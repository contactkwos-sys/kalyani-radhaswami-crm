export type BackupType =
  | "MANUAL"
  | "AUTOMATIC_DAILY"
  | "AUTOMATIC_WEEKLY"
  | "AUTOMATIC_MONTHLY"
  | "SAFETY_BEFORE_RESTORE"
  | "MODULE_EXPORT";

export type BackupStatus = "SUCCESS" | "FAILED" | "PARTIAL" | "RESTORED" | "CANCELLED";
export type DriveStatus =
  | "NOT_CONFIGURED"
  | "SKIPPED"
  | "PENDING"
  | "SUCCESS"
  | "FAILED";

export type RestoreMode = "MERGE" | "FULL";

export interface BackupJob {
  id: string;
  backup_type: BackupType;
  status: BackupStatus;
  drive_status: DriveStatus;
  company_scope: string;
  company_ids: string[];
  file_name: string;
  file_size_bytes: number | null;
  storage_path: string | null;
  drive_file_id: string | null;
  drive_web_link: string | null;
  app_version: string | null;
  record_counts: Record<string, number>;
  total_records: number;
  error_message: string | null;
  created_by: string | null;
  restored_at: string | null;
  restored_by: string | null;
  created_at: string;
}

export interface BackupSettings {
  id: string;
  company_id: string | null;
  automatic_enabled: boolean;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  backup_hour_ist: number;
  backup_minute_ist: number;
  include_all_companies: boolean;
  google_drive_enabled: boolean;
  accountant_export_allowed: boolean;
  last_auto_run_at: string | null;
}

export interface BackupHealth {
  lastSuccess: BackupJob | null;
  lastFailed: BackupJob | null;
  lastDriveSuccess: BackupJob | null;
  automaticEnabled: boolean;
  frequency: string;
  backupAgeHours: number | null;
  status: "GREEN" | "YELLOW" | "RED";
  message: string;
}

export interface RestorePreview {
  sheetCounts: Record<string, number>;
  newRecords: number;
  existingRecords: number;
  changedRecords: number;
  invalidRecords: number;
  errors: string[];
  warnings: string[];
}

export interface SheetDef {
  sheet: string;
  table: string;
  companyColumn?: string | null;
  orderBy?: string;
}

/** Stable export sheet order — matches Phase 6 specification. */
export const BACKUP_SHEETS: SheetDef[] = [
  { sheet: "Companies", table: "crm_companies", companyColumn: "id", orderBy: "name" },
  { sheet: "Users", table: "crm_profiles", companyColumn: null, orderBy: "email" },
  {
    sheet: "Salesmen",
    table: "crm_salesmen",
    companyColumn: "company_id",
    orderBy: "name",
  },
  {
    sheet: "Products",
    table: "crm_products",
    companyColumn: "company_id",
    orderBy: "product_name",
  },
  {
    sheet: "Parties",
    table: "crm_parties",
    companyColumn: "company_id",
    orderBy: "party_name",
  },
  {
    sheet: "Party Contacts",
    table: "crm_parties",
    companyColumn: "company_id",
    orderBy: "party_name",
  },
  {
    sheet: "Product Assignments",
    table: "crm_salesman_products",
    companyColumn: "company_id",
    orderBy: "assigned_at",
  },
  {
    sheet: "Salesman Assignments",
    table: "crm_party_salesmen",
    companyColumn: "company_id",
    orderBy: "assigned_at",
  },
  {
    sheet: "Party Product Assignments",
    table: "crm_party_products",
    companyColumn: "company_id",
    orderBy: "assigned_at",
  },
  {
    sheet: "Daily Plans",
    table: "crm_daily_plans",
    companyColumn: "company_id",
    orderBy: "plan_date",
  },
  {
    sheet: "Visits",
    table: "crm_visits",
    companyColumn: "company_id",
    orderBy: "visit_date",
  },
  {
    sheet: "GPS Visit Records",
    table: "crm_visit_gps_logs",
    companyColumn: "company_id",
    orderBy: "created_at",
  },
  {
    sheet: "Visit Feedback",
    table: "crm_visit_feedback",
    companyColumn: "company_id",
    orderBy: "created_at",
  },
  {
    sheet: "Follow Ups",
    table: "crm_followups",
    companyColumn: "company_id",
    orderBy: "followup_date",
  },
  {
    sheet: "Samples",
    table: "crm_samples",
    companyColumn: "company_id",
    orderBy: "given_at",
  },
  {
    sheet: "Sales",
    table: "crm_sales",
    companyColumn: "company_id",
    orderBy: "sale_date",
  },
  {
    sheet: "Sales Targets",
    table: "crm_salesman_targets",
    companyColumn: "company_id",
    orderBy: "year_month",
  },
  {
    sheet: "Incentive Rules",
    table: "crm_incentive_rules",
    companyColumn: "company_id",
    orderBy: "priority",
  },
  {
    sheet: "Incentive Transactions",
    table: "crm_incentive_calculations",
    companyColumn: "company_id",
    orderBy: "created_at",
  },
  {
    sheet: "Party Product History",
    table: "crm_party_product_history",
    companyColumn: "company_id",
    orderBy: "created_at",
  },
  {
    sheet: "Audit Logs",
    table: "crm_audit_logs",
    companyColumn: "company_id",
    orderBy: "created_at",
  },
];

export const APP_VERSION = "0.6.0-phase6";
