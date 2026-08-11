import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { auditBackup, requireBackupAccess } from "@/lib/backup/auth";
import {
  collectBackupData,
  collectModuleData,
} from "@/lib/backup/collect";
import { buildWorkbookBuffer } from "@/lib/backup/excel";
import { uploadBackupArtifact, downloadBackupArtifact } from "@/lib/backup/storage";
import {
  isGoogleDriveConfigured,
  uploadBufferToDrive,
} from "@/lib/backup/drive";
import {
  buildRestorePreview,
  companyIdsFromSheets,
  executeRestore,
} from "@/lib/backup/restore";
import { APP_VERSION, type BackupHealth, type BackupJob, type BackupSettings, type BackupType, type RestoreMode } from "@/types/backup";

function folderForType(type: BackupType): "DAILY" | "WEEKLY" | "MONTHLY" | "MANUAL" {
  if (type === "AUTOMATIC_WEEKLY") return "WEEKLY";
  if (type === "AUTOMATIC_MONTHLY") return "MONTHLY";
  if (type === "AUTOMATIC_DAILY") return "DAILY";
  return "MANUAL";
}

export async function resolveCompanyIds(
  scope: "ALL" | string
): Promise<{ ids: string[]; names: string[] }> {
  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("crm_companies")
    .select("id, name, code")
    .eq("is_active", true)
    .order("name");
  const all = companies || [];
  if (scope === "ALL") {
    return { ids: all.map((c) => c.id), names: all.map((c) => c.name) };
  }
  const one = all.find((c) => c.id === scope || c.code === scope);
  if (!one) throw new Error("Company not found or not accessible.");
  return { ids: [one.id], names: [one.name] };
}

export async function createCompleteBackup(opts: {
  companyScope: "ALL" | string;
  backupType?: BackupType;
  uploadDrive?: boolean;
  actorId?: string;
  /** Cron / system path — skips interactive session checks */
  systemRun?: boolean;
}): Promise<{ job: BackupJob; buffer: Buffer }> {
  let actorId = opts.actorId || null;
  let actorEmail: string | null = "system";
  if (!opts.systemRun) {
    const profile = await requireBackupAccess("export");
    if (profile.role === "ACCOUNTANT") {
      throw new Error("Complete backup is available to Owner and Admin only.");
    }
    actorId = opts.actorId || profile.id;
    actorEmail = profile.email;
  } else if (!actorId) {
    const admin = createServiceClient();
    const { data: owner } = await admin
      .from("crm_profiles")
      .select("id, email")
      .eq("role", "OWNER")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    actorId = owner?.id || null;
    actorEmail = owner?.email || "system";
  }

  const backupType = opts.backupType || "MANUAL";
  const { ids, names } = opts.systemRun
    ? await (async () => {
        const admin = createServiceClient();
        const { data } = await admin
          .from("crm_companies")
          .select("id, name")
          .eq("is_active", true)
          .order("name");
        const all = data || [];
        if (opts.companyScope === "ALL") {
          return { ids: all.map((c) => c.id), names: all.map((c) => c.name) };
        }
        const one = all.find((c) => c.id === opts.companyScope);
        if (!one) throw new Error("Company not found");
        return { ids: [one.id], names: [one.name] };
      })()
    : await resolveCompanyIds(opts.companyScope);

  try {
    const collected = await collectBackupData(ids);
    const { buffer, fileName } = await buildWorkbookBuffer(collected, {
      backupType,
      createdBy: actorEmail,
    });

    const storagePath = `${backupType.toLowerCase()}/${fileName}`;
    await uploadBackupArtifact(storagePath, buffer);

    let driveStatus: BackupJob["drive_status"] = "SKIPPED";
    let driveFileId: string | null = null;
    let driveWebLink: string | null = null;
    let status: BackupJob["status"] = "SUCCESS";
    let errorMessage: string | null = null;

    const admin = createServiceClient();
    const { data: settingsRow } = await admin
      .from("crm_backup_settings")
      .select("*")
      .is("company_id", null)
      .maybeSingle();
    const wantDrive =
      opts.uploadDrive ??
      (Boolean(settingsRow?.google_drive_enabled) && isGoogleDriveConfigured());

    if (wantDrive) {
      try {
        const uploaded = await uploadBufferToDrive({
          buffer,
          fileName,
          frequency: folderForType(backupType),
        });
        driveStatus = "SUCCESS";
        driveFileId = uploaded.fileId;
        driveWebLink = uploaded.webLink;
      } catch (err) {
        driveStatus = "FAILED";
        status = "PARTIAL";
        errorMessage =
          err instanceof Error
            ? err.message
            : "Google Drive backup failed. Your local backup is still safe.";
      }
    }

    const { data: job, error } = await admin
      .from("crm_backup_jobs")
      .insert({
        backup_type: backupType,
        status,
        drive_status: driveStatus,
        company_scope: opts.companyScope === "ALL" ? "ALL" : names[0],
        company_ids: ids,
        file_name: fileName,
        file_size_bytes: buffer.length,
        storage_path: storagePath,
        drive_file_id: driveFileId,
        drive_web_link: driveWebLink,
        app_version: APP_VERSION,
        record_counts: collected.counts,
        total_records: collected.totalRecords,
        error_message: errorMessage,
        created_by: actorId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (!opts.systemRun) {
      await auditBackup(
        "BACKUP_CREATED",
        {
          file_name: fileName,
          total_records: collected.totalRecords,
          counts: collected.counts,
          drive_status: driveStatus,
          backup_type: backupType,
        },
        ids[0] || null,
        job.id
      );
    } else {
      await admin.rpc("crm_write_audit_log", {
        p_action: "BACKUP_CREATED",
        p_module: "backup",
        p_company_id: ids[0] || null,
        p_record_type: "crm_backup_jobs",
        p_record_id: job.id,
        p_metadata: {
          file_name: fileName,
          total_records: collected.totalRecords,
          system: true,
          backup_type: backupType,
        },
      });
    }

    return { job: job as BackupJob, buffer };
  } catch (err) {
    const admin = createServiceClient();
    const message =
      err instanceof Error ? err.message : "Backup failed";
    const { data: failed } = await admin
      .from("crm_backup_jobs")
      .insert({
        backup_type: backupType,
        status: "FAILED",
        drive_status: "SKIPPED",
        company_scope: String(opts.companyScope),
        company_ids: ids,
        file_name: `FAILED_${Date.now()}.xlsx`,
        app_version: APP_VERSION,
        record_counts: {},
        total_records: 0,
        error_message: message,
        created_by: actorId,
      })
      .select("*")
      .single();
    if (!opts.systemRun) {
      await auditBackup(
        "BACKUP_FAILED",
        { error: message },
        ids[0] || null,
        failed?.id
      );
    }
    throw new Error(message);
  }
}

export async function createModuleExport(opts: {
  module: string;
  companyScope: "ALL" | string;
  from?: string;
  to?: string;
}) {
  const profile = await requireBackupAccess("export");
  const { ids, names } = await resolveCompanyIds(opts.companyScope);
  const collected = await collectModuleData(
    opts.module,
    ids,
    opts.from,
    opts.to
  );
  const { buffer, fileName } = await buildWorkbookBuffer(collected, {
    backupType: `MODULE_${opts.module}`,
    createdBy: profile.email,
  });
  const storagePath = `module/${opts.module}_${fileName}`;
  await uploadBackupArtifact(storagePath, buffer);
  const admin = createServiceClient();
  const { data: job } = await admin
    .from("crm_backup_jobs")
    .insert({
      backup_type: "MODULE_EXPORT",
      status: "SUCCESS",
      drive_status: "SKIPPED",
      company_scope: opts.companyScope === "ALL" ? "ALL" : names[0],
      company_ids: ids,
      file_name: fileName,
      file_size_bytes: buffer.length,
      storage_path: storagePath,
      app_version: APP_VERSION,
      record_counts: collected.counts,
      total_records: collected.totalRecords,
      created_by: profile.id,
    })
    .select("*")
    .single();
  await auditBackup(
    "BACKUP_DOWNLOADED",
    { module: opts.module, file_name: fileName },
    ids[0] || null,
    job?.id
  );
  return { job: job as BackupJob, buffer };
}

function defaultBackupSettings(): BackupSettings {
  return {
    id: "defaults",
    company_id: null,
    automatic_enabled: false,
    frequency: "DAILY",
    backup_hour_ist: 4,
    backup_minute_ist: 30,
    include_all_companies: true,
    google_drive_enabled: false,
    accountant_export_allowed: false,
    last_auto_run_at: null,
  };
}

async function readBackupSettingsRow(): Promise<BackupSettings> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("crm_backup_settings")
    .select("*")
    .is("company_id", null)
    .maybeSingle();
  return (data as BackupSettings) || defaultBackupSettings();
}

export async function getBackupSettings(): Promise<BackupSettings> {
  await requireBackupAccess("settings");
  return readBackupSettingsRow();
}

export async function updateBackupSettings(
  patch: Partial<BackupSettings>
): Promise<BackupSettings> {
  await requireBackupAccess("settings");
  const supabase = await createClient();
  const current = await readBackupSettingsRow();
  const payload = {
    automatic_enabled: patch.automatic_enabled ?? current.automatic_enabled,
    frequency: patch.frequency ?? current.frequency,
    backup_hour_ist: patch.backup_hour_ist ?? current.backup_hour_ist,
    backup_minute_ist: patch.backup_minute_ist ?? current.backup_minute_ist,
    include_all_companies:
      patch.include_all_companies ?? current.include_all_companies,
    google_drive_enabled:
      patch.google_drive_enabled ?? current.google_drive_enabled,
    accountant_export_allowed:
      patch.accountant_export_allowed ?? current.accountant_export_allowed,
  };
  if (current.id === "defaults") {
    const { data, error } = await supabase
      .from("crm_backup_settings")
      .insert({ ...payload, company_id: null })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await auditBackup("BACKUP_SETTINGS_UPDATED", { new_value: data });
    return data as BackupSettings;
  }
  const { data, error } = await supabase
    .from("crm_backup_settings")
    .update(payload)
    .eq("id", current.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await auditBackup("BACKUP_SETTINGS_UPDATED", {
    old_value: current,
    new_value: data,
  });
  return data as BackupSettings;
}

export async function listBackupJobs(limit = 50): Promise<BackupJob[]> {
  await requireBackupAccess("export");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_backup_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as BackupJob[];
}

export async function getBackupHealth(): Promise<BackupHealth> {
  await requireBackupAccess("export");
  const jobs = await listBackupJobs(100);
  const settings = await readBackupSettingsRow();
  const lastSuccess =
    jobs.find((j) => j.status === "SUCCESS" || j.status === "PARTIAL") || null;
  const lastFailed = jobs.find((j) => j.status === "FAILED") || null;
  const lastDriveSuccess =
    jobs.find((j) => j.drive_status === "SUCCESS") || null;

  let backupAgeHours: number | null = null;
  if (lastSuccess) {
    backupAgeHours =
      (Date.now() - new Date(lastSuccess.created_at).getTime()) /
      (1000 * 60 * 60);
  }

  let status: BackupHealth["status"] = "YELLOW";
  let message = "Backup due — run BACKUP NOW or enable automatic backup.";
  if (lastFailed && (!lastSuccess || lastFailed.created_at > lastSuccess.created_at)) {
    status = "RED";
    message = "Backup failed. Local restore points may be outdated.";
  } else if (lastSuccess && backupAgeHours != null && backupAgeHours <= 36) {
    status = "GREEN";
    message = "Backup healthy.";
  } else if (lastSuccess && backupAgeHours != null && backupAgeHours <= 72) {
    status = "YELLOW";
    message = "Backup aging — schedule another soon.";
  } else if (!lastSuccess) {
    status = "RED";
    message = "No successful backup yet.";
  }

  return {
    lastSuccess,
    lastFailed,
    lastDriveSuccess,
    automaticEnabled: settings.automatic_enabled,
    frequency: settings.frequency,
    backupAgeHours,
    status,
    message,
  };
}

export async function getBackupFileBuffer(jobId: string): Promise<{
  buffer: Buffer;
  fileName: string;
}> {
  await requireBackupAccess("export");
  const admin = createServiceClient();
  const { data: job, error } = await admin
    .from("crm_backup_jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (error || !job?.storage_path) throw new Error("Backup not found.");
  const buffer = await downloadBackupArtifact(job.storage_path);
  await auditBackup(
    "BACKUP_DOWNLOADED",
    { file_name: job.file_name },
    job.company_ids?.[0] || null,
    job.id
  );
  return { buffer, fileName: job.file_name };
}

export async function previewRestoreUpload(opts: {
  buffer: Buffer;
  fileName: string;
  mode: RestoreMode;
}) {
  const profile = await requireBackupAccess("restore");
  const { preview, sheets, info } = await buildRestorePreview(opts.buffer);

  const storagePath = `restore-pending/${profile.id}/${Date.now()}_${opts.fileName}`;
  await uploadBackupArtifact(storagePath, opts.buffer);

  const admin = createServiceClient();
  const { data: session, error } = await admin
    .from("crm_restore_sessions")
    .insert({
      created_by: profile.id,
      mode: opts.mode,
      file_name: opts.fileName,
      storage_path: storagePath,
      preview: { ...preview, info, companyIds: companyIdsFromSheets(sheets) },
      validation_errors: preview.errors,
      is_valid: preview.errors.length === 0,
      status: "PREVIEW",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await auditBackup("RESTORE_STARTED", {
    session_id: session.id,
    mode: opts.mode,
    file_name: opts.fileName,
    preview,
  });

  return { session, preview, info };
}

export async function confirmRestore(sessionId: string) {
  const profile = await requireBackupAccess("restore");
  const admin = createServiceClient();
  const { data: session, error } = await admin
    .from("crm_restore_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("created_by", profile.id)
    .single();
  if (error || !session) throw new Error("Restore session not found.");
  if (!session.is_valid) {
    throw new Error("Restore validation failed. No data was changed.");
  }
  if (session.status !== "PREVIEW") {
    throw new Error("Restore session is no longer available.");
  }

  const buffer = await downloadBackupArtifact(session.storage_path);
  const { sheets } = await buildRestorePreview(buffer);
  const companyIds =
    (session.preview as { companyIds?: string[] })?.companyIds ||
    companyIdsFromSheets(sheets);

  // Safety backup first
  const safety = await createCompleteBackup({
    companyScope: companyIds.length > 1 ? "ALL" : companyIds[0] || "ALL",
    backupType: "SAFETY_BEFORE_RESTORE",
    uploadDrive: false,
  });

  try {
    await admin
      .from("crm_restore_sessions")
      .update({
        status: "CONFIRMED",
        confirmed_at: new Date().toISOString(),
        safety_backup_id: safety.job.id,
      })
      .eq("id", sessionId);

    const result = await executeRestore({
      mode: session.mode as RestoreMode,
      sheets,
      companyIds,
    });

    await admin
      .from("crm_restore_sessions")
      .update({
        status: "COMPLETED",
        completed_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (session.mode === "FULL") {
      // mark nothing special on jobs
    }

    await auditBackup(
      "RESTORE_COMPLETED",
      {
        session_id: sessionId,
        mode: session.mode,
        imported: result.imported,
        safety_backup_id: safety.job.id,
      },
      companyIds[0] || null,
      safety.job.id
    );

    return { imported: result.imported, safetyBackupId: safety.job.id };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Restore failed";
    await admin
      .from("crm_restore_sessions")
      .update({ status: "FAILED", error_message: message })
      .eq("id", sessionId);
    await auditBackup("RESTORE_FAILED", {
      session_id: sessionId,
      error: message,
      safety_backup_id: safety.job.id,
    });
    throw new Error(
      `${message} A safety backup was created before restore (${safety.job.file_name}).`
    );
  }
}

export async function cancelRestore(sessionId: string) {
  const profile = await requireBackupAccess("restore");
  const admin = createServiceClient();
  await admin
    .from("crm_restore_sessions")
    .update({ status: "CANCELLED" })
    .eq("id", sessionId)
    .eq("created_by", profile.id);
  await auditBackup("RESTORE_CANCELLED", { session_id: sessionId });
}

export async function runScheduledBackupIfDue(): Promise<{
  ran: boolean;
  jobId?: string;
  reason?: string;
}> {
  const admin = createServiceClient();
  const { data: settings } = await admin
    .from("crm_backup_settings")
    .select("*")
    .is("company_id", null)
    .maybeSingle();
  if (!settings?.automatic_enabled) {
    return { ran: false, reason: "Automatic backup is OFF" };
  }

  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
  const hour = now.getHours();
  const minute = now.getMinutes();
  const dueHour = settings.backup_hour_ist;
  const dueMinute = settings.backup_minute_ist;

  // 15-minute window
  const minutesNow = hour * 60 + minute;
  const minutesDue = dueHour * 60 + dueMinute;
  if (Math.abs(minutesNow - minutesDue) > 15) {
    return { ran: false, reason: "Outside scheduled window" };
  }

  if (settings.last_auto_run_at) {
    const last = new Date(settings.last_auto_run_at);
    const hours = (Date.now() - last.getTime()) / 36e5;
    const minGap =
      settings.frequency === "MONTHLY"
        ? 24 * 25
        : settings.frequency === "WEEKLY"
          ? 24 * 6
          : 20;
    if (hours < minGap) {
      return { ran: false, reason: "Already ran recently" };
    }
  }

  const type: BackupType =
    settings.frequency === "WEEKLY"
      ? "AUTOMATIC_WEEKLY"
      : settings.frequency === "MONTHLY"
        ? "AUTOMATIC_MONTHLY"
        : "AUTOMATIC_DAILY";

  // System actor = first owner
  const { data: owner } = await admin
    .from("crm_profiles")
    .select("id")
    .eq("role", "OWNER")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const { job } = await createCompleteBackup({
    companyScope: "ALL",
    backupType: type,
    uploadDrive: settings.google_drive_enabled,
    actorId: owner?.id,
    systemRun: true,
  });

  await admin
    .from("crm_backup_settings")
    .update({ last_auto_run_at: new Date().toISOString() })
    .eq("id", settings.id);

  return { ran: true, jobId: job.id };
}
