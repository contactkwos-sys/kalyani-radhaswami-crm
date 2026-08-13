import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { roleSubtitleForLoginRole } from "@/lib/auth/pin-auth-shared";

/** Public login tiles — safe columns only; never developer identities. */
export async function GET() {
  try {
    const admin = createServiceClient();
    const { data, error } = await admin.rpc("list_login_users");
    if (error) {
      // Fallback if RPC not yet migrated
      const { data: rows, error: fallbackErr } = await admin
        .from("app_users")
        .select("id, login_slug, display_name, role, pin_is_set, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (fallbackErr) {
        return NextResponse.json({ error: fallbackErr.message }, { status: 500 });
      }
      const tiles = (rows || []).map((u) => ({
        ...u,
        role_subtitle: roleSubtitleForLoginRole(u.role),
        // Never expose personal CEO names on the public login screen.
        display_name:
          u.role === "ceo"
            ? u.display_name?.toLowerCase().includes("kailash") ||
              u.display_name?.startsWith("CEO (")
              ? "CEO"
              : u.display_name || "CEO"
            : u.display_name,
      }));
      return NextResponse.json({ users: tiles });
    }

    const tiles = (data || []).map(
      (u: {
        id: string;
        login_slug: string;
        display_name: string;
        role: string;
        role_subtitle?: string | null;
        pin_is_set: boolean;
        sort_order: number;
      }) => ({
        id: u.id,
        login_slug: u.login_slug,
        display_name:
          u.role === "ceo" &&
          (u.display_name.toLowerCase().includes("kailash") ||
            u.display_name.startsWith("CEO ("))
            ? "CEO"
            : u.display_name,
        role: u.role,
        role_subtitle:
          u.role_subtitle || roleSubtitleForLoginRole(u.role),
        pin_is_set: u.pin_is_set,
        sort_order: u.sort_order,
      })
    );

    return NextResponse.json({ users: tiles });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to load users." },
      { status: 500 }
    );
  }
}
