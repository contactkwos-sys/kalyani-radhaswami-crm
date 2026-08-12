import { NextResponse } from "next/server";
import { requestForgotPin } from "@/lib/auth/mobile-login";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { mobile?: string };
    const result = await requestForgotPin({
      mobile: String(body.mobile || ""),
      userAgent: request.headers.get("user-agent"),
      ipAddress:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: result.message });
  } catch {
    return NextResponse.json(
      { error: "Unable to process request. Please try again." },
      { status: 500 }
    );
  }
}
