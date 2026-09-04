import { NextResponse } from "next/server";
import { getOpportunityDetail } from "@/lib/store/supabase-repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const detail = await getOpportunityDetail(id);
    if (!detail) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(detail, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load opportunity" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
