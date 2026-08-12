-- Fix app_users.updated_at (older stub tables lacked this column).
-- mark_pin_set was failing: column "updated_at" of relation "app_users" does not exist

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_users_updated ON public.app_users;
CREATE TRIGGER trg_app_users_updated
  BEFORE UPDATE ON public.app_users
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

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

NOTIFY pgrst, 'reload schema';
