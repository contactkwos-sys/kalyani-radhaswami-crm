// ============================================================================
// 02_auth_lib.js  (patched — listActiveUsers via list_login_users RPC)
// PIN-only auth helpers. NO mobile number, NO OTP anywhere in this file.
// Adjust the `import { supabase } from "..."` path to match your existing
// Supabase client file in the repo.
// ============================================================================
import { supabase } from "@/lib/supabase/browser"; // <-- existing browser client

// Not a secret — just padding so the PIN satisfies Supabase Auth's minimum
// password length. Real protection comes from Supabase Auth's own hashing,
// rate limiting and session handling, not from this string.
const PEPPER = "kwos-kalyani-radhaswami-2026";

function deriveAuthPassword(loginSlug, pin) {
  return `${pin}-${loginSlug}-${PEPPER}`;
}

function slugEmail(loginSlug) {
  return `${loginSlug}@internal.kwos.local`;
}

/** Role tiles for the login screen. Safe columns only. */
export async function listActiveUsers() {
  // Uses SECURITY DEFINER RPC (list_login_users) so anon can load tiles
  // without querying the view / table directly (RLS blocks that).
  const { data, error } = await supabase.rpc("list_login_users");
  if (error) throw error;
  return data;
}

/**
 * First-time PIN setup. `currentTempPin` is whatever temporary PIN the
 * admin gave the person when the account was created.
 */
export async function setInitialPin(loginSlug, currentTempPin, newPin, confirmPin) {
  if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
    throw new Error("PIN must be exactly 4 digits.");
  }
  if (newPin !== confirmPin) {
    throw new Error("PINs do not match.");
  }

  // Step 1 — verify the temporary PIN by actually signing in with it.
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: slugEmail(loginSlug),
    password: deriveAuthPassword(loginSlug, currentTempPin),
  });
  if (verifyErr) throw new Error("Current PIN is incorrect.");

  // Step 2 — now that we have an active session, update the password to
  // the new PIN-derived value.
  const { error: updateErr } = await supabase.auth.updateUser({
    password: deriveAuthPassword(loginSlug, newPin),
  });
  if (updateErr) throw updateErr;

  // Step 3 — flag this user's row as configured so the tile shows the
  // normal PIN pad next time, not "Set your PIN" again.
  const { error: rpcErr } = await supabase.rpc("mark_pin_set");
  if (rpcErr) throw rpcErr;
}

/** Normal login — 4-digit PIN only. */
export async function loginWithPin(loginSlug, pin) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: slugEmail(loginSlug),
    password: deriveAuthPassword(loginSlug, pin),
  });
  if (error) throw new Error("Incorrect PIN. Please try again.");
  return data.session;
}

/** Call right after login to decide which dashboard route to send them to. */
export async function getMyRole() {
  const { data, error } = await supabase.rpc("get_my_role");
  if (error) throw error;
  return data; // 'admin' | 'ceo' | 'accountant' | 'salesman'
}

export async function logout() {
  await supabase.auth.signOut();
}

/** Central map — keep every role's home route here, one source of truth. */
export const ROLE_HOME = {
  admin: "/admin",
  ceo: "/ceo",
  accountant: "/accountant",
  salesman: "/salesman",
};
