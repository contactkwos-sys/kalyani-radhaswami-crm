import { NextResponse } from "next/server";
import { tryRestoreTrustedDeviceSession } from "@/lib/auth/mobile-login";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const accept = request.headers.get("accept") || "";
  const wantsJson =
    accept.includes("application/json") ||
    new URL(request.url).searchParams.get("format") === "json";

  try {
    const ok = await tryRestoreTrustedDeviceSession();
    if (ok) {
      if (wantsJson) {
        return NextResponse.json({ ok: true, home: "/dashboard" });
      }
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  } catch {
    // fall through
  }

  if (wantsJson) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.redirect(`${origin}/login`);
}
