import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { processRazorpayWebhook } from "@/lib/recovery/webhooks";
import { isDemoMode } from "@/lib/store/memory";
import { hydrateFromSupabase, persistOpportunityState } from "@/lib/store/hydrate";
import { insertWebhookEvent } from "@/lib/store/supabase-repo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  const demo = request.headers.get("x-revora-demo") === "true";

  if (!isDemoMode()) {
    try {
      await hydrateFromSupabase();
    } catch (err) {
      console.warn("[webhook] Hydrate fallback to memory store:", err instanceof Error ? err.message : err);
    }
  }

  const result = await processRazorpayWebhook({ rawBody, signature, demo });

  if (!isDemoMode()) {
    if (result.accepted && result.opportunity_id) {
      try {
        await persistOpportunityState(result.opportunity_id);
        revalidatePath("/");
        revalidatePath("/queue");
        revalidatePath("/analytics");
        revalidatePath("/experiments");
        revalidatePath(`/opportunities/${result.opportunity_id}`);
        revalidatePath("/api/dashboard/summary");
        revalidatePath("/api/recovery/opportunities");
        revalidatePath("/api/recovery/metrics");
      } catch (err) {
        console.error("[webhook] Persist opportunity error:", err instanceof Error ? err.message : err);
      }
    }

    try {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(rawBody);
      } catch {}
      await insertWebhookEvent({
        razorpay_event_id: result.event_id,
        event_type: String(parsed.event || "unknown"),
        payload: parsed,
        signature_valid: result.accepted || !result.message.toLowerCase().includes("signature"),
        processed: result.accepted,
        processing_error: result.accepted ? null : result.message,
      });
    } catch (err) {
      console.warn("[webhook] Persist webhook event error:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json(result, { status: result.accepted ? 200 : 400 });
}
