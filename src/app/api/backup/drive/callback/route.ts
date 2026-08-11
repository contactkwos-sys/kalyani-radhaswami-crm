import { NextResponse } from "next/server";
import { requireBackupAccess, auditBackup } from "@/lib/backup/auth";
import { completeGoogleOAuth } from "@/lib/backup/drive";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  const origin = process.env.NEXT_PUBLIC_APP_URL || url.origin;

  if (err) {
    return NextResponse.redirect(
      `${origin}/settings/backup?drive=error&msg=${encodeURIComponent(err)}`
    );
  }
  if (!code) {
    return NextResponse.redirect(
      `${origin}/settings/backup?drive=error&msg=missing_code`
    );
  }

  try {
    const profile = await requireBackupAccess("drive");
    await completeGoogleOAuth(code, profile.id);
    await auditBackup("GOOGLE_DRIVE_CONNECTED", { user: profile.id });
    return NextResponse.redirect(`${origin}/settings/backup?drive=connected`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "connect_failed";
    await auditBackup("GOOGLE_DRIVE_BACKUP_FAILED", { error: message }).catch(
      () => undefined
    );
    return NextResponse.redirect(
      `${origin}/settings/backup?drive=error&msg=${encodeURIComponent(message)}`
    );
  }
}
