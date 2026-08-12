import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { OwnerPinForm } from "@/components/security/OwnerPinForm";
import { DeveloperSecuritySettingsForm } from "@/components/security/DeveloperSecuritySettingsForm";
import { loadDeveloperProfile } from "@/lib/security/developer-override";

export default async function SecuritySettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "OWNER") redirect("/dashboard");

  const actor = await loadDeveloperProfile(profile.id);
  const isDeveloper = Boolean(actor?.is_developer);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
          Settings → Security
        </p>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Owner / Developer Access
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Owner Override PIN and Developer Override Key are verified only on the
          server. Secrets are never shown in the UI, API responses, frontend
          bundles, or audit logs. Developer Override does not log in as another
          user — it only authorizes administrative operations.
        </p>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <OwnerPinForm />
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <DeveloperSecuritySettingsForm isDeveloper={isDeveloper} />
      </div>
    </div>
  );
}
