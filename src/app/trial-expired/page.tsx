import { BrandingFooter } from "@/components/branding/BrandingFooter";
import { BRANDING } from "@/types/database";
import { whatsappLink } from "@/lib/license/trial";
import Link from "next/link";

export default function TrialExpiredPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
          License
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
          Your 7-day free trial has expired.
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Parties, sales, visits, follow-ups and reports are preserved. Normal
          operational entry is blocked until activation.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a
            href={whatsappLink(
              BRANDING.supportWhatsApp,
              "Hello, my 7-day free trial has expired. Please activate the CRM."
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-[var(--accent)] px-4 py-3 text-center text-sm font-semibold text-white"
          >
            CONTACT ON WHATSAPP
          </a>
          <Link
            href="/settings/license"
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-center text-sm font-semibold"
          >
            REQUEST ACTIVATION
          </Link>
        </div>
      </main>
      <BrandingFooter />
    </div>
  );
}
