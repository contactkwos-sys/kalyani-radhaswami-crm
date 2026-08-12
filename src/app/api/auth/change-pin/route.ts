import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { changeOwnPin } from "@/lib/auth/mobile-login";

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
