import { NextResponse } from "next/server";
import { previewRestoreUpload } from "@/lib/backup/actions";
import type { RestoreMode } from "@/types/backup";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const mode = (String(form.get("mode") || "MERGE") as RestoreMode) || "MERGE";
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Backup file is invalid." },
        { status: 400 }
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await previewRestoreUpload({
      buffer,
      fileName: file.name,
      mode,
    });
    return NextResponse.json({
      sessionId: result.session.id,
      preview: result.preview,
      info: result.info,
      isValid: result.session.is_valid,
      message: result.session.is_valid
        ? "Import preview ready. Confirm to restore."
        : "Restore validation failed. No data was changed.",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Restore validation failed. No data was changed.",
      },
      { status: 400 }
    );
  }
}
