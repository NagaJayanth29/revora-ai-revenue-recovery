import { jsonNoStore } from "@/lib/api/live";
import {
  atRiskOpportunities,
  leakageFromOpportunities,
  pulseFromData,
  summarizeFromSnapshot,
} from "@/lib/analytics/from-snapshot";
import {
  getHeroOpportunity,
  getRecommendationForOpportunity,
  loadMerchantSnapshot,
} from "@/lib/store/supabase-repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const range = url.searchParams.get("range") || "7D";
    const days =
      range === "30D" ? 30 : range === "90D" ? 90 : range === "ALL" ? ("all" as const) : 7;

    const snap = await loadMerchantSnapshot();
    const summary = summarizeFromSnapshot(snap);
    const atRisk = atRiskOpportunities(snap.opportunities);
    const leakage = leakageFromOpportunities(snap.opportunities);
    const pulse = pulseFromData(snap.opportunities, snap.actions, days);
    const leakageTotal = leakage.reduce((s, b) => s + b.amount, 0);

    const queue = [...atRisk]
      .sort((a, b) => (b.expected_recovery_value ?? 0) - (a.expected_recovery_value ?? 0))
      .slice(0, 8)
      .map((o) => ({
        ...o,
        customer: snap.customers.find((c) => c.id === o.customer_id) ?? null,
      }));

    const hero = await getHeroOpportunity(snap.merchant.id);
    const hero_recommendation = hero
      ? await getRecommendationForOpportunity(hero.id)
      : null;

    return jsonNoStore({
      summary,
      leakage,
      leakage_total: leakageTotal,
      pulse,
      queue,
      hero,
      hero_recommendation,
      merchant: snap.merchant,
      operator: snap.users[0] ?? null,
      open_count: atRisk.length,
      definitions: {
        revenue_at_risk:
          "Sum of amounts for non-terminal opportunities (excludes RECOVERED/CANCELLED/EXPIRED)",
        leakage: "Same at-risk population, grouped by source",
        estimated_recoverable:
          "Model estimate · Σ amount × recovery_probability on at-risk set",
        actually_recovered: "Verified recovery outcomes",
        incremental_recovery: "Actual recovered − baseline (amount × baseline_probability)",
      },
    });
  } catch (e) {
    return jsonNoStore(
      { error: e instanceof Error ? e.message : "Failed to load dashboard" },
      { status: 500 }
    );
  }
}
