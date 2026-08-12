/**
 * Reference RequireRole guard (JSX). App uses src/components/auth/RequireRole.tsx
 * and next/navigation (App Router).
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { homeForRole } from "./02_auth_lib.js";

export function RequireRole({ role, children, currentRole }) {
  const router = useRouter();
  const allowed = Array.isArray(role) ? role : [role];
  const [ready, setReady] = useState(Boolean(currentRole));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let r = currentRole;
      if (!r) {
        const res = await fetch("/api/auth/me");
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.role) {
          router.replace("/login");
          return;
        }
        r = data.role;
      }
      if (cancelled) return;
      if (!allowed.includes(r)) {
        router.replace(homeForRole(r));
        return;
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, currentRole, router]);

  if (!ready) return <p>Checking access…</p>;
  return children;
}
