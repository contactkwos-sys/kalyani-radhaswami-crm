/**
 * Server-only PIN→Auth password derivation for role-tile accounts.
 * NEVER import this from client components — PEPPER must not ship in the bundle.
 */

/** Internal Auth password pepper for legacy tile accounts (server env override preferred). */
function getPepper(): string {
  const fromEnv = process.env.AUTH_PIN_PEPPER || process.env.TILE_AUTH_PEPPER;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  // Legacy default kept server-side only for backward compatibility with existing Auth passwords.
  return "kwos-kalyani-radhaswami-2026";
}

export function deriveAuthPassword(loginSlug: string, pin: string): string {
  return `${pin}-${loginSlug}-${getPepper()}`;
}

export function slugEmail(loginSlug: string): string {
  return `${loginSlug}@internal.kwos.local`;
}
