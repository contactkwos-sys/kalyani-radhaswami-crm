"use client";

import { useTransition } from "react";
import { setCompanyScope } from "@/lib/auth/actions";
import type { Company, CompanyScope, Profile } from "@/types/database";

export function CompanySwitcher({
  profile,
  companies,
}: {
  profile: Profile;
  companies: Company[];
}) {
  const [pending, startTransition] = useTransition();

  function onChange(value: string) {
    startTransition(async () => {
      if (value === "ALL") {
        await setCompanyScope("ALL");
        return;
      }
      const company = companies.find((c) => c.id === value);
      if (!company) return;
      const scope: CompanyScope =
        company.code === "RADHASWAMI" ? "RADHASWAMI" : "KALYANI";
      await setCompanyScope(scope, company.id);
    });
  }

  const current =
    profile.company_scope === "ALL"
      ? "ALL"
      : profile.preferred_company_id ||
        companies.find((c) => c.code === profile.company_scope)?.id ||
        "";

  const canSelectAll = ["OWNER", "CEO_1", "CEO_2", "CEO_3", "ADMIN"].includes(
    profile.role
  );

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-[var(--muted)]">Company</span>
      <select
        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-medium text-[var(--ink)] outline-none focus:border-[var(--accent)]"
        value={current}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Switch company (Kalyani or Radhaswami)"
      >
        {canSelectAll && <option value="ALL">All Companies</option>}
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
