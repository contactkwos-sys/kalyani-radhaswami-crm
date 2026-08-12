import { redirect } from "next/navigation";
import { ChangePinForm } from "@/components/auth/ChangePinForm";
import { getCurrentProfile } from "@/lib/auth/session";

export default async function AccountSecurityPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
          Settings → Account
        </p>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Change PIN
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Your PIN is stored as a secure hash. After changing it, remembered
          devices are signed out and you must log in again.
        </p>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <ChangePinForm />
      </div>
    </div>
  );
}
