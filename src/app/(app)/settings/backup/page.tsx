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
    <div className="space-y-5">
      <div className="mx-auto max-w-lg">
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          DATA BACKUP
        </h2>
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
