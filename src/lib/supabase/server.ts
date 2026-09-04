import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "./env";

/**
 * Server-only Supabase client.
 * Uses SUPABASE_SECRET_KEY (elevated privileges, bypasses RLS).
 * Must never be imported from client components or shared barrels.
 * Never called from Demo Mode execution paths.
 */
export function createServerClient(): SupabaseClient {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    throw new Error(
      "Supabase client cannot be initialized in Demo Mode (NEXT_PUBLIC_DEMO_MODE=true). Use in-memory Demo Store."
    );
  }

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

