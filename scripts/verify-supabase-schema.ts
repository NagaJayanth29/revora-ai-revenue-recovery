/**
 * Verify REVORA schema + demo seed on remote Supabase.
 * Does not print secrets. Run: npx tsx scripts/verify-supabase-schema.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

function loadEnvLocal() {
  const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
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

function dbUrl(): string {
  const password = process.env.SUPABASE_DB_PASSWORD!.trim();
  const pub = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/rest\/v1\/?$/i, "");
  const ref = new URL(pub).hostname.split(".")[0];
  const region = process.env.SUPABASE_DB_REGION?.trim() || "ap-southeast-1";
  return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
}

const EXPECTED_TABLES = [
  "merchants",
  "users",
  "customers",
  "orders",
  "payments",
  "transactions",
  "recovery_opportunities",
  "interventions",
  "ai_recommendations",
  "policy_rules",
  "policy_decisions",
  "recovery_actions",
  "webhook_events",
  "audit_events",
  "recovery_outcomes",
  "experiments",
  "experiment_assignments",
  "experiment_results",
  "system_incidents",
  "copilot_sessions",
  "copilot_messages",
] as const;

async function main() {
  loadEnvLocal();
  const client = new pg.Client({
    connectionString: dbUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const failures: string[] = [];

  const tables = await client.query<{ tablename: string }>(`
    select tablename from pg_tables
    where schemaname = 'public' and tablename = any($1::text[])
    order by tablename
  `, [EXPECTED_TABLES as unknown as string[]]);
  const found = new Set(tables.rows.map((r) => r.tablename));
  const missing = EXPECTED_TABLES.filter((t) => !found.has(t));
  console.log(`Tables present: ${found.size}/21`);
  if (missing.length) {
    failures.push(`Missing tables: ${missing.join(", ")}`);
    console.log("FAIL missing:", missing.join(", "));
  } else {
    console.log("OK all 21 REVORA tables exist");
  }

  const rls = await client.query<{ tablename: string; rls: boolean }>(`
    select c.relname as tablename, c.relrowsecurity as rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname = any($1::text[])
    order by c.relname
  `, [EXPECTED_TABLES as unknown as string[]]);
  const noRls = rls.rows.filter((r) => !r.rls).map((r) => r.tablename);
  if (noRls.length) {
    failures.push(`RLS disabled: ${noRls.join(", ")}`);
    console.log("FAIL RLS disabled on:", noRls.join(", "));
  } else {
    console.log("OK RLS enabled on all 21 application tables");
  }

  const merchant = await client.query(`
    select id, name, slug from merchants where slug = 'aurora-commerce'
  `);
  console.log(`Merchants aurora-commerce: ${merchant.rowCount}`);
  if (merchant.rowCount !== 1) {
    failures.push(`Expected 1 Aurora Commerce merchant, got ${merchant.rowCount}`);
  } else {
    console.log("OK Aurora Commerce seed merchant exists");
  }

  const hero = await client.query(`
    select id, amount, status, recommended_action, correlation_id
    from recovery_opportunities
    where amount = 4800000 and correlation_id = 'corr_demo_48000'
  `);
  console.log(`Hero ₹48,000 opportunities: ${hero.rowCount}`);
  if (hero.rowCount !== 1) {
    failures.push(`Expected 1 hero opportunity, got ${hero.rowCount}`);
  } else {
    const h = hero.rows[0];
    console.log(`OK hero opportunity status=${h.status} action=${h.recommended_action}`);
    if (h.status !== "READY" || h.recommended_action !== "RETRY_LATER") {
      failures.push(`Hero expected READY/RETRY_LATER, got ${h.status}/${h.recommended_action}`);
    }
  }

  const counts = await client.query(`
    select
      (select count(*)::int from recovery_opportunities) as opportunities,
      (select count(*)::int from ai_recommendations) as recommendations,
      (select count(*)::int from recovery_actions) as actions,
      (select count(*)::int from recovery_outcomes) as outcomes,
      (select count(*)::int from experiments) as experiments,
      (select count(*)::int from experiment_assignments) as assignments,
      (select count(*)::int from audit_events) as audit_events,
      (select count(*)::int from customers) as customers,
      (select count(*)::int from policy_decisions) as policy_decisions,
      (select count(*)::int from merchants) as merchants,
      (select count(*)::int from interventions) as interventions
  `);
  const c = counts.rows[0];
  console.log("Counts:", c);

  const expected: Record<string, number> = {
    merchants: 1,
    customers: 5,
    opportunities: 7,
    recommendations: 7,
    actions: 1,
    outcomes: 1,
    experiments: 1,
    assignments: 7,
    audit_events: 4,
    policy_decisions: 7,
    interventions: 6,
  };
  for (const [key, want] of Object.entries(expected)) {
    const got = Number(c[key]);
    if (got !== want) {
      failures.push(`Count ${key}: expected ${want}, got ${got}`);
      console.log(`FAIL count ${key}: expected ${want}, got ${got}`);
    } else {
      console.log(`OK count ${key}=${got}`);
    }
  }

  // Duplicate checks on deterministic keys
  const dups = await client.query(`
    select 'merchants_slug' as kind, count(*)::int as n from (
      select slug from merchants group by slug having count(*) > 1
    ) s
    union all
    select 'hero_corr', count(*)::int from (
      select correlation_id from recovery_opportunities
      where correlation_id = 'corr_demo_48000'
      group by correlation_id having count(*) > 1
    ) s
    union all
    select 'intervention_codes', count(*)::int from (
      select code from interventions group by code having count(*) > 1
    ) s
  `);
  const dupIssues = dups.rows.filter((r) => Number(r.n) > 0);
  if (dupIssues.length) {
    failures.push(`Duplicates detected: ${JSON.stringify(dupIssues)}`);
    console.log("FAIL duplicates:", dupIssues);
  } else {
    console.log("OK no duplicate seed keys detected");
  }

  // Re-run seed migration should stay idempotent — check migration ledger
  const mig = await client.query(`
    select filename from public.revora_schema_migrations order by filename
  `);
  console.log(
    "Migrations recorded:",
    mig.rows.map((r) => r.filename).join(", ")
  );

  await client.end();

  if (failures.length) {
    console.error("VERIFICATION FAILED:");
    for (const f of failures) console.error("-", f);
    process.exit(1);
  }
  console.log("VERIFICATION PASSED");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
