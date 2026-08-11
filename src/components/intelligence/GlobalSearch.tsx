"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { globalSearch } from "@/lib/intelligence/search";
import type { SearchHit } from "@/types/intelligence";

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [pending, startTransition] = useTransition();

  function onChange(value: string) {
    setQ(value);
    if (value.trim().length < 2) {
      setHits([]);
      return;
    }
    startTransition(async () => {
      try {
        const res = await globalSearch(value);
        setHits(res);
      } catch {
        setHits([]);
      }
    });
  }

  return (
    <div className="relative w-full max-w-md">
      <input
        value={q}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search party, salesman, product, invoice, phone…"
        className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
      />
      {(hits.length > 0 || (pending && q.length >= 2)) && (
        <ul className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-[var(--border)] bg-white shadow-lg">
          {pending && (
            <li className="px-3 py-2 text-xs text-[var(--muted)]">Searching…</li>
          )}
          {hits.map((h) => (
            <li key={`${h.entity_type}-${h.entity_id}`}>
              <Link
                href={h.href}
                className="block px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
                onClick={() => {
                  setHits([]);
                  setQ("");
                }}
              >
                <span className="text-[10px] font-semibold uppercase text-[var(--muted)]">
                  {h.entity_type}
                </span>
                <p className="font-medium">{h.title}</p>
                {h.subtitle && (
                  <p className="text-xs text-[var(--muted)]">{h.subtitle}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
