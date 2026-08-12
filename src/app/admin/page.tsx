import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/role-login";
import { RoleShell } from "@/components/layout/RoleShell";
import { RequireRole } from "@/components/auth/RequireRole";
import {
  displayProfileName,
  displayRoleLabel,
} from "@/lib/auth/display";

const ALLOWED = ["OWNER", "ADMIN"] as const;

export default async function AdminHomePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!ALLOWED.includes(profile.role as (typeof ALLOWED)[number])) {
    redirect(homeForRole(profile.role));
  }

  return (
    <RequireRole role={["OWNER", "ADMIN"]} currentRole={profile.role}>
      <RoleShell
        title="Admin"
        subtitle={`${displayProfileName(profile)} · ${displayRoleLabel(profile)}`}
        links={[
          { href: "/settings/users", label: "Users" },
          { href: "/settings/company", label: "Company" },
          { href: "/settings/license", label: "License" },
          { href: "/reports", label: "Reports" },
        ]}
      >
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
            Admin workspace
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            You are signed in to the Admin role home. Use the links above for
            user and company administration.
          </p>
        </div>
      </RoleShell>
    </RequireRole>
  );
}
