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
