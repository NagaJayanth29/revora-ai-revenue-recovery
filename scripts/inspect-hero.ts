import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

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
  const id = "a0000000-0000-4000-8000-000000000051";
  const opp = await sb
    .from("recovery_opportunities")
    .select(
      "id,status,attempt_count,recovery_probability,expected_recovery_value,baseline_probability,policy_status,actual_recovered_amount,recommended_action"
    )
    .eq("id", id)
    .single();
  const recs = await sb
    .from("ai_recommendations")
    .select("id,recovery_probability,model_version,created_at,explanation")
    .eq("opportunity_id", id)
    .order("created_at", { ascending: false });
  const outs = await sb
    .from("recovery_outcomes")
    .select("id,actual_recovered_amount,verified_via,created_at")
    .eq("opportunity_id", id);
  console.log(JSON.stringify({ opp: opp.data, recs: recs.data, outs: outs.data }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
