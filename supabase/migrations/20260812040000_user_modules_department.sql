-- Additive: department + allowed modules for CRM users.
-- Preserves existing rows; defaults applied for NULL allowed_modules.

ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS department TEXT;

ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS allowed_modules JSONB;

COMMENT ON COLUMN public.crm_profiles.department IS
  'Business department label (Sales, Accounts, Management, etc.).';

COMMENT ON COLUMN public.crm_profiles.allowed_modules IS
  'Optional JSON array of module keys. NULL = use role defaults.';

-- Ensure pin_changed tracking column name stays available for admin UI.
-- (pin_updated_at already exists on crm_user_login)
