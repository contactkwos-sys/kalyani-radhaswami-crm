import { redirect } from "next/navigation";
import {
  getAccessibleCompanies,
  getCurrentProfile,
} from "@/lib/auth/session";

export default async function CompanySettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const companies = await getAccessibleCompanies(profile.id, profile.role);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
          Settings → Company
        </p>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Companies
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Every business record is scoped by company_id. Owner can switch
          between Kalyani Thread, Radhaswami Thread, or All Companies.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {companies.map((c) => (
          <div
            key={c.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          >
            <h3 className="text-xl font-semibold">{c.name}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">Code</dt>
                <dd className="font-medium">{c.code}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">GPS radius</dt>
                <dd className="font-medium">{c.gps_radius_meters}m</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">Support WhatsApp</dt>
                <dd className="font-medium">{c.support_whatsapp}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">Status</dt>
                <dd className="font-medium">
                  {c.is_active ? "Active" : "Inactive"}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
