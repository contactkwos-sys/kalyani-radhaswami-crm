import { NextResponse } from "next/server";
import { setFirstPin } from "@/lib/auth/role-login";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      tileKey?: string;
      pin?: string;
      confirmPin?: string;
    };
    const result = await setFirstPin({
      tileKey: String(body.tileKey || ""),
      pin: String(body.pin || ""),
      confirmPin: String(body.confirmPin || ""),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      role: result.role,
      home: result.home,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to set PIN. Please try again." },
      { status: 500 }
    );
  }
}
