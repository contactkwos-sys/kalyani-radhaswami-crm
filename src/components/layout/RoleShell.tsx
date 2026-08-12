import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { BrandingFooter } from "@/components/branding/BrandingFooter";

/** Lightweight per-role shell — no shared full CRM nav. */
export function RoleShell({
  title,
  subtitle,
  children,
  links = [],
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  links?: Array<{ href: string; label: string }>;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              Kalyani · Radhaswami
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-xs text-[var(--muted)]">{subtitle}</p>
            ) : null}
          </div>
          <SignOutButton />
        </div>
        {links.length > 0 ? (
          <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      <BrandingFooter compact />
    </div>
  );
}
