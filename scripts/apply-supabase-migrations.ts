/**
 * Apply supabase/migrations/*.sql to the linked Postgres database.
 *
 * Requires one of:
 *   SUPABASE_DB_URL / DATABASE_URL  — full postgres connection string
 *   SUPABASE_DB_PASSWORD            — builds URI for project ref from NEXT_PUBLIC_SUPABASE_URL
 *
 * Run: npx tsx scripts/apply-supabase-migrations.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  try {
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
  } catch {
    // optional
  }
}

function projectRefFromUrl(url: string): string | null {
  try {
    const host = new URL(url.replace(/\/rest\/v1\/?$/i, "")).hostname;
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function resolveDbUrl(): string {
  const direct = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (direct?.trim()) return direct.trim();

  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const pub = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!password || !pub) {
    throw new Error(
      "Missing DB credentials. Set SUPABASE_DB_URL (or DATABASE_URL), or SUPABASE_DB_PASSWORD plus NEXT_PUBLIC_SUPABASE_URL."
    );
  }

  const ref = projectRefFromUrl(pub);
  if (!ref) {
    throw new Error(`Could not parse project ref from NEXT_PUBLIC_SUPABASE_URL=${pub}`);
  }

  const encoded = encodeURIComponent(password);
  const region = process.env.SUPABASE_DB_REGION?.trim() || "ap-southeast-1";
  // Session pooler (IPv4-friendly). Override region with SUPABASE_DB_REGION if needed.
  return `postgresql://postgres.${ref}:${encoded}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
}

async function main() {
  loadEnvLocal();

  const migrationsDir = resolve(process.cwd(), "supabase/migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    throw new Error("No .sql files found in supabase/migrations");
  }

  const connectionString = resolveDbUrl();
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  console.log("Connecting…");
  await client.connect();
  console.log("Connected. Applying", files.length, "migration(s).");

  await client.query(`
    create table if not exists public.revora_schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  for (const file of files) {
    const { rows } = await client.query(
      `select 1 from public.revora_schema_migrations where filename = $1`,
      [file]
    );
    if (rows.length > 0) {
      console.log(`SKIP ${file} (already applied)`);
      continue;
    }

    const sql = readFileSync(resolve(migrationsDir, file), "utf8");
    console.log(`APPLY ${file}…`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(
        `insert into public.revora_schema_migrations (filename) values ($1)`,
        [file]
      );
      await client.query("commit");
      console.log(`OK   ${file}`);
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  }

  const tables = await client.query(`
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename not in ('revora_schema_migrations')
    order by tablename
  `);
  console.log("Tables:", tables.rows.map((r) => r.tablename).join(", "));

  const merchants = await client.query(`select count(*)::int as n from merchants`);
  const opps = await client.query(`select count(*)::int as n from recovery_opportunities`);
  console.log(`Seed check: merchants=${merchants.rows[0].n}, opportunities=${opps.rows[0].n}`);

  await client.end();
  console.log("SUCCESS: migrations applied.");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
