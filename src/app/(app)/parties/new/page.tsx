import { redirect } from "next/navigation";
import { PartyForm } from "@/components/masters/PartyForm";
import { getActiveCompanyContext } from "@/lib/masters/context";
import { ROLE_PERMISSIONS } from "@/types/database";

export default async function NewPartyPage() {
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }
  const canAdd =
    ROLE_PERMISSIONS[ctx.profile.role].canManageMasters ||
    ctx.profile.role === "SALESMAN" ||
    ctx.profile.role === "SALES_MANAGER";
  if (!canAdd) redirect("/parties");

  return (
    <div className="space-y-6">
      <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
        Add Party
      </h2>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <PartyForm companies={ctx.companies} />
      </div>
    </div>
  );
}
