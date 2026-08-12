import { NextResponse } from "next/server";
import { loginWithRolePin } from "@/lib/auth/role-login";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { tileKey?: string; pin?: string };
    const result = await loginWithRolePin({
      tileKey: String(body.tileKey || ""),
      pin: String(body.pin || ""),
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, mustSetPin: Boolean(result.mustSetPin) },
        { status: 401 }
      );
    }
    return NextResponse.json({
      ok: true,
      role: result.role,
      home: result.home,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to sign in. Please try again." },
      { status: 500 }
    );
  }
}
