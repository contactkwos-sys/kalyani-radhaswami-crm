"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSignOut() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onSignOut}
      disabled={loading}
      className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface-2)] disabled:opacity-60"
    >
      {loading ? "…" : "Sign out"}
    </button>
  );
}
