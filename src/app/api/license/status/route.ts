import { NextResponse } from "next/server";
import { requireProfile, getAccessibleCompanies } from "@/lib/auth/session";
import {
  getLicensesForCompanies,
  formatTrialRemaining,
} from "@/lib/license/trial";

export async function GET(request: Request) {
  try {
    const profile = await requireProfile();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("company_id");

    const companies = await getAccessibleCompanies(profile.id, profile.role);
    const ids = companyId
      ? companies.filter((c) => c.id === companyId).map((c) => c.id)
      : companies.map((c) => c.id);

    const licenses = await getLicensesForCompanies(ids);

    return NextResponse.json({
      licenses: licenses.map((l) => ({
        ...l,
        trial_remaining_label: formatTrialRemaining(l.trial_remaining_seconds),
      })),
      server_time: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
