import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import {
  loadDeveloperProfile,
  verifyDeveloperOverride,
} from "@/lib/security/developer-override";
import { listAuditLogs } from "@/lib/security/user-admin";

export async function GET(request: Request) {
  try {
    const profile = await requireProfile();
    if (profile.role !== "OWNER" && profile.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const moduleFilter = url.searchParams.get("module") || undefined;
    const limit = Math.min(
      200,
      Math.max(1, Number(url.searchParams.get("limit") || 100))
    );

    // Full security/developer audit trail requires Owner/Developer (+ optional override)
    if (moduleFilter === "developer_override") {
      const actor = await loadDeveloperProfile(profile.id);
      if (!actor?.is_developer || actor.role !== "OWNER") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const key = url.searchParams.get("override") || undefined;
      if (key) {
        const verified = await verifyDeveloperOverride({
          operation: "VIEW_AUDIT_LOGS",
          overrideKey: key,
        });
        if (!verified.ok) {
          return NextResponse.json(
            { error: verified.error, code: verified.code },
            { status: 403 }
          );
        }
      }
    }

    const logs = await listAuditLogs({ limit, module: moduleFilter });
    return NextResponse.json({ logs });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
