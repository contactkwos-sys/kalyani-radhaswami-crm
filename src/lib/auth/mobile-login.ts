import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  DEVICE_COOKIE,
  DEVICE_MAX_AGE_DAYS,
  LOCKOUT_MINUTES,
  MAX_FAILED_ATTEMPTS,
  hashDeviceToken,
  hashPin,
  isValidPin,
  newDeviceToken,
  normalizeMobile,
  stripPinMetadata,
  verifyPin,
} from "@/lib/auth/pin";
import type { AppRole, Profile } from "@/types/database";

type LoginRow = {
  user_id: string;
  mobile_number: string;
  pin_hash: string;
  failed_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  pin_updated_at: string;
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
    record_type: "crm_user_login",
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

export async function loginWithMobilePin(input: {
  mobile: string;
  pin: string;
  remember: boolean;
  userAgent?: string | null;
  ipAddress?: string | null;
}): Promise<{ ok: true; role: AppRole } | { ok: false; error: string }> {
  const mobile = normalizeMobile(input.mobile);
  if (!mobile) return { ok: false, error: "Enter a valid mobile number." };
  if (!input.pin || !isValidPin(input.pin)) {
    return { ok: false, error: "Enter a valid PIN." };
  }

  const admin = createServiceClient();
  const { data: login, error } = await admin
    .from("crm_user_login")
    .select(
      "user_id, mobile_number, pin_hash, failed_attempts, locked_until, last_login_at, pin_updated_at"
    )
    .eq("mobile_number", mobile)
    .maybeSingle();

  if (error || !login) {
    await audit(null, "MOBILE_LOGIN_FAILED", { reason: "unknown_mobile" });
    return { ok: false, error: "Invalid mobile number or PIN." };
  }

  const row = login as LoginRow;
  const { data: profile } = await admin
    .from("crm_profiles")
    .select("*")
    .eq("id", row.user_id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    await audit(row.user_id, "MOBILE_LOGIN_FAILED", { reason: "inactive" });
    return { ok: false, error: "This account is disabled. Contact Admin." };
  }

  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    await audit(row.user_id, "MOBILE_LOGIN_LOCKED", {});
    return {
      ok: false,
      error: "Too many failed attempts. Try again later.",
    };
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
    await admin.from("crm_user_login").update(patch).eq("user_id", row.user_id);
    await audit(row.user_id, "MOBILE_LOGIN_FAILED", {
      reason: "bad_pin",
      attempts,
    });
    return { ok: false, error: "Invalid mobile number or PIN." };
  }

  await admin
    .from("crm_user_login")
    .update({
      failed_attempts: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
    })
    .eq("user_id", row.user_id);

  // Keep display mobile in sync
  await admin
    .from("crm_profiles")
    .update({ mobile })
    .eq("id", row.user_id);

  await establishSupabaseSession(profile.email);

  if (input.remember) {
    await registerTrustedDevice({
      userId: row.user_id,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    });
  } else {
    await clearDeviceCookie();
  }

  await audit(row.user_id, "MOBILE_LOGIN_SUCCESS", {
    remember: input.remember,
    role: profile.role,
  });

  return { ok: true, role: profile.role as AppRole };
}

async function registerTrustedDevice(opts: {
  userId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const token = newDeviceToken();
  const tokenHash = hashDeviceToken(token);
  const admin = createServiceClient();
  await admin.from("crm_auth_devices").insert({
    user_id: opts.userId,
    token_hash: tokenHash,
    device_label: summarizeUserAgent(opts.userAgent),
    user_agent: opts.userAgent || null,
    ip_address: opts.ipAddress || null,
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

export async function clearDeviceCookie() {
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

export async function hasTrustedDeviceCookie(): Promise<boolean> {
  const jar = await cookies();
  return Boolean(jar.get(DEVICE_COOKIE)?.value);
}

/** Silent restore via trusted device cookie when Supabase session is missing.
 * Call from a Route Handler (cookie writes are not allowed in RSC render). */
export async function tryRestoreTrustedDeviceSession(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(DEVICE_COOKIE)?.value;
  if (!token) return false;

  const admin = createServiceClient();
  const tokenHash = hashDeviceToken(token);
  const { data: device } = await admin
    .from("crm_auth_devices")
    .select("id, user_id, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!device || device.revoked_at) {
    await clearDeviceCookie();
    return false;
  }

  const { data: profile } = await admin
    .from("crm_profiles")
    .select("id, email, is_active")
    .eq("id", device.user_id)
    .maybeSingle();

  if (!profile?.is_active) {
    await clearDeviceCookie();
    return false;
  }

  // Must still have a PIN login row
  const { data: login } = await admin
    .from("crm_user_login")
    .select("user_id")
    .eq("user_id", profile.id)
    .maybeSingle();
  if (!login) {
    await clearDeviceCookie();
    return false;
  }

  try {
    await establishSupabaseSession(profile.email);
    await admin
      .from("crm_auth_devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", device.id);
    await admin
      .from("crm_user_login")
      .update({ last_login_at: new Date().toISOString() })
      .eq("user_id", profile.id);
    await audit(profile.id, "DEVICE_SESSION_RESTORED", { device_id: device.id });
    return true;
  } catch {
    return false;
  }
}

export async function logoutCurrentSession(opts?: {
  revokeCurrentDevice?: boolean;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (opts?.revokeCurrentDevice !== false) {
    const jar = await cookies();
    const token = jar.get(DEVICE_COOKIE)?.value;
    if (token && user) {
      const admin = createServiceClient();
      await admin
        .from("crm_auth_devices")
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by: user.id,
        })
        .eq("token_hash", hashDeviceToken(token))
        .eq("user_id", user.id)
        .is("revoked_at", null);
    }
  }

  await clearDeviceCookie();
  await supabase.auth.signOut();
  if (user) await audit(user.id, "LOGOUT", {});
}

export async function changeOwnPin(input: {
  userId: string;
  currentPin: string;
  newPin: string;
  confirmPin: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidPin(input.currentPin) || !isValidPin(input.newPin)) {
    return {
      ok: false,
      error: `PIN must be ${4}–${8} digits.`,
    };
  }
  if (input.newPin !== input.confirmPin) {
    return { ok: false, error: "New PIN and confirmation do not match." };
  }

  const admin = createServiceClient();
  const { data: login } = await admin
    .from("crm_user_login")
    .select("pin_hash")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!login) return { ok: false, error: "PIN login is not set up for your account." };

  const ok = await verifyPin(input.currentPin, login.pin_hash);
  if (!ok) return { ok: false, error: "Current PIN is incorrect." };

  const pin_hash = await hashPin(input.newPin);
  await admin
    .from("crm_user_login")
    .update({
      pin_hash,
      pin_updated_at: new Date().toISOString(),
      failed_attempts: 0,
      locked_until: null,
    })
    .eq("user_id", input.userId);

  await revokeAllDevicesAndSessions(input.userId, input.userId, "PIN_CHANGED");
  await audit(input.userId, "PIN_CHANGED", {});
  return { ok: true };
}

export async function adminSetUserPin(input: {
  adminId: string;
  userId: string;
  newPin: string;
  mobile?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidPin(input.newPin)) {
    return { ok: false, error: `PIN must be ${4}–${8} digits.` };
  }
  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("crm_profiles")
    .select("id, mobile, email")
    .eq("id", input.userId)
    .maybeSingle();
  if (!profile) return { ok: false, error: "User not found." };

  const { data: existing } = await admin
    .from("crm_user_login")
    .select("user_id, mobile_number")
    .eq("user_id", input.userId)
    .maybeSingle();

  const pin_hash = await hashPin(input.newPin);
  const mobile =
    normalizeMobile(input.mobile || "") ||
    existing?.mobile_number ||
    normalizeMobile(profile.mobile || "") ||
    null;
  if (!mobile) {
    return {
      ok: false,
      error: "Set a mobile number for this user before assigning a PIN.",
    };
  }

  const { data: clash } = await admin
    .from("crm_user_login")
    .select("user_id")
    .eq("mobile_number", mobile)
    .neq("user_id", input.userId)
    .maybeSingle();
  if (clash) return { ok: false, error: "This mobile number is already in use." };

  if (existing) {
    await admin
      .from("crm_user_login")
      .update({
        mobile_number: mobile,
        pin_hash,
        pin_updated_at: new Date().toISOString(),
        failed_attempts: 0,
        locked_until: null,
      })
      .eq("user_id", input.userId);
  } else {
    await admin.from("crm_user_login").insert({
      user_id: input.userId,
      mobile_number: mobile,
      pin_hash,
    });
  }

  await admin.from("crm_profiles").update({ mobile }).eq("id", input.userId);
  await revokeAllDevicesAndSessions(input.userId, input.adminId, "ADMIN_PIN_RESET");
  await audit(input.adminId, "ADMIN_PIN_RESET", { target_user: input.userId });
  return { ok: true };
}

export async function adminSetUserMobile(input: {
  adminId: string;
  userId: string;
  mobile: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const mobile = normalizeMobile(input.mobile);
  if (!mobile) return { ok: false, error: "Enter a valid mobile number." };
  const admin = createServiceClient();

  const { data: clash } = await admin
    .from("crm_user_login")
    .select("user_id")
    .eq("mobile_number", mobile)
    .neq("user_id", input.userId)
    .maybeSingle();
  if (clash) return { ok: false, error: "This mobile number is already in use." };

  const { data: existing } = await admin
    .from("crm_user_login")
    .select("user_id")
    .eq("user_id", input.userId)
    .maybeSingle();

  if (existing) {
    await admin
      .from("crm_user_login")
      .update({ mobile_number: mobile })
      .eq("user_id", input.userId);
  }

  await admin.from("crm_profiles").update({ mobile }).eq("id", input.userId);
  await audit(input.adminId, "ADMIN_MOBILE_UPDATED", {
    target_user: input.userId,
  });
  return { ok: true };
}

export async function adminSetUserActive(input: {
  adminId: string;
  userId: string;
  isActive: boolean;
}) {
  const admin = createServiceClient();
  await admin
    .from("crm_profiles")
    .update({ is_active: input.isActive })
    .eq("id", input.userId);
  if (!input.isActive) {
    await revokeAllDevicesAndSessions(
      input.userId,
      input.adminId,
      "USER_DISABLED"
    );
  }
  await audit(input.adminId, input.isActive ? "USER_ENABLED" : "USER_DISABLED", {
    target_user: input.userId,
  });
}

export async function revokeAllDevicesAndSessions(
  userId: string,
  actorId: string,
  reason: string
) {
  const admin = createServiceClient();
  await admin
    .from("crm_auth_devices")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: actorId,
    })
    .eq("user_id", userId)
    .is("revoked_at", null);

  try {
    await admin.auth.admin.signOut(userId, "global");
  } catch {
    // Older projects may not support scope; ignore
  }
  await audit(actorId, "SESSIONS_REVOKED", { target_user: userId, reason });
}

export async function revokeDevice(input: {
  adminId: string;
  deviceId: string;
}) {
  const admin = createServiceClient();
  const { data: device } = await admin
    .from("crm_auth_devices")
    .select("id, user_id")
    .eq("id", input.deviceId)
    .maybeSingle();
  if (!device) return;
  await admin
    .from("crm_auth_devices")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: input.adminId,
    })
    .eq("id", input.deviceId);
  await audit(input.adminId, "DEVICE_REVOKED", {
    device_id: input.deviceId,
    target_user: device.user_id,
  });
}

export async function listUsersForAdmin(): Promise<
  Array<
    Profile & {
      mobile_number: string | null;
      last_login_at: string | null;
      has_pin: boolean;
      active_devices: number;
    }
  >
> {
  const admin = createServiceClient();
  const { data: profiles } = await admin
    .from("crm_profiles")
    .select("*")
    .order("full_name");
  const { data: logins } = await admin
    .from("crm_user_login")
    .select("user_id, mobile_number, last_login_at");
  const { data: devices } = await admin
    .from("crm_auth_devices")
    .select("user_id")
    .is("revoked_at", null);

  const loginMap = new Map(
    (logins || []).map((l) => [
      l.user_id,
      { mobile_number: l.mobile_number, last_login_at: l.last_login_at },
    ])
  );
  const deviceCount = new Map<string, number>();
  for (const d of devices || []) {
    deviceCount.set(d.user_id, (deviceCount.get(d.user_id) || 0) + 1);
  }

  return (profiles || []).map((p) => {
    const login = loginMap.get(p.id);
    return {
      ...(p as Profile),
      mobile_number: login?.mobile_number || p.mobile,
      last_login_at: login?.last_login_at || null,
      has_pin: Boolean(login),
      active_devices: deviceCount.get(p.id) || 0,
    };
  });
}

export async function listDevicesForUser(userId: string) {
  const admin = createServiceClient();
  const { data } = await admin
    .from("crm_auth_devices")
    .select(
      "id, device_label, user_agent, ip_address, last_seen_at, created_at, revoked_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data || [];
}
