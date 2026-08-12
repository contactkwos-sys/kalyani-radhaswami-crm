"use client";

import RequireRole from "@/components/auth/RequireRole";
import { RoleShell } from "@/components/layout/RoleShell";

function AccountantDashboard() {
  return (
    <RoleShell
      title="Accountant"
      links={[
        { href: "/sales", label: "Sales" },
        { href: "/incentives", label: "Incentives" },
        { href: "/reports", label: "Reports" },
      ]}
    >
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
          Accountant workspace
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Review sales and incentive figures from this role home.
        </p>
      </div>
    </RoleShell>
  );
}

export default function AccountantPage() {
  return (
    <RequireRole role="accountant">
      <AccountantDashboard />
    </RequireRole>
  );
}
