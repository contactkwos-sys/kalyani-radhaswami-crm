import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeInvite } from "@/lib/auth/invites";

const schema = z.object({
  token: z.string().min(20).max(200),
  pin: z.string().regex(/^\d{4,8}$/),
  remember: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter the temporary PIN from your Admin." },
        { status: 400 }
      );
    }
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null;
    const userAgent = request.headers.get("user-agent");

    const result = await consumeInvite({
      token: parsed.data.token,
      pin: parsed.data.pin,
      remember: Boolean(parsed.data.remember),
      userAgent,
      ipAddress,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }
    return NextResponse.json({
      ok: true,
      home: "/dashboard",
      mustChangePin: result.mustChangePin,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to accept invite." },
      { status: 500 }
    );
  }
}
