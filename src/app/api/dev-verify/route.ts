import { NextResponse } from "next/server";

/**
 * Next.js mirror of api/dev-verify.js
 * Env: DEV_OVERRIDE_KEY or DEVELOPER_OVERRIDE_KEY (Netlify / server only — never NEXT_PUBLIC_*)
 */
export async function POST(request: Request) {
  try {
    const { key } = (await request.json()) as { key?: string };
    const expected =
      process.env.DEV_OVERRIDE_KEY || process.env.DEVELOPER_OVERRIDE_KEY;
    if (!expected) {
      return NextResponse.json(
        { ok: false, error: "DEV_OVERRIDE_KEY not configured on server" },
        { status: 503 }
      );
    }
    const ok = typeof key === "string" && key === expected;
    return NextResponse.json({ ok }, { status: ok ? 200 : 401 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
