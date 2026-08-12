import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

/** Next.js mirror of api/dev-verify.js (Netlify function). Env: DEV_OVERRIDE_KEY */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { key?: string };
    const expected = process.env.DEV_OVERRIDE_KEY || "";
    if (!expected) {
      return NextResponse.json(
        { error: "DEV_OVERRIDE_KEY not configured" },
        { status: 503 }
      );
    }
    if (!safeEqual(String(body.key || ""), expected)) {
      return NextResponse.json({ error: "Invalid key" }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
