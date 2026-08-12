"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppRole } from "@/types/database";
import { homeForRole } from "@/lib/auth/role-login";

type Props = {
  role: AppRole | AppRole[];
  children: React.ReactNode;
  /** Optional profile role from server; if omitted, fetches /api/auth/me */
  currentRole?: AppRole | null;
};

function normalize(role: AppRole | AppRole[]): AppRole[] {
  return Array.isArray(role) ? role : [role];
}

/**
 * Client guard: keep a user on their own role home.
 * Prefer server-side checks in page.tsx; this is a safety net for client islands.
 */
export function RequireRole({ role, children, currentRole }: Props) {
  const router = useRouter();
  const allowedKey = normalize(role).join(",");
  const [ready, setReady] = useState(Boolean(currentRole));

  useEffect(() => {
    let cancelled = false;
    const allowed = allowedKey.split(",") as AppRole[];
    async function run() {
      let r = currentRole;
      if (!r) {
        const res = await fetch("/api/auth/me");
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.role) {
          router.replace("/login");
          return;
        }
        r = data.role as AppRole;
      }
      if (cancelled) return;
      if (!allowed.includes(r!)) {
        router.replace(homeForRole(r!));
        return;
      }
      setReady(true);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [allowedKey, currentRole, router]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted)]">
        Checking access…
      </div>
    );
  }

  return <>{children}</>;
}
