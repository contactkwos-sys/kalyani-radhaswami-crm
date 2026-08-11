import { NextResponse } from "next/server";
import { cancelRestore, confirmRestore } from "@/lib/backup/actions";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.action === "cancel") {
      await cancelRestore(String(body.sessionId));
      return NextResponse.json({
        message: "Restore cancelled.",
      });
    }
    const result = await confirmRestore(String(body.sessionId));
    return NextResponse.json({
      message: "Restore completed successfully.",
      imported: result.imported,
      safetyBackupId: result.safetyBackupId,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Restore failed. No unverified changes should remain.",
      },
      { status: 400 }
    );
  }
}
