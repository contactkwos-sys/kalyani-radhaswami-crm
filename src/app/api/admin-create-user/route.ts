import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

/**
 * Next.js mirror of api/admin-create-user.js (Netlify function).
 * Env: DEV_OVERRIDE_KEY, SUPABASE_SERVICE_ROLE_KEY
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      key?: string;
      email?: string;
      password?: string;
      fullName?: string;
      role?: string;
    };
    const expected = process.env.DEV_OVERRIDE_KEY || "";
    if (!expected || !safeEqual(String(body.key || ""), expected)) {
      return NextResponse.json({ error: "Invalid key" }, { status: 401 });
    }

    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.fullName || "").trim();
    const role = String(body.role || "ADMIN");
    if (!email || !password || !fullName) {
      return NextResponse.json(
        { error: "email, password, fullName required" },
        { status: 400 }
      );
    }

    const admin = createServiceClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const userId = data.user?.id;
    if (userId) {
      await admin.from("crm_profiles").upsert({
        id: userId,
        email,
        full_name: fullName,
        role,
        is_active: true,
        company_scope: "ALL",
      });
    }

    return NextResponse.json({ ok: true, id: userId, email, role });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
