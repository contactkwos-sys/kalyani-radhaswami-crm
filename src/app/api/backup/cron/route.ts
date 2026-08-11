import { NextResponse } from "next/server";
import { runScheduledBackupIfDue } from "@/lib/backup/actions";

/**
 * Server-side scheduled backup hook.
 *
 * Deployment: call this endpoint every 15 minutes with:
 *   Authorization: Bearer $CRON_SECRET
 *
 * Example (crontab / external scheduler every 15 minutes):
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *     https://your-app/api/backup/cron
 *
 * This is an application-level backup layer in addition to Supabase native DB backups.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "CRON_SECRET is not configured. Scheduled backups are disabled until set.",
      },
      { status: 503 }
    );
  }
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runScheduledBackupIfDue();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        ran: false,
        error: err instanceof Error ? err.message : "Scheduled backup failed",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
