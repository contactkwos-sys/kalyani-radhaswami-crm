import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { changeOwnPin } from "@/lib/auth/mobile-login";
import { isDeveloperIdentity } from "@/lib/auth/display";

/**
 * Self PIN change is restricted.
 * Normal users (salesman/accountant/manager) cannot change their own PIN.
 * Only the protected developer identity may rotate their own PIN (bootstrap).
 * Everyone else must use CEO/Owner → User Management → Reset PIN.
 */
export async function POST(request: Request) {
  try {
    const profile = await requireProfile();
    const body = (await request.json()) as {
      currentPin?: string;
      newPin?: string;
      confirmPin?: string;
    };
    const result = await changeOwnPin({
      userId: profile.id,
      currentPin: String(body.currentPin || ""),
      newPin: String(body.newPin || ""),
      confirmPin: String(body.confirmPin || ""),
      allowSelfChange: isDeveloperIdentity(profile),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      message: "PIN updated. Please sign in again with your new PIN.",
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
