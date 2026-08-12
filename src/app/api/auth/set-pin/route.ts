import { NextResponse } from "next/server";

/** Client uses setInitialPin() from auth-lib. */
export async function POST() {
  return NextResponse.json(
    { error: "Use client setInitialPin from auth-lib." },
    { status: 410 }
  );
}
