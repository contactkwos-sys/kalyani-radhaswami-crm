import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import {
  getAccessibleCompanies,
  getCurrentProfile,
} from "@/lib/auth/session";
import { userMustChangePin } from "@/lib/auth/mobile-login";
import { getLicensesForCompanies } from "@/lib/license/trial";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const mustChange = await userMustChangePin(profile.id);

  const companies = await getAccessibleCompanies(profile.id, profile.role);
  const licenses = await getLicensesForCompanies(companies.map((c) => c.id));

  const selectedIds =
    profile.company_scope === "ALL" || !profile.preferred_company_id
      ? companies.map((c) => c.id)
      : [profile.preferred_company_id];

  const relevantLicenses = licenses.filter((l) =>
    selectedIds.includes(l.company_id)
  );

  const blocked =
    relevantLicenses.length > 0 &&
    relevantLicenses.every(
      (l) => l.status === "TRIAL_EXPIRED" || l.status === "SUSPENDED"
    );

  // Allow license/security settings even when trial expired (Owner activation path)
  return (
    <AppShell
      profile={profile}
      companies={companies}
      licenses={relevantLicenses}
    >
      {mustChange ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          You must change your temporary PIN.{" "}
          <a href="/settings/account" className="font-semibold underline">
            Change My PIN
          </a>
        </div>
      ) : null}
      {blocked ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-red-900">
              Your 7-day free trial has expired.
            </h2>
            <p className="mt-2 text-sm text-red-800">
              Your data is safe. Operational entry is blocked until the account
              is activated.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={`https://wa.me/9825063208?text=${encodeURIComponent(
                  "Hello, my CRM trial has expired. Please activate Kalyani / Radhaswami Thread CRM."
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white"
              >
                CONTACT ON WHATSAPP
              </a>
              <a
                href="/settings/license"
                className="rounded-md border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-900"
              >
                REQUEST ACTIVATION
              </a>
            </div>
          </div>
          {children}
        </div>
      ) : (
        children
      )}
    </AppShell>
  );
}
