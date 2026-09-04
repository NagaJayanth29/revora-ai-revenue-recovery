import { NextResponse } from "next/server";
import { listAudit } from "@/lib/store/supabase-repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
  ctx: { params: Promise<{ opportunity_id: string }> }
) {
  try {
    const resolved = ctx?.params ? await ctx.params : undefined;
    let opportunity_id = resolved?.opportunity_id ? String(resolved.opportunity_id).trim() : undefined;
    if (!opportunity_id || opportunity_id === "undefined" || opportunity_id === "null") {
      try {
        const url = new URL(request.url);
        const parts = url.pathname.split("/");
        const idx = parts.findIndex((p) => p === "audit");
        if (idx >= 0 && parts[idx + 1]) {
          const candidate = decodeURIComponent(parts[idx + 1]).trim();
          if (candidate && candidate !== "undefined" && candidate !== "null") {
            opportunity_id = candidate;
          }
        }
      } catch {
        // ignore
      }
    }
    if (!opportunity_id || opportunity_id === "undefined" || opportunity_id === "null") {
      return NextResponse.json(
        { error: "Invalid opportunity ID" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
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
