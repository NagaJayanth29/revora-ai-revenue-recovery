/**
 * Shared Supabase public env helpers.
 * Never read SUPABASE_SECRET_KEY here — that belongs only in server.ts.
 */

function required(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

/**
 * Check whether Supabase browser configuration is present.
 * In Demo Mode, Supabase is disabled and credentials are not required.
 */
export function isSupabaseConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const pubKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return Boolean(url && pubKey);
}

/**
 * Check whether Supabase server configuration is present.
 * In Demo Mode, Supabase is disabled and credentials are not required.
 */
export function isSupabaseServerConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  return Boolean(url && secretKey);
}

/** Project URL for supabase-js (no /rest/v1 path). */
export function getSupabaseUrl(): string {
  const raw = required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  return raw.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

export function getSupabasePublishableKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

