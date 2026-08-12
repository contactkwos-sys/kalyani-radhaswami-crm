import { NextResponse } from "next/server";

/** Client uses loginWithPin() from auth-lib (signInWithPassword). */
export async function POST() {
  return NextResponse.json(
    { error: "Use client loginWithPin from auth-lib." },
    { status: 410 }
  );
}
