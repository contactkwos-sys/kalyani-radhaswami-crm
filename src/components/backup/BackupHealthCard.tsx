import Link from "next/link";
import type { BackupHealth } from "@/types/backup";

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
  return `${d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  })} — ${time}`;
}

export function BackupHealthCard({ health }: { health: BackupHealth }) {
  const tone =
    health.status === "GREEN"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : health.status === "RED"
        ? "border-red-200 bg-red-50 text-red-900"
        : "border-amber-200 bg-amber-50 text-amber-900";
  const statusText =
    health.status === "GREEN"
      ? "✓ Safe"
      : health.status === "RED"
        ? "✗ Needs attention"
        : "● Due soon";

  return (
    <section className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide">
            DATA BACKUP
          </p>
          <p className="mt-2 text-sm">
            Last Backup:{" "}
            <span className="font-medium">
              {formatLastBackup(health.lastSuccess?.created_at)}
            </span>
          </p>
          <p className="mt-1 text-sm">
            Status: <span className="font-semibold">{statusText}</span>
          </p>
          <p className="mt-1 text-sm">
            Automatic:{" "}
            {health.automaticEnabled ? `● ON · ${health.frequency}` : "○ OFF"}
          </p>
        </div>
        <Link
          href="/settings/backup"
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white"
        >
          Backup Now
        </Link>
      </div>
    </section>
  );
}
