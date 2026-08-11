"use client";

import { useMemo, useState, useTransition } from "react";
import type { BackupHealth, BackupJob, BackupSettings, RestorePreview } from "@/types/backup";
import type { Company } from "@/types/database";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function dispositionName(header: string | null, fallback: string) {
  if (!header) return fallback;
  const m = /filename="([^"]+)"/.exec(header);
  return m?.[1] || fallback;
}

export function BackupCenter({
  companies,
  initialSettings,
  initialJobs,
  health,
  driveEmail,
  driveConfigured,
  isOwner,
  canManageSettings = true,
  canFullBackup = true,
}: {
  companies: Company[];
  initialSettings: BackupSettings;
  initialJobs: BackupJob[];
  health: BackupHealth;
  driveEmail: string | null;
  driveConfigured: boolean;
  isOwner: boolean;
  canManageSettings?: boolean;
  canFullBackup?: boolean;
}) {
  const [companyScope, setCompanyScope] = useState("ALL");
  const [settings, setSettings] = useState(initialSettings);
  const [jobs] = useState(initialJobs);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<{
    sessionId: string;
    preview: RestorePreview;
    isValid: boolean;
  } | null>(null);
  const [restoreMode, setRestoreMode] = useState<"MERGE" | "FULL">("MERGE");
  const [moduleName, setModuleName] = useState("parties");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const healthTone = useMemo(() => {
    if (health.status === "GREEN") return "border-emerald-200 bg-emerald-50 text-emerald-900";
    if (health.status === "RED") return "border-red-200 bg-red-50 text-red-900";
    return "border-amber-200 bg-amber-50 text-amber-900";
  }, [health.status]);

  function backupNow(uploadDrive: boolean) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/backup/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyScope, uploadDrive }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Backup failed");
        }
        const counts = JSON.parse(res.headers.get("X-Backup-Counts") || "{}");
        const blob = await res.blob();
        downloadBlob(
          blob,
          dispositionName(res.headers.get("Content-Disposition"), "crm-backup.xlsx")
        );
        setMessage(
          `Backup completed successfully.\nCompanies: ${counts.Companies ?? "—"}\nParties: ${counts.Parties ?? "—"}\nProducts: ${counts.Products ?? "—"}\nSalesmen: ${counts.Salesmen ?? "—"}\nVisits: ${counts.Visits ?? "—"}\nSales: ${counts.Sales ?? "—"}`
        );
        // refresh history lightly
        window.location.reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Backup failed");
      }
    });
  }

  function saveSettings(form: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/backup/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            automatic_enabled: form.get("automatic_enabled") === "on",
            frequency: form.get("frequency"),
            backup_hour_ist: Number(form.get("backup_hour_ist")),
            backup_minute_ist: Number(form.get("backup_minute_ist")),
            google_drive_enabled: form.get("google_drive_enabled") === "on",
            accountant_export_allowed:
              form.get("accountant_export_allowed") === "on",
          }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Save failed");
        setSettings(j.settings);
        setMessage("Backup settings saved.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  function onRestoreFile(file: File | null) {
    if (!file) return;
    setError(null);
    setMessage(null);
    setPreview(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("mode", restoreMode);
        const res = await fetch("/api/backup/restore/preview", {
          method: "POST",
          body: fd,
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Backup file is invalid.");
        setPreview({
          sessionId: j.sessionId,
          preview: j.preview,
          isValid: j.isValid,
        });
        setMessage(j.message);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Restore validation failed. No data was changed."
        );
      }
    });
  }

  function confirmRestore() {
    if (!preview) return;
    if (
      restoreMode === "FULL" &&
      !window.confirm(
        "FULL RESTORE will replace company-scoped operational data after creating a safety backup. Continue?"
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/backup/restore/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: preview.sessionId }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Restore failed");
        setMessage("Restore completed successfully.");
        setPreview(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Restore failed");
      }
    });
  }

  function exportModule() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/backup/module", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            module: moduleName,
            companyScope,
            from: from || undefined,
            to: to || undefined,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Export failed");
        }
        const blob = await res.blob();
        downloadBlob(
          blob,
          dispositionName(
            res.headers.get("Content-Disposition"),
            `${moduleName}.xlsx`
          )
        );
        setMessage("Export ready.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Export failed");
      }
    });
  }

  const field =
    "mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <section className={`rounded-xl border p-4 ${healthTone}`}>
        <h3 className="font-semibold">Backup Health — {health.status}</h3>
        <p className="mt-1 text-sm">{health.message}</p>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <li>
            Last Backup:{" "}
            {health.lastSuccess
              ? new Date(health.lastSuccess.created_at).toLocaleString()
              : "—"}
          </li>
          <li>
            Google Drive:{" "}
            {health.lastDriveSuccess?.drive_status ||
              (driveEmail ? "CONNECTED" : "NOT_CONFIGURED")}
          </li>
          <li>Excel Export: READY</li>
          <li>
            Automatic: {health.automaticEnabled ? `ON (${health.frequency})` : "OFF"}
          </li>
          <li>
            Last failed:{" "}
            {health.lastFailed
              ? new Date(health.lastFailed.created_at).toLocaleString()
              : "—"}
          </li>
          <li>
            Size:{" "}
            {health.lastSuccess?.file_size_bytes
              ? `${Math.round(Number(health.lastSuccess.file_size_bytes) / 1024)} KB`
              : "—"}
          </li>
        </ul>
      </section>

      {(message || error) && (
        <div
          className={`whitespace-pre-wrap rounded-xl border p-4 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          {error || message}
        </div>
      )}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="font-semibold">Company scope</h3>
        <select
          className={field}
          value={companyScope}
          onChange={(e) => setCompanyScope(e.target.value)}
        >
          <option value="ALL">Both companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {canFullBackup && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => backupNow(false)}
              className="rounded-xl bg-[var(--accent)] px-4 py-4 text-base font-semibold text-white disabled:opacity-60"
            >
              BACKUP NOW
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => backupNow(false)}
              className="rounded-xl border border-[var(--border)] bg-white px-4 py-4 text-base font-semibold disabled:opacity-60"
            >
              DOWNLOAD EXCEL
            </button>
            <button
              type="button"
              disabled={pending || !settings.google_drive_enabled}
              onClick={() => backupNow(true)}
              className="rounded-xl border border-[var(--border)] bg-white px-4 py-4 text-base font-semibold disabled:opacity-60 sm:col-span-2"
            >
              BACKUP NOW + GOOGLE DRIVE
            </button>
          </>
        )}
        {isOwner && (
          <a
            href="#restore-data"
            className="rounded-xl border border-[var(--border)] bg-white px-4 py-4 text-center text-base font-semibold"
          >
            RESTORE DATA
          </a>
        )}
        <a
          href="#backup-history"
          className="rounded-xl border border-[var(--border)] bg-white px-4 py-4 text-center text-base font-semibold"
        >
          BACKUP HISTORY
        </a>
        {isOwner && (
          <a
            href="#google-drive"
            className="rounded-xl border border-[var(--border)] bg-white px-4 py-4 text-center text-base font-semibold sm:col-span-2"
          >
            GOOGLE DRIVE
          </a>
        )}
      </section>

      {canManageSettings && (
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
        <h3 className="font-semibold">A. Automatic Backup</h3>
        <form
          action={(fd) => saveSettings(fd)}
          className="grid gap-3 sm:grid-cols-2"
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="automatic_enabled"
              defaultChecked={settings.automatic_enabled}
            />
            Automatic Backup ON
          </label>
          <label className="text-sm">
            Frequency
            <select
              name="frequency"
              defaultValue={settings.frequency}
              className={field}
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </label>
          <label className="text-sm">
            Hour (IST)
            <input
              type="number"
              name="backup_hour_ist"
              min={0}
              max={23}
              defaultValue={settings.backup_hour_ist}
              className={field}
            />
          </label>
          <label className="text-sm">
            Minute (IST)
            <input
              type="number"
              name="backup_minute_ist"
              min={0}
              max={59}
              defaultValue={settings.backup_minute_ist}
              className={field}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="google_drive_enabled"
              defaultChecked={settings.google_drive_enabled}
            />
            Upload automatic backups to Google Drive
          </label>
          {isOwner && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="accountant_export_allowed"
                defaultChecked={settings.accountant_export_allowed}
              />
              Allow Accountant module exports
            </label>
          )}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
            >
              Save automatic settings
            </button>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Scheduler: call <code>/api/backup/cron</code> every 15 minutes with{" "}
              <code>Authorization: Bearer CRON_SECRET</code>. Application backup +
              Excel + Drive are additional to Supabase native database backups.
            </p>
          </div>
        </form>
      </section>
      )}

      {isOwner && (
        <section
          id="google-drive"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3"
        >
          <h3 className="font-semibold">F. Google Drive Backup</h3>
          <p className="text-sm text-[var(--muted)]">
            {driveConfigured
              ? driveEmail
                ? `Connected as ${driveEmail}`
                : "Ready to connect Google account (tokens stored server-side only)."
              : "Server env GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI not set."}
          </p>
          {driveConfigured && (
            <a
              href="/api/backup/drive/connect"
              className="inline-block rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
            >
              {driveEmail ? "Reconnect Google Drive" : "Connect Google Drive"}
            </a>
          )}
          <p className="text-xs text-[var(--muted)]">
            Folder: Kalyani-Radhaswami CRM / Backups / Daily|Weekly|Monthly. Failed
            Drive uploads keep the local Excel backup and are logged.
          </p>
        </section>
      )}

      {isOwner && (
        <section
          id="restore-data"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3"
        >
          <h3 className="font-semibold">D. Restore / Import</h3>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={restoreMode === "MERGE"}
                onChange={() => setRestoreMode("MERGE")}
              />
              MERGE IMPORT
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={restoreMode === "FULL"}
                onChange={() => setRestoreMode("FULL")}
              />
              FULL RESTORE (Owner confirmation + safety backup)
            </label>
          </div>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => onRestoreFile(e.target.files?.[0] || null)}
            className="block w-full text-sm"
          />
          {preview && (
            <div className="rounded-lg border border-[var(--border)] p-3 text-sm">
              <h4 className="font-semibold">IMPORT PREVIEW</h4>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {Object.entries(preview.preview.sheetCounts).map(([k, v]) => (
                  <li key={k}>
                    {k}: {v}
                  </li>
                ))}
              </ul>
              <p className="mt-2">
                New: {preview.preview.newRecords} · Existing:{" "}
                {preview.preview.existingRecords} · Changed:{" "}
                {preview.preview.changedRecords} · Invalid:{" "}
                {preview.preview.invalidRecords}
              </p>
              {preview.preview.errors.length > 0 && (
                <ul className="mt-2 text-red-700">
                  {preview.preview.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!preview.isValid || pending}
                  onClick={confirmRestore}
                  className="rounded-md bg-[var(--accent)] px-4 py-2 font-semibold text-white disabled:opacity-50"
                >
                  Confirm restore
                </button>
                <button
                  type="button"
                  onClick={() => {
                    fetch("/api/backup/restore/confirm", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "cancel",
                        sessionId: preview.sessionId,
                      }),
                    });
                    setPreview(null);
                    setMessage("Restore cancelled.");
                  }}
                  className="rounded-md border px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
        <h3 className="font-semibold">C / 15. Module Excel Export</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Module
            <select
              className={field}
              value={moduleName}
              onChange={(e) => setModuleName(e.target.value)}
            >
              {[
                "parties",
                "products",
                "salesmen",
                "visits",
                "gps",
                "followups",
                "sales",
                "incentives",
                "targets",
                "party360",
              ].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              From
              <input
                type="date"
                className={field}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="text-sm">
              To
              <input
                type="date"
                className={field}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={exportModule}
          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold"
        >
          Export selected module
        </button>
      </section>

      <section
        id="backup-history"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
      >
        <h3 className="font-semibold">E. Backup History</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="py-2 pr-2">Date</th>
                <th className="py-2 pr-2">Type</th>
                <th className="py-2 pr-2">Company</th>
                <th className="py-2 pr-2">File</th>
                <th className="py-2 pr-2">Records</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2">Drive</th>
                <th className="py-2 pr-2">Download</th>
                <th className="py-2">Restore</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t border-[var(--border)]">
                  <td className="py-2 pr-2">
                    {new Date(j.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-2">{j.backup_type}</td>
                  <td className="py-2 pr-2">{j.company_scope}</td>
                  <td className="py-2 pr-2">{j.file_name}</td>
                  <td className="py-2 pr-2">{j.total_records}</td>
                  <td className="py-2 pr-2">{j.status}</td>
                  <td className="py-2 pr-2">{j.drive_status}</td>
                  <td className="py-2 pr-2">
                    {j.storage_path ? (
                      <a
                        className="text-[var(--accent)] hover:underline"
                        href={`/api/backup/download/${j.id}`}
                      >
                        Download
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2">
                    {isOwner && j.storage_path ? (
                      <a
                        className="text-[var(--accent)] hover:underline"
                        href="#restore-data"
                        onClick={() =>
                          setMessage(
                            "Download this backup, then use RESTORE DATA to upload and confirm MERGE or FULL restore."
                          )
                        }
                      >
                        Restore
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-4 text-[var(--muted)]">
                    No backups yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
