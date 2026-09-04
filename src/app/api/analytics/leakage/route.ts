import { jsonNoStore } from "@/lib/api/live";
import { leakageFromOpportunities } from "@/lib/analytics/from-snapshot";
import { loadMerchantSnapshot } from "@/lib/store/supabase-repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const snap = await loadMerchantSnapshot();
    return jsonNoStore({ leakage: leakageFromOpportunities(snap.opportunities) });
  } catch (e) {
    return jsonNoStore(
      { error: e instanceof Error ? e.message : "Failed to load leakage" },
      { status: 500 }
    );
  }
}
