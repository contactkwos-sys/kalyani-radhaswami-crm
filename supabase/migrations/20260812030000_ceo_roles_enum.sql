-- Part A: add CEO enum values only (must commit before values are usable).

DO $$ BEGIN
  ALTER TYPE public.crm_app_role ADD VALUE IF NOT EXISTS 'CEO_1';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.crm_app_role ADD VALUE IF NOT EXISTS 'CEO_2';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.crm_app_role ADD VALUE IF NOT EXISTS 'CEO_3';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
