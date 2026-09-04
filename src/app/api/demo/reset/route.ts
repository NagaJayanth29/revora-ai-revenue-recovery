import { NextResponse } from "next/server";
import { summarizeFromSnapshot } from "@/lib/analytics/from-snapshot";
import { hydrateFromSupabase } from "@/lib/store/hydrate";
import { loadMerchantSnapshot } from "@/lib/store/supabase-repo";

/**
 * Demo reset: re-hydrate working memory from Supabase seed (source of truth).
 * Does not wipe the database — reloads durable demo data into the process store.
 */
export async function POST() {
  try {
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
