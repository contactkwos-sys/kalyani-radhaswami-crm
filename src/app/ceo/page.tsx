import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/role-login";
import { RoleShell } from "@/components/layout/RoleShell";
import { RequireRole } from "@/components/auth/RequireRole";
import {
  displayProfileName,
  displayRoleLabel,
} from "@/lib/auth/display";

const ALLOWED = ["CEO_1", "CEO_2", "CEO_3"] as const;

export default async function CeoHomePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!ALLOWED.includes(profile.role as (typeof ALLOWED)[number])) {
    redirect(homeForRole(profile.role));
  }

  return (
    <RequireRole
      role={["CEO_1", "CEO_2", "CEO_3"]}
      currentRole={profile.role}
    >
      <RoleShell
        title="CEO"
        subtitle={`${displayProfileName(profile)} · ${displayRoleLabel(profile)}`}
        links={[
          { href: "/dashboard", label: "Dashboard" },
          { href: "/reports", label: "Reports" },
          { href: "/settings/users", label: "Users" },
          { href: "/alerts", label: "Alerts" },
        ]}
      >
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
            CEO workspace
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Welcome. Developer access is not available in CEO settings.
          </p>
        </div>
      </RoleShell>
    </RequireRole>
  );
}
