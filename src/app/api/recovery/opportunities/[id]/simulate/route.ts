import { NextResponse } from "next/server";
import { compareInterventions } from "@/lib/recovery/probability-model";
import { hydrateFromSupabase } from "@/lib/store/hydrate";
import { getOpportunityDetail } from "@/lib/store/supabase-repo";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const resolved = ctx?.params ? await ctx.params : undefined;
    let id = resolved?.id ? String(resolved.id).trim() : undefined;
    if (!id || id === "undefined" || id === "null") {
      try {
        const url = new URL(request.url);
        const match = url.pathname.match(/\/opportunities\/([^/]+)\/simulate/);
        if (match && match[1]) id = decodeURIComponent(match[1]).trim();
      } catch {
        // ignore
      }
    }
    if (!id || id === "undefined" || id === "null") {
      return NextResponse.json(
        { error: "Invalid opportunity ID" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    const body = await request.json().catch(() => ({}));
    await hydrateFromSupabase();
    const detail = await getOpportunityDetail(id);
    if (!detail?.opportunity) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Always score live from the decision engine — never reuse seeded hardcoded probs.
    const decision = compareInterventions(
      detail.opportunity,
      detail.customer,
      detail.payment
    );

    const action = body.action as string | undefined;
    const selected = action
      ? decision.alternatives.find((a) => a.action === action)
      : decision.alternatives[0];

    return NextResponse.json({
      decision,
      selected,
      note: "Simulation only — no execution performed. MODEL ESTIMATE from recovery_probability@v0.1-demo.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}
