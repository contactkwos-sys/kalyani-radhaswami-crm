import { BRANDING } from "@/types/database";

function whatsappHref(number: string) {
  return `https://wa.me/${number.replace(/\D/g, "")}`;
}

export function BrandingFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer
      className={`border-t border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] ${
        compact ? "px-4 py-3 text-xs" : "px-6 py-4 text-sm"
      }`}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-medium text-[var(--ink)]">{BRANDING.builder}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <a
            href={`mailto:${BRANDING.supportEmail}`}
            className="hover:text-[var(--accent)] hover:underline"
          >
            Support: {BRANDING.supportEmail}
          </a>
          <a
            href={whatsappHref(BRANDING.supportWhatsApp)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--accent)] hover:underline"
          >
            WhatsApp: {BRANDING.supportWhatsAppDisplay}
          </a>
        </div>
      </div>
    </footer>
  );
}
