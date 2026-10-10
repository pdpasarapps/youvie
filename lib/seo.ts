import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://mu-komik.com");

export function createPublicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
