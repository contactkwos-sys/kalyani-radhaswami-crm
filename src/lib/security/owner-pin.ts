import bcrypt from "bcryptjs";
import { createServiceClient } from "@/lib/supabase/admin";

const BCRYPT_ROUNDS = 12;
const OVERRIDE_SESSION_HOURS = 2;

function stripPinKeys(metadata: Record<string, unknown>) {
  const clone = { ...metadata };
  delete clone.pin;
  delete clone.current_pin;
  delete clone.new_pin;
  delete clone.confirm_pin;
  delete clone.pin_hash;
  delete clone.OWNER_OVERRIDE_PIN;
  delete clone.DEVELOPER_OVERRIDE_KEY;
  delete clone.developer_override_key;
  delete clone.override_key;
  return clone;
}

async function writeAudit(params: {
  userId: string;
  action: string;
  module: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = createServiceClient();
  const { error } = await admin.from("crm_audit_logs").insert({
    user_id: params.userId,
    action: params.action,
    module: params.module,
    record_type: "owner_security",
    metadata: stripPinKeys(params.metadata || {}),
  });
  if (error) {
    console.error("audit write failed:", error.message);
  }
}

async function getSecurityRow() {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("crm_owner_security")
    .select("id, pin_hash, pin_version, updated_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    id: string;
    pin_hash: string;
    pin_version: number;
    updated_at: string;
  } | null;
}

/** Bootstrap PIN hash from env if no DB row exists. Never exposes the hash. */
export async function ensureOwnerPinBootstrapped(): Promise<boolean> {
  const existing = await getSecurityRow();
  if (existing) return true;

  const envHash = process.env.OWNER_OVERRIDE_PIN_HASH;
  if (!envHash) return false;

  // Accept either a bcrypt hash or a raw PIN (hash it once server-side).
  let pinHash = envHash;
  if (!envHash.startsWith("$2")) {
    pinHash = await bcrypt.hash(envHash, BCRYPT_ROUNDS);
  }

  const admin = createServiceClient();
  const { error } = await admin.from("crm_owner_security").insert({
    pin_hash: pinHash,
    pin_version: 1,
  });
  if (error) throw new Error(error.message);
  return true;
}

export async function isOwnerPinConfigured(): Promise<boolean> {
  const row = await getSecurityRow();
  if (row) return true;
  return Boolean(process.env.OWNER_OVERRIDE_PIN_HASH);
}

export async function verifyOwnerPin(pin: string): Promise<{
  ok: boolean;
  pinVersion?: number;
  reason?: string;
}> {
  await ensureOwnerPinBootstrapped();
  const row = await getSecurityRow();
  if (!row) {
    return { ok: false, reason: "PIN_NOT_CONFIGURED" };
  }
  const match = await bcrypt.compare(pin, row.pin_hash);
  if (!match) return { ok: false, reason: "INVALID_PIN" };
  return { ok: true, pinVersion: row.pin_version };
}

export async function changeOwnerPin(params: {
  userId: string;
  currentPin: string;
  newPin: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!/^\d{4,8}$/.test(params.newPin)) {
    return { ok: false, error: "New PIN must be 4–8 digits." };
  }

  await ensureOwnerPinBootstrapped();
  const row = await getSecurityRow();
  if (!row) {
    // First-time set: current PIN must match env bootstrap if present
    const envHash = process.env.OWNER_OVERRIDE_PIN_HASH;
    if (envHash) {
      const envMatch = envHash.startsWith("$2")
        ? await bcrypt.compare(params.currentPin, envHash)
        : params.currentPin === envHash;
      if (!envMatch) return { ok: false, error: "Current PIN is incorrect." };
    }
    const pinHash = await bcrypt.hash(params.newPin, BCRYPT_ROUNDS);
    const admin = createServiceClient();
    const { error } = await admin.from("crm_owner_security").insert({
      pin_hash: pinHash,
      pin_version: 1,
      updated_by: params.userId,
    });
    if (error) return { ok: false, error: error.message };
    await writeAudit({
      userId: params.userId,
      action: "OWNER_PIN_SET",
      module: "security",
      metadata: { pin_version: 1 },
    });
    return { ok: true };
  }

  const match = await bcrypt.compare(params.currentPin, row.pin_hash);
  if (!match) return { ok: false, error: "Current PIN is incorrect." };

  const newHash = await bcrypt.hash(params.newPin, BCRYPT_ROUNDS);
  const nextVersion = row.pin_version + 1;
  const admin = createServiceClient();

  const { error: updateError } = await admin
    .from("crm_owner_security")
    .update({
      pin_hash: newHash,
      pin_version: nextVersion,
      updated_by: params.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (updateError) return { ok: false, error: updateError.message };

  // Invalidate all previous override sessions
  await admin
    .from("crm_owner_override_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .is("revoked_at", null);

  await writeAudit({
    userId: params.userId,
    action: "OWNER_PIN_CHANGED",
    module: "security",
    metadata: {
      previous_pin_version: row.pin_version,
      new_pin_version: nextVersion,
      sessions_invalidated: true,
    },
  });

  return { ok: true };
}

export async function createOwnerOverrideSession(params: {
  userId: string;
  pin: string;
}): Promise<{ ok: boolean; expiresAt?: string; error?: string }> {
  const verified = await verifyOwnerPin(params.pin);
  if (!verified.ok) {
    await writeAudit({
      userId: params.userId,
      action: "OWNER_OVERRIDE_FAILED",
      module: "security",
      metadata: { reason: verified.reason },
    });
    return {
      ok: false,
      error:
        verified.reason === "PIN_NOT_CONFIGURED"
          ? "Owner PIN is not configured."
          : "Invalid PIN.",
    };
  }

  const expiresAt = new Date(
    Date.now() + OVERRIDE_SESSION_HOURS * 60 * 60 * 1000
  ).toISOString();

  const admin = createServiceClient();
  const { error } = await admin.from("crm_owner_override_sessions").insert({
    user_id: params.userId,
    pin_version: verified.pinVersion!,
    expires_at: expiresAt,
  });
  if (error) return { ok: false, error: error.message };

  await writeAudit({
    userId: params.userId,
    action: "OWNER_OVERRIDE_GRANTED",
    module: "security",
    metadata: { pin_version: verified.pinVersion, expires_at: expiresAt },
  });

  return { ok: true, expiresAt };
}

export async function hasValidOwnerOverride(userId: string): Promise<boolean> {
  const row = await getSecurityRow();
  if (!row) return false;

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("crm_owner_override_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("pin_version", row.pin_version)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("override session check failed:", error.message);
    return false;
  }
  return Boolean(data);
}
