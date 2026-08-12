import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/role-login";
import { RoleShell } from "@/components/layout/RoleShell";
import { RequireRole } from "@/components/auth/RequireRole";
import {
  displayProfileName,
  displayRoleLabel,
} from "@/lib/auth/display";

export default async function AccountantHomePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "ACCOUNTANT") redirect(homeForRole(profile.role));

  return (
    <RequireRole role="ACCOUNTANT" currentRole={profile.role}>
      <RoleShell
        title="Accountant"
        subtitle={`${displayProfileName(profile)} · ${displayRoleLabel(profile)}`}
        links={[
          { href: "/sales", label: "Sales" },
          { href: "/incentives", label: "Incentives" },
          { href: "/reports", label: "Reports" },
        ]}
      >
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
            Accountant workspace
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Review sales and incentive figures from this role home.
          </p>
        </div>
      </RoleShell>
    </RequireRole>
  );
}
