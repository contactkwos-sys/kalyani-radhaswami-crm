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
  // Uses SECURITY DEFINER RPC (list_login_users) so anon can load tiles
  // without querying the view / table directly (RLS blocks that).
  const { data, error } = await supabase.rpc("list_login_users");
  if (error) throw error;
  return (data || []) as ActiveUserTile[];
}

/**
 * First-time login: enter the temporary PIN from admin once.
 * That same PIN becomes the permanent login PIN (no re-entry / confirm).
 */
export async function completeFirstLogin(loginSlug: string, pin: string) {
  if (!/^\d{4}$/.test(pin || "")) {
    throw new Error("Enter the 4-digit PIN from admin.");
  }

  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: slugEmail(loginSlug),
    password: deriveAuthPassword(loginSlug, pin),
  });
  if (verifyErr) {
    throw new Error("PIN is incorrect.");
  }

  const { error: rpcErr } = await supabase.rpc("mark_pin_set");
  if (rpcErr) throw new Error(rpcErr.message || "Could not finish PIN setup.");
}

/**
 * @deprecated Prefer completeFirstLogin — first-time setup no longer asks for
 * temporary / new / confirm three times.
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
    throw new Error("New PIN and confirm PIN do not match.");
  }
  if (!/^\d{4}$/.test(currentTempPin || "")) {
    throw new Error("Enter the temporary PIN from admin (4 digits).");
  }

  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: slugEmail(loginSlug),
    password: deriveAuthPassword(loginSlug, currentTempPin),
  });
  if (verifyErr) {
    throw new Error("Temporary PIN is incorrect.");
  }

  // Supabase rejects updateUser when new password === old password.
  // If they keep the same PIN, just mark it set and continue.
  if (newPin !== currentTempPin) {
    const { error: updateErr } = await supabase.auth.updateUser({
      password: deriveAuthPassword(loginSlug, newPin),
    });
    if (updateErr) throw new Error(updateErr.message || "Could not save new PIN.");
  }

  const { error: rpcErr } = await supabase.rpc("mark_pin_set");
  if (rpcErr) throw new Error(rpcErr.message || "Could not finish PIN setup.");
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
