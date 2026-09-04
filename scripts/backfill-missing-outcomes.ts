/**
 * Backfill verified recovery_outcomes for RECOVERED opportunities missing an outcome row.
 * Root cause: prefixed createId() values are invalid for uuid columns and were silently dropped.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );

  const { data: recovered, error } = await sb
    .from("recovery_opportunities")
    .select(
      "id,merchant_id,amount,actual_recovered_amount,incremental_recovered_amount,baseline_probability,resolved_at,status"
    )
    .eq("status", "RECOVERED");

  if (error) throw error;

  let inserted = 0;
  for (const opp of recovered ?? []) {
    const { data: existing } = await sb
      .from("recovery_outcomes")
      .select("id")
      .eq("opportunity_id", opp.id)
      .limit(1);
    if (existing && existing.length > 0) continue;
    if (!opp.actual_recovered_amount) continue;

    const baselineExpected = Math.round(
      Number(opp.amount) * Number(opp.baseline_probability ?? 0.2)
    );
    const row = {
      id: randomUUID(),
      merchant_id: opp.merchant_id,
      opportunity_id: opp.id,
      action_id: null,
      actual_recovered_amount: opp.actual_recovered_amount,
      incremental_recovered_amount:
        opp.incremental_recovered_amount ||
        Math.max(0, opp.actual_recovered_amount - baselineExpected),
      baseline_expected: baselineExpected,
      verified_via: "demo",
      payment_status: "captured",
      created_at: opp.resolved_at ?? new Date().toISOString(),
    };
    const { error: insErr } = await sb.from("recovery_outcomes").insert(row);
    if (insErr) {
      console.error("insert failed", opp.id, insErr.message);
    } else {
      inserted += 1;
      console.log("backfilled outcome for", opp.id, row.actual_recovered_amount);
    }
  }

  const { data: allOuts } = await sb
    .from("recovery_outcomes")
    .select("opportunity_id,actual_recovered_amount");
  const total = (allOuts ?? []).reduce((s, o) => s + o.actual_recovered_amount, 0);
  console.log(
    JSON.stringify({ inserted, outcome_count: allOuts?.length ?? 0, total_actual_paise: total })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
