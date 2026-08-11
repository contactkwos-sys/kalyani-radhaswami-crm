export type DevStatus =
  | "NOT_STARTED"
  | "FIRST_VISIT"
  | "FOLLOW_UP"
  | "SAMPLE_GIVEN"
  | "SAMPLE_UNDER_TRIAL"
  | "PRODUCT_STARTED"
  | "REGULAR_SALE"
  | "CONVERTED"
  | "LOST_HOLD";

export type IncentiveType =
  | "PERCENT_OF_SALES"
  | "FIXED_PER_QTY"
  | "FIXED_PER_CONVERTED_PARTY"
  | "PRODUCT_SPECIFIC"
  | "TARGET_SLAB";

export type IncentiveStatus = "ESTIMATED" | "CONFIRMED" | "PAID" | "CANCELLED";

export const DEV_STATUSES: DevStatus[] = [
  "NOT_STARTED",
  "FIRST_VISIT",
  "FOLLOW_UP",
  "SAMPLE_GIVEN",
  "SAMPLE_UNDER_TRIAL",
  "PRODUCT_STARTED",
  "REGULAR_SALE",
  "CONVERTED",
  "LOST_HOLD",
];

export const DEV_STATUS_LABELS: Record<DevStatus, string> = {
  NOT_STARTED: "Not Started",
  FIRST_VISIT: "First Visit",
  FOLLOW_UP: "Follow-up",
  SAMPLE_GIVEN: "Sample Given",
  SAMPLE_UNDER_TRIAL: "Sample Under Trial",
  PRODUCT_STARTED: "Product Started",
  REGULAR_SALE: "Regular Sale",
  CONVERTED: "Converted",
  LOST_HOLD: "Lost/Hold",
};

export interface Sale {
  id: string;
  company_id: string;
  product_id: string;
  party_id: string;
  salesman_id: string;
  sale_date: string;
  quantity: number;
  rate: number | null;
  sales_value: number;
  invoice_number: string | null;
  remarks: string | null;
  entered_by: string;
  updated_by: string | null;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
  product?: { id: string; product_name: string; product_code: string } | null;
  party?: { id: string; party_name: string; party_code: string } | null;
  salesman?: { id: string; name: string; employee_id: string } | null;
}

export interface IncentiveRule {
  id: string;
  company_id: string;
  name: string;
  rule_type: IncentiveType;
  product_id: string | null;
  salesman_id: string | null;
  percent_rate: number | null;
  fixed_amount: number | null;
  slabs: Array<{ min_pct: number; max_pct: number; rate: number }>;
  is_active: boolean;
  priority: number;
  notes: string | null;
}

export interface IncentiveCalculation {
  id: string;
  company_id: string;
  salesman_id: string;
  product_id: string | null;
  sale_id: string | null;
  rule_id: string | null;
  year_month: string;
  sales_value: number;
  incentive_rate: number | null;
  calculated_amount: number;
  status: IncentiveStatus;
  calculation_notes: string | null;
}

export interface SalesmanTarget {
  id: string;
  company_id: string;
  salesman_id: string;
  product_id: string | null;
  year_month: string;
  sales_target: number;
  party_development_target: number;
}

export interface PartyProductStatus {
  id: string;
  company_id: string;
  party_id: string;
  product_id: string;
  development_status: DevStatus;
  conversion_date: string | null;
  first_visit_at: string | null;
  last_visit_at: string | null;
  sample_given_at: string | null;
  total_visits: number;
  total_successful_visits: number;
  total_samples: number;
  total_sales_qty: number;
  total_sales_value: number;
  last_sale_at: string | null;
  next_followup_date: string | null;
  product?: { product_name: string; product_code: string } | null;
}

export type AttentionSeverity = "RED" | "AMBER" | "BLUE" | "GREEN" | "GREY";

export interface InterventionItem {
  party_id: string;
  party_name: string;
  company_id: string;
  product_id: string | null;
  product_name: string | null;
  salesman_name: string | null;
  severity: AttentionSeverity;
  reason: string;
  rule_code: string;
  metric: string;
}
