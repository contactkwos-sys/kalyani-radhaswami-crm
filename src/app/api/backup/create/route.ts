import { NextResponse } from "next/server";
import { createCompleteBackup } from "@/lib/backup/actions";
import type { BackupType } from "@/types/backup";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const companyScope = (body.companyScope as string) || "ALL";
    const uploadDrive = Boolean(body.uploadDrive);
    const backupType = (body.backupType as BackupType) || "MANUAL";

    const { job, buffer } = await createCompleteBackup({
      companyScope: companyScope === "ALL" ? "ALL" : companyScope,
      backupType,
      uploadDrive,
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${job.file_name}"`,
        "X-Backup-Id": job.id,
        "X-Backup-Status": job.status,
        "X-Backup-Total-Records": String(job.total_records),
        "X-Backup-Drive-Status": job.drive_status,
        "X-Backup-Counts": JSON.stringify(job.record_counts),
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Backup failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
