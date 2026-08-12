"use client";

import RequireRole from "@/components/auth/RequireRole";
import { RoleShell } from "@/components/layout/RoleShell";

function AdminDashboard() {
  return (
    <RoleShell
      title="Admin"
      links={[
        { href: "/settings/users", label: "Users" },
        { href: "/settings/company", label: "Company" },
        { href: "/settings/license", label: "License" },
        { href: "/reports", label: "Reports" },
      ]}
    >
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
          Admin workspace
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          You are signed in to the Admin role home.
        </p>
      </div>
    </RoleShell>
  );
}

export default function AdminPage() {
  return (
    <RequireRole role="admin">
      <AdminDashboard />
    </RequireRole>
  );
}
