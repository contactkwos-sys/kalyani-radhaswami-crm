"use client";

/**
 * Client auth helpers for role-tile login.
 * PIN verification always happens server-side — no pepper / password derivation here.
 */
export { ROLE_HOME } from "@/lib/auth/pin-auth-shared";
export type { LoginRole } from "@/lib/auth/pin-auth-shared";
export { roleSubtitleForLoginRole } from "@/lib/auth/pin-auth-shared";

export type ActiveUserTile = {
  id: string;
  login_slug: string;
  display_name: string;
  role: "admin" | "ceo" | "accountant" | "salesman" | "other";
  role_subtitle?: string | null;
  pin_is_set: boolean;
};

/** Role tiles for the login screen. Safe columns only. */
export async function listActiveUsers(): Promise<ActiveUserTile[]> {
  const res = await fetch("/api/auth/login-tiles", { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Could not load users.");
  }
  return (data.users || []) as ActiveUserTile[];
}

/**
 * First-time login: enter the temporary PIN from admin once.
 * That same PIN becomes the permanent login PIN (no re-entry / confirm).
 */
export async function completeFirstLogin(
  loginSlug: string,
  pin: string,
  remember = false
) {
  if (!/^\d{4}$/.test(pin || "")) {
    throw new Error("Enter the 4-digit PIN from admin.");
  }
  const res = await fetch("/api/auth/role-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      loginSlug,
      pin,
      remember,
      firstLogin: true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "PIN is incorrect.");
  }
  return data;
}

/** Normal login — 4-digit PIN only (server-verified). */
export async function loginWithPin(
  loginSlug: string,
  pin: string,
  remember = false
) {
  const res = await fetch("/api/auth/role-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginSlug, pin, remember, firstLogin: false }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Incorrect PIN. Please try again.");
  }
  return data;
}

/** Call right after login to decide which dashboard route to send them to. */
export async function getMyRole(): Promise<
  "admin" | "ceo" | "accountant" | "salesman" | "other"
> {
  const res = await fetch("/api/auth/me", { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Not signed in.");
  const role = String(data.role || data.appRole || "").toUpperCase();
  if (role === "ADMIN") return "admin";
  if (role.startsWith("CEO") || role === "OWNER") return "ceo";
  if (role === "ACCOUNTANT") return "accountant";
  if (role === "SALESMAN" || role === "SALES_MANAGER") return "salesman";
  return "other";
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
}
