import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublishableKey, getSupabaseUrl } from "./env";

let browserClient: SupabaseClient | undefined;

/**
 * Browser / client-component Supabase client.
 * Uses the publishable key only — never the secret key.
 */
export function createBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  browserClient = createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return browserClient;
}
