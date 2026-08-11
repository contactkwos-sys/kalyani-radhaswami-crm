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
