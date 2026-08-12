import { NextResponse } from "next/server";

/** Client uses listActiveUsers() from auth-lib directly. */
export async function GET() {
  return NextResponse.json(
    { error: "Use public_active_users via auth-lib on the client." },
    { status: 410 }
  );
}
