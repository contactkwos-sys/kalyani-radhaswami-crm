"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import type { SearchHit } from "@/types/intelligence";

export async function globalSearch(query: string): Promise<SearchHit[]> {
  await requireProfile();
  const q = query.trim();
  if (q.length < 2) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_global_search", {
    p_query: q,
    p_limit: 25,
  });
  if (error) throw new Error(error.message);
  return (data || []) as SearchHit[];
}
