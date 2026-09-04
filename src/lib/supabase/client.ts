import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublishableKey, getSupabaseUrl, isSupabaseConfigured } from "./env";

let browserClient: SupabaseClient | undefined;

/**
 * Browser / client-component Supabase client.
 * Uses the publishable key only — never the secret key.
 * Returns null in Demo Mode or when Supabase is not configured.
 */
export function createBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (browserClient) return browserClient;

  browserClient = createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return browserClient;
}

