import { NextResponse } from "next/server";
import { summarizeFromSnapshot } from "@/lib/analytics/from-snapshot";
import { hydrateFromSupabase } from "@/lib/store/hydrate";
import { loadMerchantSnapshot, shouldUseDemoStore } from "@/lib/store/supabase-repo";
import { resetStore } from "@/lib/store/memory";
import { buildSeedStore } from "@/lib/store/seed";

/**
 * Demo reset: re-hydrate working memory from demo seed or Supabase seed.
 * In Demo Mode: resets the in-memory store cleanly to initial seed.
 * In Supabase Mode: re-hydrates working memory from Supabase.
 */
export async function POST() {
  try {
    if (shouldUseDemoStore()) {
      resetStore(buildSeedStore());
      const snap = await loadMerchantSnapshot();
      return NextResponse.json({
        ok: true,
        message: "Demo state reloaded from seeded demo store",
        summary: summarizeFromSnapshot(snap),
      });
    }

    await hydrateFromSupabase();
    const snap = await loadMerchantSnapshot();
    return NextResponse.json({
      ok: true,
      message: "Demo state reloaded from Supabase seed",
      summary: summarizeFromSnapshot(snap),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Reset failed" },
      { status: 500 }
    );
  }
}
