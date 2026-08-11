"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeFollowup } from "@/lib/visits/actions";

export function CompleteFollowupButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await completeFollowup(id);
          router.refresh();
        })
      }
      className="text-sm font-medium text-[var(--accent)] hover:underline disabled:opacity-60"
    >
      Mark done
    </button>
  );
}
