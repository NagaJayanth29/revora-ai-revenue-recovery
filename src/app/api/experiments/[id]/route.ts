import { NextResponse } from "next/server";
import { experimentLiftFromSnapshot } from "@/lib/analytics/from-snapshot";
import { loadMerchantSnapshot } from "@/lib/store/supabase-repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const snap = await loadMerchantSnapshot();
    const view = experimentLiftFromSnapshot(snap, id);
    if (!view) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(view, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load experiment" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
