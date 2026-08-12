import { NextResponse } from "next/server";

/**
 * Next.js mirror of api/dev-verify.js
 * Env: DEV_OVERRIDE_KEY (Netlify / server only — never NEXT_PUBLIC_*)
 */
export async function POST(request: Request) {
  try {
    const { key } = (await request.json()) as { key?: string };
    const expected = process.env.DEV_OVERRIDE_KEY;
    const ok = !!expected && key === expected;
    return NextResponse.json({ ok }, { status: ok ? 200 : 401 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
