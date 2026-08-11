"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import type {
  BackupHealth,
  BackupJob,
  BackupSettings,
  RestorePreview,
} from "@/types/backup";
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

function formatLastBackup(iso: string | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
  const sameDay =
    d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) ===
    now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (sameDay) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) ===
    yesterday.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (isYesterday) return `Yesterday ${time}`;
  return `${d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  })} — ${time}`;
}

function frequencyLabel(freq: string) {
  if (freq === "WEEKLY") return "Every Week";
  if (freq === "MONTHLY") return "Every Month";
  return "Every Day";
}

function statusLabel(status: BackupHealth["status"]) {
  if (status === "GREEN") return { text: "✓ Safe", className: "text-emerald-700" };
  if (status === "RED") return { text: "✗ Needs attention", className: "text-red-700" };
  return { text: "● Due soon", className: "text-amber-700" };
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
  const [showRestore, setShowRestore] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const status = useMemo(() => statusLabel(health.status), [health.status]);
  const driveConnected = Boolean(driveEmail);
  const driveReady = driveConfigured && driveConnected;

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
        const driveStatus = res.headers.get("X-Backup-Drive-Status");
        const blob = await res.blob();
        downloadBlob(
          blob,
          dispositionName(res.headers.get("Content-Disposition"), "crm-backup.xlsx")
        );
        let msg = `Backup completed successfully.\nCompanies: ${counts.Companies ?? "—"}\nParties: ${counts.Parties ?? "—"}\nProducts: ${counts.Products ?? "—"}\nSalesmen: ${counts.Salesmen ?? "—"}\nVisits: ${counts.Visits ?? "—"}\nSales: ${counts.Sales ?? "—"}`;
        if (uploadDrive && driveStatus === "FAILED") {
          msg +=
            "\n\nGoogle Drive backup failed. Your local backup is still safe.";
        }
        setMessage(msg);
        window.location.reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Backup failed");
      }
    });
  }

  function toggleAutomatic() {
    if (!canManageSettings) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/backup/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            automatic_enabled: !settings.automatic_enabled,
            frequency: settings.frequency,
            backup_hour_ist: settings.backup_hour_ist,
            backup_minute_ist: settings.backup_minute_ist,
            google_drive_enabled: settings.google_drive_enabled,
            accountant_export_allowed: settings.accountant_export_allowed,
          }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Save failed");
        setSettings(j.settings);
        setMessage(
          j.settings.automatic_enabled
            ? "Automatic backup turned ON."
            : "Automatic backup turned OFF."
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  function saveAdvancedSettings(form: FormData) {
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
    setShowRestore(true);
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
        setMessage(j.message || "Import preview ready. Confirm to restore.");
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
        setShowRestore(false);
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
  const primaryBtn =
    "w-full rounded-xl bg-[var(--accent)] px-4 py-4 text-base font-semibold text-white disabled:opacity-60";
  const secondaryBtn =
    "w-full rounded-xl border border-[var(--border)] bg-white px-4 py-4 text-base font-semibold disabled:opacity-60";

  return (
    <div className="mx-auto max-w-lg space-y-5">
      {/* Primary backup card — matches Owner DATA BACKUP surface */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm sm:p-6">
        <div className="space-y-1">
          <p className="text-sm text-[var(--muted)]">
            Last Backup:{" "}
            <span className="font-medium text-[var(--ink)]">
              {formatLastBackup(health.lastSuccess?.created_at)}
            </span>
          </p>
          <p className="text-sm text-[var(--muted)]">
            Status:{" "}
            <span className={`font-semibold ${status.className}`}>
              {status.text}
            </span>
          </p>
        </div>

        {canFullBackup && (
          <button
            type="button"
            disabled={pending}
            onClick={() => backupNow(false)}
            className={`mt-5 ${primaryBtn}`}
          >
            Backup Now
          </button>
        )}

        <div className="mt-6 space-y-3 border-t border-[var(--border)] pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">
                Automatic Backup
              </p>
              <p className="mt-0.5 text-sm text-[var(--muted)]">
                <span
                  className={
                    settings.automatic_enabled
                      ? "font-semibold text-emerald-700"
                      : "font-semibold text-[var(--muted)]"
                  }
                >
                  {settings.automatic_enabled ? "● ON" : "○ OFF"}
                </span>
              </p>
            </div>
            {canManageSettings && (
              <button
                type="button"
                disabled={pending}
                onClick={toggleAutomatic}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold"
              >
                {settings.automatic_enabled ? "Turn off" : "Turn on"}
              </button>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">
              Backup Frequency
            </p>
            <p className="mt-0.5 text-sm text-[var(--muted)]">
              {frequencyLabel(settings.frequency)}
              {settings.automatic_enabled
                ? ` · ${String(settings.backup_hour_ist).padStart(2, "0")}:${String(settings.backup_minute_ist).padStart(2, "0")} IST`
                : ""}
            </p>
          </div>
        </div>

        {canFullBackup && (
          <button
            type="button"
            disabled={pending}
            onClick={() => backupNow(false)}
            className={`mt-5 ${secondaryBtn}`}
          >
            Download Excel Backup
          </button>
        )}

        {isOwner && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setShowRestore(true);
                restoreInputRef.current?.click();
              }}
              className={`mt-3 ${secondaryBtn}`}
            >
              Restore From Excel
            </button>
            <input
              ref={restoreInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => onRestoreFile(e.target.files?.[0] || null)}
            />
          </>
        )}

        {isOwner && (
          <div className="mt-6 space-y-3 border-t border-[var(--border)] pt-5">
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">
                Google Drive
              </p>
              <p className="mt-0.5 text-sm">
                {driveReady ? (
                  <span className="font-semibold text-emerald-700">
                    ✓ Connected
                    {driveEmail ? ` · ${driveEmail}` : ""}
                  </span>
                ) : (
                  <span className="font-semibold text-[var(--muted)]">
                    ○ Not Connected
                  </span>
                )}
              </p>
            </div>
            {!driveConnected && (
              <a
                href={
                  driveConfigured
                    ? "/api/backup/drive/connect"
                    : "#google-drive-setup"
                }
                onClick={(e) => {
                  if (!driveConfigured) {
                    e.preventDefault();
                    setError(
                      "Google Drive is not configured yet. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI on the server, then try Connect again."
                    );
                  }
                }}
                className={`inline-flex ${secondaryBtn} items-center justify-center`}
              >
                Connect Google Drive
              </a>
            )}
            {driveConnected && canFullBackup && (
              <button
                type="button"
                disabled={pending || !driveReady}
                onClick={() => backupNow(true)}
                className={primaryBtn}
              >
                Backup Now to Google Drive
              </button>
            )}
            {driveConnected && driveConfigured && (
              <a
                href="/api/backup/drive/connect"
                className="block text-center text-sm font-semibold text-[var(--accent)]"
              >
                Reconnect Google Drive
              </a>
            )}
          </div>
        )}
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

      {isOwner && showRestore && (
        <section
          id="restore-data"
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3"
        >
          <h3 className="font-semibold">Restore From Excel</h3>
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
              FULL RESTORE
            </label>
          </div>
          <button
            type="button"
            className="text-sm font-semibold text-[var(--accent)]"
            onClick={() => restoreInputRef.current?.click()}
          >
            Choose another Excel file…
          </button>
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
                    setShowRestore(false);
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

      <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--ink)]">
          More options — company scope, schedule, exports, history
        </summary>
        <div className="mt-4 space-y-5">
          <label className="block text-sm">
            Company scope
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
          </label>

          {canManageSettings && (
            <form
              action={(fd) => saveAdvancedSettings(fd)}
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
                  <option value="DAILY">Every Day</option>
                  <option value="WEEKLY">Every Week</option>
                  <option value="MONTHLY">Every Month</option>
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
                  Save schedule settings
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Module Excel Export</h4>
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
          </div>

          <div id="backup-history">
            <h4 className="text-sm font-semibold">Backup History</h4>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="py-2 pr-2">Date</th>
                    <th className="py-2 pr-2">Type</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2 pr-2">Drive</th>
                    <th className="py-2">File</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-t border-[var(--border)]">
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {formatLastBackup(j.created_at)}
                      </td>
                      <td className="py-2 pr-2">{j.backup_type}</td>
                      <td className="py-2 pr-2">{j.status}</td>
                      <td className="py-2 pr-2">{j.drive_status}</td>
                      <td className="py-2">
                        {j.storage_path ? (
                          <a
                            className="text-[var(--accent)] hover:underline"
                            href={`/api/backup/download/${j.id}`}
                          >
                            Download
                          </a>
                        ) : (
                          j.file_name
                        )}
                      </td>
                    </tr>
                  ))}
                  {jobs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-[var(--muted)]">
                        No backups yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
