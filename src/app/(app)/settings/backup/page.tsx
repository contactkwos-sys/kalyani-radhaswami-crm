import { redirect } from "next/navigation";
import { BackupCenter } from "@/components/backup/BackupCenter";
import { getCurrentProfile, getAccessibleCompanies } from "@/lib/auth/session";
import {
  getBackupHealth,
  getBackupSettings,
  listBackupJobs,
} from "@/lib/backup/actions";
import {
  getDriveConnectionSummary,
  isGoogleDriveConfigured,
} from "@/lib/backup/drive";

export default async function BackupSettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role === "SALESMAN" || profile.role === "VIEWER") {
    redirect("/dashboard");
  }

  const companies = await getAccessibleCompanies(profile.id, profile.role);

  let settings;
  let health;
  let jobs;
  try {
    if (profile.role === "ACCOUNTANT") {
      // Accountant may only export when Owner enables it — health/jobs use export gate.
      jobs = await listBackupJobs(40);
      health = await getBackupHealth();
      settings = {
        id: "defaults",
        company_id: null,
        automatic_enabled: false,
        frequency: "DAILY" as const,
        backup_hour_ist: 4,
        backup_minute_ist: 30,
        include_all_companies: true,
        google_drive_enabled: false,
        accountant_export_allowed: true,
        last_auto_run_at: null,
      };
    } else {
      [settings, health, jobs] = await Promise.all([
        getBackupSettings(),
        getBackupHealth(),
        listBackupJobs(40),
      ]);
    }
  } catch {
    redirect("/dashboard");
  }

  const drive =
    profile.role === "OWNER" ? await getDriveConnectionSummary() : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
          Settings → Data Backup
        </p>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          DATA BACKUP & RESTORE
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Application Excel backups, Google Drive sync, and restore are an
          additional disaster-recovery layer alongside Supabase native database
          backups. Database credentials are never exposed in the app.
        </p>
      </div>
      <BackupCenter
        companies={companies}
        initialSettings={settings}
        initialJobs={jobs}
        health={health}
        driveEmail={drive?.google_email ?? null}
        driveConfigured={isGoogleDriveConfigured()}
        isOwner={profile.role === "OWNER"}
        canManageSettings={
          profile.role === "OWNER" || profile.role === "ADMIN"
        }
        canFullBackup={
          profile.role === "OWNER" || profile.role === "ADMIN"
        }
      />
    </div>
  );
}
