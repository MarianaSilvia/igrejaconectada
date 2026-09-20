import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const browserGlobal = globalThis as typeof globalThis & {
    __igrejaConectadaSupabase?: SupabaseClient;
  };

  if (!browserGlobal.__igrejaConectadaSupabase) {
    browserGlobal.__igrejaConectadaSupabase = createClient(supabaseUrl, supabaseAnonKey);
  }

  return browserGlobal.__igrejaConectadaSupabase;
}
