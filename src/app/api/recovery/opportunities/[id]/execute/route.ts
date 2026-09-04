import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { executeRecovery } from "@/lib/recovery/executor";
import { hydrateFromSupabase, persistOpportunityState } from "@/lib/store/hydrate";
import type { InterventionType } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  try {
    await hydrateFromSupabase();
    const result = await executeRecovery(id, {
      action: body.action as InterventionType | undefined,
      approvedByMerchant: Boolean(body.approved),
      actor: "merchant.ops",
    });
    await persistOpportunityState(id);
    revalidatePath("/");
    revalidatePath("/queue");
    revalidatePath("/analytics");
    revalidatePath("/experiments");
    revalidatePath(`/opportunities/${id}`);
    revalidatePath("/api/dashboard/summary");
    revalidatePath("/api/recovery/opportunities");
    revalidatePath("/api/recovery/metrics");
    revalidatePath("/api/experiments");
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
