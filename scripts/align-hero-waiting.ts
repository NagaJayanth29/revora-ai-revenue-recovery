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

  const heroId = "a0000000-0000-4000-8000-000000000051";

  // 1. Delete previous synthetic demo outcomes for hero so the real webhook is the single source of truth
  const { error: delErr } = await sb
    .from("recovery_outcomes")
    .delete()
    .eq("opportunity_id", heroId);
  console.log("Deleted old outcomes:", delErr?.message ?? "ok");

  // 2. Align opportunity state to WAITING_FOR_OUTCOME with plink_TXf59BB7H4fmeX
  const { error: oppErr } = await sb
    .from("recovery_opportunities")
    .update({
      status: "WAITING_FOR_OUTCOME",
      actual_recovered_amount: 0,
      incremental_recovered_amount: 0,
      attempt_count: 1,
      recommended_action: "PAYMENT_LINK",
      policy_status: "SAFE_TO_EXECUTE",
      autonomy_mode: "AUTO",
      last_action_at: new Date().toISOString(),
      metadata: {
        demo_seed: true,
        payment_method: "upi",
        payment_link_id: "plink_TXf59BB7H4fmeX",
        payment_link_url: "https://rzp.io/rzp/PrqDfid",
        reference_id: "revora_test_6cc115b7dd1e4a3e",
      },
    })
    .eq("id", heroId);
  console.log("Updated opportunity to WAITING_FOR_OUTCOME:", oppErr?.message ?? "ok");

  // 3. Upsert action record for the real Razorpay payment link
  const actionId = "a0000000-0000-4000-8000-0000000000a1";
  const { error: actErr } = await sb.from("recovery_actions").upsert(
    {
      id: actionId,
      merchant_id: "a0000000-0000-4000-8000-000000000001",
      opportunity_id: heroId,
      action_type: "PAYMENT_LINK",
      status: "succeeded",
      executor: "razorpay",
      request_payload: {
        amount: 4800000,
        currency: "INR",
        reference_id: "revora_test_6cc115b7dd1e4a3e",
        capability: "RAZORPAY_TEST",
      },
      response_payload: {
        mode: "RAZORPAY_TEST",
        id: "plink_TXf59BB7H4fmeX",
        payment_link_id: "plink_TXf59BB7H4fmeX",
        short_url: "https://rzp.io/rzp/PrqDfid",
        amount: 4800000,
        status: "created",
        reference_id: "revora_test_6cc115b7dd1e4a3e",
        capability: "RAZORPAY_TEST",
      },
      error_message: null,
      idempotency_key: "plink_a0000000000040008000000000000051_0",
      correlation_id: "corr_demo_48000",
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  console.log("Upserted action record:", actErr?.message ?? "ok");

  // 4. Verify updated state
  const { data: check } = await sb
    .from("recovery_opportunities")
    .select("id, status, actual_recovered_amount, metadata")
    .eq("id", heroId)
    .single();
  console.log("Hero current state in Supabase:", check);
}

main().catch(console.error);
