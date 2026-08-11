import { redirect } from "next/navigation";
import {
  getAccessibleCompanies,
  getCurrentProfile,
} from "@/lib/auth/session";
import {
  formatTrialRemaining,
  getLicensesForCompanies,
  getSupportWhatsApp,
  whatsappLink,
} from "@/lib/license/trial";
import { BRANDING } from "@/types/database";

export default async function LicenseSettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const companies = await getAccessibleCompanies(profile.id, profile.role);
  const licenses = await getLicensesForCompanies(companies.map((c) => c.id));
  const whatsapp = await getSupportWhatsApp();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
          Settings → License
        </p>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Trial &amp; License
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Status is computed on the server from trial timestamps. Clearing
          browser data cannot reset the trial.
        </p>
      </div>

      <div className="grid gap-4">
        {licenses.map((l) => {
          const company = companies.find((c) => c.id === l.company_id);
          return (
            <div
              key={l.company_id}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <h3 className="text-lg font-semibold">{company?.name}</h3>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[var(--muted)]">Status</dt>
                  <dd className="font-medium">{l.status}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Trial remaining</dt>
                  <dd className="font-medium">
                    {formatTrialRemaining(l.trial_remaining_seconds)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Trial start (server)</dt>
                  <dd>{new Date(l.trial_start_at).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Trial end (server)</dt>
                  <dd>{new Date(l.trial_end_at).toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <a
          href={whatsappLink(
            whatsapp,
            "Hello, I request activation for Kalyani / Radhaswami Thread CRM."
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white"
        >
          CONTACT ON WHATSAPP
        </a>
        <a
          href={`mailto:${BRANDING.supportEmail}?subject=CRM%20Activation%20Request`}
          className="rounded-md border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-semibold"
        >
          REQUEST ACTIVATION
        </a>
      </div>
    </div>
  );
}
