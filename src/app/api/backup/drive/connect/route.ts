import { NextResponse } from "next/server";
import { requireBackupAccess, auditBackup } from "@/lib/backup/auth";
import { getGoogleAuthUrl, isGoogleDriveConfigured } from "@/lib/backup/drive";
import { randomBytes } from "crypto";

export async function GET() {
  try {
    const profile = await requireBackupAccess("drive");
    if (!isGoogleDriveConfigured()) {
      return NextResponse.json(
        {
          error:
            "Google Drive is not configured on the server. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.",
          configured: false,
        },
        { status: 400 }
      );
    }
    const state = Buffer.from(
      JSON.stringify({
        uid: profile.id,
        n: randomBytes(8).toString("hex"),
      })
    ).toString("base64url");
    const url = getGoogleAuthUrl(state);
    await auditBackup("GOOGLE_DRIVE_CONNECT_STARTED", { user: profile.id });
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Forbidden" },
      { status: 400 }
    );
  }
}
