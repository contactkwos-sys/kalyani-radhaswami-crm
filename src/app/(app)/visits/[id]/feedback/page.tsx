import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { VisitFeedbackForm } from "@/components/visits/VisitFeedbackForm";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function VisitFeedbackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile().catch(() => null);
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: visit } = await supabase
    .from("crm_visits")
    .select("*, party:crm_parties(party_name)")
    .eq("id", id)
    .maybeSingle();
  if (!visit) notFound();
  if (visit.status !== "ENDED" || !visit.gps_verified) {
    redirect(`/visits/${id}`);
  }

  const { data: products } = await supabase
    .from("crm_products")
    .select("id, product_name")
    .eq("company_id", visit.company_id)
    .eq("status", "ACTIVE")
    .order("product_name");

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/visits/${id}`} className="text-sm text-[var(--accent)] hover:underline">
          ← Visit
        </Link>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Visit Feedback
        </h2>
        <p className="text-sm text-[var(--muted)]">{visit.party?.party_name}</p>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <VisitFeedbackForm visitId={id} products={products || []} />
      </div>
    </div>
  );
}
