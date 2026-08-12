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
