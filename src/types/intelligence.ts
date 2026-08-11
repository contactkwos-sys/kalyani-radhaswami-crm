export type PartyClass =
  | "HOT"
  | "WARM"
  | "COLD"
  | "NEW"
  | "ACTIVE_CUSTOMER"
  | "INACTIVE_CUSTOMER"
  | "HIGH_POTENTIAL"
  | "NO_DEVELOPMENT";

export type MatrixStatus =
  | "NOT_ASSIGNED"
  | "ASSIGNED"
  | "VISIT_STARTED"
  | "SAMPLE_GIVEN"
  | "TRIAL"
  | "REGULAR_ORDER"
  | "STOPPED"
  | "NO_RESPONSE";

export const MATRIX_STATUS_LABELS: Record<MatrixStatus, string> = {
  NOT_ASSIGNED: "Not Assigned",
  ASSIGNED: "Assigned",
  VISIT_STARTED: "Visit Started",
  SAMPLE_GIVEN: "Sample Given",
  TRIAL: "Trial",
  REGULAR_ORDER: "Regular Order",
  STOPPED: "Stopped",
  NO_RESPONSE: "No Response",
};

export const PARTY_CLASS_LABELS: Record<PartyClass, string> = {
  HOT: "Hot",
  WARM: "Warm",
  COLD: "Cold",
  NEW: "New",
  ACTIVE_CUSTOMER: "Active Customer",
  INACTIVE_CUSTOMER: "Inactive Customer",
  HIGH_POTENTIAL: "High Potential",
  NO_DEVELOPMENT: "No Development",
};

export interface ReportFilters {
  companyIds: string[];
  productId?: string | null;
  salesmanId?: string | null;
  partyId?: string | null;
  from: string;
  to: string;
  month?: string | null;
  financialYear?: string | null;
}

export interface IntelligenceSettings {
  id: string;
  company_id: string | null;
  inactive_days: number;
  high_visits_no_sales: number;
  single_visit_ignore_days: number;
  sample_no_followup_days: number;
  high_potential_value: number;
  high_potential_min_visits: number;
  product_started_stale_days: number;
  hot_min_visits: number;
  hot_max_days_since_visit: number;
  warm_max_days_since_visit: number;
  cold_max_days_since_visit: number;
  active_customer_min_sales: number;
  inactive_customer_days: number;
}

export interface OwnerDashboardKpis {
  salesToday: number;
  salesMonth: number;
  salesYear: number;
  target: number;
  achievementPct: number;
  incentiveGenerated: number;
  activeSalesmen: number;
  activeParties: number;
  visitsToday: number;
  visitsMonth: number;
  newPartiesDeveloped: number;
  partiesConverted: number;
  partiesNotConverted: number;
  samplesGiven: number;
  samplesConverted: number;
  followupsPending: number;
  partiesIgnored: number;
  highVisitLowSales: number;
  lowVisitHighPotential: number;
}

export interface SalesmanPerformanceRow {
  id: string;
  name: string;
  company_id: string;
  products: string[];
  assignedParties: number;
  plannedVisits: number;
  actualVisits: number;
  gpsVerifiedVisits: number;
  totalVisitSeconds: number;
  avgTimePerParty: number;
  followups: number;
  samplesGiven: number;
  samplesConverted: number;
  salesAmount: number;
  target: number;
  achievementPct: number;
  incentive: number;
  newParties: number;
  convertedParties: number;
  nonConvertedParties: number;
  lastVisitDate: string | null;
  nextFollowupDate: string | null;
}

export interface ProductPerformanceRow {
  id: string;
  product_name: string;
  product_code: string;
  company_id: string;
  assignedSalesmen: number;
  totalParties: number;
  totalVisits: number;
  totalSales: number;
  target: number;
  achievementPct: number;
  samplesGiven: number;
  samplesConverted: number;
  conversionPct: number;
  followups: number;
  nonConvertedParties: number;
  trend: "GROWING" | "STABLE" | "NEEDS_ATTENTION";
}

export interface ManagementAlert {
  id: string;
  severity: "RED" | "YELLOW" | "GREEN";
  title: string;
  detail: string;
  href: string;
  entity_type: "party" | "product" | "salesman";
  entity_id: string;
  rule_code: string;
}

export interface SearchHit {
  entity_type: string;
  entity_id: string;
  title: string;
  subtitle: string | null;
  company_id: string;
  href: string;
}
