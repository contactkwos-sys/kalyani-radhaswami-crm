import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  LOCKOUT_MINUTES,
  MAX_FAILED_ATTEMPTS,
  hashPin,
  isValidPin,
  stripPinMetadata,
  verifyPin,
} from "@/lib/auth/pin";
import type { AppRole } from "@/types/database";

export type LoginTile = {
  tile_key: string;
  tile_label: string;
  must_set_pin: boolean;
  sort_order: number;
};

export type RoleHome =
  | "/admin"
  | "/ceo"
  | "/accountant"
  | "/salesman"
  | "/dashboard";

type AppUserRow = {
  id: string;
  profile_id: string;
  tile_key: string;
  tile_label: string;
  pin_hash: string | null;
  must_set_pin: boolean;
  failed_attempts: number;
  locked_until: string | null;
  is_active: boolean;
};

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

async function establishSupabaseSession(email: string) {
  const admin = createServiceClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data?.properties?.hashed_token) {
    throw new Error(error?.message || "Unable to start session.");
  }
  const supabase = await createClient();
  const { error: otpError } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: data.properties.hashed_token,
  });
  if (otpError) throw new Error(otpError.message);
}

export function homeForRole(role: AppRole | string): RoleHome {
  switch (role) {
    case "OWNER":
    case "ADMIN":
      return "/admin";
    case "CEO_1":
    case "CEO_2":
    case "CEO_3":
      return "/ceo";
    case "ACCOUNTANT":
      return "/accountant";
    case "SALESMAN":
    case "SALES_MANAGER":
      return "/salesman";
    default:
      return "/dashboard";
  }
}

export async function listLoginTiles(): Promise<LoginTile[]> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("list_login_tiles");
  if (error) {
    // Fallback if RPC not yet applied: empty list
    console.error("list_login_tiles:", error.message);
    return [];
  }
  return (data || []) as LoginTile[];
}

async function loadAppUser(tileKey: string): Promise<AppUserRow | null> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("app_users")
    .select(
      "id, profile_id, tile_key, tile_label, pin_hash, must_set_pin, failed_attempts, locked_until, is_active"
    )
    .eq("tile_key", tileKey)
    .maybeSingle();
  if (error || !data) return null;
  return data as AppUserRow;
}

export async function loginWithRolePin(input: {
  tileKey: string;
  pin: string;
}): Promise<
  | { ok: true; role: AppRole; home: RoleHome; mustSetPin: false }
  | { ok: false; error: string; mustSetPin?: boolean }
> {
  const tileKey = String(input.tileKey || "")
    .trim()
    .toLowerCase();
  if (!tileKey) return { ok: false, error: "Select a role to continue." };
  if (!input.pin || !isValidPin(input.pin)) {
    return { ok: false, error: "Enter a valid PIN." };
  }

  const row = await loadAppUser(tileKey);
  if (!row || !row.is_active) {
    await audit(null, "ROLE_LOGIN_FAILED", { reason: "unknown_tile", tileKey });
    return { ok: false, error: "Invalid role or PIN." };
  }

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("crm_profiles")
    .select("*")
    .eq("id", row.profile_id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    await audit(row.profile_id, "ROLE_LOGIN_FAILED", { reason: "inactive" });
    return { ok: false, error: "This account is disabled. Contact Admin." };
  }

  if (!row.pin_hash || row.must_set_pin) {
    return {
      ok: false,
      error: "Set your PIN first.",
      mustSetPin: true,
    };
  }

  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    await audit(row.profile_id, "ROLE_LOGIN_LOCKED", {});
    return { ok: false, error: "Too many failed attempts. Try again later." };
  }

  const pinOk = await verifyPin(input.pin, row.pin_hash);
  if (!pinOk) {
    const attempts = (row.failed_attempts || 0) + 1;
    const patch: Record<string, unknown> = { failed_attempts: attempts };
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      patch.locked_until = new Date(
        Date.now() + LOCKOUT_MINUTES * 60 * 1000
      ).toISOString();
      patch.failed_attempts = 0;
    }
    await admin.from("app_users").update(patch).eq("id", row.id);
    await audit(row.profile_id, "ROLE_LOGIN_FAILED", {
      reason: "bad_pin",
      attempts,
    });
    return { ok: false, error: "Invalid role or PIN." };
  }

  await admin
    .from("app_users")
    .update({
      failed_attempts: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
      must_set_pin: false,
    })
    .eq("id", row.id);

  await establishSupabaseSession(profile.email);
  await audit(row.profile_id, "ROLE_LOGIN_SUCCESS", {
    tile_key: tileKey,
    role: profile.role,
  });

  const role = profile.role as AppRole;
  return { ok: true, role, home: homeForRole(role), mustSetPin: false };
}

export async function setFirstPin(input: {
  tileKey: string;
  pin: string;
  confirmPin: string;
}): Promise<{ ok: true; home: RoleHome; role: AppRole } | { ok: false; error: string }> {
  const tileKey = String(input.tileKey || "")
    .trim()
    .toLowerCase();
  if (!tileKey) return { ok: false, error: "Select a role to continue." };
  if (!isValidPin(input.pin)) {
    return { ok: false, error: "PIN must be 4–8 digits." };
  }
  if (input.pin !== input.confirmPin) {
    return { ok: false, error: "PINs do not match." };
  }

  const row = await loadAppUser(tileKey);
  if (!row || !row.is_active) {
    return { ok: false, error: "Invalid role." };
  }
  if (row.pin_hash && !row.must_set_pin) {
    return { ok: false, error: "PIN already set. Sign in with your PIN." };
  }

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("crm_profiles")
    .select("*")
    .eq("id", row.profile_id)
    .maybeSingle();
  if (!profile || !profile.is_active) {
    return { ok: false, error: "This account is disabled. Contact Admin." };
  }

  const pin_hash = await hashPin(input.pin);
  await admin
    .from("app_users")
    .update({
      pin_hash,
      must_set_pin: false,
      failed_attempts: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  await establishSupabaseSession(profile.email);
  await audit(row.profile_id, "ROLE_PIN_SET", { tile_key: tileKey });

  const role = profile.role as AppRole;
  return { ok: true, role, home: homeForRole(role) };
}
