-- Kalyani · Radhaswami CRM — full setup for dedicated project pelwnhukierrqienpveb
-- Paste into Supabase SQL Editor and Run (once).
BEGIN;

-- ===== 20260811220000_phase1_foundation.sql =====
-- Phase 1: CRM foundation (namespaced crm_* to coexist with shared Supabase project)
-- Kalyani Thread + Radhaswami Thread Sales Force Management CRM

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE public.crm_app_role AS ENUM (
    'OWNER', 'ADMIN', 'SALES_MANAGER', 'SALESMAN', 'ACCOUNTANT', 'VIEWER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_license_status AS ENUM (
    'TRIAL_ACTIVE', 'TRIAL_EXPIRING', 'TRIAL_EXPIRED', 'ACTIVE_LICENSE', 'SUSPENDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_company_scope AS ENUM (
    'KALYANI', 'RADHASWAMI', 'ALL'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.crm_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  legal_name TEXT,
  support_whatsapp TEXT DEFAULT '9825063208',
  support_email TEXT DEFAULT 'contact.kwos@gmail.com',
  gps_radius_meters INTEGER NOT NULL DEFAULT 200 CHECK (gps_radius_meters IN (100, 200, 500)),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_companies_code ON public.crm_companies (code);

CREATE TABLE IF NOT EXISTS public.crm_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  mobile TEXT,
  photo_url TEXT,
  role public.crm_app_role NOT NULL DEFAULT 'VIEWER',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  preferred_company_id UUID REFERENCES public.crm_companies (id),
  company_scope public.crm_company_scope NOT NULL DEFAULT 'KALYANI',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_profiles_role ON public.crm_profiles (role);
CREATE INDEX IF NOT EXISTS idx_crm_profiles_email ON public.crm_profiles (email);

CREATE TABLE IF NOT EXISTS public.crm_user_company_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.crm_profiles (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  role public.crm_app_role NOT NULL DEFAULT 'VIEWER',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_uca_user ON public.crm_user_company_access (user_id);
CREATE INDEX IF NOT EXISTS idx_crm_uca_company ON public.crm_user_company_access (company_id);

CREATE TABLE IF NOT EXISTS public.crm_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  status public.crm_license_status NOT NULL DEFAULT 'TRIAL_ACTIVE',
  trial_start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trial_end_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  activated_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_licenses_company ON public.crm_licenses (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_licenses_status ON public.crm_licenses (status);
CREATE INDEX IF NOT EXISTS idx_crm_licenses_trial_end ON public.crm_licenses (trial_end_at);

CREATE TABLE IF NOT EXISTS public.crm_app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES public.crm_profiles (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_app_settings_company_key
  ON public.crm_app_settings (company_id, key)
  WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_app_settings_global_key
  ON public.crm_app_settings (key)
  WHERE company_id IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_owner_security (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_hash TEXT NOT NULL,
  pin_version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.crm_profiles (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_owner_security_singleton
  ON public.crm_owner_security ((TRUE));

CREATE TABLE IF NOT EXISTS public.crm_owner_override_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.crm_profiles (id) ON DELETE CASCADE,
  pin_version INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_owner_override_user ON public.crm_owner_override_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_crm_owner_override_expires ON public.crm_owner_override_sessions (expires_at);

CREATE TABLE IF NOT EXISTS public.crm_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.crm_companies (id),
  user_id UUID REFERENCES public.crm_profiles (id),
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  record_type TEXT,
  record_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_audit_company ON public.crm_audit_logs (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_audit_user ON public.crm_audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_crm_audit_created ON public.crm_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_audit_module ON public.crm_audit_logs (module);

CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_companies_updated ON public.crm_companies;
CREATE TRIGGER trg_crm_companies_updated
  BEFORE UPDATE ON public.crm_companies
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_profiles_updated ON public.crm_profiles;
CREATE TRIGGER trg_crm_profiles_updated
  BEFORE UPDATE ON public.crm_profiles
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_licenses_updated ON public.crm_licenses;
CREATE TRIGGER trg_crm_licenses_updated
  BEFORE UPDATE ON public.crm_licenses
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_app_settings_updated ON public.crm_app_settings;
CREATE TRIGGER trg_crm_app_settings_updated
  BEFORE UPDATE ON public.crm_app_settings
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

CREATE OR REPLACE FUNCTION public.crm_current_user_role()
RETURNS public.crm_app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.crm_profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.crm_is_owner()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_profiles
    WHERE id = auth.uid() AND role = 'OWNER' AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.crm_is_admin_or_owner()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_profiles
    WHERE id = auth.uid()
      AND role IN ('OWNER', 'ADMIN')
      AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.crm_user_has_company_access(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.crm_is_owner()
    OR EXISTS (
      SELECT 1 FROM public.crm_user_company_access uca
      WHERE uca.user_id = auth.uid()
        AND uca.company_id = p_company_id
        AND uca.is_active = TRUE
    );
$$;

CREATE OR REPLACE FUNCTION public.crm_compute_license_status(
  p_status public.crm_license_status,
  p_trial_end_at TIMESTAMPTZ,
  p_activated_at TIMESTAMPTZ,
  p_suspended_at TIMESTAMPTZ
)
RETURNS public.crm_license_status
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  remaining INTERVAL;
BEGIN
  IF p_suspended_at IS NOT NULL OR p_status = 'SUSPENDED' THEN
    RETURN 'SUSPENDED';
  END IF;
  IF p_activated_at IS NOT NULL OR p_status = 'ACTIVE_LICENSE' THEN
    RETURN 'ACTIVE_LICENSE';
  END IF;
  remaining := p_trial_end_at - NOW();
  IF remaining <= INTERVAL '0' THEN
    RETURN 'TRIAL_EXPIRED';
  ELSIF remaining <= INTERVAL '24 hours' THEN
    RETURN 'TRIAL_EXPIRING';
  ELSE
    RETURN 'TRIAL_ACTIVE';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_refresh_license_status(p_company_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.crm_licenses l
  SET status = public.crm_compute_license_status(l.status, l.trial_end_at, l.activated_at, l.suspended_at),
      updated_at = NOW()
  WHERE (p_company_id IS NULL OR l.company_id = p_company_id)
    AND l.activated_at IS NULL
    AND l.suspended_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_get_license_for_company(p_company_id UUID)
RETURNS TABLE (
  company_id UUID,
  status public.crm_license_status,
  trial_start_at TIMESTAMPTZ,
  trial_end_at TIMESTAMPTZ,
  trial_remaining_seconds BIGINT,
  activated_at TIMESTAMPTZ,
  can_operate BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rec public.crm_licenses%ROWTYPE;
  computed public.crm_license_status;
BEGIN
  SELECT * INTO rec FROM public.crm_licenses WHERE crm_licenses.company_id = p_company_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  computed := public.crm_compute_license_status(rec.status, rec.trial_end_at, rec.activated_at, rec.suspended_at);
  company_id := rec.company_id;
  status := computed;
  trial_start_at := rec.trial_start_at;
  trial_end_at := rec.trial_end_at;
  trial_remaining_seconds := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (rec.trial_end_at - NOW()))))::BIGINT;
  activated_at := rec.activated_at;
  can_operate := computed IN ('TRIAL_ACTIVE', 'TRIAL_EXPIRING', 'ACTIVE_LICENSE');
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role public.crm_app_role;
  v_name TEXT;
  v_app TEXT;
BEGIN
  -- Only create CRM profile when signup metadata requests CRM
  v_app := COALESCE(NEW.raw_user_meta_data->>'app', '');
  IF v_app <> 'crm' AND COALESCE(NEW.raw_user_meta_data->>'crm', '') <> 'true' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.crm_app_role, 'VIEWER');
  EXCEPTION WHEN OTHERS THEN
    v_role := 'VIEWER';
  END;

  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  INSERT INTO public.crm_profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, v_name, v_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_crm ON auth.users;
CREATE TRIGGER on_auth_user_created_crm
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.crm_handle_new_user();

CREATE OR REPLACE FUNCTION public.crm_write_audit_log(
  p_action TEXT,
  p_module TEXT,
  p_company_id UUID DEFAULT NULL,
  p_record_type TEXT DEFAULT NULL,
  p_record_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  p_metadata := p_metadata - 'pin' - 'current_pin' - 'new_pin' - 'pin_hash' - 'OWNER_OVERRIDE_PIN';
  INSERT INTO public.crm_audit_logs (company_id, user_id, action, module, record_type, record_id, metadata)
  VALUES (p_company_id, auth.uid(), p_action, p_module, p_record_type, p_record_id, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

INSERT INTO public.crm_companies (code, name, legal_name, support_whatsapp, support_email)
VALUES
  ('KALYANI', 'Kalyani Thread', 'Kalyani Thread', '9825063208', 'contact.kwos@gmail.com'),
  ('RADHASWAMI', 'Radhaswami Thread', 'Radhaswami Thread', '9825063208', 'contact.kwos@gmail.com')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    legal_name = EXCLUDED.legal_name,
    support_whatsapp = EXCLUDED.support_whatsapp,
    support_email = EXCLUDED.support_email;

INSERT INTO public.crm_licenses (company_id, status, trial_start_at, trial_end_at)
SELECT c.id, 'TRIAL_ACTIVE', NOW(), NOW() + INTERVAL '7 days'
FROM public.crm_companies c
WHERE c.code IN ('KALYANI', 'RADHASWAMI')
ON CONFLICT (company_id) DO NOTHING;

INSERT INTO public.crm_app_settings (company_id, key, value, is_public)
SELECT NULL, v.key, v.value, TRUE
FROM (VALUES
  ('support_whatsapp', '9825063208'),
  ('support_email', 'contact.kwos@gmail.com'),
  ('branding_builder', 'Built by Kumaresh Budhia'),
  ('gps_default_radius_meters', '200')
) AS v(key, value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.crm_app_settings s
  WHERE s.company_id IS NULL AND s.key = v.key
);

ALTER TABLE public.crm_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_user_company_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_owner_security ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_owner_override_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_companies_select ON public.crm_companies;
CREATE POLICY crm_companies_select ON public.crm_companies
  FOR SELECT TO authenticated
  USING (public.crm_is_owner() OR public.crm_user_has_company_access(id));

DROP POLICY IF EXISTS crm_companies_update ON public.crm_companies;
CREATE POLICY crm_companies_update ON public.crm_companies
  FOR UPDATE TO authenticated
  USING (public.crm_is_admin_or_owner())
  WITH CHECK (public.crm_is_admin_or_owner());

DROP POLICY IF EXISTS crm_profiles_select ON public.crm_profiles;
CREATE POLICY crm_profiles_select ON public.crm_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.crm_is_admin_or_owner());

DROP POLICY IF EXISTS crm_profiles_update ON public.crm_profiles;
CREATE POLICY crm_profiles_update ON public.crm_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.crm_is_owner())
  WITH CHECK (
    (id = auth.uid() AND role = (SELECT role FROM public.crm_profiles WHERE id = auth.uid()))
    OR public.crm_is_owner()
  );

DROP POLICY IF EXISTS crm_uca_select ON public.crm_user_company_access;
CREATE POLICY crm_uca_select ON public.crm_user_company_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.crm_is_admin_or_owner());

DROP POLICY IF EXISTS crm_uca_manage ON public.crm_user_company_access;
CREATE POLICY crm_uca_manage ON public.crm_user_company_access
  FOR ALL TO authenticated
  USING (public.crm_is_owner())
  WITH CHECK (public.crm_is_owner());

DROP POLICY IF EXISTS crm_licenses_select ON public.crm_licenses;
CREATE POLICY crm_licenses_select ON public.crm_licenses
  FOR SELECT TO authenticated
  USING (public.crm_user_has_company_access(company_id) OR public.crm_is_owner());

DROP POLICY IF EXISTS crm_licenses_update ON public.crm_licenses;
CREATE POLICY crm_licenses_update ON public.crm_licenses
  FOR UPDATE TO authenticated
  USING (public.crm_is_owner())
  WITH CHECK (public.crm_is_owner());

DROP POLICY IF EXISTS crm_app_settings_select ON public.crm_app_settings;
CREATE POLICY crm_app_settings_select ON public.crm_app_settings
  FOR SELECT TO authenticated
  USING (
    is_public = TRUE
    OR public.crm_is_owner()
    OR (company_id IS NOT NULL AND public.crm_user_has_company_access(company_id) AND public.crm_is_admin_or_owner())
  );

DROP POLICY IF EXISTS crm_app_settings_manage ON public.crm_app_settings;
CREATE POLICY crm_app_settings_manage ON public.crm_app_settings
  FOR ALL TO authenticated
  USING (public.crm_is_owner())
  WITH CHECK (public.crm_is_owner());

DROP POLICY IF EXISTS crm_owner_security_deny ON public.crm_owner_security;
CREATE POLICY crm_owner_security_deny ON public.crm_owner_security
  FOR ALL TO authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS crm_owner_override_select ON public.crm_owner_override_sessions;
CREATE POLICY crm_owner_override_select ON public.crm_owner_override_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.crm_is_owner());

DROP POLICY IF EXISTS crm_owner_override_insert ON public.crm_owner_override_sessions;
CREATE POLICY crm_owner_override_insert ON public.crm_owner_override_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.crm_is_owner());

DROP POLICY IF EXISTS crm_audit_select ON public.crm_audit_logs;
CREATE POLICY crm_audit_select ON public.crm_audit_logs
  FOR SELECT TO authenticated
  USING (public.crm_is_admin_or_owner());

DROP POLICY IF EXISTS crm_audit_insert ON public.crm_audit_logs;
CREATE POLICY crm_audit_insert ON public.crm_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.crm_is_owner());

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.crm_companies TO authenticated;
GRANT SELECT, UPDATE ON public.crm_profiles TO authenticated;
GRANT SELECT ON public.crm_user_company_access TO authenticated;
GRANT SELECT ON public.crm_licenses TO authenticated;
GRANT SELECT ON public.crm_app_settings TO authenticated;
GRANT SELECT ON public.crm_owner_override_sessions TO authenticated;
GRANT SELECT, INSERT ON public.crm_audit_logs TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_is_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_is_admin_or_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_user_has_company_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_get_license_for_company(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_refresh_license_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_write_audit_log(TEXT, TEXT, UUID, TEXT, UUID, JSONB) TO authenticated;


-- ===== 20260811223000_phase2_masters.sql =====
-- Phase 2: Product, Salesman, Party masters + assignments

DO $$ BEGIN
  CREATE TYPE public.crm_master_status AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_party_status AS ENUM (
    'NEW', 'PROSPECT', 'SAMPLE', 'TRIAL', 'CONVERTED', 'REGULAR', 'DORMANT', 'LOST'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Territories
CREATE TABLE IF NOT EXISTS public.crm_territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_crm_territories_company ON public.crm_territories (company_id);

-- Products
CREATE TABLE IF NOT EXISTS public.crm_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'KG',
  sales_rate NUMERIC(14, 2) NOT NULL DEFAULT 0,
  monthly_target NUMERIC(14, 2) NOT NULL DEFAULT 0,
  incentive_percent NUMERIC(6, 3) NOT NULL DEFAULT 0,
  status public.crm_master_status NOT NULL DEFAULT 'ACTIVE',
  created_by UUID REFERENCES public.crm_profiles (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, product_code)
);

CREATE INDEX IF NOT EXISTS idx_crm_products_company ON public.crm_products (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_products_status ON public.crm_products (status);
CREATE INDEX IF NOT EXISTS idx_crm_products_name ON public.crm_products (product_name);

-- Salesmen
CREATE TABLE IF NOT EXISTS public.crm_salesmen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.crm_profiles (id),
  employee_id TEXT NOT NULL,
  name TEXT NOT NULL,
  photo_url TEXT,
  mobile TEXT,
  territory_id UUID REFERENCES public.crm_territories (id),
  monthly_target NUMERIC(14, 2) NOT NULL DEFAULT 0,
  incentive_rule TEXT,
  joining_date DATE,
  status public.crm_master_status NOT NULL DEFAULT 'ACTIVE',
  created_by UUID REFERENCES public.crm_profiles (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_salesmen_company ON public.crm_salesmen (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_salesmen_user ON public.crm_salesmen (user_id);
CREATE INDEX IF NOT EXISTS idx_crm_salesmen_status ON public.crm_salesmen (status);

-- Parties
CREATE TABLE IF NOT EXISTS public.crm_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  party_code TEXT NOT NULL,
  party_name TEXT NOT NULL,
  contact_person TEXT,
  mobile TEXT,
  whatsapp TEXT,
  address TEXT,
  area TEXT,
  city TEXT,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  current_supplier TEXT,
  potential_monthly_business NUMERIC(14, 2) NOT NULL DEFAULT 0,
  current_business NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status public.crm_party_status NOT NULL DEFAULT 'NEW',
  created_by UUID REFERENCES public.crm_profiles (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, party_code)
);

CREATE INDEX IF NOT EXISTS idx_crm_parties_company ON public.crm_parties (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_parties_status ON public.crm_parties (status);
CREATE INDEX IF NOT EXISTS idx_crm_parties_name ON public.crm_parties (party_name);
CREATE INDEX IF NOT EXISTS idx_crm_parties_area ON public.crm_parties (area);
CREATE INDEX IF NOT EXISTS idx_crm_parties_city ON public.crm_parties (city);

-- Assignments: salesman ↔ product
CREATE TABLE IF NOT EXISTS public.crm_salesman_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  salesman_id UUID NOT NULL REFERENCES public.crm_salesmen (id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.crm_products (id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES public.crm_profiles (id),
  UNIQUE (salesman_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_sp_company ON public.crm_salesman_products (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_sp_salesman ON public.crm_salesman_products (salesman_id);
CREATE INDEX IF NOT EXISTS idx_crm_sp_product ON public.crm_salesman_products (product_id);

-- Party ↔ product
CREATE TABLE IF NOT EXISTS public.crm_party_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES public.crm_parties (id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.crm_products (id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT 'INTERESTED' CHECK (relation_type IN ('USED', 'INTERESTED')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES public.crm_profiles (id),
  UNIQUE (party_id, product_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_crm_pp_company ON public.crm_party_products (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_pp_party ON public.crm_party_products (party_id);
CREATE INDEX IF NOT EXISTS idx_crm_pp_product ON public.crm_party_products (product_id);

-- Party ↔ salesman (optionally per product)
CREATE TABLE IF NOT EXISTS public.crm_party_salesmen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES public.crm_parties (id) ON DELETE CASCADE,
  salesman_id UUID NOT NULL REFERENCES public.crm_salesmen (id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.crm_products (id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES public.crm_profiles (id),
  UNIQUE (party_id, salesman_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_ps_company ON public.crm_party_salesmen (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_ps_party ON public.crm_party_salesmen (party_id);
CREATE INDEX IF NOT EXISTS idx_crm_ps_salesman ON public.crm_party_salesmen (salesman_id);
CREATE INDEX IF NOT EXISTS idx_crm_ps_product ON public.crm_party_salesmen (product_id);

-- Updated-at triggers
DROP TRIGGER IF EXISTS trg_crm_territories_updated ON public.crm_territories;
CREATE TRIGGER trg_crm_territories_updated
  BEFORE UPDATE ON public.crm_territories
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_products_updated ON public.crm_products;
CREATE TRIGGER trg_crm_products_updated
  BEFORE UPDATE ON public.crm_products
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_salesmen_updated ON public.crm_salesmen;
CREATE TRIGGER trg_crm_salesmen_updated
  BEFORE UPDATE ON public.crm_salesmen
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_parties_updated ON public.crm_parties;
CREATE TRIGGER trg_crm_parties_updated
  BEFORE UPDATE ON public.crm_parties
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

-- Salesman helper: resolve salesman row for current user
CREATE OR REPLACE FUNCTION public.crm_current_salesman_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.crm_salesmen
  WHERE user_id = auth.uid() AND status = 'ACTIVE';
$$;

CREATE OR REPLACE FUNCTION public.crm_can_manage_masters()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_profiles
    WHERE id = auth.uid()
      AND is_active = TRUE
      AND role IN ('OWNER', 'ADMIN')
  );
$$;

-- RLS
ALTER TABLE public.crm_territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_salesmen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_salesman_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_party_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_party_salesmen ENABLE ROW LEVEL SECURITY;

-- Territories
DROP POLICY IF EXISTS crm_territories_select ON public.crm_territories;
CREATE POLICY crm_territories_select ON public.crm_territories
  FOR SELECT TO authenticated
  USING (public.crm_user_has_company_access(company_id) OR public.crm_is_owner());

DROP POLICY IF EXISTS crm_territories_write ON public.crm_territories;
CREATE POLICY crm_territories_write ON public.crm_territories
  FOR ALL TO authenticated
  USING (public.crm_can_manage_masters() AND public.crm_user_has_company_access(company_id))
  WITH CHECK (public.crm_can_manage_masters() AND public.crm_user_has_company_access(company_id));

-- Products: managers see company; salesman sees assigned products
DROP POLICY IF EXISTS crm_products_select ON public.crm_products;
CREATE POLICY crm_products_select ON public.crm_products
  FOR SELECT TO authenticated
  USING (
    public.crm_is_owner()
    OR public.crm_is_admin_or_owner()
    OR (
      public.crm_user_has_company_access(company_id)
      AND (
        public.crm_current_user_role() IN ('SALES_MANAGER', 'ACCOUNTANT', 'VIEWER')
        OR EXISTS (
          SELECT 1 FROM public.crm_salesman_products sp
          JOIN public.crm_salesmen s ON s.id = sp.salesman_id
          WHERE sp.product_id = crm_products.id
            AND sp.is_active = TRUE
            AND s.user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS crm_products_write ON public.crm_products;
CREATE POLICY crm_products_write ON public.crm_products
  FOR ALL TO authenticated
  USING (public.crm_can_manage_masters() AND (public.crm_is_owner() OR public.crm_user_has_company_access(company_id)))
  WITH CHECK (public.crm_can_manage_masters() AND (public.crm_is_owner() OR public.crm_user_has_company_access(company_id)));

-- Salesmen
DROP POLICY IF EXISTS crm_salesmen_select ON public.crm_salesmen;
CREATE POLICY crm_salesmen_select ON public.crm_salesmen
  FOR SELECT TO authenticated
  USING (
    public.crm_is_owner()
    OR public.crm_is_admin_or_owner()
    OR user_id = auth.uid()
    OR (
      public.crm_user_has_company_access(company_id)
      AND public.crm_current_user_role() IN ('SALES_MANAGER', 'ACCOUNTANT', 'VIEWER')
    )
  );

DROP POLICY IF EXISTS crm_salesmen_write ON public.crm_salesmen;
CREATE POLICY crm_salesmen_write ON public.crm_salesmen
  FOR ALL TO authenticated
  USING (public.crm_can_manage_masters() AND (public.crm_is_owner() OR public.crm_user_has_company_access(company_id)))
  WITH CHECK (public.crm_can_manage_masters() AND (public.crm_is_owner() OR public.crm_user_has_company_access(company_id)));

-- Parties: salesman only assigned parties
DROP POLICY IF EXISTS crm_parties_select ON public.crm_parties;
CREATE POLICY crm_parties_select ON public.crm_parties
  FOR SELECT TO authenticated
  USING (
    public.crm_is_owner()
    OR public.crm_is_admin_or_owner()
    OR (
      public.crm_user_has_company_access(company_id)
      AND public.crm_current_user_role() IN ('SALES_MANAGER', 'ACCOUNTANT', 'VIEWER')
    )
    OR EXISTS (
      SELECT 1 FROM public.crm_party_salesmen ps
      JOIN public.crm_salesmen s ON s.id = ps.salesman_id
      WHERE ps.party_id = crm_parties.id
        AND ps.is_active = TRUE
        AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS crm_parties_insert ON public.crm_parties;
CREATE POLICY crm_parties_insert ON public.crm_parties
  FOR INSERT TO authenticated
  WITH CHECK (
    public.crm_can_manage_masters()
    OR (
      public.crm_user_has_company_access(company_id)
      AND public.crm_current_user_role() IN ('SALESMAN', 'SALES_MANAGER')
    )
  );

DROP POLICY IF EXISTS crm_parties_update ON public.crm_parties;
CREATE POLICY crm_parties_update ON public.crm_parties
  FOR UPDATE TO authenticated
  USING (
    public.crm_can_manage_masters()
    OR EXISTS (
      SELECT 1 FROM public.crm_party_salesmen ps
      JOIN public.crm_salesmen s ON s.id = ps.salesman_id
      WHERE ps.party_id = crm_parties.id AND s.user_id = auth.uid() AND ps.is_active
    )
  )
  WITH CHECK (
    public.crm_can_manage_masters()
    OR EXISTS (
      SELECT 1 FROM public.crm_party_salesmen ps
      JOIN public.crm_salesmen s ON s.id = ps.salesman_id
      WHERE ps.party_id = crm_parties.id AND s.user_id = auth.uid() AND ps.is_active
    )
  );

-- Assignment tables
DROP POLICY IF EXISTS crm_sp_select ON public.crm_salesman_products;
CREATE POLICY crm_sp_select ON public.crm_salesman_products
  FOR SELECT TO authenticated
  USING (
    public.crm_is_owner()
    OR public.crm_user_has_company_access(company_id)
    OR EXISTS (
      SELECT 1 FROM public.crm_salesmen s
      WHERE s.id = salesman_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS crm_sp_write ON public.crm_salesman_products;
CREATE POLICY crm_sp_write ON public.crm_salesman_products
  FOR ALL TO authenticated
  USING (public.crm_can_manage_masters())
  WITH CHECK (public.crm_can_manage_masters());

DROP POLICY IF EXISTS crm_pp_select ON public.crm_party_products;
CREATE POLICY crm_pp_select ON public.crm_party_products
  FOR SELECT TO authenticated
  USING (
    public.crm_is_owner()
    OR public.crm_user_has_company_access(company_id)
    OR EXISTS (
      SELECT 1 FROM public.crm_party_salesmen ps
      JOIN public.crm_salesmen s ON s.id = ps.salesman_id
      WHERE ps.party_id = crm_party_products.party_id AND s.user_id = auth.uid() AND ps.is_active
    )
  );

DROP POLICY IF EXISTS crm_pp_write ON public.crm_party_products;
CREATE POLICY crm_pp_write ON public.crm_party_products
  FOR ALL TO authenticated
  USING (public.crm_can_manage_masters())
  WITH CHECK (public.crm_can_manage_masters());

DROP POLICY IF EXISTS crm_ps_select ON public.crm_party_salesmen;
CREATE POLICY crm_ps_select ON public.crm_party_salesmen
  FOR SELECT TO authenticated
  USING (
    public.crm_is_owner()
    OR public.crm_user_has_company_access(company_id)
    OR EXISTS (
      SELECT 1 FROM public.crm_salesmen s
      WHERE s.id = salesman_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS crm_ps_write ON public.crm_party_salesmen;
CREATE POLICY crm_ps_write ON public.crm_party_salesmen
  FOR ALL TO authenticated
  USING (public.crm_can_manage_masters())
  WITH CHECK (public.crm_can_manage_masters());

GRANT SELECT ON public.crm_territories TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.crm_products TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.crm_salesmen TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.crm_parties TO authenticated;
GRANT SELECT ON public.crm_salesman_products TO authenticated;
GRANT SELECT ON public.crm_party_products TO authenticated;
GRANT SELECT ON public.crm_party_salesmen TO authenticated;
GRANT ALL ON public.crm_territories TO authenticated;
GRANT ALL ON public.crm_salesman_products TO authenticated;
GRANT ALL ON public.crm_party_products TO authenticated;
GRANT ALL ON public.crm_party_salesmen TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_current_salesman_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_can_manage_masters() TO authenticated;


-- ===== 20260811230000_phase3_visits.sql =====
-- Phase 3: Daily plans, GPS visits, feedback, follow-ups, samples, trials

DO $$ BEGIN
  CREATE TYPE public.crm_plan_status AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_visit_status AS ENUM (
    'STARTED', 'ENDED', 'CANCELLED', 'REJECTED_GPS'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_gps_status AS ENUM (
    'PENDING', 'VERIFIED', 'OUT_OF_RANGE', 'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_followup_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_probability AS ENUM (
    'P10', 'P25', 'P50', 'P75', 'P90', 'CONVERTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_loss_reason AS ENUM (
    'PRICE', 'QUALITY', 'EXISTING_SUPPLIER', 'CREDIT', 'NO_REQUIREMENT', 'COMPETITOR', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Haversine distance in metres (server-side GPS validation)
CREATE OR REPLACE FUNCTION public.crm_haversine_meters(
  lat1 DOUBLE PRECISION,
  lon1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lon2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN NULL
    ELSE (
      2 * 6371000 * ASIN(
        SQRT(
          POWER(SIN(RADIANS(lat2 - lat1) / 2), 2) +
          COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
          POWER(SIN(RADIANS(lon2 - lon1) / 2), 2)
        )
      )
    )
  END;
$$;

CREATE TABLE IF NOT EXISTS public.crm_daily_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  salesman_id UUID NOT NULL REFERENCES public.crm_salesmen (id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  daily_sales_target NUMERIC(14, 2) NOT NULL DEFAULT 0,
  planned_parties_count INTEGER NOT NULL DEFAULT 0,
  status public.crm_plan_status NOT NULL DEFAULT 'PLANNED',
  notes TEXT,
  created_by UUID REFERENCES public.crm_profiles (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (salesman_id, plan_date)
);

CREATE INDEX IF NOT EXISTS idx_crm_daily_plans_company ON public.crm_daily_plans (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_daily_plans_salesman ON public.crm_daily_plans (salesman_id);
CREATE INDEX IF NOT EXISTS idx_crm_daily_plans_date ON public.crm_daily_plans (plan_date);

CREATE TABLE IF NOT EXISTS public.crm_planned_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  daily_plan_id UUID NOT NULL REFERENCES public.crm_daily_plans (id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES public.crm_parties (id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.crm_products (id),
  sequence_no INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'COMPLETED', 'PENDING', 'SKIPPED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (daily_plan_id, party_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_planned_visits_plan ON public.crm_planned_visits (daily_plan_id);
CREATE INDEX IF NOT EXISTS idx_crm_planned_visits_party ON public.crm_planned_visits (party_id);

CREATE TABLE IF NOT EXISTS public.crm_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  salesman_id UUID NOT NULL REFERENCES public.crm_salesmen (id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES public.crm_parties (id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.crm_products (id),
  planned_visit_id UUID REFERENCES public.crm_planned_visits (id),
  visit_date DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'Asia/Kolkata')::DATE),
  status public.crm_visit_status NOT NULL DEFAULT 'STARTED',
  gps_status public.crm_gps_status NOT NULL DEFAULT 'PENDING',
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  start_latitude NUMERIC(10, 7),
  start_longitude NUMERIC(10, 7),
  start_accuracy_meters NUMERIC(10, 2),
  start_distance_meters NUMERIC(12, 2),
  end_latitude NUMERIC(10, 7),
  end_longitude NUMERIC(10, 7),
  end_accuracy_meters NUMERIC(10, 2),
  allowed_radius_meters INTEGER NOT NULL DEFAULT 200,
  gps_verified BOOLEAN NOT NULL DEFAULT FALSE,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_visits_end_after_start CHECK (end_at IS NULL OR start_at IS NULL OR end_at >= start_at),
  CONSTRAINT crm_visits_no_manual_edit_guard CHECK (TRUE)
);

CREATE INDEX IF NOT EXISTS idx_crm_visits_company ON public.crm_visits (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_visits_salesman ON public.crm_visits (salesman_id);
CREATE INDEX IF NOT EXISTS idx_crm_visits_party ON public.crm_visits (party_id);
CREATE INDEX IF NOT EXISTS idx_crm_visits_product ON public.crm_visits (product_id);
CREATE INDEX IF NOT EXISTS idx_crm_visits_date ON public.crm_visits (visit_date);
CREATE INDEX IF NOT EXISTS idx_crm_visits_gps ON public.crm_visits (gps_verified);

CREATE TABLE IF NOT EXISTS public.crm_visit_gps_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  visit_id UUID NOT NULL REFERENCES public.crm_visits (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('START_ATTEMPT', 'START_VERIFIED', 'START_REJECTED', 'END')),
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  accuracy_meters NUMERIC(10, 2),
  distance_meters NUMERIC(12, 2),
  party_latitude NUMERIC(10, 7),
  party_longitude NUMERIC(10, 7),
  allowed_radius_meters INTEGER,
  client_reported_at TIMESTAMPTZ,
  server_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_crm_visit_gps_visit ON public.crm_visit_gps_logs (visit_id);
CREATE INDEX IF NOT EXISTS idx_crm_visit_gps_company ON public.crm_visit_gps_logs (company_id);

CREATE TABLE IF NOT EXISTS public.crm_visit_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  visit_id UUID NOT NULL UNIQUE REFERENCES public.crm_visits (id) ON DELETE CASCADE,
  person_met TEXT,
  designation TEXT,
  discussion TEXT,
  product_id UUID REFERENCES public.crm_products (id),
  potential_quantity NUMERIC(14, 3),
  potential_monthly_business NUMERIC(14, 2),
  current_supplier TEXT,
  current_rate NUMERIC(14, 2),
  our_rate NUMERIC(14, 2),
  sample_required BOOLEAN NOT NULL DEFAULT FALSE,
  sample_given BOOLEAN NOT NULL DEFAULT FALSE,
  trial_required BOOLEAN NOT NULL DEFAULT FALSE,
  trial_date DATE,
  probability public.crm_probability,
  reason_not_converting public.crm_loss_reason,
  remarks TEXT,
  photo_url TEXT,
  voice_note_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_visit_feedback_company ON public.crm_visit_feedback (company_id);

CREATE TABLE IF NOT EXISTS public.crm_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES public.crm_parties (id) ON DELETE CASCADE,
  salesman_id UUID NOT NULL REFERENCES public.crm_salesmen (id) ON DELETE CASCADE,
  visit_id UUID REFERENCES public.crm_visits (id),
  followup_date DATE NOT NULL,
  purpose TEXT,
  priority public.crm_followup_priority NOT NULL DEFAULT 'MEDIUM',
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.crm_profiles (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_followups_company ON public.crm_followups (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_followups_salesman ON public.crm_followups (salesman_id);
CREATE INDEX IF NOT EXISTS idx_crm_followups_party ON public.crm_followups (party_id);
CREATE INDEX IF NOT EXISTS idx_crm_followups_date ON public.crm_followups (followup_date);
CREATE INDEX IF NOT EXISTS idx_crm_followups_open ON public.crm_followups (is_completed, followup_date);

CREATE TABLE IF NOT EXISTS public.crm_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES public.crm_parties (id) ON DELETE CASCADE,
  salesman_id UUID NOT NULL REFERENCES public.crm_salesmen (id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.crm_products (id),
  visit_id UUID REFERENCES public.crm_visits (id),
  given_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  quantity NUMERIC(14, 3),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_samples_party ON public.crm_samples (party_id);
CREATE INDEX IF NOT EXISTS idx_crm_samples_salesman ON public.crm_samples (salesman_id);

CREATE TABLE IF NOT EXISTS public.crm_trials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES public.crm_parties (id) ON DELETE CASCADE,
  salesman_id UUID NOT NULL REFERENCES public.crm_salesmen (id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.crm_products (id),
  visit_id UUID REFERENCES public.crm_visits (id),
  trial_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'STARTED', 'FEEDBACK', 'CONVERTED', 'FAILED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_trials_party ON public.crm_trials (party_id);
CREATE INDEX IF NOT EXISTS idx_crm_trials_salesman ON public.crm_trials (salesman_id);

DROP TRIGGER IF EXISTS trg_crm_daily_plans_updated ON public.crm_daily_plans;
CREATE TRIGGER trg_crm_daily_plans_updated
  BEFORE UPDATE ON public.crm_daily_plans
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_visits_updated ON public.crm_visits;
CREATE TRIGGER trg_crm_visits_updated
  BEFORE UPDATE ON public.crm_visits
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_visit_feedback_updated ON public.crm_visit_feedback;
CREATE TRIGGER trg_crm_visit_feedback_updated
  BEFORE UPDATE ON public.crm_visit_feedback
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_followups_updated ON public.crm_followups;
CREATE TRIGGER trg_crm_followups_updated
  BEFORE UPDATE ON public.crm_followups
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_trials_updated ON public.crm_trials;
CREATE TRIGGER trg_crm_trials_updated
  BEFORE UPDATE ON public.crm_trials
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

-- Prevent client from rewriting original timestamps after set
CREATE OR REPLACE FUNCTION public.crm_protect_visit_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.start_at IS NOT NULL AND NEW.start_at IS DISTINCT FROM OLD.start_at THEN
      RAISE EXCEPTION 'Visit start_at cannot be modified';
    END IF;
    IF OLD.end_at IS NOT NULL AND NEW.end_at IS DISTINCT FROM OLD.end_at THEN
      RAISE EXCEPTION 'Visit end_at cannot be modified';
    END IF;
    IF OLD.gps_verified = TRUE AND NEW.gps_verified = FALSE THEN
      RAISE EXCEPTION 'GPS verification cannot be cleared';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_protect_visit_timestamps ON public.crm_visits;
CREATE TRIGGER trg_crm_protect_visit_timestamps
  BEFORE UPDATE ON public.crm_visits
  FOR EACH ROW EXECUTE FUNCTION public.crm_protect_visit_timestamps();

-- Server-side start visit with GPS validation
CREATE OR REPLACE FUNCTION public.crm_start_visit(
  p_party_id UUID,
  p_salesman_id UUID,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_accuracy_meters DOUBLE PRECISION DEFAULT NULL,
  p_product_id UUID DEFAULT NULL,
  p_planned_visit_id UUID DEFAULT NULL,
  p_client_reported_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.crm_visits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_party public.crm_parties%ROWTYPE;
  v_salesman public.crm_salesmen%ROWTYPE;
  v_company public.crm_companies%ROWTYPE;
  v_distance DOUBLE PRECISION;
  v_radius INTEGER;
  v_visit public.crm_visits%ROWTYPE;
  v_role public.crm_app_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_party FROM public.crm_parties WHERE id = p_party_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Party not found'; END IF;

  SELECT * INTO v_salesman FROM public.crm_salesmen WHERE id = p_salesman_id AND status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Salesman not found'; END IF;

  SELECT role INTO v_role FROM public.crm_profiles WHERE id = auth.uid();
  IF v_role NOT IN ('OWNER', 'ADMIN', 'SALES_MANAGER') AND v_salesman.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not allowed to start visit for this salesman';
  END IF;

  IF v_party.company_id <> v_salesman.company_id THEN
    RAISE EXCEPTION 'Party and salesman company mismatch';
  END IF;

  SELECT * INTO v_company FROM public.crm_companies WHERE id = v_party.company_id;
  v_radius := COALESCE(v_company.gps_radius_meters, 200);

  IF v_party.latitude IS NULL OR v_party.longitude IS NULL THEN
    RAISE EXCEPTION 'Party GPS coordinates are not configured';
  END IF;

  IF p_latitude IS NULL OR p_longitude IS NULL THEN
    RAISE EXCEPTION 'Device GPS coordinates required';
  END IF;

  v_distance := public.crm_haversine_meters(
    p_latitude, p_longitude,
    v_party.latitude::DOUBLE PRECISION, v_party.longitude::DOUBLE PRECISION
  );

  IF v_distance > v_radius THEN
    INSERT INTO public.crm_visits (
      company_id, salesman_id, party_id, product_id, planned_visit_id,
      status, gps_status, start_latitude, start_longitude, start_accuracy_meters,
      start_distance_meters, allowed_radius_meters, gps_verified, rejection_reason,
      start_at
    ) VALUES (
      v_party.company_id, p_salesman_id, p_party_id, p_product_id, p_planned_visit_id,
      'REJECTED_GPS', 'OUT_OF_RANGE', p_latitude, p_longitude, p_accuracy_meters,
      v_distance, v_radius, FALSE,
      format('You are not within the permitted party location. Distance: %s metres (allowed %s m).',
             ROUND(v_distance::NUMERIC, 1), v_radius),
      NOW()
    ) RETURNING * INTO v_visit;

    INSERT INTO public.crm_visit_gps_logs (
      company_id, visit_id, event_type, latitude, longitude, accuracy_meters,
      distance_meters, party_latitude, party_longitude, allowed_radius_meters, client_reported_at
    ) VALUES (
      v_party.company_id, v_visit.id, 'START_REJECTED', p_latitude, p_longitude, p_accuracy_meters,
      v_distance, v_party.latitude, v_party.longitude, v_radius, p_client_reported_at
    );

    RETURN v_visit;
  END IF;

  INSERT INTO public.crm_visits (
    company_id, salesman_id, party_id, product_id, planned_visit_id,
    status, gps_status, start_at, start_latitude, start_longitude,
    start_accuracy_meters, start_distance_meters, allowed_radius_meters, gps_verified
  ) VALUES (
    v_party.company_id, p_salesman_id, p_party_id, p_product_id, p_planned_visit_id,
    'STARTED', 'VERIFIED', NOW(), p_latitude, p_longitude,
    p_accuracy_meters, v_distance, v_radius, TRUE
  ) RETURNING * INTO v_visit;

  INSERT INTO public.crm_visit_gps_logs (
    company_id, visit_id, event_type, latitude, longitude, accuracy_meters,
    distance_meters, party_latitude, party_longitude, allowed_radius_meters, client_reported_at
  ) VALUES (
    v_party.company_id, v_visit.id, 'START_VERIFIED', p_latitude, p_longitude, p_accuracy_meters,
    v_distance, v_party.latitude, v_party.longitude, v_radius, p_client_reported_at
  );

  IF p_planned_visit_id IS NOT NULL THEN
    UPDATE public.crm_planned_visits SET status = 'COMPLETED' WHERE id = p_planned_visit_id;
  END IF;

  RETURN v_visit;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_end_visit(
  p_visit_id UUID,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL,
  p_accuracy_meters DOUBLE PRECISION DEFAULT NULL,
  p_client_reported_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.crm_visits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visit public.crm_visits%ROWTYPE;
  v_salesman public.crm_salesmen%ROWTYPE;
  v_role public.crm_app_role;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_visit FROM public.crm_visits WHERE id = p_visit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Visit not found'; END IF;
  IF v_visit.status <> 'STARTED' OR v_visit.gps_verified <> TRUE THEN
    RAISE EXCEPTION 'Only GPS-verified started visits can be ended';
  END IF;
  IF v_visit.end_at IS NOT NULL THEN
    RAISE EXCEPTION 'Visit already ended';
  END IF;

  SELECT * INTO v_salesman FROM public.crm_salesmen WHERE id = v_visit.salesman_id;
  SELECT role INTO v_role FROM public.crm_profiles WHERE id = auth.uid();
  IF v_role NOT IN ('OWNER', 'ADMIN', 'SALES_MANAGER') AND v_salesman.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not allowed to end this visit';
  END IF;

  UPDATE public.crm_visits
  SET
    end_at = NOW(),
    end_latitude = p_latitude,
    end_longitude = p_longitude,
    end_accuracy_meters = p_accuracy_meters,
    duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - start_at))::INTEGER),
    status = 'ENDED',
    updated_at = NOW()
  WHERE id = p_visit_id
  RETURNING * INTO v_visit;

  INSERT INTO public.crm_visit_gps_logs (
    company_id, visit_id, event_type, latitude, longitude, accuracy_meters, client_reported_at
  ) VALUES (
    v_visit.company_id, v_visit.id, 'END',
    COALESCE(p_latitude, v_visit.start_latitude),
    COALESCE(p_longitude, v_visit.start_longitude),
    p_accuracy_meters, p_client_reported_at
  );

  RETURN v_visit;
END;
$$;

-- RLS
ALTER TABLE public.crm_daily_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_planned_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_visit_gps_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_visit_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_trials ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.crm_is_salesman_self(p_salesman_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_salesmen s
    WHERE s.id = p_salesman_id AND s.user_id = auth.uid()
  ) OR public.crm_is_admin_or_owner() OR public.crm_current_user_role() = 'SALES_MANAGER';
$$;

DROP POLICY IF EXISTS crm_daily_plans_select ON public.crm_daily_plans;
CREATE POLICY crm_daily_plans_select ON public.crm_daily_plans
  FOR SELECT TO authenticated
  USING (public.crm_is_salesman_self(salesman_id) OR public.crm_user_has_company_access(company_id));

DROP POLICY IF EXISTS crm_daily_plans_write ON public.crm_daily_plans;
CREATE POLICY crm_daily_plans_write ON public.crm_daily_plans
  FOR ALL TO authenticated
  USING (public.crm_is_salesman_self(salesman_id))
  WITH CHECK (public.crm_is_salesman_self(salesman_id));

DROP POLICY IF EXISTS crm_planned_visits_all ON public.crm_planned_visits;
CREATE POLICY crm_planned_visits_all ON public.crm_planned_visits
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_daily_plans dp
      WHERE dp.id = daily_plan_id AND public.crm_is_salesman_self(dp.salesman_id)
    ) OR public.crm_is_admin_or_owner()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crm_daily_plans dp
      WHERE dp.id = daily_plan_id AND public.crm_is_salesman_self(dp.salesman_id)
    ) OR public.crm_is_admin_or_owner()
  );

DROP POLICY IF EXISTS crm_visits_select ON public.crm_visits;
CREATE POLICY crm_visits_select ON public.crm_visits
  FOR SELECT TO authenticated
  USING (public.crm_is_salesman_self(salesman_id) OR public.crm_user_has_company_access(company_id));

DROP POLICY IF EXISTS crm_visits_update_limited ON public.crm_visits;
CREATE POLICY crm_visits_update_limited ON public.crm_visits
  FOR UPDATE TO authenticated
  USING (public.crm_is_salesman_self(salesman_id))
  WITH CHECK (public.crm_is_salesman_self(salesman_id));

-- Inserts go through SECURITY DEFINER function primarily
DROP POLICY IF EXISTS crm_visits_insert ON public.crm_visits;
CREATE POLICY crm_visits_insert ON public.crm_visits
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_is_salesman_self(salesman_id));

DROP POLICY IF EXISTS crm_visit_gps_select ON public.crm_visit_gps_logs;
CREATE POLICY crm_visit_gps_select ON public.crm_visit_gps_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_visits v
      WHERE v.id = visit_id AND public.crm_is_salesman_self(v.salesman_id)
    ) OR public.crm_is_admin_or_owner()
  );

DROP POLICY IF EXISTS crm_feedback_all ON public.crm_visit_feedback;
CREATE POLICY crm_feedback_all ON public.crm_visit_feedback
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_visits v
      WHERE v.id = visit_id AND public.crm_is_salesman_self(v.salesman_id)
    ) OR public.crm_is_admin_or_owner()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crm_visits v
      WHERE v.id = visit_id AND public.crm_is_salesman_self(v.salesman_id)
    ) OR public.crm_is_admin_or_owner()
  );

DROP POLICY IF EXISTS crm_followups_all ON public.crm_followups;
CREATE POLICY crm_followups_all ON public.crm_followups
  FOR ALL TO authenticated
  USING (public.crm_is_salesman_self(salesman_id) OR public.crm_user_has_company_access(company_id))
  WITH CHECK (public.crm_is_salesman_self(salesman_id) OR public.crm_is_admin_or_owner());

DROP POLICY IF EXISTS crm_samples_all ON public.crm_samples;
CREATE POLICY crm_samples_all ON public.crm_samples
  FOR ALL TO authenticated
  USING (public.crm_is_salesman_self(salesman_id) OR public.crm_user_has_company_access(company_id))
  WITH CHECK (public.crm_is_salesman_self(salesman_id) OR public.crm_is_admin_or_owner());

DROP POLICY IF EXISTS crm_trials_all ON public.crm_trials;
CREATE POLICY crm_trials_all ON public.crm_trials
  FOR ALL TO authenticated
  USING (public.crm_is_salesman_self(salesman_id) OR public.crm_user_has_company_access(company_id))
  WITH CHECK (public.crm_is_salesman_self(salesman_id) OR public.crm_is_admin_or_owner());

GRANT SELECT, INSERT, UPDATE ON public.crm_daily_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_planned_visits TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.crm_visits TO authenticated;
GRANT SELECT ON public.crm_visit_gps_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.crm_visit_feedback TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.crm_followups TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.crm_samples TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.crm_trials TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_haversine_meters(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_start_visit(UUID, UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, UUID, UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_end_visit(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_is_salesman_self(UUID) TO authenticated;


-- ===== 20260811233000_phase4_sales_incentives.sql =====
-- Phase 4: Sales, targets, incentives, party-product development
-- Safe additive migration — does not drop Phase 1–3 objects

DO $$ BEGIN
  CREATE TYPE public.crm_dev_status AS ENUM (
    'NOT_STARTED',
    'FIRST_VISIT',
    'FOLLOW_UP',
    'SAMPLE_GIVEN',
    'SAMPLE_UNDER_TRIAL',
    'PRODUCT_STARTED',
    'REGULAR_SALE',
    'CONVERTED',
    'LOST_HOLD'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_incentive_type AS ENUM (
    'PERCENT_OF_SALES',
    'FIXED_PER_QTY',
    'FIXED_PER_CONVERTED_PARTY',
    'PRODUCT_SPECIFIC',
    'TARGET_SLAB'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_incentive_status AS ENUM (
    'ESTIMATED',
    'CONFIRMED',
    'PAID',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Extend products with notes (targets/incentive already exist)
ALTER TABLE public.crm_products
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Extend salesmen with party-development target
ALTER TABLE public.crm_salesmen
  ADD COLUMN IF NOT EXISTS party_development_target INTEGER NOT NULL DEFAULT 0;

-- Extend party_products with development lifecycle
ALTER TABLE public.crm_party_products
  ADD COLUMN IF NOT EXISTS development_status public.crm_dev_status NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS conversion_date DATE,
  ADD COLUMN IF NOT EXISTS first_visit_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_visit_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sample_given_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_visits INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_successful_visits INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_samples INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_sales_qty NUMERIC(14, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_sales_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sale_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_followup_date DATE;

CREATE INDEX IF NOT EXISTS idx_crm_pp_dev_status
  ON public.crm_party_products (development_status);

-- Immutable party-product development history
CREATE TABLE IF NOT EXISTS public.crm_party_product_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES public.crm_parties (id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.crm_products (id) ON DELETE CASCADE,
  party_product_id UUID REFERENCES public.crm_party_products (id) ON DELETE SET NULL,
  from_status public.crm_dev_status,
  to_status public.crm_dev_status NOT NULL,
  changed_by UUID REFERENCES public.crm_profiles (id),
  source_module TEXT NOT NULL DEFAULT 'manual',
  source_record_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_pph_party ON public.crm_party_product_history (party_id);
CREATE INDEX IF NOT EXISTS idx_crm_pph_product ON public.crm_party_product_history (product_id);
CREATE INDEX IF NOT EXISTS idx_crm_pph_company ON public.crm_party_product_history (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_pph_created ON public.crm_party_product_history (created_at DESC);

-- Accountant sales entries
CREATE TABLE IF NOT EXISTS public.crm_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.crm_products (id),
  party_id UUID NOT NULL REFERENCES public.crm_parties (id),
  salesman_id UUID NOT NULL REFERENCES public.crm_salesmen (id),
  sale_date DATE NOT NULL,
  quantity NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  rate NUMERIC(14, 2),
  sales_value NUMERIC(14, 2) NOT NULL CHECK (sales_value >= 0),
  invoice_number TEXT,
  remarks TEXT,
  entered_by UUID NOT NULL REFERENCES public.crm_profiles (id),
  updated_by UUID REFERENCES public.crm_profiles (id),
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_sales_company ON public.crm_sales (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_sales_product ON public.crm_sales (product_id);
CREATE INDEX IF NOT EXISTS idx_crm_sales_party ON public.crm_sales (party_id);
CREATE INDEX IF NOT EXISTS idx_crm_sales_salesman ON public.crm_sales (salesman_id);
CREATE INDEX IF NOT EXISTS idx_crm_sales_date ON public.crm_sales (sale_date);
CREATE INDEX IF NOT EXISTS idx_crm_sales_company_date ON public.crm_sales (company_id, sale_date);

DROP TRIGGER IF EXISTS trg_crm_sales_updated ON public.crm_sales;
CREATE TRIGGER trg_crm_sales_updated
  BEFORE UPDATE ON public.crm_sales
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

-- Salesman monthly targets
CREATE TABLE IF NOT EXISTS public.crm_salesman_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  salesman_id UUID NOT NULL REFERENCES public.crm_salesmen (id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.crm_products (id),
  year_month TEXT NOT NULL CHECK (year_month ~ '^[0-9]{4}-[0-9]{2}$'),
  sales_target NUMERIC(14, 2) NOT NULL DEFAULT 0,
  party_development_target INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.crm_profiles (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (salesman_id, year_month, product_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_salesman_targets_null_product
  ON public.crm_salesman_targets (salesman_id, year_month)
  WHERE product_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_st_company ON public.crm_salesman_targets (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_st_salesman ON public.crm_salesman_targets (salesman_id);
CREATE INDEX IF NOT EXISTS idx_crm_st_month ON public.crm_salesman_targets (year_month);

DROP TRIGGER IF EXISTS trg_crm_salesman_targets_updated ON public.crm_salesman_targets;
CREATE TRIGGER trg_crm_salesman_targets_updated
  BEFORE UPDATE ON public.crm_salesman_targets
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

-- Configurable incentive rules
CREATE TABLE IF NOT EXISTS public.crm_incentive_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rule_type public.crm_incentive_type NOT NULL,
  product_id UUID REFERENCES public.crm_products (id),
  salesman_id UUID REFERENCES public.crm_salesmen (id),
  percent_rate NUMERIC(8, 4),
  fixed_amount NUMERIC(14, 2),
  -- JSON slabs: [{min_pct:0,max_pct:80,rate:0},{min_pct:80,max_pct:100,rate:1},...]
  slabs JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  notes TEXT,
  created_by UUID REFERENCES public.crm_profiles (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_ir_company ON public.crm_incentive_rules (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_ir_product ON public.crm_incentive_rules (product_id);
CREATE INDEX IF NOT EXISTS idx_crm_ir_active ON public.crm_incentive_rules (is_active);

DROP TRIGGER IF EXISTS trg_crm_incentive_rules_updated ON public.crm_incentive_rules;
CREATE TRIGGER trg_crm_incentive_rules_updated
  BEFORE UPDATE ON public.crm_incentive_rules
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

-- Incentive calculations / ledger
CREATE TABLE IF NOT EXISTS public.crm_incentive_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  salesman_id UUID NOT NULL REFERENCES public.crm_salesmen (id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.crm_products (id),
  sale_id UUID REFERENCES public.crm_sales (id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.crm_incentive_rules (id),
  year_month TEXT NOT NULL,
  sales_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  incentive_rate NUMERIC(10, 4),
  calculated_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status public.crm_incentive_status NOT NULL DEFAULT 'ESTIMATED',
  calculation_notes TEXT,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES public.crm_profiles (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_ic_company ON public.crm_incentive_calculations (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_ic_salesman ON public.crm_incentive_calculations (salesman_id);
CREATE INDEX IF NOT EXISTS idx_crm_ic_sale ON public.crm_incentive_calculations (sale_id);
CREATE INDEX IF NOT EXISTS idx_crm_ic_month ON public.crm_incentive_calculations (year_month);
CREATE INDEX IF NOT EXISTS idx_crm_ic_status ON public.crm_incentive_calculations (status);

DROP TRIGGER IF EXISTS trg_crm_incentive_calc_updated ON public.crm_incentive_calculations;
CREATE TRIGGER trg_crm_incentive_calc_updated
  BEFORE UPDATE ON public.crm_incentive_calculations
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

-- Owner intervention configurable rules
CREATE TABLE IF NOT EXISTS public.crm_intervention_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  threshold_visits INTEGER,
  threshold_days INTEGER,
  requires_sample_no_sale BOOLEAN NOT NULL DEFAULT FALSE,
  requires_zero_sales BOOLEAN NOT NULL DEFAULT FALSE,
  target_achievement_below NUMERIC(6, 2),
  severity TEXT NOT NULL DEFAULT 'RED' CHECK (severity IN ('RED', 'AMBER', 'BLUE', 'GREEN', 'GREY')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, code)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_intervention_global_code
  ON public.crm_intervention_rules (code)
  WHERE company_id IS NULL;

DROP TRIGGER IF EXISTS trg_crm_intervention_rules_updated ON public.crm_intervention_rules;
CREATE TRIGGER trg_crm_intervention_rules_updated
  BEFORE UPDATE ON public.crm_intervention_rules
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

-- Seed default intervention rules (global)
INSERT INTO public.crm_intervention_rules (company_id, code, name, description, threshold_visits, requires_zero_sales, severity)
SELECT NULL, v.code, v.name, v.description, v.threshold_visits, v.requires_zero_sales, v.severity
FROM (VALUES
  ('HIGH_VISITS_NO_SALES', 'High visits + no sales', '5+ visits with zero sales', 5, TRUE, 'RED'),
  ('SAMPLE_NO_CONVERSION', 'Sample given + no conversion', 'Sample given but not converted', NULL, TRUE, 'AMBER'),
  ('NO_FOLLOWUP_AFTER_SAMPLE', 'No follow-up after sample', 'Sample given and no follow-up', NULL, FALSE, 'AMBER'),
  ('INACTIVE_PARTY', 'Inactive party', 'No visit for configured days', NULL, FALSE, 'GREY'),
  ('PRODUCT_STARTED_NO_RECENT_SALE', 'Product started + no recent sale', 'Started but sales stopped', NULL, TRUE, 'BLUE'),
  ('LOW_TARGET_ACHIEVEMENT', 'Low target achievement', 'Salesman significantly below target', NULL, FALSE, 'RED')
) AS v(code, name, description, threshold_visits, requires_zero_sales, severity)
WHERE NOT EXISTS (
  SELECT 1 FROM public.crm_intervention_rules r WHERE r.company_id IS NULL AND r.code = v.code
);

-- Seed default incentive rules per company from product incentive_percent (percent of sales)
INSERT INTO public.crm_incentive_rules (company_id, name, rule_type, percent_rate, slabs, is_active, priority, notes)
SELECT c.id,
       'Default target slab incentive',
       'TARGET_SLAB',
       NULL,
       '[
          {"min_pct":0,"max_pct":80,"rate":0},
          {"min_pct":80,"max_pct":100,"rate":1},
          {"min_pct":100,"max_pct":120,"rate":1.5},
          {"min_pct":120,"max_pct":9999,"rate":2}
        ]'::jsonb,
       TRUE,
       10,
       'Default configurable slabs — Owner can edit'
FROM public.crm_companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.crm_incentive_rules r
  WHERE r.company_id = c.id AND r.name = 'Default target slab incentive'
);

INSERT INTO public.crm_incentive_rules (company_id, name, rule_type, product_id, percent_rate, is_active, priority, notes)
SELECT p.company_id,
       'Product rate: ' || p.product_name,
       'PRODUCT_SPECIFIC',
       p.id,
       p.incentive_percent,
       TRUE,
       50,
       'Synced from product incentive %'
FROM public.crm_products p
WHERE p.incentive_percent > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.crm_incentive_rules r
    WHERE r.product_id = p.id AND r.rule_type = 'PRODUCT_SPECIFIC'
  );

-- Helper: year_month from date
CREATE OR REPLACE FUNCTION public.crm_year_month(p_date DATE)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT to_char(p_date, 'YYYY-MM');
$$;

-- Advance development status (never deletes history)
CREATE OR REPLACE FUNCTION public.crm_set_party_product_status(
  p_party_id UUID,
  p_product_id UUID,
  p_to_status public.crm_dev_status,
  p_source_module TEXT DEFAULT 'manual',
  p_source_record_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pp public.crm_party_products%ROWTYPE;
  v_company UUID;
  v_from public.crm_dev_status;
  v_hist UUID;
BEGIN
  SELECT company_id INTO v_company FROM public.crm_parties WHERE id = p_party_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Party not found';
  END IF;

  SELECT * INTO v_pp
  FROM public.crm_party_products
  WHERE party_id = p_party_id AND product_id = p_product_id AND is_active = TRUE
  ORDER BY assigned_at
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.crm_party_products (
      company_id, party_id, product_id, relation_type, is_active, development_status, assigned_by
    ) VALUES (
      v_company, p_party_id, p_product_id, 'INTERESTED', TRUE, 'NOT_STARTED', auth.uid()
    ) RETURNING * INTO v_pp;
  END IF;

  v_from := v_pp.development_status;
  IF v_from IS DISTINCT FROM p_to_status THEN
    UPDATE public.crm_party_products
    SET development_status = p_to_status,
        conversion_date = CASE WHEN p_to_status IN ('CONVERTED', 'REGULAR_SALE') THEN COALESCE(conversion_date, CURRENT_DATE) ELSE conversion_date END,
        sample_given_at = CASE WHEN p_to_status IN ('SAMPLE_GIVEN', 'SAMPLE_UNDER_TRIAL') THEN COALESCE(sample_given_at, NOW()) ELSE sample_given_at END
    WHERE id = v_pp.id;

    INSERT INTO public.crm_party_product_history (
      company_id, party_id, product_id, party_product_id,
      from_status, to_status, changed_by, source_module, source_record_id, notes
    ) VALUES (
      v_company, p_party_id, p_product_id, v_pp.id,
      v_from, p_to_status, auth.uid(), p_source_module, p_source_record_id, p_notes
    ) RETURNING id INTO v_hist;
  END IF;

  RETURN COALESCE(v_hist, v_pp.id);
END;
$$;

-- Resolve incentive rate for a sale
CREATE OR REPLACE FUNCTION public.crm_resolve_incentive_for_sale(p_sale_id UUID)
RETURNS TABLE (
  rule_id UUID,
  incentive_rate NUMERIC,
  calculated_amount NUMERIC,
  notes TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale public.crm_sales%ROWTYPE;
  v_rule public.crm_incentive_rules%ROWTYPE;
  v_product_rate NUMERIC;
  v_month TEXT;
  v_month_sales NUMERIC;
  v_target NUMERIC;
  v_ach_pct NUMERIC;
  v_slab JSONB;
  v_rate NUMERIC := 0;
  v_amount NUMERIC := 0;
  v_notes TEXT := '';
BEGIN
  SELECT * INTO v_sale FROM public.crm_sales WHERE id = p_sale_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_month := public.crm_year_month(v_sale.sale_date);

  -- Prefer product-specific percent rule
  SELECT * INTO v_rule
  FROM public.crm_incentive_rules r
  WHERE r.company_id = v_sale.company_id
    AND r.is_active
    AND r.rule_type = 'PRODUCT_SPECIFIC'
    AND r.product_id = v_sale.product_id
  ORDER BY r.priority
  LIMIT 1;

  IF FOUND AND v_rule.percent_rate IS NOT NULL THEN
    v_rate := v_rule.percent_rate;
    v_amount := ROUND(v_sale.sales_value * v_rate / 100.0, 2);
    rule_id := v_rule.id;
    incentive_rate := v_rate;
    calculated_amount := v_amount;
    notes := 'Product-specific % of sales value';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Fallback: product.incentive_percent
  SELECT incentive_percent INTO v_product_rate FROM public.crm_products WHERE id = v_sale.product_id;
  IF COALESCE(v_product_rate, 0) > 0 THEN
    v_rate := v_product_rate;
    v_amount := ROUND(v_sale.sales_value * v_rate / 100.0, 2);
    rule_id := NULL;
    incentive_rate := v_rate;
    calculated_amount := v_amount;
    notes := 'Product master incentive %';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Target slab rule (company default)
  SELECT * INTO v_rule
  FROM public.crm_incentive_rules r
  WHERE r.company_id = v_sale.company_id
    AND r.is_active
    AND r.rule_type = 'TARGET_SLAB'
  ORDER BY r.priority
  LIMIT 1;

  IF FOUND THEN
    SELECT COALESCE(SUM(s.sales_value), 0) INTO v_month_sales
    FROM public.crm_sales s
    WHERE s.salesman_id = v_sale.salesman_id
      AND public.crm_year_month(s.sale_date) = v_month;

    SELECT COALESCE(st.sales_target, sm.monthly_target, 0) INTO v_target
    FROM public.crm_salesmen sm
    LEFT JOIN public.crm_salesman_targets st
      ON st.salesman_id = sm.id AND st.year_month = v_month AND st.product_id IS NULL
    WHERE sm.id = v_sale.salesman_id;

    IF v_target <= 0 THEN
      v_ach_pct := 0;
    ELSE
      v_ach_pct := (v_month_sales / v_target) * 100.0;
    END IF;

    FOR v_slab IN SELECT * FROM jsonb_array_elements(COALESCE(v_rule.slabs, '[]'::jsonb))
    LOOP
      IF v_ach_pct >= COALESCE((v_slab->>'min_pct')::NUMERIC, 0)
         AND v_ach_pct < COALESCE((v_slab->>'max_pct')::NUMERIC, 9999) THEN
        v_rate := COALESCE((v_slab->>'rate')::NUMERIC, 0);
        EXIT;
      END IF;
    END LOOP;

    v_amount := ROUND(v_sale.sales_value * v_rate / 100.0, 2);
    rule_id := v_rule.id;
    incentive_rate := v_rate;
    calculated_amount := v_amount;
    notes := format('Target slab at %s%% achievement', ROUND(v_ach_pct, 1));
    RETURN NEXT;
    RETURN;
  END IF;

  rule_id := NULL;
  incentive_rate := 0;
  calculated_amount := 0;
  notes := 'No matching incentive rule';
  RETURN NEXT;
END;
$$;

-- After sale insert/update: refresh party-product aggregates + incentive estimate
CREATE OR REPLACE FUNCTION public.crm_after_sale_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty NUMERIC;
  v_val NUMERIC;
  v_last TIMESTAMPTZ;
  v_inc RECORD;
  v_month TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT COALESCE(SUM(quantity),0), COALESCE(SUM(sales_value),0), MAX(sale_date::timestamptz)
      INTO v_qty, v_val, v_last
    FROM public.crm_sales
    WHERE party_id = OLD.party_id AND product_id = OLD.product_id;

    UPDATE public.crm_party_products
    SET total_sales_qty = v_qty,
        total_sales_value = v_val,
        last_sale_at = v_last
    WHERE party_id = OLD.party_id AND product_id = OLD.product_id;

    DELETE FROM public.crm_incentive_calculations WHERE sale_id = OLD.id;
    RETURN OLD;
  END IF;

  -- Ensure party-product row + status
  PERFORM public.crm_set_party_product_status(
    NEW.party_id, NEW.product_id, 'PRODUCT_STARTED', 'sales', NEW.id, 'Sale recorded'
  );

  SELECT COALESCE(SUM(quantity),0), COALESCE(SUM(sales_value),0), MAX(sale_date::timestamptz)
    INTO v_qty, v_val, v_last
  FROM public.crm_sales
  WHERE party_id = NEW.party_id AND product_id = NEW.product_id;

  UPDATE public.crm_party_products
  SET total_sales_qty = v_qty,
      total_sales_value = v_val,
      last_sale_at = v_last,
      development_status = CASE
        WHEN development_status IN ('CONVERTED', 'REGULAR_SALE') THEN development_status
        WHEN v_val > 0 THEN 'PRODUCT_STARTED'::public.crm_dev_status
        ELSE development_status
      END
  WHERE party_id = NEW.party_id AND product_id = NEW.product_id;

  -- Update party current_business rollup
  UPDATE public.crm_parties p
  SET current_business = COALESCE((
    SELECT SUM(s.sales_value) FROM public.crm_sales s WHERE s.party_id = p.id
  ), 0)
  WHERE p.id = NEW.party_id;

  v_month := public.crm_year_month(NEW.sale_date);
  SELECT * INTO v_inc FROM public.crm_resolve_incentive_for_sale(NEW.id);

  INSERT INTO public.crm_incentive_calculations (
    company_id, salesman_id, product_id, sale_id, rule_id, year_month,
    sales_value, incentive_rate, calculated_amount, status, calculation_notes
  ) VALUES (
    NEW.company_id, NEW.salesman_id, NEW.product_id, NEW.id, v_inc.rule_id, v_month,
    NEW.sales_value, v_inc.incentive_rate, v_inc.calculated_amount, 'ESTIMATED', v_inc.notes
  )
  ON CONFLICT DO NOTHING;

  -- Upsert by deleting prior estimate for sale then insert (no unique on sale_id yet)
  DELETE FROM public.crm_incentive_calculations
  WHERE sale_id = NEW.id AND status = 'ESTIMATED';

  INSERT INTO public.crm_incentive_calculations (
    company_id, salesman_id, product_id, sale_id, rule_id, year_month,
    sales_value, incentive_rate, calculated_amount, status, calculation_notes
  ) VALUES (
    NEW.company_id, NEW.salesman_id, NEW.product_id, NEW.id, v_inc.rule_id, v_month,
    NEW.sales_value, v_inc.incentive_rate, v_inc.calculated_amount, 'ESTIMATED', v_inc.notes
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_after_sale_change ON public.crm_sales;
CREATE TRIGGER trg_crm_after_sale_change
  AFTER INSERT OR UPDATE OR DELETE ON public.crm_sales
  FOR EACH ROW EXECUTE FUNCTION public.crm_after_sale_change();

-- Sync visit stats into party_products when visit ends
CREATE OR REPLACE FUNCTION public.crm_sync_visit_to_party_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'ENDED' AND NEW.gps_verified AND NEW.product_id IS NOT NULL THEN
    PERFORM public.crm_set_party_product_status(
      NEW.party_id,
      NEW.product_id,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.crm_visit_feedback f
          WHERE f.visit_id = NEW.id AND f.sample_given
        ) THEN 'SAMPLE_GIVEN'::public.crm_dev_status
        WHEN EXISTS (
          SELECT 1 FROM public.crm_visits v
          WHERE v.party_id = NEW.party_id AND v.product_id = NEW.product_id
            AND v.gps_verified AND v.status = 'ENDED'
        ) THEN 'FOLLOW_UP'::public.crm_dev_status
        ELSE 'FIRST_VISIT'::public.crm_dev_status
      END,
      'visits',
      NEW.id,
      'Visit ended'
    );

    UPDATE public.crm_party_products pp
    SET total_visits = (
          SELECT COUNT(*) FROM public.crm_visits v
          WHERE v.party_id = NEW.party_id AND v.product_id = NEW.product_id AND v.gps_verified
        ),
        total_successful_visits = (
          SELECT COUNT(*) FROM public.crm_visits v
          WHERE v.party_id = NEW.party_id AND v.product_id = NEW.product_id
            AND v.gps_verified AND v.status = 'ENDED'
        ),
        first_visit_at = COALESCE(pp.first_visit_at, NEW.start_at),
        last_visit_at = NEW.end_at
    WHERE pp.party_id = NEW.party_id AND pp.product_id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_sync_visit_pp ON public.crm_visits;
CREATE TRIGGER trg_crm_sync_visit_pp
  AFTER INSERT OR UPDATE OF status ON public.crm_visits
  FOR EACH ROW EXECUTE FUNCTION public.crm_sync_visit_to_party_product();

-- Role helpers
CREATE OR REPLACE FUNCTION public.crm_is_accountant()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_profiles
    WHERE id = auth.uid() AND is_active AND role IN ('ACCOUNTANT', 'OWNER', 'ADMIN')
  );
$$;

CREATE OR REPLACE FUNCTION public.crm_can_enter_sales()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_profiles
    WHERE id = auth.uid() AND is_active AND role IN ('ACCOUNTANT', 'OWNER', 'ADMIN')
  );
$$;

-- RLS
ALTER TABLE public.crm_party_product_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_salesman_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_incentive_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_incentive_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_intervention_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_pph_select ON public.crm_party_product_history;
CREATE POLICY crm_pph_select ON public.crm_party_product_history
  FOR SELECT TO authenticated
  USING (
    public.crm_is_owner()
    OR public.crm_user_has_company_access(company_id)
    OR EXISTS (
      SELECT 1 FROM public.crm_party_salesmen ps
      JOIN public.crm_salesmen s ON s.id = ps.salesman_id
      WHERE ps.party_id = crm_party_product_history.party_id
        AND s.user_id = auth.uid() AND ps.is_active
    )
  );

DROP POLICY IF EXISTS crm_pph_insert ON public.crm_party_product_history;
CREATE POLICY crm_pph_insert ON public.crm_party_product_history
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_is_admin_or_owner() OR public.crm_can_enter_sales() OR public.crm_current_user_role() IN ('SALESMAN', 'SALES_MANAGER'));

-- Sales: accountant/owner write; salesman read own; never salesman update
DROP POLICY IF EXISTS crm_sales_select ON public.crm_sales;
CREATE POLICY crm_sales_select ON public.crm_sales
  FOR SELECT TO authenticated
  USING (
    public.crm_is_owner()
    OR public.crm_is_admin_or_owner()
    OR public.crm_is_accountant()
    OR (
      public.crm_user_has_company_access(company_id)
      AND public.crm_current_user_role() IN ('SALES_MANAGER', 'VIEWER', 'ACCOUNTANT')
    )
    OR EXISTS (
      SELECT 1 FROM public.crm_salesmen s
      WHERE s.id = salesman_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS crm_sales_insert ON public.crm_sales;
CREATE POLICY crm_sales_insert ON public.crm_sales
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_can_enter_sales() AND public.crm_user_has_company_access(company_id));

DROP POLICY IF EXISTS crm_sales_update ON public.crm_sales;
CREATE POLICY crm_sales_update ON public.crm_sales
  FOR UPDATE TO authenticated
  USING (public.crm_can_enter_sales() AND public.crm_user_has_company_access(company_id))
  WITH CHECK (public.crm_can_enter_sales() AND public.crm_user_has_company_access(company_id));

DROP POLICY IF EXISTS crm_sales_delete ON public.crm_sales;
CREATE POLICY crm_sales_delete ON public.crm_sales
  FOR DELETE TO authenticated
  USING (public.crm_is_admin_or_owner());

DROP POLICY IF EXISTS crm_st_select ON public.crm_salesman_targets;
CREATE POLICY crm_st_select ON public.crm_salesman_targets
  FOR SELECT TO authenticated
  USING (
    public.crm_is_owner() OR public.crm_is_admin_or_owner() OR public.crm_is_accountant()
    OR EXISTS (SELECT 1 FROM public.crm_salesmen s WHERE s.id = salesman_id AND s.user_id = auth.uid())
    OR public.crm_user_has_company_access(company_id)
  );

DROP POLICY IF EXISTS crm_st_write ON public.crm_salesman_targets;
CREATE POLICY crm_st_write ON public.crm_salesman_targets
  FOR ALL TO authenticated
  USING (public.crm_can_manage_masters())
  WITH CHECK (public.crm_can_manage_masters());

DROP POLICY IF EXISTS crm_ir_select ON public.crm_incentive_rules;
CREATE POLICY crm_ir_select ON public.crm_incentive_rules
  FOR SELECT TO authenticated
  USING (public.crm_is_owner() OR public.crm_user_has_company_access(company_id) OR public.crm_is_accountant());

DROP POLICY IF EXISTS crm_ir_write ON public.crm_incentive_rules;
CREATE POLICY crm_ir_write ON public.crm_incentive_rules
  FOR ALL TO authenticated
  USING (public.crm_is_admin_or_owner())
  WITH CHECK (public.crm_is_admin_or_owner());

DROP POLICY IF EXISTS crm_ic_select ON public.crm_incentive_calculations;
CREATE POLICY crm_ic_select ON public.crm_incentive_calculations
  FOR SELECT TO authenticated
  USING (
    public.crm_is_owner() OR public.crm_is_admin_or_owner() OR public.crm_is_accountant()
    OR EXISTS (SELECT 1 FROM public.crm_salesmen s WHERE s.id = salesman_id AND s.user_id = auth.uid())
  );

DROP POLICY IF EXISTS crm_ic_write ON public.crm_incentive_calculations;
CREATE POLICY crm_ic_write ON public.crm_incentive_calculations
  FOR ALL TO authenticated
  USING (public.crm_is_admin_or_owner() OR public.crm_is_accountant())
  WITH CHECK (public.crm_is_admin_or_owner() OR public.crm_is_accountant());

DROP POLICY IF EXISTS crm_int_select ON public.crm_intervention_rules;
CREATE POLICY crm_int_select ON public.crm_intervention_rules
  FOR SELECT TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS crm_int_write ON public.crm_intervention_rules;
CREATE POLICY crm_int_write ON public.crm_intervention_rules
  FOR ALL TO authenticated
  USING (public.crm_is_admin_or_owner())
  WITH CHECK (public.crm_is_admin_or_owner());

GRANT SELECT, INSERT ON public.crm_party_product_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_sales TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_salesman_targets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_incentive_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_incentive_calculations TO authenticated;
GRANT SELECT ON public.crm_intervention_rules TO authenticated;
GRANT ALL ON public.crm_intervention_rules TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_year_month(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_set_party_product_status(UUID, UUID, public.crm_dev_status, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_resolve_incentive_for_sale(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_is_accountant() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_can_enter_sales() TO authenticated;


-- ===== 20260811234000_phase4_incentive_resolve_fix.sql =====
-- Phase 4 fix: resolve PERCENT_OF_SALES / FIXED_PER_QTY / FIXED_PER_CONVERTED_PARTY
-- and simplify post-sale incentive upsert (no duplicate insert/delete race).

CREATE OR REPLACE FUNCTION public.crm_resolve_incentive_for_sale(p_sale_id UUID)
RETURNS TABLE (
  rule_id UUID,
  incentive_rate NUMERIC,
  calculated_amount NUMERIC,
  notes TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale public.crm_sales%ROWTYPE;
  v_rule public.crm_incentive_rules%ROWTYPE;
  v_product_rate NUMERIC;
  v_month TEXT;
  v_month_sales NUMERIC;
  v_target NUMERIC;
  v_ach_pct NUMERIC;
  v_slab JSONB;
  v_rate NUMERIC := 0;
  v_amount NUMERIC := 0;
BEGIN
  SELECT * INTO v_sale FROM public.crm_sales WHERE id = p_sale_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_month := public.crm_year_month(v_sale.sale_date);

  -- 1) Product-specific percent rule
  SELECT * INTO v_rule
  FROM public.crm_incentive_rules r
  WHERE r.company_id = v_sale.company_id
    AND r.is_active
    AND r.rule_type = 'PRODUCT_SPECIFIC'
    AND r.product_id = v_sale.product_id
  ORDER BY r.priority
  LIMIT 1;

  IF FOUND AND v_rule.percent_rate IS NOT NULL THEN
    v_rate := v_rule.percent_rate;
    v_amount := ROUND(v_sale.sales_value * v_rate / 100.0, 2);
    rule_id := v_rule.id;
    incentive_rate := v_rate;
    calculated_amount := v_amount;
    notes := 'Product-specific % of sales value';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 2) Percent of sales (company / salesman scoped)
  SELECT * INTO v_rule
  FROM public.crm_incentive_rules r
  WHERE r.company_id = v_sale.company_id
    AND r.is_active
    AND r.rule_type = 'PERCENT_OF_SALES'
    AND (r.salesman_id IS NULL OR r.salesman_id = v_sale.salesman_id)
    AND (r.product_id IS NULL OR r.product_id = v_sale.product_id)
  ORDER BY r.priority
  LIMIT 1;

  IF FOUND AND v_rule.percent_rate IS NOT NULL THEN
    v_rate := v_rule.percent_rate;
    v_amount := ROUND(v_sale.sales_value * v_rate / 100.0, 2);
    rule_id := v_rule.id;
    incentive_rate := v_rate;
    calculated_amount := v_amount;
    notes := 'Percent of sales value';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 3) Fixed per quantity
  SELECT * INTO v_rule
  FROM public.crm_incentive_rules r
  WHERE r.company_id = v_sale.company_id
    AND r.is_active
    AND r.rule_type = 'FIXED_PER_QTY'
    AND (r.product_id IS NULL OR r.product_id = v_sale.product_id)
  ORDER BY r.priority
  LIMIT 1;

  IF FOUND AND v_rule.fixed_amount IS NOT NULL THEN
    v_rate := NULL;
    v_amount := ROUND(v_sale.quantity * v_rule.fixed_amount, 2);
    rule_id := v_rule.id;
    incentive_rate := v_rate;
    calculated_amount := v_amount;
    notes := 'Fixed amount per quantity';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 4) Fallback: product.incentive_percent
  SELECT incentive_percent INTO v_product_rate FROM public.crm_products WHERE id = v_sale.product_id;
  IF COALESCE(v_product_rate, 0) > 0 THEN
    v_rate := v_product_rate;
    v_amount := ROUND(v_sale.sales_value * v_rate / 100.0, 2);
    rule_id := NULL;
    incentive_rate := v_rate;
    calculated_amount := v_amount;
    notes := 'Product master incentive %';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 5) Target slab rule (company default)
  SELECT * INTO v_rule
  FROM public.crm_incentive_rules r
  WHERE r.company_id = v_sale.company_id
    AND r.is_active
    AND r.rule_type = 'TARGET_SLAB'
  ORDER BY r.priority
  LIMIT 1;

  IF FOUND THEN
    SELECT COALESCE(SUM(s.sales_value), 0) INTO v_month_sales
    FROM public.crm_sales s
    WHERE s.salesman_id = v_sale.salesman_id
      AND public.crm_year_month(s.sale_date) = v_month;

    SELECT COALESCE(st.sales_target, sm.monthly_target, 0) INTO v_target
    FROM public.crm_salesmen sm
    LEFT JOIN public.crm_salesman_targets st
      ON st.salesman_id = sm.id AND st.year_month = v_month AND st.product_id IS NULL
    WHERE sm.id = v_sale.salesman_id;

    IF v_target <= 0 THEN
      v_ach_pct := 0;
    ELSE
      v_ach_pct := (v_month_sales / v_target) * 100.0;
    END IF;

    FOR v_slab IN SELECT * FROM jsonb_array_elements(COALESCE(v_rule.slabs, '[]'::jsonb))
    LOOP
      IF v_ach_pct >= COALESCE((v_slab->>'min_pct')::NUMERIC, 0)
         AND v_ach_pct < COALESCE((v_slab->>'max_pct')::NUMERIC, 9999) THEN
        v_rate := COALESCE((v_slab->>'rate')::NUMERIC, 0);
        EXIT;
      END IF;
    END LOOP;

    v_amount := ROUND(v_sale.sales_value * v_rate / 100.0, 2);
    rule_id := v_rule.id;
    incentive_rate := v_rate;
    calculated_amount := v_amount;
    notes := format('Target slab at %s%% achievement', ROUND(v_ach_pct, 1));
    RETURN NEXT;
    RETURN;
  END IF;

  rule_id := NULL;
  incentive_rate := 0;
  calculated_amount := 0;
  notes := 'No matching incentive rule';
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_after_sale_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty NUMERIC;
  v_val NUMERIC;
  v_last TIMESTAMPTZ;
  v_inc RECORD;
  v_month TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT COALESCE(SUM(quantity),0), COALESCE(SUM(sales_value),0), MAX(sale_date::timestamptz)
      INTO v_qty, v_val, v_last
    FROM public.crm_sales
    WHERE party_id = OLD.party_id AND product_id = OLD.product_id;

    UPDATE public.crm_party_products
    SET total_sales_qty = v_qty,
        total_sales_value = v_val,
        last_sale_at = v_last
    WHERE party_id = OLD.party_id AND product_id = OLD.product_id;

    DELETE FROM public.crm_incentive_calculations WHERE sale_id = OLD.id;
    RETURN OLD;
  END IF;

  PERFORM public.crm_set_party_product_status(
    NEW.party_id, NEW.product_id, 'PRODUCT_STARTED', 'sales', NEW.id, 'Sale recorded'
  );

  SELECT COALESCE(SUM(quantity),0), COALESCE(SUM(sales_value),0), MAX(sale_date::timestamptz)
    INTO v_qty, v_val, v_last
  FROM public.crm_sales
  WHERE party_id = NEW.party_id AND product_id = NEW.product_id;

  UPDATE public.crm_party_products
  SET total_sales_qty = v_qty,
      total_sales_value = v_val,
      last_sale_at = v_last,
      development_status = CASE
        WHEN development_status IN ('CONVERTED', 'REGULAR_SALE') THEN development_status
        WHEN v_val > 0 THEN 'PRODUCT_STARTED'::public.crm_dev_status
        ELSE development_status
      END
  WHERE party_id = NEW.party_id AND product_id = NEW.product_id;

  UPDATE public.crm_parties p
  SET current_business = COALESCE((
    SELECT SUM(s.sales_value) FROM public.crm_sales s WHERE s.party_id = p.id
  ), 0)
  WHERE p.id = NEW.party_id;

  v_month := public.crm_year_month(NEW.sale_date);
  SELECT * INTO v_inc FROM public.crm_resolve_incentive_for_sale(NEW.id);

  DELETE FROM public.crm_incentive_calculations
  WHERE sale_id = NEW.id AND status = 'ESTIMATED';

  INSERT INTO public.crm_incentive_calculations (
    company_id, salesman_id, product_id, sale_id, rule_id, year_month,
    sales_value, incentive_rate, calculated_amount, status, calculation_notes
  ) VALUES (
    NEW.company_id, NEW.salesman_id, NEW.product_id, NEW.id, v_inc.rule_id, v_month,
    NEW.sales_value, v_inc.incentive_rate, v_inc.calculated_amount, 'ESTIMATED', v_inc.notes
  );

  RETURN NEW;
END;
$$;


-- ===== 20260811240000_phase5_management_intelligence.sql =====
-- Phase 5: Management intelligence — classifications, alert thresholds, search helpers
-- Additive only; does not drop Phase 1–4 objects

DO $$ BEGIN
  CREATE TYPE public.crm_party_class AS ENUM (
    'HOT',
    'WARM',
    'COLD',
    'NEW',
    'ACTIVE_CUSTOMER',
    'INACTIVE_CUSTOMER',
    'HIGH_POTENTIAL',
    'NO_DEVELOPMENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Configurable intelligence thresholds (Owner editable)
CREATE TABLE IF NOT EXISTS public.crm_intelligence_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  -- days without visit → inactive / ignored
  inactive_days INTEGER NOT NULL DEFAULT 21,
  -- visits with zero sales → high visit / low sales
  high_visits_no_sales INTEGER NOT NULL DEFAULT 5,
  -- single visit then ignored (days after first visit)
  single_visit_ignore_days INTEGER NOT NULL DEFAULT 14,
  -- sample without follow-up days
  sample_no_followup_days INTEGER NOT NULL DEFAULT 7,
  -- high potential (₹) with insufficient visits
  high_potential_value NUMERIC(14, 2) NOT NULL DEFAULT 100000,
  high_potential_min_visits INTEGER NOT NULL DEFAULT 3,
  -- product started but no sale for days
  product_started_stale_days INTEGER NOT NULL DEFAULT 30,
  -- classification visit/sales windows
  hot_min_visits INTEGER NOT NULL DEFAULT 3,
  hot_max_days_since_visit INTEGER NOT NULL DEFAULT 14,
  warm_max_days_since_visit INTEGER NOT NULL DEFAULT 30,
  cold_max_days_since_visit INTEGER NOT NULL DEFAULT 60,
  active_customer_min_sales NUMERIC(14, 2) NOT NULL DEFAULT 1,
  inactive_customer_days INTEGER NOT NULL DEFAULT 45,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_intel_settings_company
  ON public.crm_intelligence_settings (company_id)
  WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_intel_settings_global
  ON public.crm_intelligence_settings ((company_id IS NULL))
  WHERE company_id IS NULL;

DROP TRIGGER IF EXISTS trg_crm_intel_settings_updated ON public.crm_intelligence_settings;
CREATE TRIGGER trg_crm_intel_settings_updated
  BEFORE UPDATE ON public.crm_intelligence_settings
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

INSERT INTO public.crm_intelligence_settings (company_id)
SELECT NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.crm_intelligence_settings WHERE company_id IS NULL
);

-- Persist classification on party_products for reporting (never deletes history)
ALTER TABLE public.crm_party_products
  ADD COLUMN IF NOT EXISTS party_class public.crm_party_class,
  ADD COLUMN IF NOT EXISTS matrix_status TEXT;

-- Matrix status check (soft; app-driven)
DO $$ BEGIN
  ALTER TABLE public.crm_party_products
    ADD CONSTRAINT crm_pp_matrix_status_check
    CHECK (
      matrix_status IS NULL OR matrix_status IN (
        'NOT_ASSIGNED',
        'ASSIGNED',
        'VISIT_STARTED',
        'SAMPLE_GIVEN',
        'TRIAL',
        'REGULAR_ORDER',
        'STOPPED',
        'NO_RESPONSE'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Derive matrix status from development_status + aggregates
CREATE OR REPLACE FUNCTION public.crm_derive_matrix_status(
  p_dev public.crm_dev_status,
  p_visits INTEGER,
  p_sales NUMERIC,
  p_sample_at TIMESTAMPTZ,
  p_last_sale TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_dev = 'LOST_HOLD' THEN
    RETURN 'STOPPED';
  ELSIF p_dev IN ('CONVERTED', 'REGULAR_SALE') OR COALESCE(p_sales, 0) > 0 THEN
    IF p_last_sale IS NOT NULL AND p_last_sale < (NOW() - INTERVAL '60 days') THEN
      RETURN 'STOPPED';
    END IF;
    RETURN 'REGULAR_ORDER';
  ELSIF p_dev IN ('SAMPLE_UNDER_TRIAL', 'PRODUCT_STARTED') THEN
    RETURN 'TRIAL';
  ELSIF p_dev = 'SAMPLE_GIVEN' OR p_sample_at IS NOT NULL THEN
    RETURN 'SAMPLE_GIVEN';
  ELSIF p_dev IN ('FIRST_VISIT', 'FOLLOW_UP') OR COALESCE(p_visits, 0) > 0 THEN
    RETURN 'VISIT_STARTED';
  ELSIF p_dev = 'NOT_STARTED' THEN
    RETURN 'ASSIGNED';
  END IF;
  RETURN 'ASSIGNED';
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_refresh_party_product_matrix()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.matrix_status := public.crm_derive_matrix_status(
    NEW.development_status,
    NEW.total_visits,
    NEW.total_sales_value,
    NEW.sample_given_at,
    NEW.last_sale_at
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_pp_matrix ON public.crm_party_products;
CREATE TRIGGER trg_crm_pp_matrix
  BEFORE INSERT OR UPDATE OF development_status, total_visits, total_sales_value, sample_given_at, last_sale_at
  ON public.crm_party_products
  FOR EACH ROW EXECUTE FUNCTION public.crm_refresh_party_product_matrix();

-- Backfill matrix_status
UPDATE public.crm_party_products
SET matrix_status = public.crm_derive_matrix_status(
  development_status, total_visits, total_sales_value, sample_given_at, last_sale_at
)
WHERE matrix_status IS NULL;

-- Extra intervention seed rules for Phase 5 messaging
INSERT INTO public.crm_intervention_rules (company_id, code, name, description, threshold_visits, threshold_days, requires_zero_sales, severity)
SELECT NULL, v.code, v.name, v.description, v.threshold_visits, v.threshold_days, v.requires_zero_sales, v.severity
FROM (VALUES
  ('SINGLE_VISIT_IGNORED', 'Single visit then ignored', 'Only one visit and no return', 1, 14, TRUE, 'AMBER'),
  ('HIGH_POTENTIAL_LOW_VISITS', 'High potential insufficient visits', 'High potential party with few visits', 3, NULL, FALSE, 'AMBER'),
  ('OVERDUE_FOLLOWUP', 'Follow-up overdue', 'Open follow-up past due date', NULL, 0, FALSE, 'RED')
) AS v(code, name, description, threshold_visits, threshold_days, requires_zero_sales, severity)
WHERE NOT EXISTS (
  SELECT 1 FROM public.crm_intervention_rules r WHERE r.company_id IS NULL AND r.code = v.code
);

-- Sync inactive_days default from intervention rule if present
UPDATE public.crm_intelligence_settings s
SET inactive_days = COALESCE(
  (SELECT threshold_days FROM public.crm_intervention_rules WHERE code = 'INACTIVE_PARTY' AND company_id IS NULL LIMIT 1),
  s.inactive_days
),
high_visits_no_sales = COALESCE(
  (SELECT threshold_visits FROM public.crm_intervention_rules WHERE code = 'HIGH_VISITS_NO_SALES' AND company_id IS NULL LIMIT 1),
  s.high_visits_no_sales
)
WHERE s.company_id IS NULL;

ALTER TABLE public.crm_intelligence_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_intel_settings_select ON public.crm_intelligence_settings;
CREATE POLICY crm_intel_settings_select ON public.crm_intelligence_settings
  FOR SELECT TO authenticated
  USING (
    public.crm_is_owner()
    OR public.crm_is_admin_or_owner()
    OR company_id IS NULL
    OR public.crm_user_has_company_access(company_id)
  );

DROP POLICY IF EXISTS crm_intel_settings_write ON public.crm_intelligence_settings;
CREATE POLICY crm_intel_settings_write ON public.crm_intelligence_settings
  FOR ALL TO authenticated
  USING (public.crm_is_admin_or_owner())
  WITH CHECK (public.crm_is_admin_or_owner());

GRANT SELECT ON public.crm_intelligence_settings TO authenticated;
GRANT ALL ON public.crm_intelligence_settings TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_derive_matrix_status(public.crm_dev_status, INTEGER, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- Simple search RPC for owner/admin (respects company access via RLS on underlying tables)
CREATE OR REPLACE FUNCTION public.crm_global_search(p_query TEXT, p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  entity_type TEXT,
  entity_id UUID,
  title TEXT,
  subtitle TEXT,
  company_id UUID,
  href TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q TEXT := TRIM(COALESCE(p_query, ''));
BEGIN
  IF LENGTH(q) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  (
    SELECT 'party'::TEXT, p.id, p.party_name,
           COALESCE(p.mobile, p.party_code),
           p.company_id,
           '/parties/' || p.id::TEXT || '/360'
    FROM public.crm_parties p
    WHERE (
      public.crm_is_owner()
      OR public.crm_user_has_company_access(p.company_id)
      OR EXISTS (
        SELECT 1 FROM public.crm_party_salesmen ps
        JOIN public.crm_salesmen s ON s.id = ps.salesman_id
        WHERE ps.party_id = p.id AND s.user_id = auth.uid() AND ps.is_active
      )
    )
    AND (
      p.party_name ILIKE '%' || q || '%'
      OR COALESCE(p.party_code, '') ILIKE '%' || q || '%'
      OR COALESCE(p.mobile, '') ILIKE '%' || q || '%'
      OR COALESCE(p.contact_person, '') ILIKE '%' || q || '%'
    )
    LIMIT p_limit
  )
  UNION ALL
  (
    SELECT 'salesman'::TEXT, s.id, s.name, s.employee_id, s.company_id,
           '/salesmen/' || s.id::TEXT
    FROM public.crm_salesmen s
    WHERE (public.crm_is_owner() OR public.crm_user_has_company_access(s.company_id) OR s.user_id = auth.uid())
      AND (s.name ILIKE '%' || q || '%' OR s.employee_id ILIKE '%' || q || '%' OR COALESCE(s.mobile, '') ILIKE '%' || q || '%')
    LIMIT p_limit
  )
  UNION ALL
  (
    SELECT 'product'::TEXT, pr.id, pr.product_name, pr.product_code, pr.company_id,
           '/products/' || pr.id::TEXT
    FROM public.crm_products pr
    WHERE (public.crm_is_owner() OR public.crm_user_has_company_access(pr.company_id))
      AND (pr.product_name ILIKE '%' || q || '%' OR pr.product_code ILIKE '%' || q || '%')
    LIMIT p_limit
  )
  UNION ALL
  (
    SELECT 'invoice'::TEXT, sa.id,
           COALESCE(sa.invoice_number, 'Sale'),
           TO_CHAR(sa.sale_date, 'YYYY-MM-DD') || ' · ₹' || sa.sales_value::TEXT,
           sa.company_id,
           '/sales'
    FROM public.crm_sales sa
    WHERE (
      public.crm_is_owner() OR public.crm_is_admin_or_owner() OR public.crm_is_accountant()
      OR EXISTS (SELECT 1 FROM public.crm_salesmen sm WHERE sm.id = sa.salesman_id AND sm.user_id = auth.uid())
      OR public.crm_user_has_company_access(sa.company_id)
    )
    AND COALESCE(sa.invoice_number, '') ILIKE '%' || q || '%'
    LIMIT p_limit
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_global_search(TEXT, INTEGER) TO authenticated;


-- ===== 20260811250000_phase6_backup_restore.sql =====
-- Phase 6: Application backup, restore history, Google Drive connection, schedules
-- Additive only — does not alter Phase 1–5 business tables

DO $$ BEGIN
  CREATE TYPE public.crm_backup_type AS ENUM (
    'MANUAL',
    'AUTOMATIC_DAILY',
    'AUTOMATIC_WEEKLY',
    'AUTOMATIC_MONTHLY',
    'SAFETY_BEFORE_RESTORE',
    'MODULE_EXPORT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_backup_status AS ENUM (
    'SUCCESS',
    'FAILED',
    'PARTIAL',
    'RESTORED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_drive_status AS ENUM (
    'NOT_CONFIGURED',
    'SKIPPED',
    'PENDING',
    'SUCCESS',
    'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.crm_backup_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  automatic_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  frequency TEXT NOT NULL DEFAULT 'DAILY'
    CHECK (frequency IN ('DAILY', 'WEEKLY', 'MONTHLY')),
  backup_hour_ist INTEGER NOT NULL DEFAULT 4 CHECK (backup_hour_ist BETWEEN 0 AND 23),
  backup_minute_ist INTEGER NOT NULL DEFAULT 30 CHECK (backup_minute_ist BETWEEN 0 AND 59),
  include_all_companies BOOLEAN NOT NULL DEFAULT TRUE,
  google_drive_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  accountant_export_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  last_auto_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_backup_settings_global
  ON public.crm_backup_settings ((company_id IS NULL))
  WHERE company_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_backup_settings_company
  ON public.crm_backup_settings (company_id)
  WHERE company_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_crm_backup_settings_updated ON public.crm_backup_settings;
CREATE TRIGGER trg_crm_backup_settings_updated
  BEFORE UPDATE ON public.crm_backup_settings
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

INSERT INTO public.crm_backup_settings (company_id, automatic_enabled, frequency)
SELECT NULL, FALSE, 'DAILY'
WHERE NOT EXISTS (
  SELECT 1 FROM public.crm_backup_settings WHERE company_id IS NULL
);

-- Google OAuth tokens stored server-side only (never select to client roles except owner via RPC)
CREATE TABLE IF NOT EXISTS public.crm_drive_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connected_by UUID NOT NULL REFERENCES public.crm_profiles (id) ON DELETE CASCADE,
  google_email TEXT,
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  token_expiry TIMESTAMPTZ,
  root_folder_id TEXT,
  daily_folder_id TEXT,
  weekly_folder_id TEXT,
  monthly_folder_id TEXT,
  scopes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_error TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_crm_drive_connections_updated ON public.crm_drive_connections;
CREATE TRIGGER trg_crm_drive_connections_updated
  BEFORE UPDATE ON public.crm_drive_connections
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

CREATE TABLE IF NOT EXISTS public.crm_backup_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type public.crm_backup_type NOT NULL DEFAULT 'MANUAL',
  status public.crm_backup_status NOT NULL DEFAULT 'SUCCESS',
  drive_status public.crm_drive_status NOT NULL DEFAULT 'SKIPPED',
  company_scope TEXT NOT NULL DEFAULT 'ALL',
  company_ids UUID[] NOT NULL DEFAULT '{}',
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  storage_path TEXT,
  drive_file_id TEXT,
  drive_web_link TEXT,
  app_version TEXT,
  record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_records INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_by UUID REFERENCES public.crm_profiles (id),
  restored_at TIMESTAMPTZ,
  restored_by UUID REFERENCES public.crm_profiles (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_backup_jobs_created
  ON public.crm_backup_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_backup_jobs_status
  ON public.crm_backup_jobs (status);
CREATE INDEX IF NOT EXISTS idx_crm_backup_jobs_type
  ON public.crm_backup_jobs (backup_type);

-- Pending restore sessions (validated preview before confirm)
CREATE TABLE IF NOT EXISTS public.crm_restore_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.crm_profiles (id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('MERGE', 'FULL')),
  file_name TEXT NOT NULL,
  storage_path TEXT,
  preview JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_valid BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  safety_backup_id UUID REFERENCES public.crm_backup_jobs (id),
  status TEXT NOT NULL DEFAULT 'PREVIEW'
    CHECK (status IN ('PREVIEW', 'CONFIRMED', 'COMPLETED', 'FAILED', 'CANCELLED')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours')
);

CREATE INDEX IF NOT EXISTS idx_crm_restore_sessions_user
  ON public.crm_restore_sessions (created_by, created_at DESC);

-- Storage bucket for backup artifacts (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('crm-backups', 'crm-backups', FALSE, 104857600)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.crm_backup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_drive_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_backup_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_restore_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_backup_settings_select ON public.crm_backup_settings;
CREATE POLICY crm_backup_settings_select ON public.crm_backup_settings
  FOR SELECT TO authenticated
  USING (public.crm_is_admin_or_owner());

DROP POLICY IF EXISTS crm_backup_settings_write ON public.crm_backup_settings;
CREATE POLICY crm_backup_settings_write ON public.crm_backup_settings
  FOR ALL TO authenticated
  USING (public.crm_is_admin_or_owner())
  WITH CHECK (public.crm_is_admin_or_owner());

-- Drive tokens: only OWNER can read/write (Admin configures with Owner for restore)
DROP POLICY IF EXISTS crm_drive_select ON public.crm_drive_connections;
CREATE POLICY crm_drive_select ON public.crm_drive_connections
  FOR SELECT TO authenticated
  USING (public.crm_is_owner());

DROP POLICY IF EXISTS crm_drive_write ON public.crm_drive_connections;
CREATE POLICY crm_drive_write ON public.crm_drive_connections
  FOR ALL TO authenticated
  USING (public.crm_is_owner())
  WITH CHECK (public.crm_is_owner());

DROP POLICY IF EXISTS crm_backup_jobs_select ON public.crm_backup_jobs;
CREATE POLICY crm_backup_jobs_select ON public.crm_backup_jobs
  FOR SELECT TO authenticated
  USING (
    public.crm_is_admin_or_owner()
    OR (
      public.crm_current_user_role() = 'ACCOUNTANT'
      AND EXISTS (
        SELECT 1 FROM public.crm_backup_settings s
        WHERE s.accountant_export_allowed = TRUE
          AND (s.company_id IS NULL OR public.crm_user_has_company_access(s.company_id))
      )
    )
  );

DROP POLICY IF EXISTS crm_backup_jobs_write ON public.crm_backup_jobs;
CREATE POLICY crm_backup_jobs_write ON public.crm_backup_jobs
  FOR ALL TO authenticated
  USING (public.crm_is_admin_or_owner())
  WITH CHECK (public.crm_is_admin_or_owner());

DROP POLICY IF EXISTS crm_restore_select ON public.crm_restore_sessions;
CREATE POLICY crm_restore_select ON public.crm_restore_sessions
  FOR SELECT TO authenticated
  USING (public.crm_is_owner() AND created_by = auth.uid());

DROP POLICY IF EXISTS crm_restore_write ON public.crm_restore_sessions;
CREATE POLICY crm_restore_write ON public.crm_restore_sessions
  FOR ALL TO authenticated
  USING (public.crm_is_owner() AND created_by = auth.uid())
  WITH CHECK (public.crm_is_owner() AND created_by = auth.uid());

-- Storage policies: authenticated owner/admin via path prefix user id not required — service role used from API
DROP POLICY IF EXISTS crm_backups_storage_select ON storage.objects;
CREATE POLICY crm_backups_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'crm-backups'
    AND public.crm_is_admin_or_owner()
  );

DROP POLICY IF EXISTS crm_backups_storage_insert ON storage.objects;
CREATE POLICY crm_backups_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'crm-backups'
    AND public.crm_is_admin_or_owner()
  );

DROP POLICY IF EXISTS crm_backups_storage_delete ON storage.objects;
CREATE POLICY crm_backups_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'crm-backups'
    AND public.crm_is_admin_or_owner()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_backup_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_drive_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_backup_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_restore_sessions TO authenticated;


-- ===== 20260812010000_mobile_pin_auth.sql =====
-- Mobile Number + PIN login (additive). Keeps existing auth.users + crm_profiles.
-- PIN hashes live in a service-role-only table (never exposed via client SELECT).

CREATE TABLE IF NOT EXISTS public.crm_user_login (
  user_id UUID PRIMARY KEY REFERENCES public.crm_profiles (id) ON DELETE CASCADE,
  mobile_number TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  pin_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_user_login_mobile_digits CHECK (mobile_number ~ '^[0-9]{10,15}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_user_login_mobile
  ON public.crm_user_login (mobile_number);

DROP TRIGGER IF EXISTS trg_crm_user_login_updated ON public.crm_user_login;
CREATE TRIGGER trg_crm_user_login_updated
  BEFORE UPDATE ON public.crm_user_login
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

CREATE TABLE IF NOT EXISTS public.crm_auth_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.crm_profiles (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device_label TEXT,
  user_agent TEXT,
  ip_address TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.crm_profiles (id)
);

CREATE INDEX IF NOT EXISTS idx_crm_auth_devices_user
  ON public.crm_auth_devices (user_id, revoked_at);

ALTER TABLE public.crm_user_login ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_auth_devices ENABLE ROW LEVEL SECURITY;

-- Deny direct client access to PIN hashes (service role bypasses RLS).
DROP POLICY IF EXISTS crm_user_login_deny ON public.crm_user_login;
CREATE POLICY crm_user_login_deny ON public.crm_user_login
  FOR ALL TO authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

-- Users may see their own non-revoked devices (no token_hash exposure via restricted select in app).
DROP POLICY IF EXISTS crm_auth_devices_select_own ON public.crm_auth_devices;
CREATE POLICY crm_auth_devices_select_own ON public.crm_auth_devices
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.crm_is_admin_or_owner()
  );

DROP POLICY IF EXISTS crm_auth_devices_no_client_write ON public.crm_auth_devices;
CREATE POLICY crm_auth_devices_no_client_write ON public.crm_auth_devices
  FOR INSERT TO authenticated
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS crm_auth_devices_no_client_update ON public.crm_auth_devices;
CREATE POLICY crm_auth_devices_no_client_update ON public.crm_auth_devices
  FOR UPDATE TO authenticated
  USING (FALSE);

DROP POLICY IF EXISTS crm_auth_devices_no_client_delete ON public.crm_auth_devices;
CREATE POLICY crm_auth_devices_no_client_delete ON public.crm_auth_devices
  FOR DELETE TO authenticated
  USING (FALSE);

-- Keep profiles.mobile in sync helper for display (optional backfill from login).
COMMENT ON TABLE public.crm_user_login IS
  'Mobile+PIN credentials. pin_hash is bcrypt; never return to clients.';
COMMENT ON TABLE public.crm_auth_devices IS
  'Trusted devices for Remember this device. token_hash is SHA-256 of cookie token.';


-- ===== 20260812020000_developer_override.sql =====
-- Developer / Owner Override foundation (server-side only).
-- Extends Mobile+PIN auth with primary-owner protection and developer flags.
-- DEVELOPER_OVERRIDE_KEY lives only in server env — never stored in DB plaintext.

ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS is_primary_owner BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS is_developer BOOLEAN NOT NULL DEFAULT FALSE;

-- At most one primary owner
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_profiles_primary_owner
  ON public.crm_profiles ((is_primary_owner))
  WHERE is_primary_owner = TRUE;

COMMENT ON COLUMN public.crm_profiles.is_primary_owner IS
  'Protected primary Owner (Kumaresh Budhia). Cannot be deleted/demoted via normal UI.';
COMMENT ON COLUMN public.crm_profiles.is_developer IS
  'Owner/Developer flag. Required with DEVELOPER_OVERRIDE_KEY for elevated override ops.';

-- Soft-delete / restore support for profiles (deactivate already uses is_active)
ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES public.crm_profiles (id);

-- Audit enrichment: success/failure lives in metadata.success; strip override secrets
CREATE OR REPLACE FUNCTION public.crm_write_audit_log(
  p_action TEXT,
  p_module TEXT,
  p_company_id UUID DEFAULT NULL,
  p_record_type TEXT DEFAULT NULL,
  p_record_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  p_metadata := p_metadata
    - 'pin'
    - 'current_pin'
    - 'new_pin'
    - 'confirm_pin'
    - 'pin_hash'
    - 'OWNER_OVERRIDE_PIN'
    - 'DEVELOPER_OVERRIDE_KEY'
    - 'developer_override_key'
    - 'override_key'
    - 'password'
    - 'token'
    - 'device_token';
  INSERT INTO public.crm_audit_logs (company_id, user_id, action, module, record_type, record_id, metadata)
  VALUES (p_company_id, auth.uid(), p_action, p_module, p_record_type, p_record_id, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Helper: is active owner-developer (for potential RLS gates)
CREATE OR REPLACE FUNCTION public.crm_is_owner_developer()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_profiles
    WHERE id = auth.uid()
      AND role = 'OWNER'
      AND is_developer = TRUE
      AND is_active = TRUE
  );
$$;

GRANT EXECUTE ON FUNCTION public.crm_is_owner_developer() TO authenticated;

-- Role permission overrides (optional JSON blob managed by Owner/Developer)
INSERT INTO public.crm_app_settings (company_id, key, value, is_public)
SELECT NULL, 'security_role_permissions', '{}', FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM public.crm_app_settings s
  WHERE s.company_id IS NULL AND s.key = 'security_role_permissions'
);

INSERT INTO public.crm_app_settings (company_id, key, value, is_public)
SELECT NULL, 'security_lockout_policy', '{"max_failed_attempts":5,"lockout_minutes":15}', FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM public.crm_app_settings s
  WHERE s.company_id IS NULL AND s.key = 'security_lockout_policy'
);


-- ===== 20260812030000_ceo_roles_enum.sql =====
-- Part A: add CEO enum values only (must commit before values are usable).

DO $$ BEGIN
  ALTER TYPE public.crm_app_role ADD VALUE IF NOT EXISTS 'CEO_1';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.crm_app_role ADD VALUE IF NOT EXISTS 'CEO_2';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.crm_app_role ADD VALUE IF NOT EXISTS 'CEO_3';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ===== 20260812031000_ceo_forgot_pin_sessions.sql =====
-- Part B: session expiry, must_change_pin, forgot-PIN, CEO-aware helpers.
-- Runs after CEO enum values are committed.

ALTER TABLE public.crm_auth_devices
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE public.crm_auth_devices
  SET expires_at = created_at + INTERVAL '90 days'
  WHERE expires_at IS NULL;

ALTER TABLE public.crm_auth_devices
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '90 days');

CREATE INDEX IF NOT EXISTS idx_crm_auth_devices_expires
  ON public.crm_auth_devices (expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.crm_user_login
  ADD COLUMN IF NOT EXISTS must_change_pin BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.crm_user_login.must_change_pin IS
  'When true, user must change PIN after next successful login.';

CREATE TABLE IF NOT EXISTS public.crm_pin_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile_number TEXT NOT NULL,
  user_id UUID REFERENCES public.crm_profiles (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'FULFILLED', 'CANCELLED', 'EXPIRED')),
  note TEXT,
  requested_ip TEXT,
  requested_user_agent TEXT,
  fulfilled_by UUID REFERENCES public.crm_profiles (id),
  fulfilled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_pin_reset_mobile_created
  ON public.crm_pin_reset_requests (mobile_number, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_pin_reset_status
  ON public.crm_pin_reset_requests (status, created_at DESC)
  WHERE status = 'PENDING';

ALTER TABLE public.crm_pin_reset_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_pin_reset_deny_client ON public.crm_pin_reset_requests;
CREATE POLICY crm_pin_reset_deny_client ON public.crm_pin_reset_requests
  FOR ALL TO authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

CREATE OR REPLACE FUNCTION public.crm_is_admin_or_owner()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_profiles
    WHERE id = auth.uid()
      AND is_active = TRUE
      AND role IN ('OWNER', 'ADMIN', 'CEO_1', 'CEO_2', 'CEO_3')
  );
$$;

CREATE OR REPLACE FUNCTION public.crm_is_ceo_or_owner()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_profiles
    WHERE id = auth.uid()
      AND is_active = TRUE
      AND role IN ('OWNER', 'CEO_1', 'CEO_2', 'CEO_3')
  );
$$;

GRANT EXECUTE ON FUNCTION public.crm_is_ceo_or_owner() TO authenticated;

COMMENT ON TABLE public.crm_pin_reset_requests IS
  'Forgot-PIN tickets. Admins fulfill by issuing a new hashed PIN; never stores old PIN.';


-- ===== 20260812040000_user_modules_department.sql =====
-- Additive: department + allowed modules for CRM users.
-- Preserves existing rows; defaults applied for NULL allowed_modules.

ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS department TEXT;

ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS allowed_modules JSONB;

COMMENT ON COLUMN public.crm_profiles.department IS
  'Business department label (Sales, Accounts, Management, etc.).';

COMMENT ON COLUMN public.crm_profiles.allowed_modules IS
  'Optional JSON array of module keys. NULL = use role defaults.';

-- Ensure pin_changed tracking column name stays available for admin UI.
-- (pin_updated_at already exists on crm_user_login)


-- ===== 20260812050000_role_pin_app_users.sql =====
-- Role-tile + PIN auth (Supabase Auth password = pin-loginSlug-pepper).
-- NO mobile / OTP. Run in Supabase SQL Editor on the correct project first.
--
-- Seed:
--   1) Create auth users via api/admin-create-user (email = {login_slug}@internal.kwos.local,
--      password = deriveAuthPassword(slug, tempPin))
--   2) INSERT app_users rows (Admin, CEO Kailash Kalyani, Accountant, Salesman 01/02)
--   3) Ensure matching crm_profiles.id = auth.users.id

UPDATE public.crm_companies
SET name = CASE code
      WHEN 'KALYANI' THEN 'Kalyani'
      WHEN 'RADHASWAMI' THEN 'Radhaswami'
      ELSE name
    END,
    legal_name = CASE code
      WHEN 'KALYANI' THEN 'Kalyani'
      WHEN 'RADHASWAMI' THEN 'Radhaswami'
      ELSE legal_name
    END,
    updated_at = NOW()
WHERE code IN ('KALYANI', 'RADHASWAMI');

CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  login_slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'ceo', 'accountant', 'salesman')),
  pin_is_set BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_users_login_slug_format CHECK (login_slug ~ '^[a-z0-9_]+$')
);

CREATE INDEX IF NOT EXISTS idx_app_users_active_sort
  ON public.app_users (is_active, sort_order);

DROP TRIGGER IF EXISTS trg_app_users_updated ON public.app_users;
CREATE TRIGGER trg_app_users_updated
  BEFORE UPDATE ON public.app_users
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_users_deny_client ON public.app_users;
CREATE POLICY app_users_deny_client ON public.app_users
  FOR ALL TO authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

-- Safe public tile list (no secrets)
CREATE OR REPLACE VIEW public.public_active_users
WITH (security_invoker = false)
AS
SELECT id, login_slug, display_name, role, pin_is_set, sort_order
FROM public.app_users
WHERE is_active = TRUE;

GRANT SELECT ON public.public_active_users TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_pin_set()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.app_users
  SET pin_is_set = TRUE, updated_at = NOW()
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.mark_pin_set() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_pin_set() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.app_users WHERE id = auth.uid() AND is_active LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- Login tiles for anon (SECURITY DEFINER bypasses app_users deny-all RLS).
-- Client: supabase.rpc("list_login_users") — no parameters.
CREATE OR REPLACE FUNCTION public.list_login_users()
RETURNS TABLE (
  id UUID,
  login_slug TEXT,
  display_name TEXT,
  role TEXT,
  pin_is_set BOOLEAN,
  sort_order INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    u.id,
    u.login_slug,
    u.display_name,
    u.role,
    u.pin_is_set,
    u.sort_order
  FROM public.app_users u
  WHERE u.is_active = TRUE
  ORDER BY u.sort_order ASC, u.display_name ASC;
$$;

REVOKE ALL ON FUNCTION public.list_login_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_login_users() TO anon, authenticated;

COMMENT ON FUNCTION public.list_login_users() IS
  'Public role-tile list for login. Safe columns only; no PIN/password.';

COMMENT ON TABLE public.app_users IS
  'Role-tile login identities. Auth password is PIN-derived in the client; pin_is_set only.';

-- Example seed (after admin-create-user):
-- INSERT INTO public.app_users (id, login_slug, display_name, role, pin_is_set, sort_order)
-- VALUES
--   ('<admin-uuid>', 'admin', 'Admin', 'admin', false, 10),
--   ('<ceo-uuid>', 'ceo', 'CEO (Kailash Kalyani)', 'ceo', false, 20),
--   ('<acct-uuid>', 'accountant', 'Accountant', 'accountant', false, 30),
--   ('<s1-uuid>', 'salesman_01', 'Salesman 01', 'salesman', false, 40),
--   ('<s2-uuid>', 'salesman_02', 'Salesman 02', 'salesman', false, 50);

COMMIT;
NOTIFY pgrst, 'reload schema';
