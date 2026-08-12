import { NextResponse } from "next/server";
import { loginWithMobilePin } from "@/lib/auth/mobile-login";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      mobile?: string;
      pin?: string;
      remember?: boolean;
    };
    const result = await loginWithMobilePin({
      mobile: String(body.mobile || ""),
      pin: String(body.pin || ""),
      remember: Boolean(body.remember),
      userAgent: request.headers.get("user-agent"),
      ipAddress:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        null,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }
    return NextResponse.json({ ok: true, role: result.role });
  } catch {
    return NextResponse.json(
      { error: "Unable to sign in. Please try again." },
      { status: 500 }
    );
  }
}
