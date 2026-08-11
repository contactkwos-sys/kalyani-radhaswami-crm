import { NextResponse } from "next/server";
import { updateBackupSettings } from "@/lib/backup/actions";
import type { BackupSettings } from "@/types/backup";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<BackupSettings>;
    const settings = await updateBackupSettings({
      automatic_enabled: body.automatic_enabled,
      frequency: body.frequency,
      backup_hour_ist: body.backup_hour_ist,
      backup_minute_ist: body.backup_minute_ist,
      google_drive_enabled: body.google_drive_enabled,
      accountant_export_allowed: body.accountant_export_allowed,
      include_all_companies: body.include_all_companies,
    });
    return NextResponse.json({ settings });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Unable to save backup settings.",
      },
      { status: 400 }
    );
  }
}
