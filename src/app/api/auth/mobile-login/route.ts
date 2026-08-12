import { NextResponse } from "next/server";

/** Mobile number + PIN login removed — use role-tile + PIN at /login. */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Mobile login is disabled. Use role tiles and PIN on the login screen.",
    },
    { status: 410 }
  );
}
