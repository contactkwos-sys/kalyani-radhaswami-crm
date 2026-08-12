// Types for Phase 1 foundation

export type AppRole =
  | "OWNER"
  | "CEO_1"
  | "CEO_2"
  | "CEO_3"
  | "ADMIN"
  | "SALES_MANAGER"
  | "SALESMAN"
  | "ACCOUNTANT"
  | "VIEWER";

export type LicenseStatus =
  | "TRIAL_ACTIVE"
  | "TRIAL_EXPIRING"
  | "TRIAL_EXPIRED"
  | "ACTIVE_LICENSE"
  | "SUSPENDED";

export type CompanyScope = "KALYANI" | "RADHASWAMI" | "ALL";

export type CompanyCode = "KALYANI" | "RADHASWAMI";

export type MasterStatus = "ACTIVE" | "INACTIVE";

export type PartyStatus =
  | "NEW"
  | "PROSPECT"
  | "SAMPLE"
  | "TRIAL"
  | "CONVERTED"
  | "REGULAR"
  | "DORMANT"
  | "LOST";

export interface Company {
  id: string;
  code: CompanyCode;
  name: string;
  legal_name: string | null;
  support_whatsapp: string | null;
  support_email: string | null;
  gps_radius_meters: 100 | 200 | 500;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  mobile: string | null;
  photo_url: string | null;
  role: AppRole;
  is_active: boolean;
  preferred_company_id: string | null;
  company_scope: CompanyScope;
  /** Protected primary Owner — cannot be deleted/demoted via normal UI. */
  is_primary_owner?: boolean;
  /** Owner/Developer flag for elevated override operations. */
  is_developer?: boolean;
  deactivated_at?: string | null;
  deactivated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserCompanyAccess {
  id: string;
  user_id: string;
  company_id: string;
  role: AppRole;
  is_active: boolean;
  created_at: string;
}

export interface License {
  id: string;
  company_id: string;
  status: LicenseStatus;
  trial_start_at: string;
  trial_end_at: string;
  activated_at: string | null;
  suspended_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LicenseView {
  company_id: string;
  status: LicenseStatus;
  trial_start_at: string;
  trial_end_at: string;
  trial_remaining_seconds: number;
  activated_at: string | null;
  can_operate: boolean;
}

export interface AppSetting {
  id: string;
  company_id: string | null;
  key: string;
  value: string;
  is_public: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  company_id: string | null;
  user_id: string | null;
  action: string;
  module: string;
  record_type: string | null;
  record_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export const ROLE_PERMISSIONS: Record<
  AppRole,
  {
    label: string;
    canManageMasters: boolean;
    canEnterSales: boolean;
    canManageUsers: boolean;
    canViewAll: boolean;
    canOverride: boolean;
    readOnly: boolean;
  }
> = {
  OWNER: {
    label: "CEO / Owner",
    canManageMasters: true,
    canEnterSales: true,
    canManageUsers: true,
    canViewAll: true,
    canOverride: true,
    readOnly: false,
  },
  CEO_1: {
    label: "CEO 1",
    canManageMasters: true,
    canEnterSales: true,
    canManageUsers: true,
    canViewAll: true,
    canOverride: false,
    readOnly: false,
  },
  CEO_2: {
    label: "CEO 2",
    canManageMasters: true,
    canEnterSales: true,
    canManageUsers: true,
    canViewAll: true,
    canOverride: false,
    readOnly: false,
  },
  CEO_3: {
    label: "CEO 3",
    canManageMasters: true,
    canEnterSales: true,
    canManageUsers: true,
    canViewAll: true,
    canOverride: false,
    readOnly: false,
  },
  ADMIN: {
    label: "Admin",
    canManageMasters: true,
    canEnterSales: true,
    canManageUsers: true,
    canViewAll: true,
    canOverride: false,
    readOnly: false,
  },
  SALES_MANAGER: {
    label: "Sales Manager",
    canManageMasters: false,
    canEnterSales: false,
    canManageUsers: false,
    canViewAll: false,
    canOverride: false,
    readOnly: false,
  },
  SALESMAN: {
    label: "Salesman",
    canManageMasters: false,
    canEnterSales: false,
    canManageUsers: false,
    canViewAll: false,
    canOverride: false,
    readOnly: false,
  },
  ACCOUNTANT: {
    label: "Accountant",
    canManageMasters: false,
    canEnterSales: true,
    canManageUsers: false,
    canViewAll: false,
    canOverride: false,
    readOnly: false,
  },
  VIEWER: {
    label: "Viewer",
    canManageMasters: false,
    canEnterSales: false,
    canManageUsers: false,
    canViewAll: true,
    canOverride: false,
    readOnly: true,
  },
};

export const BRANDING = {
  builder: "Built by Kumaresh Budhia",
  supportEmail: "contact.kwos@gmail.com",
  supportWhatsApp: "9825063208",
  supportWhatsAppDisplay: "98250-63-208",
} as const;
