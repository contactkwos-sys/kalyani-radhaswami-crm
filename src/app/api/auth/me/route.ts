import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/role-login";
import {
  displayProfileName,
  displayRoleLabel,
} from "@/lib/auth/display";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    id: profile.id,
    role: profile.role,
    name: displayProfileName(profile),
    roleLabel: displayRoleLabel(profile),
    home: homeForRole(profile.role),
  });
}
