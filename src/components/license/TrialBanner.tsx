import Link from "next/link";
import type { LicenseView } from "@/types/database";
import { formatTrialRemaining, whatsappLink } from "@/lib/license/trial";
import { BRANDING } from "@/types/database";

export function TrialBanner({
  licenses,
}: {
  licenses: LicenseView[];
}) {
  const actionable = licenses.filter(
    (l) =>
      l.status === "TRIAL_ACTIVE" ||
      l.status === "TRIAL_EXPIRING" ||
      l.status === "TRIAL_EXPIRED"
  );
  if (actionable.length === 0) return null;

  const worst = actionable.reduce((a, b) =>
    a.trial_remaining_seconds < b.trial_remaining_seconds ? a : b
  );

  if (worst.status === "TRIAL_EXPIRED") {
    return (
      <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
        Your 7-day free trial has expired.{" "}
        <Link href="/trial-expired" className="font-semibold underline">
          Activate account
        </Link>
      </div>
    );
  }

  const tone =
    worst.status === "TRIAL_EXPIRING"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink)]";

  return (
    <div className={`border-b px-4 py-2 text-sm ${tone}`}>
      Trial: {formatTrialRemaining(worst.trial_remaining_seconds)}
      {worst.status === "TRIAL_EXPIRING" && (
        <>
          {" · "}
          <a
            href={whatsappLink(
              BRANDING.supportWhatsApp,
              "Hello, I need to activate my Kalyani / Radhaswami CRM license."
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline"
          >
            Contact on WhatsApp
          </a>
        </>
      )}
    </div>
  );
}
