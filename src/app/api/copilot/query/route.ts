import { NextResponse } from "next/server";
import { answerCopilotQuery } from "@/lib/copilot/tools";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const result = await answerCopilotQuery({
      message: String(body.message || ""),
      opportunityId: (body.opportunity_id as string | null) ?? null,
      sessionId: (body.session_id as string | null) ?? null,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Copilot query failed";
    console.error("[copilot/query]", message, e);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
