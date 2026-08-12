-- Developer / Owner Override foundation (server-side only).
-- Extends Mobile+PIN auth with primary-owner protection and developer flags.
-- DEVELOPER_OVERRIDE_KEY lives only in server env — never stored in DB plaintext.

ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS is_primary_owner BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS is_developer BOOLEAN NOT NULL DEFAULT FALSE;

-- At most one primary owner
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_profiles_primary_owner
  ON public.crm_profiles ((is_primary_owner))
  WHERE is_primary_owner = TRUE;

COMMENT ON COLUMN public.crm_profiles.is_primary_owner IS
  'Protected primary Owner (Kumaresh Budhia). Cannot be deleted/demoted via normal UI.';
COMMENT ON COLUMN public.crm_profiles.is_developer IS
  'Owner/Developer flag. Required with DEVELOPER_OVERRIDE_KEY for elevated override ops.';

-- Soft-delete / restore support for profiles (deactivate already uses is_active)
ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES public.crm_profiles (id);

-- Audit enrichment: success/failure lives in metadata.success; strip override secrets
CREATE OR REPLACE FUNCTION public.crm_write_audit_log(
  p_action TEXT,
  p_module TEXT,
  p_company_id UUID DEFAULT NULL,
  p_record_type TEXT DEFAULT NULL,
  p_record_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  p_metadata := p_metadata
    - 'pin'
    - 'current_pin'
    - 'new_pin'
    - 'confirm_pin'
    - 'pin_hash'
    - 'OWNER_OVERRIDE_PIN'
    - 'DEVELOPER_OVERRIDE_KEY'
    - 'developer_override_key'
    - 'override_key'
    - 'password'
    - 'token'
    - 'device_token';
  INSERT INTO public.crm_audit_logs (company_id, user_id, action, module, record_type, record_id, metadata)
  VALUES (p_company_id, auth.uid(), p_action, p_module, p_record_type, p_record_id, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Helper: is active owner-developer (for potential RLS gates)
CREATE OR REPLACE FUNCTION public.crm_is_owner_developer()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_profiles
    WHERE id = auth.uid()
      AND role = 'OWNER'
      AND is_developer = TRUE
      AND is_active = TRUE
  );
$$;

GRANT EXECUTE ON FUNCTION public.crm_is_owner_developer() TO authenticated;

-- Role permission overrides (optional JSON blob managed by Owner/Developer)
INSERT INTO public.crm_app_settings (company_id, key, value, is_public)
SELECT NULL, 'security_role_permissions', '{}', FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM public.crm_app_settings s
  WHERE s.company_id IS NULL AND s.key = 'security_role_permissions'
);

INSERT INTO public.crm_app_settings (company_id, key, value, is_public)
SELECT NULL, 'security_lockout_policy', '{"max_failed_attempts":5,"lockout_minutes":15}', FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM public.crm_app_settings s
  WHERE s.company_id IS NULL AND s.key = 'security_lockout_policy'
);
