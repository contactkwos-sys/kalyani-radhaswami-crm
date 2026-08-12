"use client";

import RequireRole from "@/components/auth/RequireRole";
import { RoleShell } from "@/components/layout/RoleShell";

function CeoDashboard() {
  return (
    <RoleShell
      title="CEO"
      links={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/reports", label: "Reports" },
        { href: "/settings/users", label: "Users" },
        { href: "/alerts", label: "Alerts" },
      ]}
    >
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
          CEO workspace
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Welcome. Developer access is not available in CEO settings.
        </p>
      </div>
    </RoleShell>
  );
}

export default function CeoPage() {
  return (
    <RequireRole role="ceo">
      <CeoDashboard />
    </RequireRole>
  );
}
