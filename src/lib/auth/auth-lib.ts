"use client";

// PIN-only auth helpers. NO mobile number, NO OTP anywhere in this file.
import { supabase } from "@/lib/supabase/browser";
import {
  deriveAuthPassword,
  slugEmail,
} from "@/lib/auth/pin-auth-shared";

export {
  ROLE_HOME,
  deriveAuthPassword,
  slugEmail,
} from "@/lib/auth/pin-auth-shared";
export type { LoginRole } from "@/lib/auth/pin-auth-shared";

export type ActiveUserTile = {
  id: string;
  login_slug: string;
  display_name: string;
  role: "admin" | "ceo" | "accountant" | "salesman";
  pin_is_set: boolean;
};

/** Role tiles for the login screen. Safe columns only. */
export async function listActiveUsers(): Promise<ActiveUserTile[]> {
  const { data, error } = await supabase
    .from("public_active_users")
    .select("id, login_slug, display_name, role, pin_is_set")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data || []) as ActiveUserTile[];
}

/**
 * First-time PIN setup. `currentTempPin` is whatever temporary PIN the
 * admin gave the person when the account was created.
 */
export async function setInitialPin(
  loginSlug: string,
  currentTempPin: string,
  newPin: string,
  confirmPin: string
) {
  if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
    throw new Error("PIN must be exactly 4 digits.");
  }
  if (newPin !== confirmPin) {
    throw new Error("PINs do not match.");
  }

  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: slugEmail(loginSlug),
    password: deriveAuthPassword(loginSlug, currentTempPin),
  });
  if (verifyErr) throw new Error("Current PIN is incorrect.");

  const { error: updateErr } = await supabase.auth.updateUser({
    password: deriveAuthPassword(loginSlug, newPin),
  });
  if (updateErr) throw updateErr;

  const { error: rpcErr } = await supabase.rpc("mark_pin_set");
  if (rpcErr) throw rpcErr;
}

/** Normal login — 4-digit PIN only. */
export async function loginWithPin(loginSlug: string, pin: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: slugEmail(loginSlug),
    password: deriveAuthPassword(loginSlug, pin),
  });
  if (error) throw new Error("Incorrect PIN. Please try again.");
  return data.session;
}

/** Call right after login to decide which dashboard route to send them to. */
export async function getMyRole(): Promise<
  "admin" | "ceo" | "accountant" | "salesman"
> {
  const { data, error } = await supabase.rpc("get_my_role");
  if (error) throw error;
  return data as "admin" | "ceo" | "accountant" | "salesman";
}

export async function logout() {
  await supabase.auth.signOut();
}
