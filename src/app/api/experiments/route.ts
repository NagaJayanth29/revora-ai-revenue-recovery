import { jsonNoStore } from "@/lib/api/live";
import { experimentLiftFromSnapshot } from "@/lib/analytics/from-snapshot";
import { loadMerchantSnapshot } from "@/lib/store/supabase-repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const snap = await loadMerchantSnapshot();
    const current = experimentLiftFromSnapshot(snap);
    return jsonNoStore({
      experiments: snap.experiments,
      current,
    });
  } catch (e) {
    return jsonNoStore(
      { error: e instanceof Error ? e.message : "Failed to load experiments" },
      { status: 500 }
    );
  }
}
