export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createId } from "@/lib/utils";
import type { ConfidenceLevel } from "@/lib/domain/types";
import {
  getPolicyRules,
  getMerchantId,
  insertAudit,
  updatePolicyRules,
} from "@/lib/store/supabase-repo";

export async function GET() {
  try {
    const merchantId = await getMerchantId();
    const rules = await getPolicyRules(merchantId);
    return NextResponse.json(
      { policies: rules ? [rules] : [] },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load policies" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const merchantId = await getMerchantId();
    const rules = await getPolicyRules(merchantId);
    if (!rules) return NextResponse.json({ error: "No policies" }, { status: 404 });

    const updated = await updatePolicyRules(
      merchantId,
      {
        max_retry_attempts: Number(body.max_retry_attempts ?? rules.max_retry_attempts),
        min_retry_interval_minutes: Number(
          body.min_retry_interval_minutes ?? rules.min_retry_interval_minutes
        ),
        max_auto_action_amount: Number(body.max_auto_action_amount ?? rules.max_auto_action_amount),
        min_ai_confidence: (body.min_ai_confidence ?? rules.min_ai_confidence) as ConfidenceLevel,
        max_reminders_per_24h: Number(body.max_reminders_per_24h ?? rules.max_reminders_per_24h),
        high_risk_requires_approval: Boolean(
          body.high_risk_requires_approval ?? rules.high_risk_requires_approval
        ),
        allow_auto_retry: Boolean(body.allow_auto_retry ?? rules.allow_auto_retry),
        block_already_paid: Boolean(body.block_already_paid ?? rules.block_already_paid),
      },
      "merchant.ops"
    );

    await insertAudit({
      merchant_id: updated.merchant_id,
      opportunity_id: null,
      actor: "merchant.ops",
      actor_type: "MERCHANT",
      event: "POLICY_UPDATED",
      previous_state: null,
      new_state: null,
      reason: "Merchant updated recovery policies",
      ai_recommendation: null,
      policy_decision: null,
      execution_result: null,
      request_id: createId("req"),
      correlation_id: createId("corr"),
      metadata: { rules: updated },
    });

    return NextResponse.json({ policies: [updated] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update policies" },
      { status: 500 }
    );
  }
}
