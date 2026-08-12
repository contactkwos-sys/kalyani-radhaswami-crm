-- Role-tile + PIN auth (replaces mobile/OTP login).
-- Run in Supabase SQL Editor on the correct project org before seeding.
--
-- Seed flow:
--   1) Create auth users via api/admin-create-user (Netlify) or Admin API
--   2) Ensure matching crm_profiles rows exist (Admin, CEO, Accountant, Salesman 01/02)
--   3) INSERT into app_users linking profile_id + tile_key (see seed comments below)

-- Strip hardcoded "Thread" from company display names
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES public.crm_profiles (id) ON DELETE CASCADE,
  tile_key TEXT NOT NULL UNIQUE,
  tile_label TEXT NOT NULL,
  pin_hash TEXT,
  must_set_pin BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_users_tile_key_format CHECK (tile_key ~ '^[a-z0-9_]+$')
);

CREATE INDEX IF NOT EXISTS idx_app_users_active_sort
  ON public.app_users (is_active, sort_order);

DROP TRIGGER IF EXISTS trg_app_users_updated ON public.app_users;
CREATE TRIGGER trg_app_users_updated
  BEFORE UPDATE ON public.app_users
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

-- Clients never read pin_hash; public tile list uses a security-definer RPC.
DROP POLICY IF EXISTS app_users_deny_all ON public.app_users;
CREATE POLICY app_users_deny_all ON public.app_users
  FOR ALL TO authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

-- Public-safe tile catalog (no PIN material)
CREATE OR REPLACE FUNCTION public.list_login_tiles()
RETURNS TABLE (
  tile_key TEXT,
  tile_label TEXT,
  must_set_pin BOOLEAN,
  sort_order INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.tile_key, u.tile_label, u.must_set_pin OR u.pin_hash IS NULL, u.sort_order
  FROM public.app_users u
  JOIN public.crm_profiles p ON p.id = u.profile_id
  WHERE u.is_active AND p.is_active
  ORDER BY u.sort_order, u.tile_label;
$$;

REVOKE ALL ON FUNCTION public.list_login_tiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_login_tiles() TO anon, authenticated;

COMMENT ON TABLE public.app_users IS
  'Role-tile login identities. pin_hash is bcrypt; never expose to clients.';

-- Example seed (run AFTER creating auth users + crm_profiles):
-- INSERT INTO public.app_users (profile_id, tile_key, tile_label, must_set_pin, sort_order)
-- SELECT id, 'admin', 'Admin', TRUE, 10 FROM public.crm_profiles WHERE role = 'ADMIN' LIMIT 1;
-- INSERT INTO public.app_users (profile_id, tile_key, tile_label, must_set_pin, sort_order)
-- SELECT id, 'ceo', 'CEO (Kailash Kalyani)', TRUE, 20 FROM public.crm_profiles WHERE role IN ('CEO_1','OWNER') AND full_name ILIKE '%Kailash%' LIMIT 1;
-- INSERT INTO public.app_users (profile_id, tile_key, tile_label, must_set_pin, sort_order)
-- SELECT id, 'accountant', 'Accountant', TRUE, 30 FROM public.crm_profiles WHERE role = 'ACCOUNTANT' LIMIT 1;
-- INSERT INTO public.app_users (profile_id, tile_key, tile_label, must_set_pin, sort_order)
-- SELECT id, 'salesman_01', 'Salesman 01', TRUE, 40 FROM public.crm_profiles WHERE role = 'SALESMAN' ORDER BY created_at LIMIT 1;
-- INSERT INTO public.app_users (profile_id, tile_key, tile_label, must_set_pin, sort_order)
-- SELECT id, 'salesman_02', 'Salesman 02', TRUE, 50 FROM public.crm_profiles WHERE role = 'SALESMAN' ORDER BY created_at OFFSET 1 LIMIT 1;
