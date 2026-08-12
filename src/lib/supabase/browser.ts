"use client";

import { createClient } from "@/lib/supabase/client";

/** Singleton browser Supabase client for PIN-only auth helpers. */
export const supabase = createClient();
