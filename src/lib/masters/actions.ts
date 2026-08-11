"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { ROLE_PERMISSIONS } from "@/types/database";
import type { Party, Product, Salesman } from "@/types/masters";

async function requireManager() {
  const profile = await requireProfile();
  if (!ROLE_PERMISSIONS[profile.role].canManageMasters) {
    throw new Error("Forbidden");
  }
  return profile;
}

async function audit(
  action: string,
  module: string,
  companyId: string | null,
  recordType: string,
  recordId: string | null,
  metadata: Record<string, unknown> = {}
) {
  const supabase = await createClient();
  await supabase.rpc("crm_write_audit_log", {
    p_action: action,
    p_module: module,
    p_company_id: companyId,
    p_record_type: recordType,
    p_record_id: recordId,
    p_metadata: metadata,
  });
}

function emptyToNull(value: unknown) {
  if (value === "" || value === undefined) return null;
  return value;
}

const productSchema = z.object({
  company_id: z.string().uuid(),
  product_code: z.string().min(1).max(40),
  product_name: z.string().min(1).max(120),
  category: z.preprocess(emptyToNull, z.string().max(80).nullable()).optional(),
  description: z.preprocess(emptyToNull, z.string().max(2000).nullable()).optional(),
  unit: z.string().min(1).max(20).default("KG"),
  sales_rate: z.coerce.number().min(0),
  monthly_target: z.coerce.number().min(0),
  incentive_percent: z.coerce.number().min(0).max(100),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

const salesmanSchema = z.object({
  company_id: z.string().uuid(),
  employee_id: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  mobile: z.preprocess(emptyToNull, z.string().max(20).nullable()).optional(),
  photo_url: z.preprocess(emptyToNull, z.string().nullable()).optional(),
  territory_id: z.preprocess(emptyToNull, z.string().uuid().nullable()).optional(),
  monthly_target: z.coerce.number().min(0),
  incentive_rule: z.preprocess(emptyToNull, z.string().max(500).nullable()).optional(),
  joining_date: z.preprocess(emptyToNull, z.string().nullable()).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  user_id: z.preprocess(emptyToNull, z.string().uuid().nullable()).optional(),
});

const partySchema = z.object({
  company_id: z.string().uuid(),
  party_code: z.string().min(1).max(40),
  party_name: z.string().min(1).max(160),
  contact_person: z.preprocess(emptyToNull, z.string().max(120).nullable()).optional(),
  mobile: z.preprocess(emptyToNull, z.string().max(20).nullable()).optional(),
  whatsapp: z.preprocess(emptyToNull, z.string().max(20).nullable()).optional(),
  address: z.preprocess(emptyToNull, z.string().max(500).nullable()).optional(),
  area: z.preprocess(emptyToNull, z.string().max(80).nullable()).optional(),
  city: z.preprocess(emptyToNull, z.string().max(80).nullable()).optional(),
  latitude: z.preprocess(emptyToNull, z.coerce.number().min(-90).max(90).nullable()).optional(),
  longitude: z.preprocess(
    emptyToNull,
    z.coerce.number().min(-180).max(180).nullable()
  ).optional(),
  current_supplier: z.preprocess(emptyToNull, z.string().max(160).nullable()).optional(),
  potential_monthly_business: z.coerce.number().min(0).default(0),
  current_business: z.coerce.number().min(0).default(0),
  status: z
    .enum([
      "NEW",
      "PROSPECT",
      "SAMPLE",
      "TRIAL",
      "CONVERTED",
      "REGULAR",
      "DORMANT",
      "LOST",
    ])
    .default("NEW"),
});

export async function listProducts(companyIds?: string[]): Promise<Product[]> {
  await requireProfile();
  const supabase = await createClient();
  let q = supabase
    .from("crm_products")
    .select("*, company:crm_companies(id,name,code)")
    .order("product_name");
  if (companyIds?.length) q = q.in("company_id", companyIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as Product[];
}

export async function getProduct(id: string): Promise<Product | null> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_products")
    .select("*, company:crm_companies(id,name,code)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Product | null;
}

export async function upsertProduct(input: unknown, id?: string) {
  const profile = await requireManager();
  const parsed = productSchema.parse(input);
  const supabase = await createClient();

  if (id) {
    const { data, error } = await supabase
      .from("crm_products")
      .update(parsed)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await audit("PRODUCT_UPDATED", "products", parsed.company_id, "crm_products", id, {
      product_code: parsed.product_code,
    });
    revalidatePath("/products");
    return data as Product;
  }

  const { data, error } = await supabase
    .from("crm_products")
    .insert({ ...parsed, created_by: profile.id })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await audit("PRODUCT_CREATED", "products", parsed.company_id, "crm_products", data.id, {
    product_code: parsed.product_code,
  });
  revalidatePath("/products");
  return data as Product;
}

export async function listSalesmen(companyIds?: string[]): Promise<Salesman[]> {
  await requireProfile();
  const supabase = await createClient();
  let q = supabase
    .from("crm_salesmen")
    .select(
      "*, company:crm_companies(id,name,code), territory:crm_territories(id,name,code)"
    )
    .order("name");
  if (companyIds?.length) q = q.in("company_id", companyIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as Salesman[];
}

export async function getSalesman(id: string): Promise<Salesman | null> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_salesmen")
    .select(
      "*, company:crm_companies(id,name,code), territory:crm_territories(id,name,code)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Salesman | null;
}

export async function upsertSalesman(input: unknown, id?: string) {
  const profile = await requireManager();
  const parsed = salesmanSchema.parse(input);
  const payload = {
    ...parsed,
    photo_url: parsed.photo_url || null,
    joining_date: parsed.joining_date || null,
    territory_id: parsed.territory_id || null,
    user_id: parsed.user_id || null,
  };
  const supabase = await createClient();

  if (id) {
    const { data, error } = await supabase
      .from("crm_salesmen")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await audit("SALESMAN_UPDATED", "salesmen", parsed.company_id, "crm_salesmen", id, {
      employee_id: parsed.employee_id,
    });
    revalidatePath("/salesmen");
    return data as Salesman;
  }

  const { data, error } = await supabase
    .from("crm_salesmen")
    .insert({ ...payload, created_by: profile.id })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await audit("SALESMAN_CREATED", "salesmen", parsed.company_id, "crm_salesmen", data.id, {
    employee_id: parsed.employee_id,
  });
  revalidatePath("/salesmen");
  return data as Salesman;
}

export async function listParties(companyIds?: string[]): Promise<Party[]> {
  await requireProfile();
  const supabase = await createClient();
  let q = supabase
    .from("crm_parties")
    .select("*, company:crm_companies(id,name,code)")
    .order("party_name");
  if (companyIds?.length) q = q.in("company_id", companyIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as Party[];
}

export async function getParty(id: string): Promise<Party | null> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_parties")
    .select("*, company:crm_companies(id,name,code)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Party | null;
}

export async function upsertParty(input: unknown, id?: string) {
  const profile = await requireProfile();
  const canManage = ROLE_PERMISSIONS[profile.role].canManageMasters;
  const canCreate =
    canManage ||
    profile.role === "SALESMAN" ||
    profile.role === "SALES_MANAGER";
  if (!canCreate && !id) throw new Error("Forbidden");
  if (!canManage && id) {
    // updates allowed for assigned salesman via RLS; still validate here softly
  }

  const parsed = partySchema.parse(input);
  const supabase = await createClient();

  if (id) {
    const { data, error } = await supabase
      .from("crm_parties")
      .update(parsed)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await audit("PARTY_UPDATED", "parties", parsed.company_id, "crm_parties", id, {
      party_code: parsed.party_code,
    });
    revalidatePath("/parties");
    revalidatePath(`/parties/${id}`);
    return data as Party;
  }

  const { data, error } = await supabase
    .from("crm_parties")
    .insert({ ...parsed, created_by: profile.id })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await audit("PARTY_CREATED", "parties", parsed.company_id, "crm_parties", data.id, {
    party_code: parsed.party_code,
  });
  revalidatePath("/parties");
  return data as Party;
}

export async function assignSalesmanProduct(params: {
  company_id: string;
  salesman_id: string;
  product_id: string;
}) {
  const profile = await requireManager();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_salesman_products")
    .upsert(
      {
        company_id: params.company_id,
        salesman_id: params.salesman_id,
        product_id: params.product_id,
        is_active: true,
        assigned_by: profile.id,
      },
      { onConflict: "salesman_id,product_id" }
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await audit(
    "SALESMAN_PRODUCT_ASSIGNED",
    "assignments",
    params.company_id,
    "crm_salesman_products",
    data.id,
    params
  );
  revalidatePath("/assignments");
  revalidatePath(`/salesmen/${params.salesman_id}`);
  revalidatePath(`/products/${params.product_id}`);
  return data;
}

export async function removeSalesmanProduct(id: string) {
  await requireManager();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_salesman_products")
    .update({ is_active: false })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await audit(
    "SALESMAN_PRODUCT_REMOVED",
    "assignments",
    data.company_id,
    "crm_salesman_products",
    id,
    {}
  );
  revalidatePath("/assignments");
  return data;
}

export async function assignPartyProduct(params: {
  company_id: string;
  party_id: string;
  product_id: string;
  relation_type: "USED" | "INTERESTED";
}) {
  const profile = await requireManager();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_party_products")
    .upsert(
      {
        ...params,
        is_active: true,
        assigned_by: profile.id,
      },
      { onConflict: "party_id,product_id,relation_type" }
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await audit(
    "PARTY_PRODUCT_ASSIGNED",
    "assignments",
    params.company_id,
    "crm_party_products",
    data.id,
    params
  );
  revalidatePath("/assignments");
  revalidatePath(`/parties/${params.party_id}`);
  return data;
}

export async function assignPartySalesman(params: {
  company_id: string;
  party_id: string;
  salesman_id: string;
  product_id?: string | null;
}) {
  const profile = await requireManager();
  const supabase = await createClient();
  const payload = {
    company_id: params.company_id,
    party_id: params.party_id,
    salesman_id: params.salesman_id,
    product_id: params.product_id || null,
    is_active: true,
    assigned_by: profile.id,
  };
  const { data, error } = await supabase
    .from("crm_party_salesmen")
    .upsert(payload, { onConflict: "party_id,salesman_id,product_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await audit(
    "PARTY_SALESMAN_ASSIGNED",
    "assignments",
    params.company_id,
    "crm_party_salesmen",
    data.id,
    params
  );
  revalidatePath("/assignments");
  revalidatePath(`/parties/${params.party_id}`);
  revalidatePath(`/salesmen/${params.salesman_id}`);
  return data;
}

export async function removePartySalesman(id: string) {
  await requireManager();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_party_salesmen")
    .update({ is_active: false })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await audit(
    "PARTY_SALESMAN_REMOVED",
    "assignments",
    data.company_id,
    "crm_party_salesmen",
    id,
    {}
  );
  revalidatePath("/assignments");
  return data;
}

export async function getSalesmanProductAssignments(salesmanId: string) {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_salesman_products")
    .select("*, product:crm_products(*)")
    .eq("salesman_id", salesmanId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getPartyAssignments(partyId: string) {
  await requireProfile();
  const supabase = await createClient();
  const [products, salesmen] = await Promise.all([
    supabase
      .from("crm_party_products")
      .select("*, product:crm_products(*)")
      .eq("party_id", partyId)
      .eq("is_active", true),
    supabase
      .from("crm_party_salesmen")
      .select("*, salesman:crm_salesmen(*), product:crm_products(*)")
      .eq("party_id", partyId)
      .eq("is_active", true),
  ]);
  if (products.error) throw new Error(products.error.message);
  if (salesmen.error) throw new Error(salesmen.error.message);
  return { products: products.data || [], salesmen: salesmen.data || [] };
}
