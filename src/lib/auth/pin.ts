import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";

const BCRYPT_ROUNDS = 12;
export const PIN_MIN_LEN = 4;
export const PIN_MAX_LEN = 8;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;
export const DEVICE_COOKIE = "crm_device_token";
export const DEVICE_MAX_AGE_DAYS = 90;

export function normalizeMobile(input: string): string | null {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) return null;
  // India: allow 10-digit local or 91 + 10 digits
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length >= 10 && digits.length <= 15) {
    // keep last 10 for IN mobiles when longer country codes appear oddly
    if (digits.length > 10 && digits.endsWith(digits.slice(-10))) {
      const last10 = digits.slice(-10);
      if (last10.length === 10) return last10;
    }
    return digits;
  }
  return null;
}

export function isValidPin(pin: string): boolean {
  return /^[0-9]+$/.test(pin) && pin.length >= PIN_MIN_LEN && pin.length <= PIN_MAX_LEN;
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

export async function verifyPin(pin: string, pinHash: string): Promise<boolean> {
  return bcrypt.compare(pin, pinHash);
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

/** Strip PIN-related keys before audit/logging. */
export function stripPinMetadata(metadata: Record<string, unknown>) {
  const clone = { ...metadata };
  for (const k of [
    "pin",
    "current_pin",
    "new_pin",
    "confirm_pin",
    "pin_hash",
    "password",
    "token",
    "device_token",
  ]) {
    delete clone[k];
  }
  return clone;
}
