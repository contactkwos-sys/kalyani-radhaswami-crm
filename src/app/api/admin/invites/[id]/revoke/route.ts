import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { canManageUsersModule } from "@/lib/auth/modules";
import { assertPermission } from "@/lib/auth/permissions";
import { revokeUserInvite } from "@/lib/auth/invites";
import { ROLE_PERMISSIONS } from "@/types/database";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await requireProfile();
    try {
      assertPermission(profile, "invite.revoke");
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (
      !ROLE_PERMISSIONS[profile.role].canManageUsers ||
      !canManageUsersModule(profile)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const result = await revokeUserInvite({ actor: profile, inviteId: id });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
