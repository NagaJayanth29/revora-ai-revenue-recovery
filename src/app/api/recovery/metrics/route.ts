import { jsonNoStore } from "@/lib/api/live";
import {
  expectedVsActual,
  leakageFromOpportunities,
  metricsFromOpportunities,
  pulseFromData,
  summarizeFromSnapshot,
} from "@/lib/analytics/from-snapshot";
import { loadMerchantSnapshot } from "@/lib/store/supabase-repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const range = new URL(request.url).searchParams.get("range") || "30D";
    const days =
      range === "7D" ? 7 : range === "90D" ? 90 : range === "ALL" ? ("all" as const) : 30;
    const snap = await loadMerchantSnapshot();
    const summary = summarizeFromSnapshot(snap);
    const metrics = metricsFromOpportunities(snap.opportunities);
    const leakage = leakageFromOpportunities(snap.opportunities);
    const pulse = pulseFromData(snap.opportunities, snap.actions, days);
    const expected_vs_actual = expectedVsActual(snap.opportunities, snap.outcomes);

    return jsonNoStore({
      summary,
      ...metrics,
      leakage,
      pulse,
      expected_vs_actual,
    });
  } catch (e) {
    return jsonNoStore(
      { error: e instanceof Error ? e.message : "Failed to load metrics" },
      { status: 500 }
    );
  }
}
