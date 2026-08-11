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
