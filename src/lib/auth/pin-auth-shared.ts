/** Shared PIN-auth constants — safe on server and client. No secrets. */

/** Central map — keep every role's home route here, one source of truth.
 * All roles land on the real CRM dashboard (Kalyani / Radhaswami company switcher). */
export const ROLE_HOME = {
  admin: "/dashboard",
  ceo: "/dashboard",
  accountant: "/dashboard",
  salesman: "/dashboard",
  other: "/dashboard",
} as const;

export type LoginRole = keyof typeof ROLE_HOME;

export function slugEmailPublic(loginSlug: string) {
  return `${loginSlug}@internal.kwos.local`;
}

/** Public subtitle for login tiles (never personal names). */
export function roleSubtitleForLoginRole(role: string): string {
  switch (role) {
    case "ceo":
      return "Chief Executive / Management";
    case "admin":
      return "System administrator";
    case "accountant":
      return "Accounts & entries";
    case "salesman":
      return "Field sales";
    case "other":
      return "Authorized user";
    default:
      return "Authorized user";
  }
}
