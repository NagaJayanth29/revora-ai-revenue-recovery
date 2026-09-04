import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "./env";

/**
 * Server-only Supabase client.
 * Uses SUPABASE_SECRET_KEY (elevated privileges, bypasses RLS).
 * Must never be imported from client components or shared barrels.
 */
export function createServerClient(): SupabaseClient {
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("Missing required environment variable: SUPABASE_SECRET_KEY");
  }

  return createClient(getSupabaseUrl(), secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
