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
});

