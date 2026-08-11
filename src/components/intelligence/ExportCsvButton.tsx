"use client";

import { downloadCsv, toCsv } from "@/lib/intelligence/csv";

export function ExportCsvButton({
  filename,
  rows,
  label = "Export CSV",
}: {
  filename: string;
  rows: Record<string, string | number | null | undefined>[];
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => downloadCsv(filename, toCsv(rows))}
      className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium print:hidden"
    >
      {label}
    </button>
  );
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium print:hidden"
    >
      Print
    </button>
  );
}
