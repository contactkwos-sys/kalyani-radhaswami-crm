import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isOverrideConfigured,
  loadDeveloperProfile,
  verifyDeveloperOverride,
} from "@/lib/security/developer-override";
import {
  getSecuritySettings,
  updateSecuritySettings,
} from "@/lib/security/user-admin";

export async function GET() {
  try {
    const actor = await loadDeveloperProfile();
    if (!actor || actor.role !== "OWNER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const settings = await getSecuritySettings();
    return NextResponse.json({
      ...settings,
      overrideConfigured: isOverrideConfigured(),
      isDeveloper: Boolean(actor.is_developer),
      isPrimaryOwner: Boolean(actor.is_primary_owner),
      // Never return the override key
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

const schema = z.object({
  rolePermissions: z.unknown().optional(),
  lockoutPolicy: z
    .object({
      max_failed_attempts: z.number().int().min(3).max(20),
      lockout_minutes: z.number().int().min(1).max(1440),
    })
    .optional(),
  developerOverrideKey: z.string().min(1),
  confirm: z.boolean(),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (!parsed.data.confirm) {
      return NextResponse.json(
        { error: "Confirmation required.", code: "CONFIRM_REQUIRED" },
        { status: 400 }
      );
    }

    const verified = await verifyDeveloperOverride({
      operation: "CHANGE_SECURITY_SETTINGS",
      overrideKey: parsed.data.developerOverrideKey,
      forceOverride: true,
    });
    if (!verified.ok) {
      return NextResponse.json(
        { error: verified.error, code: verified.code },
        { status: 403 }
      );
    }

    await updateSecuritySettings({
      actor: verified.actor,
      rolePermissions: parsed.data.rolePermissions,
      lockoutPolicy: parsed.data.lockoutPolicy,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
