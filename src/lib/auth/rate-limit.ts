import { createServiceClient } from "@/lib/supabase/admin";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IDENTIFIER = 10;
const MAX_FAILURES_PER_IP = 30;

export async function recordLoginAttempt(input: {
  identifier: string;
  ipAddress?: string | null;
  success: boolean;
}) {
  try {
    const admin = createServiceClient();
    await admin.from("crm_login_attempts").insert({
      identifier: input.identifier.slice(0, 120),
      ip_address: input.ipAddress || null,
      success: input.success,
    });
  } catch {
    // Table may not exist until migration; never block login on audit write.
  }
}

export async function isLoginThrottled(input: {
  identifier: string;
  ipAddress?: string | null;
}): Promise<{ throttled: boolean; reason?: string }> {
  try {
    const admin = createServiceClient();
    const since = new Date(Date.now() - WINDOW_MS).toISOString();

    const { count: idCount } = await admin
      .from("crm_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("identifier", input.identifier.slice(0, 120))
      .eq("success", false)
      .gte("created_at", since);

    if ((idCount || 0) >= MAX_FAILURES_PER_IDENTIFIER) {
      return {
        throttled: true,
        reason: "Too many failed attempts. Try again later.",
      };
    }

    if (input.ipAddress) {
      const { count: ipCount } = await admin
        .from("crm_login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip_address", input.ipAddress)
        .eq("success", false)
        .gte("created_at", since);
      if ((ipCount || 0) >= MAX_FAILURES_PER_IP) {
        return {
          throttled: true,
          reason: "Too many failed attempts from this network. Try again later.",
        };
      }
    }
  } catch {
    return { throttled: false };
  }
  return { throttled: false };
}
