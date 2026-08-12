"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { ROLE_PERMISSIONS } from "@/types/database";
import type { Sale } from "@/types/sales";

function emptyToNull(v: unknown) {
  if (v === "" || v === undefined) return null;
  return v;
}

async function requireSalesEnterer() {
  const profile = await requireProfile();
  if (!["OWNER", "CEO_1", "CEO_2", "CEO_3", "ADMIN", "ACCOUNTANT"].includes(profile.role)) {
    throw new Error("Forbidden: only Accountant/Owner/Admin can enter sales");
  }
  return profile;
}

const saleSchema = z.object({
  company_id: z.string().uuid(),
  product_id: z.string().uuid(),
  party_id: z.string().uuid(),
  salesman_id: z.string().uuid(),
  sale_date: z.string().min(8),
  quantity: z.coerce.number().min(0),
  rate: z.preprocess(emptyToNull, z.coerce.number().min(0).nullable()).optional(),
  sales_value: z.coerce.number().min(0),
  invoice_number: z.preprocess(emptyToNull, z.string().max(80).nullable()).optional(),
  remarks: z.preprocess(emptyToNull, z.string().max(2000).nullable()).optional(),
});

export async function createSale(input: unknown) {
  const profile = await requireSalesEnterer();
  const parsed = saleSchema.parse(input);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("crm_sales")
    .insert({
      ...parsed,
      rate: parsed.rate ?? null,
      invoice_number: parsed.invoice_number ?? null,
      remarks: parsed.remarks ?? null,
      entered_by: profile.id,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await supabase.rpc("crm_write_audit_log", {
    p_action: "SALE_CREATED",
    p_module: "sales",
    p_company_id: parsed.company_id,
    p_record_type: "crm_sales",
    p_record_id: data.id,
    p_metadata: {
      party_id: parsed.party_id,
      product_id: parsed.product_id,
      salesman_id: parsed.salesman_id,
      sales_value: parsed.sales_value,
      invoice_number: parsed.invoice_number,
    },
  });

  revalidatePath("/sales");
  revalidatePath("/dashboard");
  revalidatePath(`/parties/${parsed.party_id}`);
  return data as Sale;
}

export async function createSalesBatch(rows: unknown[]) {
  const created: Sale[] = [];
  for (const row of rows) {
    created.push(await createSale(row));
  }
  return created;
}

export async function updateSale(id: string, input: unknown) {
  const profile = await requireSalesEnterer();
  const parsed = saleSchema.partial().parse(input);
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("crm_sales")
    .select("*")
    .eq("id", id)
    .single();
  if (!before) throw new Error("Sale not found");

  const { data, error } = await supabase
    .from("crm_sales")
    .update({ ...parsed, updated_by: profile.id })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await supabase.rpc("crm_write_audit_log", {
    p_action: "SALE_UPDATED",
    p_module: "sales",
    p_company_id: data.company_id,
    p_record_type: "crm_sales",
    p_record_id: id,
    p_metadata: {
      old_value: {
        sales_value: before.sales_value,
        quantity: before.quantity,
        sale_date: before.sale_date,
      },
      new_value: {
        sales_value: data.sales_value,
        quantity: data.quantity,
        sale_date: data.sale_date,
      },
    },
  });

  revalidatePath("/sales");
  revalidatePath("/dashboard");
  return data as Sale;
}

export async function listSales(filters: {
  companyIds?: string[];
  salesmanId?: string;
  partyId?: string;
  productId?: string;
  from?: string;
  to?: string;
}) {
  await requireProfile();
  const supabase = await createClient();
  let q = supabase
    .from("crm_sales")
    .select(
      "*, product:crm_products(id,product_name,product_code), party:crm_parties(id,party_name,party_code), salesman:crm_salesmen(id,name,employee_id)"
    )
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (filters.companyIds?.length) q = q.in("company_id", filters.companyIds);
  if (filters.salesmanId) q = q.eq("salesman_id", filters.salesmanId);
  if (filters.partyId) q = q.eq("party_id", filters.partyId);
  if (filters.productId) q = q.eq("product_id", filters.productId);
  if (filters.from) q = q.gte("sale_date", filters.from);
  if (filters.to) q = q.lte("sale_date", filters.to);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as Sale[];
}

export async function getSalesmanSalesSummary(salesmanId: string, yearMonth: string) {
  await requireProfile();
  const supabase = await createClient();
  const [y, m] = yearMonth.split("-").map(Number);
  const from = `${yearMonth}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${yearMonth}-${String(lastDay).padStart(2, "0")}`;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const { data: sales, error } = await supabase
    .from("crm_sales")
    .select(
      "*, product:crm_products(product_name), party:crm_parties(party_name)"
    )
    .eq("salesman_id", salesmanId)
    .gte("sale_date", from)
    .lte("sale_date", to);
  if (error) throw new Error(error.message);

  const rows = sales || [];
  const todayRows = rows.filter((s) => s.sale_date === today);
  const monthValue = rows.reduce((a, s) => a + Number(s.sales_value), 0);
  const todayValue = todayRows.reduce((a, s) => a + Number(s.sales_value), 0);
  const todayParties = new Set(todayRows.map((s) => s.party_id)).size;

  const { data: salesman } = await supabase
    .from("crm_salesmen")
    .select("monthly_target, party_development_target, company_id")
    .eq("id", salesmanId)
    .single();

  const { data: targetRow } = await supabase
    .from("crm_salesman_targets")
    .select("*")
    .eq("salesman_id", salesmanId)
    .eq("year_month", yearMonth)
    .is("product_id", null)
    .maybeSingle();

  const target = Number(
    targetRow?.sales_target ?? salesman?.monthly_target ?? 0
  );
  const achievement = target > 0 ? (monthValue / target) * 100 : 0;

  const { data: incentives } = await supabase
    .from("crm_incentive_calculations")
    .select("calculated_amount, status")
    .eq("salesman_id", salesmanId)
    .eq("year_month", yearMonth);

  const estimated = (incentives || [])
    .filter((i) => i.status === "ESTIMATED")
    .reduce((a, i) => a + Number(i.calculated_amount), 0);
  const confirmed = (incentives || [])
    .filter((i) => i.status === "CONFIRMED" || i.status === "PAID")
    .reduce((a, i) => a + Number(i.calculated_amount), 0);

  const byProduct = new Map<string, number>();
  const byParty = new Map<string, number>();
  for (const s of rows) {
    const product = Array.isArray(s.product) ? s.product[0] : s.product;
    const party = Array.isArray(s.party) ? s.party[0] : s.party;
    const pName = product?.product_name || s.product_id;
    const partyName = party?.party_name || s.party_id;
    byProduct.set(pName, (byProduct.get(pName) || 0) + Number(s.sales_value));
    byParty.set(partyName, (byParty.get(partyName) || 0) + Number(s.sales_value));
  }

  return {
    todayValue,
    todayCount: todayRows.length,
    todayParties,
    monthValue,
    monthCount: rows.length,
    target,
    remaining: Math.max(0, target - monthValue),
    achievement,
    estimatedIncentive: estimated,
    confirmedIncentive: confirmed,
    byProduct: Object.fromEntries(byProduct),
    byParty: Object.fromEntries(byParty),
    yearMonth,
    today,
  };
}

export async function upsertSalesmanTarget(input: {
  company_id: string;
  salesman_id: string;
  year_month: string;
  sales_target: number;
  party_development_target?: number;
  product_id?: string | null;
}) {
  const profile = await requireProfile();
  if (!ROLE_PERMISSIONS[profile.role].canManageMasters) throw new Error("Forbidden");
  const supabase = await createClient();

  // Delete existing then insert to handle null product unique
  let del = supabase
    .from("crm_salesman_targets")
    .delete()
    .eq("salesman_id", input.salesman_id)
    .eq("year_month", input.year_month);
  if (input.product_id) del = del.eq("product_id", input.product_id);
  else del = del.is("product_id", null);
  await del;

  const { data, error } = await supabase
    .from("crm_salesman_targets")
    .insert({
      company_id: input.company_id,
      salesman_id: input.salesman_id,
      year_month: input.year_month,
      sales_target: input.sales_target,
      party_development_target: input.party_development_target || 0,
      product_id: input.product_id || null,
      created_by: profile.id,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await supabase.rpc("crm_write_audit_log", {
    p_action: "TARGET_UPSERTED",
    p_module: "targets",
    p_company_id: input.company_id,
    p_record_type: "crm_salesman_targets",
    p_record_id: data.id,
    p_metadata: input,
  });

  revalidatePath("/settings/targets");
  revalidatePath("/dashboard");
  return data;
}

export async function confirmIncentives(salesmanId: string, yearMonth: string) {
  const profile = await requireProfile();
  if (!["OWNER", "CEO_1", "CEO_2", "CEO_3", "ADMIN"].includes(profile.role)) throw new Error("Forbidden");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_incentive_calculations")
    .update({
      status: "CONFIRMED",
      confirmed_at: new Date().toISOString(),
      confirmed_by: profile.id,
    })
    .eq("salesman_id", salesmanId)
    .eq("year_month", yearMonth)
    .eq("status", "ESTIMATED")
    .select("id");
  if (error) throw new Error(error.message);

  await supabase.rpc("crm_write_audit_log", {
    p_action: "INCENTIVES_CONFIRMED",
    p_module: "incentives",
    p_company_id: null,
    p_record_type: "crm_incentive_calculations",
    p_record_id: null,
    p_metadata: { salesman_id: salesmanId, year_month: yearMonth, count: data?.length || 0 },
  });

  revalidatePath("/incentives");
  revalidatePath("/dashboard");
  return { count: data?.length || 0 };
}
