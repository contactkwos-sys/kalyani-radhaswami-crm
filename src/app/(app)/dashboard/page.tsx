import {
  getAccessibleCompanies,
  getCurrentProfile,
} from "@/lib/auth/session";
import { getLicensesForCompanies, formatTrialRemaining } from "@/lib/license/trial";
import { ROLE_PERMISSIONS } from "@/types/database";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const companies = await getAccessibleCompanies(profile.id, profile.role);
  const licenses = await getLicensesForCompanies(companies.map((c) => c.id));
  const perms = ROLE_PERMISSIONS[profile.role];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
          Welcome, {profile.full_name}
        </h2>
        <p className="mt-1 text-[var(--muted)]">
          Phase 1 foundation is live — authentication, companies, roles,
          license/trial and owner security.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Role
          </p>
          <p className="mt-2 text-2xl font-semibold">{perms.label}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {perms.readOnly
              ? "Read-only access"
              : perms.canViewAll
                ? "Full management access"
                : "Scoped operational access"}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Companies
          </p>
          <p className="mt-2 text-2xl font-semibold">{companies.length}</p>
          <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
            {companies.map((c) => (
              <li key={c.id}>{c.name}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            License / Trial
          </p>
          <ul className="mt-2 space-y-2 text-sm">
            {licenses.map((l) => {
              const company = companies.find((c) => c.id === l.company_id);
              return (
                <li key={l.company_id}>
                  <span className="font-medium">{company?.name}</span>
                  <br />
                  <span className="text-[var(--muted)]">
                    {l.status}
                    {l.status.startsWith("TRIAL") &&
                      ` · ${formatTrialRemaining(l.trial_remaining_seconds)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="font-semibold">System status (Phase 1)</h3>
        <ul className="mt-3 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-2">
          <li>✓ Supabase Auth protected routes</li>
          <li>✓ Multi-company architecture</li>
          <li>✓ Roles with database RLS</li>
          <li>✓ Server-side 7-day trial</li>
          <li>✓ Owner Override PIN (hashed)</li>
          <li>✓ Audit logging foundation</li>
        </ul>
      </div>
    </div>
  );
}
