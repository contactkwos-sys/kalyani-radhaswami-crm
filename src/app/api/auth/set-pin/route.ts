import { NextResponse } from "next/server";

/** Client uses completeFirstLogin() from auth-lib. */
export async function POST() {
  return NextResponse.json(
    { error: "Use client completeFirstLogin from auth-lib." },
    { status: 410 }
  );
}
