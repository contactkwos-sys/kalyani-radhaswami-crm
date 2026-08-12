/**
 * Role-tile + PIN auth helpers (reference / Netlify-compatible).
 * App Router implementation lives in src/lib/auth/role-login.ts
 * Adjust supabase import path to match the host project.
 */

import { createClient } from "@supabase/supabase-js";

export const ROLE_HOMES = {
  OWNER: "/admin",
  ADMIN: "/admin",
  CEO_1: "/ceo",
  CEO_2: "/ceo",
  CEO_3: "/ceo",
  ACCOUNTANT: "/accountant",
  SALESMAN: "/salesman",
  SALES_MANAGER: "/salesman",
};

export function homeForRole(role) {
  return ROLE_HOMES[role] || "/dashboard";
}

export function createBrowserSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  );
}

export async function fetchLoginTiles(supabase) {
  const { data, error } = await supabase.rpc("list_login_tiles");
  if (error) throw error;
  return data || [];
}

export async function postRoleLogin({ tileKey, pin }) {
  const res = await fetch("/api/auth/role-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tileKey, pin }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Invalid role or PIN.");
    err.mustSetPin = Boolean(data.mustSetPin);
    throw err;
  }
  return data;
}

export async function postSetPin({ tileKey, pin, confirmPin }) {
  const res = await fetch("/api/auth/set-pin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tileKey, pin, confirmPin }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to set PIN.");
  return data;
}
