import { NextResponse } from "next/server";
import { loadMerchantSnapshot } from "@/lib/store/supabase-repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "ALL";
    const sort = searchParams.get("sort") || "expected";
    const risk = searchParams.get("risk") || "ALL";
    const action = searchParams.get("action") || "ALL";
    const q = (searchParams.get("q") || "").toLowerCase().trim();

    const snap = await loadMerchantSnapshot();
    let opps = [...snap.opportunities];

    switch (filter) {
      case "HIGH_VALUE":
        opps = opps.filter((o) => o.amount >= 20_000_00);
        break;
      case "HIGH_CONFIDENCE":
        opps = opps.filter((o) => o.confidence === "HIGH");
        break;
      case "NEEDS_APPROVAL":
      case "PENDING_APPROVAL":
        opps = opps.filter((o) => o.status === "AWAITING_APPROVAL");
        break;
      case "READY":
        opps = opps.filter((o) => o.status === "READY");
        break;
      case "BLOCKED":
        opps = opps.filter((o) => o.status === "BLOCKED");
        break;
      case "EXECUTING":
        opps = opps.filter((o) => o.status === "EXECUTING" || o.status === "WAITING_FOR_OUTCOME");
        break;
      case "RECOVERED":
        opps = opps.filter((o) => o.status === "RECOVERED");
        break;
      case "FAILED":
        opps = opps.filter((o) => o.status === "FAILED");
        break;
      case "DISMISSED":
        opps = opps.filter((o) => o.status === "CANCELLED" || o.status === "EXPIRED");
        break;
    }

    if (risk !== "ALL") {
      opps = opps.filter((o) => o.risk_level === risk);
    }
    if (action !== "ALL") {
      opps = opps.filter((o) => o.recommended_action === action);
    }
    if (q) {
      opps = opps.filter((o) => {
        const customer = snap.customers.find((c) => c.id === o.customer_id);
        return (
          customer?.name.toLowerCase().includes(q) ||
          customer?.email.toLowerCase().includes(q) ||
          o.failure_reason?.toLowerCase().includes(q) ||
          o.correlation_id.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q)
        );
      });
    }

    opps.sort((a, b) => {
      switch (sort) {
        case "amount":
          return b.amount - a.amount;
        case "confidence": {
          const rank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
          return (rank[b.confidence || "LOW"] || 0) - (rank[a.confidence || "LOW"] || 0);
        }
        case "age":
        case "newest":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "probability":
          return (b.recovery_probability ?? 0) - (a.recovery_probability ?? 0);
        case "risk": {
          const r = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
          return (r[b.risk_level] || 0) - (r[a.risk_level] || 0);
        }
        default:
          return (b.expected_recovery_value ?? 0) - (a.expected_recovery_value ?? 0);
      }
    });

    const enriched = opps.map((o) => ({
      ...o,
      customer: snap.customers.find((c) => c.id === o.customer_id) ?? null,
    }));

    return NextResponse.json(
      { opportunities: enriched, count: enriched.length },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load opportunities" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
