import { redirect } from "next/navigation";
import { ChangePinForm } from "@/components/auth/ChangePinForm";
import { getCurrentProfile } from "@/lib/auth/session";
import { isDeveloperIdentity } from "@/lib/auth/display";

export default async function AccountSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ forced?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const params = await searchParams;
  const forced = params.forced === "1";

  // Only the protected developer identity may self-change PIN.
  // All business users must request a CEO/Owner reset.
  if (!isDeveloperIdentity(profile)) {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
            Settings → Security
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            PIN management
          </h2>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--ink)]">
          <p>
            Only authorised CEO/Owner users can change or reset PINs from{" "}
            <a
              href="/settings/users"
              className="font-semibold text-[var(--accent)] underline"
            >
              Settings → User Management
            </a>
            .
          </p>
          <p className="mt-2 text-[var(--muted)]">
            Salesman, Accountant, Manager, and other employees cannot change
            their own PIN. Use Forgot PIN to submit a secure reset request, or
            contact your CEO/Owner.
          </p>
          {forced ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
              Your account was flagged for a PIN update. Ask your CEO/Owner to
              reset it in User Management.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
          System Administration → Change PIN
        </p>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Administrator PIN
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Rotate the system administration PIN. After changing it, remembered
          devices are signed out and you must log in again.
        </p>
        {forced ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            A temporary or bootstrap PIN was used. Choose a new PIN before
            continuing maintenance work.
          </p>
        ) : null}
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <ChangePinForm />
      </div>
    </div>
  );
}
