import { NextResponse } from "next/server";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { changeOwnerPin, isOwnerPinConfigured } from "@/lib/security/owner-pin";

const changeSchema = z.object({
  currentPin: z.string().min(4).max(8),
  newPin: z.string().regex(/^\d{4,8}$/),
  confirmPin: z.string().regex(/^\d{4,8}$/),
});

export async function GET() {
  try {
    const profile = await requireProfile();
    if (profile.role !== "OWNER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const configured = await isOwnerPinConfigured();
    return NextResponse.json({
      configured,
      // Never return hash or PIN
    });
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
    const parsed = changeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid PIN format. Use 4–8 digits." },
        { status: 400 }
      );
    }

    const { currentPin, newPin, confirmPin } = parsed.data;
    if (newPin !== confirmPin) {
      return NextResponse.json(
        { error: "New PIN and confirmation do not match." },
        { status: 400 }
      );
    }

    const result = await changeOwnerPin({
      userId: profile.id,
      currentPin,
      newPin,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "Owner Override PIN updated. Previous override sessions invalidated.",
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
