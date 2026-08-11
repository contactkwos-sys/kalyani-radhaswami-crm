import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { OwnerPinForm } from "@/components/security/OwnerPinForm";

export default async function SecuritySettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "OWNER") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
          Settings → Security
        </p>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Owner Access
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Private Owner Override PIN is verified only on the server. It is never
          shown in the UI, API responses, or audit logs.
        </p>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <OwnerPinForm />
      </div>
    </div>
  );
}
