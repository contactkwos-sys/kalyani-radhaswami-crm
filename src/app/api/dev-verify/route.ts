import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { normalizeMobile } from "@/lib/auth/pin";
import { createServiceClient } from "@/lib/supabase/admin";

function safeEqual(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ab.length !== bb.length) {
      timingSafeEqual(ab, ab);
      return false;
    }
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * Hidden developer diagnostic gate.
 * Accepts either:
 *  - DEVELOPER_OVERRIDE_KEY / DEV_OVERRIDE_KEY
 *  - DEVELOPER_OVERRIDE_MOBILE + DEVELOPER_OVERRIDE_PIN_HASH (bcrypt)
 * Never exposes secrets; never validates in the browser.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      key?: string;
      mobile?: string;
      pin?: string;
    };

    const expectedKey =
      process.env.DEV_OVERRIDE_KEY || process.env.DEVELOPER_OVERRIDE_KEY || "";

    let ok = false;
    let method: "override_key" | "mobile_pin" | null = null;

    if (typeof body.key === "string" && expectedKey && safeEqual(body.key, expectedKey)) {
      ok = true;
      method = "override_key";
    }

    if (!ok && body.mobile && body.pin) {
      const configuredMobile = normalizeMobile(
        process.env.DEVELOPER_OVERRIDE_MOBILE || ""
      );
      const pinHash = process.env.DEVELOPER_OVERRIDE_PIN_HASH || "";
      const mobile = normalizeMobile(body.mobile);
      if (
        configuredMobile &&
        pinHash &&
        mobile &&
        safeEqual(mobile, configuredMobile) &&
        (await bcrypt.compare(body.pin, pinHash))
      ) {
        ok = true;
        method = "mobile_pin";
      }
    }

    if (ok) {
      try {
        const admin = createServiceClient();
        await admin.from("crm_audit_logs").insert({
          user_id: null,
          action: "DEVELOPER_OVERRIDE_CONSOLE_UNLOCK",
          module: "developer_override",
          record_type: "dev_console",
          metadata: { method },
        });
      } catch {
        /* ignore audit failures */
      }
    }

    if (!expectedKey && !process.env.DEVELOPER_OVERRIDE_PIN_HASH) {
      return NextResponse.json(
        { ok: false, error: "Developer Override secrets not configured on server" },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok }, { status: ok ? 200 : 401 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
