-- Safe auth/RBAC upgrade: CEO_4, invites, permissions, login tile labels.
-- Preserves existing users/data. Idempotent where possible.

-- ---------------------------------------------------------------------------
-- 1) CEO_4 role enum
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE public.crm_app_role ADD VALUE IF NOT EXISTS 'CEO_4';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Login tiles: role subtitle + never expose developer identities
-- ---------------------------------------------------------------------------
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS role_subtitle TEXT;

-- Strip hard-coded personal CEO names from public tiles; keep profile.full_name.
UPDATE public.app_users
SET
  display_name = 'CEO',
  role_subtitle = 'Chief Executive / Management',
  updated_at = NOW()
WHERE role = 'ceo'
  AND (
    display_name ILIKE '%kailash%'
    OR display_name ILIKE 'CEO (%'
    OR display_name IS DISTINCT FROM 'CEO'
  );

UPDATE public.app_users
SET role_subtitle = COALESCE(role_subtitle, 'Chief Executive / Management'),
    updated_at = NOW()
WHERE role = 'ceo' AND role_subtitle IS NULL;

UPDATE public.app_users
SET role_subtitle = COALESCE(role_subtitle, 'System administrator'),
    updated_at = NOW()
WHERE role = 'admin' AND role_subtitle IS NULL;

UPDATE public.app_users
SET role_subtitle = COALESCE(role_subtitle, 'Accounts & entries'),
    updated_at = NOW()
WHERE role = 'accountant' AND role_subtitle IS NULL;

UPDATE public.app_users
SET role_subtitle = COALESCE(role_subtitle, 'Field sales'),
    updated_at = NOW()
WHERE role = 'salesman' AND role_subtitle IS NULL;

-- Allow additional tile roles for "other authorized users"
ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE public.app_users
  ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('admin', 'ceo', 'accountant', 'salesman', 'other'));

UPDATE public.app_users
SET role_subtitle = COALESCE(role_subtitle, 'Authorized user'),
    updated_at = NOW()
WHERE role = 'other' AND role_subtitle IS NULL;

CREATE OR REPLACE VIEW public.public_active_users
WITH (security_invoker = false)
AS
SELECT id, login_slug, display_name, role, role_subtitle, pin_is_set, sort_order
FROM public.app_users
WHERE is_active = TRUE;

CREATE OR REPLACE FUNCTION public.list_login_users()
RETURNS TABLE (
  id UUID,
  login_slug TEXT,
  display_name TEXT,
  role TEXT,
  role_subtitle TEXT,
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
    COALESCE(
      u.role_subtitle,
      CASE u.role
        WHEN 'ceo' THEN 'Chief Executive / Management'
        WHEN 'admin' THEN 'System administrator'
        WHEN 'accountant' THEN 'Accounts & entries'
        WHEN 'salesman' THEN 'Field sales'
        WHEN 'other' THEN 'Authorized user'
        ELSE NULL
      END
    ) AS role_subtitle,
    u.pin_is_set,
    u.sort_order
  FROM public.app_users u
  LEFT JOIN public.crm_profiles p ON p.id = u.id
  WHERE u.is_active = TRUE
    AND COALESCE(p.is_developer, FALSE) = FALSE
  ORDER BY u.sort_order ASC, u.display_name ASC;
$$;

REVOKE ALL ON FUNCTION public.list_login_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_login_users() TO anon, authenticated;

COMMENT ON FUNCTION public.list_login_users() IS
  'Public role-tile list. Never includes developer identities or PIN secrets.';

-- ---------------------------------------------------------------------------
-- 3) Fine-grained permissions (database-driven; null = role defaults)
-- ---------------------------------------------------------------------------
ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS allowed_permissions JSONB;

COMMENT ON COLUMN public.crm_profiles.allowed_permissions IS
  'Optional explicit permission keys (e.g. sales.create). Null = role defaults.';

-- ---------------------------------------------------------------------------
-- 4) Secure invite links (single-use, time-limited, revocable)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_user_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.crm_profiles (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES public.crm_profiles (id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.crm_profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_user_invites_expiry_check CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_crm_user_invites_user
  ON public.crm_user_invites (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_user_invites_active
  ON public.crm_user_invites (token_hash)
  WHERE used_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.crm_user_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_user_invites_deny_client ON public.crm_user_invites;
CREATE POLICY crm_user_invites_deny_client ON public.crm_user_invites
  FOR ALL TO authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

-- ---------------------------------------------------------------------------
-- 5) Login attempt throttling (IP / identifier)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  ip_address TEXT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_login_attempts_identifier_created
  ON public.crm_login_attempts (identifier, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_login_attempts_ip_created
  ON public.crm_login_attempts (ip_address, created_at DESC);

ALTER TABLE public.crm_login_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_login_attempts_deny_client ON public.crm_login_attempts;
CREATE POLICY crm_login_attempts_deny_client ON public.crm_login_attempts
  FOR ALL TO authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

-- ---------------------------------------------------------------------------
-- 6) CEO helper: treat CEO_4 as executive
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_is_executive_role(role public.crm_app_role)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT role IN (
    'OWNER'::public.crm_app_role,
    'CEO_1'::public.crm_app_role,
    'CEO_2'::public.crm_app_role,
    'CEO_3'::public.crm_app_role,
    'CEO_4'::public.crm_app_role,
    'ADMIN'::public.crm_app_role
  );
$$;
