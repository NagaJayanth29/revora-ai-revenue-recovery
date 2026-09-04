import { NextResponse } from "next/server";
import { getOpportunityDetail } from "@/lib/store/supabase-repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = ctx?.params ? await ctx.params : undefined;
    let id = resolvedParams?.id ? String(resolvedParams.id).trim() : undefined;

    // Fallback: extract ID directly from URL pathname if params was missing or unresolved
    if (!id || id === "undefined" || id === "null") {
      try {
        const url = new URL(request.url);
        const parts = url.pathname.split("/");
        const idx = parts.findIndex((p) => p === "opportunities");
        if (idx >= 0 && parts[idx + 1]) {
          const candidate = decodeURIComponent(parts[idx + 1]).trim();
          if (candidate && candidate !== "undefined" && candidate !== "null") {
            id = candidate;
          }
        }
      } catch {
        // ignore url parsing error
      }
    }

    if (!id || id === "undefined" || id === "null") {
      return NextResponse.json(
        { error: "Invalid or missing opportunity ID" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

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
