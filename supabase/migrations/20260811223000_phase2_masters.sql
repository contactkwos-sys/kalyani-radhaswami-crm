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
