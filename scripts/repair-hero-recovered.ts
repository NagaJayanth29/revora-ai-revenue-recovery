/**
 * Repair hero after accidental second execute during stale-server testing.
 * Restores RECOVERED + attempts=2 and removes the extra outcome only.
 */
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

  const { data: outs } = await sb
    .from("recovery_outcomes")
    .select("id,created_at")
    .eq("opportunity_id", id)
    .order("created_at", { ascending: true });

  if ((outs?.length ?? 0) > 1) {
    const extra = outs!.slice(1);
    for (const row of extra) {
      const { error } = await sb.from("recovery_outcomes").delete().eq("id", row.id);
      console.log("deleted extra outcome", row.id, error?.message ?? "ok");
    }
  }

  const { error } = await sb
    .from("recovery_opportunities")
    .update({
      status: "RECOVERED",
      attempt_count: 2,
      actual_recovered_amount: 4_800_000,
      policy_status: "BLOCKED",
      policy_reason: "Already RECOVERED — execution blocked",
      autonomy_mode: "BLOCKED",
    })
    .eq("id", id);

  console.log("opp repair", error?.message ?? "ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
