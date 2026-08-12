import { NextResponse } from "next/server";
import { tryRestoreTrustedDeviceSession } from "@/lib/auth/mobile-login";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  try {
    const ok = await tryRestoreTrustedDeviceSession();
    if (ok) {
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  } catch {
    // fall through to login
  }
  return NextResponse.redirect(`${origin}/login`);
}
