import { NextResponse } from "next/server";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { canManageUsersModule } from "@/lib/auth/modules";
import { assertPermission, hasPermission } from "@/lib/auth/permissions";
import { createUserInvite, listInvitesForUser } from "@/lib/auth/invites";
import { ROLE_PERMISSIONS } from "@/types/database";

const createSchema = z.object({
  userId: z.string().uuid(),
  temporaryPin: z.string().regex(/^\d{4,8}$/).optional(),
});

export async function GET(request: Request) {
  try {
    const profile = await requireProfile();
    if (
      !ROLE_PERMISSIONS[profile.role].canManageUsers ||
      !canManageUsersModule(profile) ||
      !hasPermission(profile, "invite.create")
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const userId = new URL(request.url).searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }
    const invites = await listInvitesForUser(userId);
    return NextResponse.json({ invites });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requireProfile();
    try {
      assertPermission(profile, "invite.create");
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (
      !ROLE_PERMISSIONS[profile.role].canManageUsers ||
      !canManageUsersModule(profile)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const result = await createUserInvite({
      actor: profile,
      userId: parsed.data.userId,
      temporaryPin: parsed.data.temporaryPin,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    return NextResponse.json({
      ok: true,
      inviteUrl: `${origin}${result.invitePath}`,
      invitePath: result.invitePath,
      temporaryPin: result.temporaryPin,
      expiresAt: result.expiresAt,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
