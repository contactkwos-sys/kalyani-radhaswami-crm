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
