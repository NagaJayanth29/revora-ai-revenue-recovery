import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isSupabaseConfigured, isSupabaseServerConfigured } from "@/lib/supabase/env";
import { createBrowserClient } from "@/lib/supabase/client";
import { createServerClient } from "@/lib/supabase/server";
import {
  getDemoMerchant,
  getHeroOpportunity,
  getMerchantId,
  getOpportunity,
  getOpportunityDetail,
  getPolicyRules,
  listAudit,
  listCustomers,
  listExperiments,
  listIncidents,
  listOpportunities,
  loadMerchantSnapshot,
  updateOpportunity,
  updatePolicyRules,
  insertAudit,
  insertIncident,
} from "@/lib/store/supabase-repo";
import { hydrateFromSupabase, persistOpportunityState } from "@/lib/store/hydrate";
import { resetStore } from "@/lib/store/memory";
import { buildSeedStore } from "@/lib/store/seed";

describe("Demo Mode Zero-Supabase Credentials Guarantee", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Completely strip any Supabase credentials
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_DB_PASSWORD;

    // Explicitly enforce Demo Mode
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";

    // Re-seed memory store
    resetStore(buildSeedStore());
  });

  afterEach?.(() => {
    process.env = { ...originalEnv };
  });

  it("1. reports Supabase is NOT configured in Demo Mode", () => {
    expect(isSupabaseConfigured()).toBe(false);
    expect(isSupabaseServerConfigured()).toBe(false);
  });

  it("2. createBrowserClient returns null without throwing in Demo Mode", () => {
    expect(createBrowserClient()).toBeNull();
  });

  it("3. createServerClient refuses initialization in Demo Mode", () => {
    expect(() => createServerClient()).toThrow(/cannot be initialized in demo mode/i);
  });

  it("4. loadMerchantSnapshot succeeds without Supabase credentials", async () => {
    const snap = await loadMerchantSnapshot();
    expect(snap).toBeDefined();
    expect(snap.merchant).toBeDefined();
    expect(snap.merchant.name).toBe("Aurora Commerce");
    expect(snap.opportunities.length).toBeGreaterThan(0);
    expect(snap.users.length).toBeGreaterThan(0);
    expect(snap.customers.length).toBeGreaterThan(0);
    expect(snap.policy_rules.length).toBeGreaterThan(0);
    expect(snap.recommendations.length).toBeGreaterThan(0);
  });

  it("5. hydrateFromSupabase loads demo store without calling Supabase", async () => {
    const store = await hydrateFromSupabase();
    expect(store).toBeDefined();
    expect(store.opportunities.length).toBeGreaterThan(0);
  });

  it("6. getDemoMerchant and getMerchantId return demo merchant without Supabase", async () => {
    const merchant = await getDemoMerchant();
    expect(merchant.slug).toBe("aurora-commerce");
    const mid = await getMerchantId();
    expect(mid).toBe(merchant.id);
  });

  it("7. listOpportunities and getHeroOpportunity work in Demo Mode", async () => {
    const mid = await getMerchantId();
    const opps = await listOpportunities(mid);
    expect(opps.length).toBeGreaterThan(0);

    const hero = await getHeroOpportunity(mid);
    expect(hero).toBeDefined();
    expect(hero?.amount).toBe(4800000);
  });

  it("8. getOpportunityDetail loads full context in Demo Mode", async () => {
    const mid = await getMerchantId();
    const hero = await getHeroOpportunity(mid);
    expect(hero).toBeDefined();

    const detail = await getOpportunityDetail(hero!.id);
    expect(detail).toBeDefined();
    expect(detail?.opportunity.id).toBe(hero!.id);
    expect(detail?.customer).toBeDefined();
    expect(detail?.payment).toBeDefined();
  });

  it("9. policy rules can be read and updated in Demo Mode", async () => {
    const mid = await getMerchantId();
    const rules = await getPolicyRules(mid);
    expect(rules).toBeDefined();

    const updated = await updatePolicyRules(mid, { max_retry_attempts: 5 }, "test.operator");
    expect(updated.max_retry_attempts).toBe(5);

    const reRead = await getPolicyRules(mid);
    expect(reRead?.max_retry_attempts).toBe(5);
  });

  it("10. audit events and incidents can be written and listed in Demo Mode", async () => {
    const mid = await getMerchantId();
    const audit = await insertAudit({
      merchant_id: mid,
      opportunity_id: null,
      actor: "test.actor",
      actor_type: "SYSTEM",
      event: "DEMO_TEST_EVENT",
      previous_state: null,
      new_state: null,
      reason: "Testing demo mode persistence",
      ai_recommendation: null,
      policy_decision: null,
      execution_result: null,
      request_id: null,
      correlation_id: null,
      metadata: {},
    });
    expect(audit.id).toBeDefined();

    const incidents = await listIncidents(mid);
    expect(Array.isArray(incidents)).toBe(true);

    const newIncident = await insertIncident({
      merchant_id: mid,
      type: "API_TIMEOUT",
      severity: "warning",
      title: "Test Incident",
      description: "Test incident description",
      what_broke: "Upstream timeout",
      recovery_action: "Retry",
      final_state: "Resolved",
      resolved: true,
      opportunity_id: null,
      correlation_id: null,
    });
    expect(newIncident.id).toBeDefined();
  });

  it("11. persistOpportunityState succeeds cleanly without Supabase credentials", async () => {
    const mid = await getMerchantId();
    const hero = await getHeroOpportunity(mid);
    expect(hero).toBeDefined();

    await updateOpportunity(hero!.id, { status: "AWAITING_APPROVAL" });
    await expect(persistOpportunityState(hero!.id)).resolves.not.toThrow();

    const updated = await getOpportunity(hero!.id);
    expect(updated?.status).toBe("AWAITING_APPROVAL");
  });

  it("12. all core API routes return 200 without Supabase credentials", async () => {
    const { GET: getSummary } = await import("@/app/api/dashboard/summary/route");
    const { GET: getOpportunities } = await import("@/app/api/recovery/opportunities/route");
    const { GET: getMetrics } = await import("@/app/api/recovery/metrics/route");
    const { GET: getExperiments } = await import("@/app/api/experiments/route");
    const { GET: getPolicies } = await import("@/app/api/policies/route");
    const { POST: postReset } = await import("@/app/api/demo/reset/route");
    const { GET: getIncidents } = await import("@/app/api/reliability/incidents/route");

    // Dashboard summary
    const summaryRes = await getSummary(new Request("http://localhost:3000/api/dashboard/summary"));
    expect(summaryRes.status).toBe(200);
    const summaryData = await summaryRes.json();
    expect(summaryData.open_count).toBeGreaterThanOrEqual(0);
    expect(summaryData.summary).toBeDefined();

    // Opportunities
    const oppsRes = await getOpportunities(new Request("http://localhost:3000/api/recovery/opportunities"));
    expect(oppsRes.status).toBe(200);
    const oppsData = await oppsRes.json();
    expect(oppsData.count).toBeGreaterThan(0);

    // Metrics
    const metricsRes = await getMetrics(new Request("http://localhost:3000/api/recovery/metrics"));
    expect(metricsRes.status).toBe(200);

    // Experiments
    const expRes = await getExperiments();
    expect(expRes.status).toBe(200);

    // Policies
    const polRes = await getPolicies();
    expect(polRes.status).toBe(200);

    // Incidents
    const incRes = await getIncidents();
    expect(incRes.status).toBe(200);

    // Demo reset
    const resetRes = await postReset();
    expect(resetRes.status).toBe(200);
    const resetData = await resetRes.json();
    expect(resetData.ok).toBe(true);
  });

  it("13. opportunities have deterministic demo IDs and hero has corr_demo_48000 / opp_demo_48000", async () => {
    const { GET: getOpportunities } = await import("@/app/api/recovery/opportunities/route");
    const res = await getOpportunities(new Request("http://localhost:3000/api/recovery/opportunities"));
    expect(res.status).toBe(200);
    const data = await res.json();
    const hero = data.opportunities.find((o: any) => o.amount === 4800000);

    expect(hero).toBeDefined();
    expect(hero.id).toBe("opp_demo_48000");
    expect(hero.correlation_id).toBe("corr_demo_48000");
    expect(hero.status).toBe("READY");
    expect(hero.recommended_action).toBe("RETRY_LATER");
    expect(hero.policy_status).toBe("SAFE_TO_EXECUTE");
    expect(hero.autonomy_mode).toBe("AUTO");
    expect(hero.confidence).toBe("HIGH");

    // All demo opportunities must have deterministic opp_demo_ prefix
    for (const opp of data.opportunities) {
      expect(opp.id).toMatch(/^opp_demo_/);
      expect(opp.correlation_id).toMatch(/^corr_demo_/);
    }
  });

  it("14. Opportunity Detail API resolves across separate request/store rebuilds by id and correlation_id", async () => {
    const { GET: getOppDetail } = await import("@/app/api/recovery/opportunities/[id]/route");

    // Simulate separate serverless invocation: fresh rebuild of demo store
    resetStore(buildSeedStore());

    // Lookup by opportunity id
    const resById = await getOppDetail(
      new Request("http://localhost:3000/api/recovery/opportunities/opp_demo_48000"),
      { params: Promise.resolve({ id: "opp_demo_48000" }) }
    );
    expect(resById.status).toBe(200);
    const detailById = await resById.json();
    expect(detailById.opportunity).toBeDefined();
    expect(detailById.opportunity.id).toBe("opp_demo_48000");
    expect(detailById.opportunity.amount).toBe(4800000);
    expect(detailById.customer).toBeDefined();
    expect(detailById.customer.id).toBe("cust_arjun");
    expect(detailById.payment).toBeDefined();
    expect(detailById.payment.id).toBe("pay_48000");
    expect(detailById.recommendation).toBeDefined();
    expect(detailById.recommendation.recommended_action).toBe("RETRY_LATER");
    expect(detailById.recommendation.confidence).toBe("HIGH");
    expect(detailById.policy_decisions.length).toBeGreaterThan(0);
    expect(detailById.audit.length).toBeGreaterThan(0);

    // Another fresh rebuild simulating yet another serverless request
    resetStore(buildSeedStore());

    // Lookup by correlation_id
    const resByCorr = await getOppDetail(
      new Request("http://localhost:3000/api/recovery/opportunities/corr_demo_48000"),
      { params: Promise.resolve({ id: "corr_demo_48000" }) }
    );
    expect(resByCorr.status).toBe(200);
    const detailByCorr = await resByCorr.json();
    expect(detailByCorr.opportunity).toBeDefined();
    expect(detailByCorr.opportunity.id).toBe("opp_demo_48000");
    expect(detailByCorr.customer).toBeDefined();
    expect(detailByCorr.payment).toBeDefined();
    expect(detailByCorr.recommendation).toBeDefined();
  });

  it("15. every opportunity clicked from Recovery Queue resolves in Opportunity Detail API", async () => {
    const { GET: getOpportunities } = await import("@/app/api/recovery/opportunities/route");
    const { GET: getOppDetail } = await import("@/app/api/recovery/opportunities/[id]/route");

    // Step 1: User fetches queue in request 1
    const listRes = await getOpportunities(new Request("http://localhost:3000/api/recovery/opportunities"));
    const listData = await listRes.json();
    const queueOpportunities = listData.opportunities;
    expect(queueOpportunities.length).toBeGreaterThanOrEqual(7);

    // Step 2: Across new serverless request cycles, every clicked opportunity resolves
    for (const item of queueOpportunities) {
      // simulate fresh serverless instance
      resetStore(buildSeedStore());

      const clickByIdRes = await getOppDetail(
        new Request(`http://localhost:3000/api/recovery/opportunities/${item.id}`),
        { params: Promise.resolve({ id: item.id }) }
      );
      expect(clickByIdRes.status).toBe(200);
      const dataById = await clickByIdRes.json();
      expect(dataById.opportunity.id).toBe(item.id);

      // Also test lookup by correlation_id
      const clickByCorrRes = await getOppDetail(
        new Request(`http://localhost:3000/api/recovery/opportunities/${item.correlation_id}`),
        { params: Promise.resolve({ id: item.correlation_id }) }
      );
      expect(clickByCorrRes.status).toBe(200);
      const dataByCorr = await clickByCorrRes.json();
      expect(dataByCorr.opportunity.id).toBe(item.id);
    }
  });

  it("16. legacy demo UUID a0000000-0000-4000-8000-000000000051 resolves to hero opportunity", async () => {
    const { getOpportunity } = await import("@/lib/store/supabase-repo");
    const { GET: getOppDetail } = await import("@/app/api/recovery/opportunities/[id]/route");

    const opp = await getOpportunity("a0000000-0000-4000-8000-000000000051");
    expect(opp).toBeDefined();
    expect(opp?.id).toBe("opp_demo_48000");
    expect(opp?.amount).toBe(4800000);

    const res = await getOppDetail(
      new Request("http://localhost:3000/api/recovery/opportunities/a0000000-0000-4000-8000-000000000051"),
      { params: Promise.resolve({ id: "a0000000-0000-4000-8000-000000000051" }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.opportunity.id).toBe("opp_demo_48000");
  });

  it("17. URL pathname fallback resolves ID when params is empty, and invalid ID returns 400", async () => {
    const { GET: getOppDetail } = await import("@/app/api/recovery/opportunities/[id]/route");

    // URL fallback test
    const req = new Request("http://localhost:3000/api/recovery/opportunities/opp_demo_48000");
    const res = await getOppDetail(req, { params: Promise.resolve({ id: "" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.opportunity.id).toBe("opp_demo_48000");

    // Undefined ID rejection test
    const reqUndef = new Request("http://localhost:3000/api/recovery/opportunities/undefined");
    const resUndef = await getOppDetail(reqUndef, { params: Promise.resolve({ id: "undefined" }) });
    expect(resUndef.status).toBe(400);
  });
});

