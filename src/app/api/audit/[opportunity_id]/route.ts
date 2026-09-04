import { NextResponse } from "next/server";
import { listAudit } from "@/lib/store/supabase-repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _: Request,
  ctx: { params: Promise<{ opportunity_id: string }> }
) {
  try {
    const { opportunity_id } = await ctx.params;
    const events = await listAudit(opportunity_id);
    return NextResponse.json(
      { events },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load audit" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
