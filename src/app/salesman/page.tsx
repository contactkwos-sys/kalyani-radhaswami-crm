"use client";

import RequireRole from "@/components/auth/RequireRole";
import { RoleShell } from "@/components/layout/RoleShell";

function SalesmanDashboard() {
  return (
    <RoleShell
      title="Salesman"
      links={[
        { href: "/today", label: "Today" },
        { href: "/sales/new", label: "New sale" },
        { href: "/follow-ups", label: "Follow-ups" },
        { href: "/parties", label: "Parties" },
      ]}
    >
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
          Salesman workspace
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Start your day from Today, then log sales and follow-ups.
        </p>
      </div>
    </RoleShell>
  );
}

export default function SalesmanPage() {
  return (
    <RequireRole role="salesman">
      <SalesmanDashboard />
    </RequireRole>
  );
}
