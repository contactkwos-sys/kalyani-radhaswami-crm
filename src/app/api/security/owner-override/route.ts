import { NextResponse } from "next/server";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import {
  createOwnerOverrideSession,
  hasValidOwnerOverride,
} from "@/lib/security/owner-pin";

const schema = z.object({
  pin: z.string().min(4).max(8),
});

export async function GET() {
  try {
    const profile = await requireProfile();
    if (profile.role !== "OWNER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const active = await hasValidOwnerOverride(profile.id);
    return NextResponse.json({ active });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requireProfile();
    if (profile.role !== "OWNER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid PIN." }, { status: 400 });
    }

    const result = await createOwnerOverrideSession({
      userId: profile.id,
      pin: parsed.data.pin,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      expiresAt: result.expiresAt,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
