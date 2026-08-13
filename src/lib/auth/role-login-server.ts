import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { deriveAuthPassword, slugEmail } from "@/lib/auth/pin-auth-server";
import {
  DEVICE_COOKIE,
  DEVICE_MAX_AGE_DAYS,
  hashDeviceToken,
  isValidPin,
  newDeviceToken,
  stripPinMetadata,
  verifyPin,
} from "@/lib/auth/pin";
import { cookies } from "next/headers";
import { isLoginThrottled, recordLoginAttempt } from "@/lib/auth/rate-limit";
import type { AppRole } from "@/types/database";
import { homeForRole } from "@/lib/auth/role-login";

async function audit(
  userId: string | null,
  action: string,
  metadata: Record<string, unknown> = {}
) {
  const admin = createServiceClient();
  await admin.from("crm_audit_logs").insert({
    user_id: userId,
    action,
    module: "auth",
    record_type: "app_users",
    record_id: userId,
    metadata: stripPinMetadata(metadata),
  });
}

async function registerTrustedDevice(opts: {
  userId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const token = newDeviceToken();
  const tokenHash = hashDeviceToken(token);
  const admin = createServiceClient();
  const expiresAt = new Date(
    Date.now() + DEVICE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  );
  await admin.from("crm_auth_devices").insert({
    user_id: opts.userId,
    token_hash: tokenHash,
    device_label: summarizeUserAgent(opts.userAgent),
    user_agent: opts.userAgent || null,
    ip_address: opts.ipAddress || null,
    expires_at: expiresAt.toISOString(),
  });
  const jar = await cookies();
  jar.set(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_MAX_AGE_DAYS * 24 * 60 * 60,
  });
}

async function clearDeviceCookie() {
  const jar = await cookies();
  jar.set(DEVICE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

function summarizeUserAgent(ua?: string | null) {
  if (!ua) return "Device";
  if (/iPhone|iPad/i.test(ua)) return "Apple device";
  if (/Android/i.test(ua)) return "Android device";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS/i.test(ua)) return "Mac";
  return "Browser";
}

/**
 * Role-tile + PIN login (server-side).
 * Validates PIN via bcrypt (crm_user_login) when present, else Auth password
 * derived server-side (pepper never sent to the browser).
 */
export async function loginWithRolePin(input: {
  loginSlug: string;
  pin: string;
  remember: boolean;
  firstLogin?: boolean;
  userAgent?: string | null;
  ipAddress?: string | null;
}): Promise<
  | { ok: true; role: AppRole; home: string }
  | { ok: false; error: string }
> {
  const loginSlug = String(input.loginSlug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  if (!loginSlug) return { ok: false, error: "Select a user." };
  if (!isValidPin(input.pin) || input.pin.length !== 4) {
    return { ok: false, error: "Enter a valid 4-digit PIN." };
  }

  const throttle = await isLoginThrottled({
    identifier: `tile:${loginSlug}`,
    ipAddress: input.ipAddress,
  });
  if (throttle.throttled) {
    return { ok: false, error: throttle.reason || "Too many attempts." };
  }

  const admin = createServiceClient();
  const { data: tile } = await admin
    .from("app_users")
    .select("id, login_slug, role, is_active, pin_is_set")
    .eq("login_slug", loginSlug)
    .maybeSingle();

  if (!tile || !tile.is_active) {
    await recordLoginAttempt({
      identifier: `tile:${loginSlug}`,
      ipAddress: input.ipAddress,
      success: false,
    });
    await audit(null, "ROLE_LOGIN_FAILED", { reason: "unknown_tile", loginSlug });
    return { ok: false, error: "Incorrect PIN. Please try again." };
  }

  const { data: profile } = await admin
    .from("crm_profiles")
    .select("id, email, role, is_active, is_developer")
    .eq("id", tile.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    await recordLoginAttempt({
      identifier: `tile:${loginSlug}`,
      ipAddress: input.ipAddress,
      success: false,
    });
    await audit(tile.id, "ROLE_LOGIN_FAILED", { reason: "inactive" });
    return { ok: false, error: "This account is disabled. Contact Admin." };
  }

  // Never allow developer identity via public role tiles.
  if (profile.is_developer && profile.role === "OWNER") {
    await recordLoginAttempt({
      identifier: `tile:${loginSlug}`,
      ipAddress: input.ipAddress,
      success: false,
    });
    await audit(tile.id, "ROLE_LOGIN_FAILED", { reason: "developer_blocked" });
    return { ok: false, error: "Incorrect PIN. Please try again." };
  }

  const { data: loginRow } = await admin
    .from("crm_user_login")
    .select("pin_hash, failed_attempts, locked_until")
    .eq("user_id", tile.id)
    .maybeSingle();

  if (
    loginRow?.locked_until &&
    new Date(loginRow.locked_until).getTime() > Date.now()
  ) {
    await audit(tile.id, "ROLE_LOGIN_LOCKED", {});
    return { ok: false, error: "Too many failed attempts. Try again later." };
  }

  let authenticated = false;

  if (loginRow?.pin_hash) {
    const bcryptOk = await verifyPin(input.pin, loginRow.pin_hash);
    if (bcryptOk) {
      const { data: linkData, error: linkErr } =
        await admin.auth.admin.generateLink({
          type: "magiclink",
          email: profile.email || slugEmail(loginSlug),
        });
      if (linkErr || !linkData?.properties?.hashed_token) {
        return { ok: false, error: "Unable to start session." };
      }
      const supabase = await createClient();
      const { error: otpError } = await supabase.auth.verifyOtp({
        type: "email",
        token_hash: linkData.properties.hashed_token,
      });
      if (otpError) return { ok: false, error: otpError.message };
      authenticated = true;
    }
  }

  // Legacy / dual-path: Auth password derived server-side (pepper never in browser).
  if (!authenticated) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: slugEmail(loginSlug),
      password: deriveAuthPassword(loginSlug, input.pin),
    });
    authenticated = !error;
  }

  if (!authenticated) {
    if (loginRow) {
      const attempts = (loginRow.failed_attempts || 0) + 1;
      const patch: Record<string, unknown> = { failed_attempts: attempts };
      if (attempts >= 5) {
        patch.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        patch.failed_attempts = 0;
      }
      await admin.from("crm_user_login").update(patch).eq("user_id", tile.id);
    }
    await recordLoginAttempt({
      identifier: `tile:${loginSlug}`,
      ipAddress: input.ipAddress,
      success: false,
    });
    await audit(tile.id, "ROLE_LOGIN_FAILED", { reason: "bad_pin" });
    return { ok: false, error: "Incorrect PIN. Please try again." };
  }

  if (loginRow) {
    await admin
      .from("crm_user_login")
      .update({
        failed_attempts: 0,
        locked_until: null,
        last_login_at: new Date().toISOString(),
      })
      .eq("user_id", tile.id);
  }

  if (input.firstLogin || !tile.pin_is_set) {
    await admin
      .from("app_users")
      .update({ pin_is_set: true, updated_at: new Date().toISOString() })
      .eq("id", tile.id);
  }

  if (input.remember) {
    await registerTrustedDevice({
      userId: tile.id,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    });
  } else {
    await clearDeviceCookie();
  }

  await recordLoginAttempt({
    identifier: `tile:${loginSlug}`,
    ipAddress: input.ipAddress,
    success: true,
  });
  await audit(tile.id, "ROLE_LOGIN_SUCCESS", {
    remember: input.remember,
    role: profile.role,
    first_login: Boolean(input.firstLogin || !tile.pin_is_set),
  });

  return {
    ok: true,
    role: profile.role as AppRole,
    home: homeForRole(profile.role as AppRole),
  };
}

/** Sync Auth password + bcrypt hash when Admin resets a tile user's PIN. */
export async function syncTilePinCredentials(input: {
  userId: string;
  pin: string;
}): Promise<void> {
  const admin = createServiceClient();
  const { data: tile } = await admin
    .from("app_users")
    .select("login_slug")
    .eq("id", input.userId)
    .maybeSingle();
  if (!tile?.login_slug) return;
  await admin.auth.admin.updateUserById(input.userId, {
    password: deriveAuthPassword(tile.login_slug, input.pin),
  });
}
