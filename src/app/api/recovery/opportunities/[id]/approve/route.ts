import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { executeRecovery } from "@/lib/recovery/executor";
import { updateOpportunity, writeAudit } from "@/lib/store/memory";
import { hydrateFromSupabase, persistOpportunityState } from "@/lib/store/hydrate";
import { createId } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await hydrateFromSupabase();
    const updated = updateOpportunity(id, {
      status: "READY",
      policy_status: "SAFE_TO_EXECUTE",
      autonomy_mode: "AUTO",
    });
    if (!updated) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    writeAudit({
      merchant_id: updated.merchant_id,
      opportunity_id: id,
      actor: "merchant.ops",
      actor_type: "MERCHANT",
      event: "APPROVED",
      previous_state: "AWAITING_APPROVAL",
      new_state: "READY",
      reason: "Merchant approved recovery action",
      ai_recommendation: updated.recommended_action,
      policy_decision: "SAFE_TO_EXECUTE",
      execution_result: null,
      request_id: createId("req"),
      correlation_id: updated.correlation_id,
      metadata: {},
    });

    const result = await executeRecovery(id, { approvedByMerchant: true, actor: "merchant.ops" });
    await persistOpportunityState(id);
    revalidatePath("/");
    revalidatePath("/queue");
    revalidatePath("/analytics");
    revalidatePath("/experiments");
    revalidatePath(`/opportunities/${id}`);
    return NextResponse.json(
      { ...result, demo_mode: true, simulated: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}
