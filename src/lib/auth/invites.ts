import { createHash, randomBytes } from "crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { generateTemporaryPin, hashPin, stripPinMetadata } from "@/lib/auth/pin";
import { revokeAllDevicesAndSessions } from "@/lib/auth/mobile-login";
import type { Profile } from "@/types/database";

const INVITE_TTL_HOURS = 72;

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

async function audit(
  actorId: string | null,
  action: string,
  metadata: Record<string, unknown> = {}
) {
  const admin = createServiceClient();
  await admin.from("crm_audit_logs").insert({
    user_id: actorId,
    action,
    module: "user_management",
    record_type: "crm_user_invites",
    record_id: (metadata.target_user as string) || actorId,
    metadata: stripPinMetadata(metadata),
  });
}

export async function createUserInvite(input: {
  actor: Profile;
  userId: string;
  /** Optional temporary PIN to set (auto-generated if omitted). */
  temporaryPin?: string;
}): Promise<
  | {
      ok: true;
      inviteToken: string;
      temporaryPin: string;
      expiresAt: string;
      invitePath: string;
    }
  | { ok: false; error: string }
> {
  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("crm_profiles")
    .select("id, is_active, is_developer, role, full_name")
    .eq("id", input.userId)
    .maybeSingle();
  if (!profile) return { ok: false, error: "User not found." };
  if (profile.is_developer && profile.role === "OWNER") {
    return { ok: false, error: "Cannot create invites for Developer Override." };
  }
  if (!profile.is_active) {
    return { ok: false, error: "Reactivate the user before creating an invite." };
  }

  const temporaryPin =
    input.temporaryPin && /^\d{4,8}$/.test(input.temporaryPin)
      ? input.temporaryPin
      : generateTemporaryPin(6);

  const pin_hash = await hashPin(temporaryPin);
  const { data: login } = await admin
    .from("crm_user_login")
    .select("user_id, mobile_number")
    .eq("user_id", input.userId)
    .maybeSingle();

  if (!login?.mobile_number) {
    return {
      ok: false,
      error: "Assign a mobile number before generating an invite.",
    };
  }

  await admin.from("crm_user_login").upsert({
    user_id: input.userId,
    mobile_number: login.mobile_number,
    pin_hash,
    pin_updated_at: new Date().toISOString(),
    failed_attempts: 0,
    locked_until: null,
    must_change_pin: true,
  });

  // Sync tile Auth password when a login tile exists.
  const { data: tile } = await admin
    .from("app_users")
    .select("login_slug")
    .eq("id", input.userId)
    .maybeSingle();
  if (tile?.login_slug) {
    const { deriveAuthPassword } = await import("@/lib/auth/pin-auth-server");
    await admin.auth.admin.updateUserById(input.userId, {
      password: deriveAuthPassword(tile.login_slug, temporaryPin),
    });
    await admin
      .from("app_users")
      .update({ pin_is_set: false, updated_at: new Date().toISOString() })
      .eq("id", input.userId);
  }

  // Revoke prior unused invites
  await admin
    .from("crm_user_invites")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: input.actor.id,
    })
    .eq("user_id", input.userId)
    .is("used_at", null)
    .is("revoked_at", null);

  await revokeAllDevicesAndSessions(
    input.userId,
    input.actor.id,
    "INVITE_CREATED"
  );

  const inviteToken = newInviteToken();
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { error } = await admin.from("crm_user_invites").insert({
    user_id: input.userId,
    token_hash: hashInviteToken(inviteToken),
    created_by: input.actor.id,
    expires_at: expiresAt,
  });
  if (error) return { ok: false, error: error.message };

  await audit(input.actor.id, "INVITE_CREATED", {
    target_user: input.userId,
    expires_at: expiresAt,
  });

  return {
    ok: true,
    inviteToken,
    temporaryPin,
    expiresAt,
    invitePath: `/invite/${inviteToken}`,
  };
}

export async function revokeUserInvite(input: {
  actor: Profile;
  inviteId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createServiceClient();
  const { data: invite } = await admin
    .from("crm_user_invites")
    .select("id, user_id, used_at, revoked_at")
    .eq("id", input.inviteId)
    .maybeSingle();
  if (!invite) return { ok: false, error: "Invite not found." };
  if (invite.used_at) return { ok: false, error: "Invite already used." };
  if (invite.revoked_at) return { ok: true };

  await admin
    .from("crm_user_invites")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: input.actor.id,
    })
    .eq("id", input.inviteId);

  await audit(input.actor.id, "INVITE_REVOKED", {
    target_user: invite.user_id,
    invite_id: invite.id,
  });
  return { ok: true };
}

export async function consumeInvite(input: {
  token: string;
  pin: string;
  remember?: boolean;
  userAgent?: string | null;
  ipAddress?: string | null;
}): Promise<
  | { ok: true; userId: string; mustChangePin: boolean }
  | { ok: false; error: string }
> {
  if (!input.token || input.token.length < 20) {
    return { ok: false, error: "Invalid invite link." };
  }
  if (!/^\d{4,8}$/.test(input.pin || "")) {
    return { ok: false, error: "Enter the temporary PIN from Admin." };
  }

  const admin = createServiceClient();
  const tokenHash = hashInviteToken(input.token);
  const { data: invite } = await admin
    .from("crm_user_invites")
    .select("id, user_id, expires_at, used_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!invite) return { ok: false, error: "Invalid or expired invite link." };
  if (invite.revoked_at) {
    return { ok: false, error: "This invite was revoked. Contact Admin." };
  }
  if (invite.used_at) {
    return { ok: false, error: "This invite has already been used." };
  }
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: "This invite has expired. Contact Admin." };
  }

  const { data: login } = await admin
    .from("crm_user_login")
    .select("mobile_number, pin_hash")
    .eq("user_id", invite.user_id)
    .maybeSingle();
  if (!login) return { ok: false, error: "Account is not ready. Contact Admin." };

  const { verifyPin } = await import("@/lib/auth/pin");
  const pinOk = await verifyPin(input.pin, login.pin_hash);
  if (!pinOk) return { ok: false, error: "Temporary PIN is incorrect." };

  // Mark invite used (single-use)
  const { data: marked, error: markErr } = await admin
    .from("crm_user_invites")
    .update({ used_at: new Date().toISOString() })
    .eq("id", invite.id)
    .is("used_at", null)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (markErr || !marked) {
    return { ok: false, error: "This invite has already been used." };
  }

  await admin
    .from("app_users")
    .update({ pin_is_set: true, updated_at: new Date().toISOString() })
    .eq("id", invite.user_id);

  await admin
    .from("crm_user_login")
    .update({
      must_change_pin: false,
      failed_attempts: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
    })
    .eq("user_id", invite.user_id);

  const { loginWithMobilePin } = await import("@/lib/auth/mobile-login");
  const result = await loginWithMobilePin({
    mobile: login.mobile_number,
    pin: input.pin,
    remember: Boolean(input.remember),
    userAgent: input.userAgent,
    ipAddress: input.ipAddress,
  });
  if (!result.ok) return { ok: false, error: result.error };

  await audit(invite.user_id, "INVITE_USED", {
    target_user: invite.user_id,
    invite_id: invite.id,
  });

  return {
    ok: true,
    userId: invite.user_id,
    mustChangePin: result.mustChangePin,
  };
}

export async function listInvitesForUser(userId: string) {
  const admin = createServiceClient();
  const { data } = await admin
    .from("crm_user_invites")
    .select("id, expires_at, used_at, revoked_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  return data || [];
}
