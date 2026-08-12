import { redirect } from "next/navigation";
import { ChangePinForm } from "@/components/auth/ChangePinForm";
import { getCurrentProfile } from "@/lib/auth/session";

export default async function AccountSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ forced?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const params = await searchParams;
  const forced = params.forced === "1";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
          Settings → Security → Change My PIN
        </p>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Change My PIN
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Your PIN is stored as a secure hash. After changing it, remembered
          devices are signed out and you must log in again.
        </p>
        {forced ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            A temporary or bootstrap PIN was used. Choose a new PIN before
            continuing normal work.
          </p>
        ) : null}
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <ChangePinForm />
      </div>
    </div>
  );
}
