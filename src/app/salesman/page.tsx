import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/role-login";
import { RoleShell } from "@/components/layout/RoleShell";
import { RequireRole } from "@/components/auth/RequireRole";
import {
  displayProfileName,
  displayRoleLabel,
} from "@/lib/auth/display";

const ALLOWED = ["SALESMAN", "SALES_MANAGER"] as const;

export default async function SalesmanHomePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!ALLOWED.includes(profile.role as (typeof ALLOWED)[number])) {
    redirect(homeForRole(profile.role));
  }

  return (
    <RequireRole
      role={["SALESMAN", "SALES_MANAGER"]}
      currentRole={profile.role}
    >
      <RoleShell
        title="Salesman"
        subtitle={`${displayProfileName(profile)} · ${displayRoleLabel(profile)}`}
        links={[
          { href: "/today", label: "Today" },
          { href: "/sales/new", label: "New sale" },
          { href: "/follow-ups", label: "Follow-ups" },
          { href: "/parties", label: "Parties" },
        ]}
      >
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
            Salesman workspace
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Start your day from Today, then log sales and follow-ups.
          </p>
        </div>
      </RoleShell>
    </RequireRole>
  );
}
