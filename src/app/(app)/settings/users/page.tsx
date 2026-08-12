import Link from "next/link";
import { redirect } from "next/navigation";
import { AddUserForm } from "@/components/admin/AddUserForm";
import { PendingPinResets } from "@/components/admin/PendingPinResets";
import { getCurrentProfile } from "@/lib/auth/session";
import {
  listPendingPinResetRequests,
  listUsersForAdmin,
} from "@/lib/auth/mobile-login";
import {
  displayProfileName,
  displayRoleLabel,
  isDeveloperIdentity,
} from "@/lib/auth/display";
import { canManageUsersModule } from "@/lib/auth/modules";
import { isOverrideConfigured } from "@/lib/security/developer-override";
import { ROLE_PERMISSIONS } from "@/types/database";

export default async function UsersManagementPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (
    !ROLE_PERMISSIONS[profile.role].canManageUsers ||
    !canManageUsersModule(profile)
  ) {
    redirect("/dashboard");
  }

  const actorIsDeveloper = isDeveloperIdentity(profile);
  const users = await listUsersForAdmin({ viewerIsDeveloper: actorIsDeveloper });
  const pendingResets = await listPendingPinResetRequests();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
            Settings → User Management
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Users
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Create and configure business users with Mobile + PIN login, roles,
            departments, and allowed modules. PIN values are never shown after
            save.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/settings/audit-logs"
            className="font-semibold text-[var(--accent)] hover:underline"
          >
            Security / audit logs
          </Link>
          {actorIsDeveloper && (
            <Link
              href="/settings/security"
              className="font-semibold text-[var(--accent)] hover:underline"
            >
              Security settings
            </Link>
          )}
        </div>
      </div>

      <AddUserForm
        actorIsDeveloper={actorIsDeveloper}
        overrideConfigured={isOverrideConfigured()}
      />

      <PendingPinResets requests={pendingResets} users={users} />

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Mobile</th>
              <th className="px-4 py-3">PIN</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3">PIN changed</th>
              <th className="px-4 py-3">Devices</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Security</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-3">
                  <p className="font-medium">{displayProfileName(u)}</p>
                </td>
                <td className="px-4 py-3">{displayRoleLabel(u)}</td>
                <td className="px-4 py-3">{u.department || "—"}</td>
                <td className="px-4 py-3">{u.mobile_number || "—"}</td>
                <td className="px-4 py-3">{u.has_pin ? "Set" : "Not set"}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {u.last_login_at
                    ? new Date(u.last_login_at).toLocaleString()
                    : "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {u.pin_changed_at
                    ? new Date(u.pin_changed_at).toLocaleString()
                    : "—"}
                </td>
                <td className="px-4 py-3">{u.active_devices}</td>
                <td className="px-4 py-3">
                  {u.is_active ? "Active" : "Disabled"}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/settings/users/${u.id}/security`}
                    className="font-semibold text-[var(--accent)] hover:underline"
                  >
                    Reset PIN / Security
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
