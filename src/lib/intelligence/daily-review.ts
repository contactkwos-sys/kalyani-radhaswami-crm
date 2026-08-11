"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { todayISO } from "@/lib/intelligence/filters";

export async function getSalesmanDailyReview(
  companyIds: string[],
  date?: string
) {
  await requireProfile();
  const supabase = await createClient();
  const day = date || todayISO();
  const month = day.slice(0, 7);

  const { data: salesmen } = await supabase
    .from("crm_salesmen")
    .select("id, name, company_id, monthly_target")
    .in("company_id", companyIds)
    .eq("status", "ACTIVE")
    .order("name");

  const [
    { data: plans },
    { data: planned },
    { data: visits },
    { data: sales },
    { data: incentives },
    { data: followups },
  ] = await Promise.all([
    supabase
      .from("crm_daily_plans")
      .select("*")
      .in("company_id", companyIds)
      .eq("plan_date", day),
    supabase
      .from("crm_planned_visits")
      .select(
        "*, party:crm_parties(party_name), daily_plan:crm_daily_plans(salesman_id, plan_date, daily_sales_target)"
      )
      .in("company_id", companyIds),
    supabase
      .from("crm_visits")
      .select(
        "*, party:crm_parties(party_name), feedback:crm_visit_feedback(discussion, person_met, sample_given)"
      )
      .in("company_id", companyIds)
      .eq("visit_date", day),
    supabase
      .from("crm_sales")
      .select("*")
      .in("company_id", companyIds)
      .eq("sale_date", day),
    supabase
      .from("crm_incentive_calculations")
      .select("*")
      .in("company_id", companyIds)
      .eq("year_month", month),
    supabase
      .from("crm_followups")
      .select("*, party:crm_parties(party_name)")
      .in("company_id", companyIds)
      .eq("followup_date", day),
  ]);

  return (salesmen || []).map((sm) => {
    const plan = (plans || []).find((p) => p.salesman_id === sm.id);
    const plannedParties = (planned || []).filter((pv) => {
      const dp = Array.isArray(pv.daily_plan) ? pv.daily_plan[0] : pv.daily_plan;
      return dp?.salesman_id === sm.id && dp.plan_date === day;
    });
    const dayVisits = (visits || []).filter((v) => v.salesman_id === sm.id);
    const gps = dayVisits.filter((v) => v.gps_verified);
    const visitedPartyIds = new Set(gps.map((v) => v.party_id));
    const notVisited = plannedParties.filter(
      (pv) => !visitedPartyIds.has(pv.party_id) && pv.status !== "SKIPPED"
    );
    const daySales = (sales || []).filter((s) => s.salesman_id === sm.id);
    const salesValue = daySales.reduce((a, s) => a + Number(s.sales_value), 0);
    const dayTarget = Number(plan?.daily_sales_target || sm.monthly_target / 26 || 0);
    const estIncentive = (incentives || [])
      .filter(
        (i) =>
          i.salesman_id === sm.id &&
          i.status === "ESTIMATED" &&
          daySales.some((s) => s.id === i.sale_id)
      )
      .reduce((a, i) => a + Number(i.calculated_amount), 0);

    return {
      salesman: sm,
      plan,
      plannedParties: plannedParties.map((pv) => {
        const party = Array.isArray(pv.party) ? pv.party[0] : pv.party;
        return {
          id: pv.id,
          party_id: pv.party_id,
          party_name: party?.party_name || "Party",
          status: pv.status,
          reasonNotVisited:
            pv.status === "SKIPPED"
              ? "Marked skipped"
              : !visitedPartyIds.has(pv.party_id)
                ? "Why was this party not visited? No GPS-verified visit recorded."
                : null,
        };
      }),
      visits: gps.map((v) => {
        const party = Array.isArray(v.party) ? v.party[0] : v.party;
        const fb = Array.isArray(v.feedback) ? v.feedback[0] : v.feedback;
        return {
          id: v.id,
          party_name: party?.party_name,
          duration_seconds: v.duration_seconds,
          person_met: fb?.person_met,
          discussion: fb?.discussion,
          sample_given: fb?.sample_given,
        };
      }),
      notVisited,
      followups: (followups || []).filter((f) => f.salesman_id === sm.id),
      sales: daySales,
      todaysSales: salesValue,
      todaysTarget: dayTarget,
      achievementPct: dayTarget > 0 ? (salesValue / dayTarget) * 100 : 0,
      estimatedIncentive: estIncentive,
      totalDuration: gps.reduce(
        (a, v) => a + Number(v.duration_seconds || 0),
        0
      ),
    };
  });
}
