import Link from "next/link";
import { CompanySwitcher } from "@/components/company/CompanySwitcher";
import { BrandingFooter } from "@/components/branding/BrandingFooter";
import { TrialBanner } from "@/components/license/TrialBanner";
import type { Company, LicenseView, Profile } from "@/types/database";
import { SignOutButton } from "@/components/auth/SignOutButton";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products", label: "Products" },
  { href: "/salesmen", label: "Salesmen" },
  { href: "/parties", label: "Parties" },
  { href: "/assignments", label: "Assignments", ownerAdmin: true },
  { href: "/settings/company", label: "Company" },
  { href: "/settings/license", label: "License" },
  { href: "/settings/security", label: "Security", ownerOnly: true },
];

export function AppShell({
  profile,
  companies,
  licenses,
  children,
}: {
  profile: Profile;
  companies: Company[];
  licenses: LicenseView[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <TrialBanner licenses={licenses} />
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              Sales Force CRM
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]">
              Kalyani · Radhaswami
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <CompanySwitcher profile={profile} companies={companies} />
            <div className="text-right text-sm">
              <p className="font-medium text-[var(--ink)]">{profile.full_name}</p>
              <p className="text-xs text-[var(--muted)]">{profile.role}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {NAV.filter((item) => {
            if ("ownerOnly" in item && item.ownerOnly)
              return profile.role === "OWNER";
            if ("ownerAdmin" in item && item.ownerAdmin)
              return profile.role === "OWNER" || profile.role === "ADMIN";
            return true;
          }).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <BrandingFooter compact />
    </div>
  );
}
