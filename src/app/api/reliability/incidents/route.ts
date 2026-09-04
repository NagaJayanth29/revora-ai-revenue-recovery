import { jsonNoStore } from "@/lib/api/live";
import { systemHealthFromFlags } from "@/lib/analytics/from-snapshot";
import { listIncidents, getMerchantId, getDemoMerchant, getOperator } from "@/lib/store/supabase-repo";
import { getStore } from "@/lib/store/memory";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const merchantId = await getMerchantId();
    const [incidents, merchant, operator] = await Promise.all([
      listIncidents(merchantId, 20),
      getDemoMerchant(),
      getOperator(merchantId),
    ]);
    const flags = getStore().simulation_flags;
    const aiDegraded = Boolean(flags?.llm_unavailable || flags?.model_unavailable);
    return jsonNoStore({
      health: systemHealthFromFlags(aiDegraded),
      incidents,
      merchant,
      operator,
    });
  } catch (e) {
    return jsonNoStore(
      { error: e instanceof Error ? e.message : "Failed to load reliability" },
      { status: 500 }
    );
  }
}
