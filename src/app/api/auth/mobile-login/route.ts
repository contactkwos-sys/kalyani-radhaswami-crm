import { NextResponse } from "next/server";
import { z } from "zod";
import { loginWithMobilePin } from "@/lib/auth/mobile-login";
import { homeForRole } from "@/lib/auth/role-login";
import { isLoginThrottled, recordLoginAttempt } from "@/lib/auth/rate-limit";
import { normalizeMobile } from "@/lib/auth/pin";

const schema = z.object({
  mobile: z.string().min(8).max(20),
  pin: z.string().min(4).max(8),
  remember: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter a valid mobile number and PIN." },
        { status: 400 }
      );
    }

    const mobile = normalizeMobile(parsed.data.mobile) || parsed.data.mobile;
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null;
    const userAgent = request.headers.get("user-agent");

    const throttle = await isLoginThrottled({
      identifier: `mobile:${mobile}`,
      ipAddress,
    });
    if (throttle.throttled) {
      return NextResponse.json(
        { error: throttle.reason || "Too many attempts." },
        { status: 429 }
      );
    }

    const result = await loginWithMobilePin({
      mobile: parsed.data.mobile,
      pin: parsed.data.pin,
      remember: Boolean(parsed.data.remember),
      userAgent,
      ipAddress,
    });

    await recordLoginAttempt({
      identifier: `mobile:${mobile}`,
      ipAddress,
      success: result.ok,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      role: result.role,
      mustChangePin: result.mustChangePin,
      home: homeForRole(result.role),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to sign in." },
      { status: 500 }
    );
  }
}
