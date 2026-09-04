import { NextResponse } from "next/server";
import { runFailureSimulation, type SimulationType } from "@/lib/reliability/failure-lab";
import { hydrateFromSupabase, persistIncident, persistOpportunityState } from "@/lib/store/hydrate";
import { getStore } from "@/lib/store/memory";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const type = body.type as SimulationType;
    if (!type) return NextResponse.json({ error: "type required" }, { status: 400 });

    await hydrateFromSupabase();
    const result = await runFailureSimulation(type);

    if (result.opportunity_id) {
      await persistOpportunityState(result.opportunity_id);
    }
    const incident = getStore().incidents.find((i) => i.id === result.incident_id);
    if (incident) await persistIncident(incident);

    return NextResponse.json({ ...result, demo_mode: true, simulated: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Simulation failed" },
      { status: 400 }
    );
  }
}
