-- Phase 6: Application backup, restore history, Google Drive connection, schedules
-- Additive only — does not alter Phase 1–5 business tables

DO $$ BEGIN
  CREATE TYPE public.crm_backup_type AS ENUM (
    'MANUAL',
    'AUTOMATIC_DAILY',
    'AUTOMATIC_WEEKLY',
    'AUTOMATIC_MONTHLY',
    'SAFETY_BEFORE_RESTORE',
    'MODULE_EXPORT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_backup_status AS ENUM (
    'SUCCESS',
    'FAILED',
    'PARTIAL',
    'RESTORED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_drive_status AS ENUM (
    'NOT_CONFIGURED',
    'SKIPPED',
    'PENDING',
    'SUCCESS',
    'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.crm_backup_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.crm_companies (id) ON DELETE CASCADE,
  automatic_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  frequency TEXT NOT NULL DEFAULT 'DAILY'
    CHECK (frequency IN ('DAILY', 'WEEKLY', 'MONTHLY')),
  backup_hour_ist INTEGER NOT NULL DEFAULT 4 CHECK (backup_hour_ist BETWEEN 0 AND 23),
  backup_minute_ist INTEGER NOT NULL DEFAULT 30 CHECK (backup_minute_ist BETWEEN 0 AND 59),
  include_all_companies BOOLEAN NOT NULL DEFAULT TRUE,
  google_drive_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  accountant_export_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  last_auto_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_backup_settings_global
  ON public.crm_backup_settings ((company_id IS NULL))
  WHERE company_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_backup_settings_company
  ON public.crm_backup_settings (company_id)
  WHERE company_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_crm_backup_settings_updated ON public.crm_backup_settings;
CREATE TRIGGER trg_crm_backup_settings_updated
  BEFORE UPDATE ON public.crm_backup_settings
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

INSERT INTO public.crm_backup_settings (company_id, automatic_enabled, frequency)
SELECT NULL, FALSE, 'DAILY'
WHERE NOT EXISTS (
  SELECT 1 FROM public.crm_backup_settings WHERE company_id IS NULL
);

-- Google OAuth tokens stored server-side only (never select to client roles except owner via RPC)
CREATE TABLE IF NOT EXISTS public.crm_drive_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connected_by UUID NOT NULL REFERENCES public.crm_profiles (id) ON DELETE CASCADE,
  google_email TEXT,
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  token_expiry TIMESTAMPTZ,
  root_folder_id TEXT,
  daily_folder_id TEXT,
  weekly_folder_id TEXT,
  monthly_folder_id TEXT,
  scopes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_error TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_crm_drive_connections_updated ON public.crm_drive_connections;
CREATE TRIGGER trg_crm_drive_connections_updated
  BEFORE UPDATE ON public.crm_drive_connections
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

CREATE TABLE IF NOT EXISTS public.crm_backup_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type public.crm_backup_type NOT NULL DEFAULT 'MANUAL',
  status public.crm_backup_status NOT NULL DEFAULT 'SUCCESS',
  drive_status public.crm_drive_status NOT NULL DEFAULT 'SKIPPED',
  company_scope TEXT NOT NULL DEFAULT 'ALL',
  company_ids UUID[] NOT NULL DEFAULT '{}',
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  storage_path TEXT,
  drive_file_id TEXT,
  drive_web_link TEXT,
  app_version TEXT,
  record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_records INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_by UUID REFERENCES public.crm_profiles (id),
  restored_at TIMESTAMPTZ,
  restored_by UUID REFERENCES public.crm_profiles (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_backup_jobs_created
  ON public.crm_backup_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_backup_jobs_status
  ON public.crm_backup_jobs (status);
CREATE INDEX IF NOT EXISTS idx_crm_backup_jobs_type
  ON public.crm_backup_jobs (backup_type);

-- Pending restore sessions (validated preview before confirm)
CREATE TABLE IF NOT EXISTS public.crm_restore_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.crm_profiles (id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('MERGE', 'FULL')),
  file_name TEXT NOT NULL,
  storage_path TEXT,
  preview JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_valid BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  safety_backup_id UUID REFERENCES public.crm_backup_jobs (id),
  status TEXT NOT NULL DEFAULT 'PREVIEW'
    CHECK (status IN ('PREVIEW', 'CONFIRMED', 'COMPLETED', 'FAILED', 'CANCELLED')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours')
);

CREATE INDEX IF NOT EXISTS idx_crm_restore_sessions_user
  ON public.crm_restore_sessions (created_by, created_at DESC);

-- Storage bucket for backup artifacts (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('crm-backups', 'crm-backups', FALSE, 104857600)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.crm_backup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_drive_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_backup_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_restore_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_backup_settings_select ON public.crm_backup_settings;
CREATE POLICY crm_backup_settings_select ON public.crm_backup_settings
  FOR SELECT TO authenticated
  USING (public.crm_is_admin_or_owner());

DROP POLICY IF EXISTS crm_backup_settings_write ON public.crm_backup_settings;
CREATE POLICY crm_backup_settings_write ON public.crm_backup_settings
  FOR ALL TO authenticated
  USING (public.crm_is_admin_or_owner())
  WITH CHECK (public.crm_is_admin_or_owner());

-- Drive tokens: only OWNER can read/write (Admin configures with Owner for restore)
DROP POLICY IF EXISTS crm_drive_select ON public.crm_drive_connections;
CREATE POLICY crm_drive_select ON public.crm_drive_connections
  FOR SELECT TO authenticated
  USING (public.crm_is_owner());

DROP POLICY IF EXISTS crm_drive_write ON public.crm_drive_connections;
CREATE POLICY crm_drive_write ON public.crm_drive_connections
  FOR ALL TO authenticated
  USING (public.crm_is_owner())
  WITH CHECK (public.crm_is_owner());

DROP POLICY IF EXISTS crm_backup_jobs_select ON public.crm_backup_jobs;
CREATE POLICY crm_backup_jobs_select ON public.crm_backup_jobs
  FOR SELECT TO authenticated
  USING (
    public.crm_is_admin_or_owner()
    OR (
      public.crm_current_user_role() = 'ACCOUNTANT'
      AND EXISTS (
        SELECT 1 FROM public.crm_backup_settings s
        WHERE s.accountant_export_allowed = TRUE
          AND (s.company_id IS NULL OR public.crm_user_has_company_access(s.company_id))
      )
    )
  );

DROP POLICY IF EXISTS crm_backup_jobs_write ON public.crm_backup_jobs;
CREATE POLICY crm_backup_jobs_write ON public.crm_backup_jobs
  FOR ALL TO authenticated
  USING (public.crm_is_admin_or_owner())
  WITH CHECK (public.crm_is_admin_or_owner());

DROP POLICY IF EXISTS crm_restore_select ON public.crm_restore_sessions;
CREATE POLICY crm_restore_select ON public.crm_restore_sessions
  FOR SELECT TO authenticated
  USING (public.crm_is_owner() AND created_by = auth.uid());

DROP POLICY IF EXISTS crm_restore_write ON public.crm_restore_sessions;
CREATE POLICY crm_restore_write ON public.crm_restore_sessions
  FOR ALL TO authenticated
  USING (public.crm_is_owner() AND created_by = auth.uid())
  WITH CHECK (public.crm_is_owner() AND created_by = auth.uid());

-- Storage policies: authenticated owner/admin via path prefix user id not required — service role used from API
DROP POLICY IF EXISTS crm_backups_storage_select ON storage.objects;
CREATE POLICY crm_backups_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'crm-backups'
    AND public.crm_is_admin_or_owner()
  );

DROP POLICY IF EXISTS crm_backups_storage_insert ON storage.objects;
CREATE POLICY crm_backups_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'crm-backups'
    AND public.crm_is_admin_or_owner()
  );

DROP POLICY IF EXISTS crm_backups_storage_delete ON storage.objects;
CREATE POLICY crm_backups_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'crm-backups'
    AND public.crm_is_admin_or_owner()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_backup_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_drive_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_backup_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_restore_sessions TO authenticated;
