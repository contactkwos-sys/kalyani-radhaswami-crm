import { NextResponse } from "next/server";
import { listLoginTiles } from "@/lib/auth/role-login";

export async function GET() {
  try {
    const tiles = await listLoginTiles();
    return NextResponse.json({ tiles });
  } catch {
    return NextResponse.json({ tiles: [] });
  }
}
