// ============================================================================
// 08_auth_lib_patch.js
// Same file as 02_auth_lib.js, with ONE change: listActiveUsers() now calls
// the list_login_users() RPC (bypasses the RLS bug) instead of querying the
// view directly. Tell Cursor: "replace 02_auth_lib.js with this file's
// content, same filename."
// ============================================================================
import { supabase } from "@/lib/supabase/browser"; // <-- existing browser client

const PEPPER = "kwos-kalyani-radhaswami-2026";

function deriveAuthPassword(loginSlug, pin) {
  return `${pin}-${loginSlug}-${PEPPER}`;
}
function slugEmail(loginSlug) {
  return `${loginSlug}@internal.kwos.local`;
}

/** Role tiles for the login screen. FIXED: uses RPC, not the raw view. */
export async function listActiveUsers() {
  const { data, error } = await supabase.rpc("list_login_users");
  if (error) throw error;
  return data;
}

export async function setInitialPin(loginSlug, currentTempPin, newPin, confirmPin) {
  if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) throw new Error("PIN must be exactly 4 digits.");
  if (newPin !== confirmPin) throw new Error("PINs do not match.");

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

export async function loginWithPin(loginSlug, pin) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: slugEmail(loginSlug),
    password: deriveAuthPassword(loginSlug, pin),
  });
  if (error) throw new Error("Incorrect PIN. Please try again.");
  return data.session;
}

export async function getMyRole() {
  const { data, error } = await supabase.rpc("get_my_role");
  if (error) throw error;
  return data;
}

export async function logout() {
  await supabase.auth.signOut();
}

export const ROLE_HOME = {
  admin: "/admin",
  ceo: "/ceo",
  accountant: "/accountant",
  salesman: "/salesman",
};
