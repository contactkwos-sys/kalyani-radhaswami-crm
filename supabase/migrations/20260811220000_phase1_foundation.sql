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
