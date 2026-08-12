import { NextResponse } from "next/server";
import { logoutCurrentSession } from "@/lib/auth/mobile-login";

export async function POST() {
  try {
    await logoutCurrentSession({ revokeCurrentDevice: true });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
