/** Shared PIN-auth constants — safe on server and client. No mobile/OTP. */

export const PEPPER = "kwos-kalyani-radhaswami-2026";

export function deriveAuthPassword(loginSlug: string, pin: string) {
  return `${pin}-${loginSlug}-${PEPPER}`;
}

export function slugEmail(loginSlug: string) {
  return `${loginSlug}@internal.kwos.local`;
}

/** Central map — keep every role's home route here, one source of truth. */
export const ROLE_HOME = {
  admin: "/admin",
  ceo: "/ceo",
  accountant: "/accountant",
  salesman: "/salesman",
} as const;

export type LoginRole = keyof typeof ROLE_HOME;
