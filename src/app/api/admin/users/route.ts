import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { listUsersForAdmin } from "@/lib/auth/mobile-login";
import { ROLE_PERMISSIONS } from "@/types/database";

export async function GET() {
  try {
    const profile = await requireProfile();
    if (!ROLE_PERMISSIONS[profile.role].canManageUsers) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const users = await listUsersForAdmin();
    return NextResponse.json({ users });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
