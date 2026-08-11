import Link from "next/link";
import type { BackupHealth } from "@/types/backup";

export function BackupHealthCard({ health }: { health: BackupHealth }) {
  const tone =
    health.status === "GREEN"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : health.status === "RED"
        ? "border-red-200 bg-red-50 text-red-900"
        : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <section className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide">
            Backup Health · {health.status}
          </p>
          <p className="mt-1 text-sm font-medium">{health.message}</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li>
              Last Backup:{" "}
              {health.lastSuccess
                ? new Date(health.lastSuccess.created_at).toLocaleString()
                : "—"}
            </li>
            <li>
              Google Drive:{" "}
              {health.lastDriveSuccess?.drive_status || "NOT_CONFIGURED"}
            </li>
            <li>Excel Export: READY</li>
            <li>
              Automatic:{" "}
              {health.automaticEnabled ? `ON (${health.frequency})` : "OFF"}
            </li>
          </ul>
        </div>
        <Link
          href="/settings/backup"
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white"
        >
          Open Backup Center
        </Link>
      </div>
    </section>
  );
}
