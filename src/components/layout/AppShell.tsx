import Link from "next/link";
import { CompanySwitcher } from "@/components/company/CompanySwitcher";
import { BrandingFooter } from "@/components/branding/BrandingFooter";
import { TrialBanner } from "@/components/license/TrialBanner";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { GlobalSearch } from "@/components/intelligence/GlobalSearch";
import type { Company, LicenseView, Profile } from "@/types/database";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { isExecutiveRole } from "@/lib/auth/roles";
import {
  displayProfileName,
  displayRoleLabel,
  isDeveloperIdentity,
} from "@/lib/auth/display";
import { hasModuleAccess, type CrmModule } from "@/lib/auth/modules";

const NAV: Array<{
  href: string;
  label: string;
  module: CrmModule;
  management?: boolean;
  ownerAdmin?: boolean;
  ownerOnly?: boolean;
  developerOnly?: boolean;
}> = [
  { href: "/dashboard", label: "Dashboard", module: "dashboard" },
  { href: "/today", label: "Today", module: "today" },
  { href: "/follow-ups", label: "Follow-up", module: "followups" },
  { href: "/sales", label: "Sales", module: "sales" },
  { href: "/incentives", label: "Incentives", module: "incentives" },
  { href: "/reports", label: "Reports", module: "reports", management: true },
  { href: "/alerts", label: "Alerts", module: "alerts", ownerAdmin: true },
  {
    href: "/intervention",
    label: "Intervention",
    module: "intervention",
    ownerAdmin: true,
  },
  {
    href: "/reports/matrix",
    label: "Matrix",
    module: "reports",
    ownerAdmin: true,
  },
  {
    href: "/reports/daily-review",
    label: "Daily review",
    module: "reports",
    ownerAdmin: true,
  },
  { href: "/products", label: "Products", module: "products" },
  { href: "/salesmen", label: "Salesmen", module: "salesmen" },
  { href: "/parties", label: "Parties", module: "parties" },
  {
    href: "/assignments",
    label: "Assignments",
    module: "assignments",
    ownerAdmin: true,
  },
  {
    href: "/settings/targets",
    label: "Targets",
    module: "targets",
    ownerAdmin: true,
  },
  {
    href: "/settings/incentives",
    label: "Incentive rules",
    module: "incentives",
    ownerAdmin: true,
  },
  {
    href: "/settings/intelligence",
    label: "Intelligence",
    module: "settings",
    ownerAdmin: true,
  },
  {
    href: "/settings/backup",
    label: "Backup",
    module: "backup",
    ownerAdmin: true,
  },
  {
    href: "/settings/users",
    label: "Users",
    module: "users",
    ownerAdmin: true,
  },
  {
    href: "/settings/audit-logs",
    label: "Audit",
    module: "audit",
    ownerAdmin: true,
  },
  {
    href: "/settings/account",
    label: "Developer PIN",
    module: "settings",
    developerOnly: true,
  },
  { href: "/settings/company", label: "Company", module: "company" },
  { href: "/settings/license", label: "License", module: "license" },
  {
    href: "/settings/security",
    label: "Security",
    module: "security",
    ownerOnly: true,
  },
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
  const roleLabel = displayRoleLabel(profile);
  const displayName = displayProfileName(profile);
  const isExec = isExecutiveRole(profile.role);
  const isDev = isDeveloperIdentity(profile);
  const canSearch = isExec || profile.role === "SALES_MANAGER";

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
            {canSearch && (
              <div className="hidden md:block">
                <GlobalSearch />
              </div>
            )}
            <CompanySwitcher profile={profile} companies={companies} />
            <div className="text-right text-sm">
              <p className="font-medium text-[var(--ink)]">{displayName}</p>
              <p className="text-xs text-[var(--muted)]">{roleLabel}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {NAV.filter((item) => {
            if (item.developerOnly) return isDev;
            if (item.ownerOnly) return profile.role === "OWNER" || isDev;
            if (item.ownerAdmin && !isExec) return false;
            if (
              item.management &&
              ![
                "OWNER",
                "CEO_1",
                "CEO_2",
                "CEO_3",
                "ADMIN",
                "SALES_MANAGER",
                "ACCOUNTANT",
                "VIEWER",
              ].includes(profile.role)
            ) {
              return false;
            }
            return hasModuleAccess(profile, item.module);
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
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 md:pb-6">
        {children}
      </main>
      <BrandingFooter compact />
      <MobileBottomNav />
    </div>
  );
}
