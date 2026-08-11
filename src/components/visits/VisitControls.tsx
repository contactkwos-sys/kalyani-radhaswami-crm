"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { endVisit, startVisit } from "@/lib/visits/actions";
import { captureDeviceGps } from "@/lib/visits/geolocation";

export function StartVisitButton({
  partyId,
  salesmanId,
  productId,
  plannedVisitId,
}: {
  partyId: string;
  salesmanId: string;
  productId?: string | null;
  plannedVisitId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      try {
        const gps = await captureDeviceGps();
        const visit = await startVisit({
          party_id: partyId,
          salesman_id: salesmanId,
          product_id: productId,
          planned_visit_id: plannedVisitId,
          latitude: gps.latitude,
          longitude: gps.longitude,
          accuracy_meters: gps.accuracy,
        });
        if (!visit.gps_verified) {
          setError(
            visit.rejection_reason ||
              "You are not within the permitted party location."
          );
          return;
        }
        router.push(`/visits/${visit.id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start visit");
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="w-full rounded-md bg-[var(--accent)] px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Verifying GPS…" : "START VISIT"}
      </button>
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function EndVisitButton({
  visitId,
  startAt,
}: {
  visitId: string;
  startAt: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.floor((Date.now() - new Date(startAt).getTime()) / 1000))
  );

  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(
        Math.max(0, Math.floor((Date.now() - new Date(startAt).getTime()) / 1000))
      );
    }, 1000);
    return () => clearInterval(t);
  }, [startAt]);

  function format(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function onClick() {
    setError(null);
    startTransition(async () => {
      try {
        let lat: number | null = null;
        let lng: number | null = null;
        let acc: number | null = null;
        try {
          const gps = await captureDeviceGps();
          lat = gps.latitude;
          lng = gps.longitude;
          acc = gps.accuracy;
        } catch {
          // End GPS optional; start GPS already verified
        }
        const visit = await endVisit({
          visit_id: visitId,
          latitude: lat,
          longitude: lng,
          accuracy_meters: acc,
        });
        router.push(`/visits/${visit.id}/feedback`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to end visit");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
          Live visit timer
        </p>
        <p className="mt-1 font-[family-name:var(--font-display)] text-4xl font-semibold">
          {format(elapsed)}
        </p>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="w-full rounded-md bg-[var(--ink)] px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Ending…" : "END VISIT"}
      </button>
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
