import type {
  Company,
  MasterStatus,
  PartyStatus,
} from "@/types/database";

export type { MasterStatus, PartyStatus };

export interface Territory {
  id: string;
  company_id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  company_id: string;
  product_code: string;
  product_name: string;
  category: string | null;
  description: string | null;
  unit: string;
  sales_rate: number;
  monthly_target: number;
  incentive_percent: number;
  notes: string | null;
  status: MasterStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  company?: Pick<Company, "id" | "name" | "code"> | null;
}

export interface Salesman {
  id: string;
  company_id: string;
  user_id: string | null;
  employee_id: string;
  name: string;
  photo_url: string | null;
  mobile: string | null;
  territory_id: string | null;
  monthly_target: number;
  party_development_target: number;
  incentive_rule: string | null;
  joining_date: string | null;
  status: MasterStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  company?: Pick<Company, "id" | "name" | "code"> | null;
  territory?: Pick<Territory, "id" | "name" | "code"> | null;
}

export interface Party {
  id: string;
  company_id: string;
  party_code: string;
  party_name: string;
  contact_person: string | null;
  mobile: string | null;
  whatsapp: string | null;
  address: string | null;
  area: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  current_supplier: string | null;
  potential_monthly_business: number;
  current_business: number;
  status: PartyStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  company?: Pick<Company, "id" | "name" | "code"> | null;
}

export interface SalesmanProduct {
  id: string;
  company_id: string;
  salesman_id: string;
  product_id: string;
  is_active: boolean;
  assigned_at: string;
  assigned_by: string | null;
  product?: Product | null;
  salesman?: Salesman | null;
}

export interface PartyProduct {
  id: string;
  company_id: string;
  party_id: string;
  product_id: string;
  relation_type: "USED" | "INTERESTED";
  is_active: boolean;
  assigned_at: string;
  assigned_by: string | null;
  product?: Product | null;
}

export interface PartySalesman {
  id: string;
  company_id: string;
  party_id: string;
  salesman_id: string;
  product_id: string | null;
  is_active: boolean;
  assigned_at: string;
  assigned_by: string | null;
  salesman?: Salesman | null;
  product?: Product | null;
  party?: Party | null;
}

export const PARTY_STATUSES: PartyStatus[] = [
  "NEW",
  "PROSPECT",
  "SAMPLE",
  "TRIAL",
  "CONVERTED",
  "REGULAR",
  "DORMANT",
  "LOST",
];
