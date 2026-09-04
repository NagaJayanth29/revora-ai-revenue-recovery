import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { analyzeOpportunity } from "@/lib/recovery/executor";
import { getStore } from "@/lib/store/memory";
import { hydrateFromSupabase, persistOpportunityState } from "@/lib/store/hydrate";

export const dynamic = "force-dynamic";

/**
 * Re-analyze: hydrate current Supabase state → feature extract → model →
 * counterfactuals → policy → persist recommendation. Never creates outcomes.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const resolved = ctx?.params ? await ctx.params : undefined;
  let id = resolved?.id ? String(resolved.id).trim() : undefined;
  if (!id || id === "undefined" || id === "null") {
    try {
      const url = new URL(request.url);
      const match = url.pathname.match(/\/opportunities\/([^/]+)\/analyze/);
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
  try {
    await hydrateFromSupabase();
    const outcomeCountBefore = getStore().outcomes.filter((o) => o.opportunity_id === id).length;

    const result = analyzeOpportunity(id);
    await persistOpportunityState(id);

    const outcomeCountAfter = getStore().outcomes.filter((o) => o.opportunity_id === id).length;

    revalidatePath(`/opportunities/${id}`);
    revalidatePath("/queue");
    revalidatePath("/");

    return NextResponse.json(
      {
        ...result,
        outcomes_created: outcomeCountAfter - outcomeCountBefore,
        note: result.analysis_only
          ? "Analysis only — terminal opportunity status preserved; execution not authorized."
          : "Recommendation refreshed from recovery_probability model.",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("[analyze]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}
