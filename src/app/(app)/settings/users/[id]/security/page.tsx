import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { UserSecurityPanel } from "@/components/admin/UserSecurityPanel";
import { getCurrentProfile } from "@/lib/auth/session";
import { listDevicesForUser } from "@/lib/auth/mobile-login";
import {
  isOverrideConfigured,
  loadDeveloperProfile,
} from "@/lib/security/developer-override";
import { createServiceClient } from "@/lib/supabase/admin";
import { ROLE_PERMISSIONS } from "@/types/database";

export default async function UserSecurityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!ROLE_PERMISSIONS[profile.role].canManageUsers) redirect("/dashboard");

  const { id } = await params;
  const admin = createServiceClient();
  const { data: user } = await admin
    .from("crm_profiles")
    .select(
      "id, email, full_name, mobile, role, is_active, is_primary_owner, is_developer"
    )
    .eq("id", id)
    .maybeSingle();
  if (!user) notFound();

  const { data: login } = await admin
    .from("crm_user_login")
    .select("mobile_number, last_login_at, pin_updated_at, locked_until")
    .eq("user_id", id)
    .maybeSingle();

  const devices = await listDevicesForUser(id);
  const actor = await loadDeveloperProfile(profile.id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings/users"
          className="text-sm text-[var(--accent)] hover:underline"
        >
          ← User Management
        </Link>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
          Settings → User Management → Security
        </p>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          {user.full_name}
        </h2>
      </div>
      <UserSecurityPanel
        user={{
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          is_active: user.is_active,
          mobile_number: login?.mobile_number || user.mobile,
          last_login_at: login?.last_login_at || null,
          pin_updated_at: login?.pin_updated_at || null,
          locked_until: login?.locked_until || null,
          has_pin: Boolean(login),
          is_primary_owner: Boolean(user.is_primary_owner),
          is_developer: Boolean(user.is_developer),
        }}
        devices={devices as never}
        security={{
          overrideConfigured: isOverrideConfigured(),
          actorIsDeveloper: Boolean(
            actor?.role === "OWNER" && actor.is_developer
          ),
          isPrimaryOwner: Boolean(user.is_primary_owner),
        }}
      />
    </div>
  );
}
