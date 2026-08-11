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
