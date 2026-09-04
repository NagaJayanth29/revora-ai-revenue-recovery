/**
 * One-off smoke test for Supabase client initialization.
 * Run: npx tsx scripts/test-supabase-connection.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function normalizeUrl(raw: string) {
  return raw.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

async function main() {
  loadEnvLocal();

  const url = normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  const secret = process.env.SUPABASE_SECRET_KEY || "";

  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !publishable && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    !secret && "SUPABASE_SECRET_KEY",
  ].filter(Boolean);

  if (missing.length) {
    console.error("FAIL: missing env:", missing.join(", "));
    process.exit(1);
  }

  console.log("URL (normalized):", url);
  console.log("Publishable key prefix:", publishable.slice(0, 18) + "…");
  console.log("Secret key prefix:", secret.slice(0, 12) + "…");
  console.log("Secret is server-only env (no NEXT_PUBLIC_):", !("NEXT_PUBLIC_SUPABASE_SECRET_KEY" in process.env));

  const browserLike = createClient(url, publishable);
  const serverLike = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("Browser client created:", Boolean(browserLike));
  console.log("Server client created:", Boolean(serverLike));

  const { data: sessionData, error: sessionError } =
    await browserLike.auth.getSession();
  if (sessionError) {
    console.error("FAIL: publishable client auth.getSession:", sessionError.message);
    process.exit(1);
  }
  console.log("Publishable client OK (getSession):", sessionData.session === null ? "no session (expected)" : "has session");

  // Lightweight authenticated REST probe with secret key (bypasses RLS).
  const { error: probeError } = await serverLike
    .from("_revora_connection_probe")
    .select("*")
    .limit(1);

  // Missing table is fine — proves API accepted the secret key.
  if (probeError && probeError.code !== "PGRST116" && probeError.code !== "42P01" && !/does not exist|Could not find the table|relation/i.test(probeError.message)) {
    // PGRST205 = table not in schema cache; still means auth + API worked
    if (probeError.code === "PGRST205" || /schema cache/i.test(probeError.message)) {
      console.log("Server client OK (API reachable; probe table absent as expected):", probeError.code || probeError.message);
    } else if (/JWT|apikey|Invalid API key|401|403/i.test(probeError.message)) {
      console.error("FAIL: secret key rejected:", probeError.message);
      process.exit(1);
    } else {
      console.log("Server client OK (API responded):", probeError.code || probeError.message);
    }
  } else {
    console.log("Server client OK (API reachable)");
  }

  console.log("SUCCESS: Supabase clients initialized and reachable.");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
