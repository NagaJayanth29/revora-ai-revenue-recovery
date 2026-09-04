import { describe, expect, it, beforeEach } from "vitest";
import { analyzeOpportunity, executeRecovery } from "@/lib/recovery/executor";
import { compareInterventions, MODEL_VERSION } from "@/lib/recovery/probability-model";
import { evaluatePolicy, defaultPolicyRules } from "@/lib/policy/engine";
import { resetStore, getStore } from "@/lib/store/memory";
import { buildSeedStore, MERCHANT_ID } from "@/lib/store/seed";
import type { Payment } from "@/lib/domain/types";

describe("re-analyze pipeline", () => {
  beforeEach(() => {
    resetStore();
    buildSeedStore();
  });

  it("A. replaces seeded 0.72 recommendation after re-analysis", () => {
    const store = getStore();
    const hero = store.opportunities.find((o) => o.correlation_id === "corr_demo_48000")!;
    // Simulate seeded stale values
    hero.recovery_probability = 0.72;
    hero.expected_recovery_value = 34_560_00;
    hero.status = "RECOVERED";
    hero.attempt_count = 2;
    hero.actual_recovered_amount = 48_000_00;

    const stale = store.recommendations.find((r) => r.opportunity_id === hero.id);
    if (stale) {
      stale.recovery_probability = 0.72;
      stale.explanation =
        "Customer has strong history; insufficient funds usually clear after a short delay.";
      stale.model_version = "revora-lr-v1-synthetic";
    }

    const result = analyzeOpportunity(hero.id);
    expect(result.recommendation.recovery_probability).not.toBe(0.72);
    expect(result.recommendation.model_version).toBe(MODEL_VERSION);
    expect(result.opportunity.recovery_probability).not.toBe(0.72);
    expect(result.opportunity.status).toBe("RECOVERED");
  });

  it("B. uses current attempt_count from opportunity state", () => {
    const store = getStore();
    const hero = store.opportunities.find((o) => o.amount === 48_000_00)!;
    hero.status = "RECOVERED";
    hero.attempt_count = 2;
    const result = analyzeOpportunity(hero.id);
    expect(result.opportunity.attempt_count).toBe(2);
    expect(result.decision.key_factors.join(" ").toLowerCase()).not.toContain(
      "usually clear"
    );
  });

  it("C. model version is v0.1-demo", () => {
    const store = getStore();
    const hero = store.opportunities.find((o) => o.amount === 48_000_00)!;
    const result = analyzeOpportunity(hero.id);
    expect(result.recommendation.model_version).toBe("v0.1-demo");
    expect(MODEL_VERSION).toBe("v0.1-demo");
  });

  it("D. persists updated recommendation into memory store (front of list)", () => {
    const store = getStore();
    const hero = store.opportunities.find((o) => o.amount === 48_000_00)!;
    hero.status = "RECOVERED";
    hero.attempt_count = 2;
    const before = store.recommendations.filter((r) => r.opportunity_id === hero.id).length;
    const result = analyzeOpportunity(hero.id);
    const after = store.recommendations.filter((r) => r.opportunity_id === hero.id);
    expect(after.length).toBeGreaterThanOrEqual(before);
    expect(after[0].id).toBe(result.recommendation.id);
    expect(after[0].recovery_probability).toBe(result.recommendation.recovery_probability);
  });

  it("E. counterfactuals are generated dynamically", () => {
    const store = getStore();
    const hero = store.opportunities.find((o) => o.amount === 48_000_00)!;
    hero.attempt_count = 2;
    const result = analyzeOpportunity(hero.id);
    expect(result.decision.alternatives.length).toBeGreaterThanOrEqual(4);
    expect(result.decision.alternatives.some((a) => a.probability === 0.72)).toBe(false);
  });

  it("F. DO_NOTHING is marked BASELINE", () => {
    const store = getStore();
    const hero = store.opportunities.find((o) => o.amount === 48_000_00)!;
    const customer = store.customers.find((c) => c.id === hero.customer_id)!;
    const decision = compareInterventions(hero, customer, null);
    const baseline = decision.alternatives.find((a) => a.action === "DO_NOTHING");
    expect(baseline?.probability_source).toBe("BASELINE");
  });

  it("G. already recovered opportunity cannot execute again", async () => {
    const store = getStore();
    const hero = store.opportunities.find((o) => o.amount === 48_000_00)!;
    hero.status = "RECOVERED";
    hero.policy_status = "SAFE_TO_EXECUTE";
    const outcomesBefore = store.outcomes.filter((o) => o.opportunity_id === hero.id).length;
    const result = await executeRecovery(hero.id, { approvedByMerchant: true });
    expect(result.simulated_failure).toBe("already_recovered");
    expect(result.opportunity.status).toBe("RECOVERED");
    const outcomesAfter = store.outcomes.filter((o) => o.opportunity_id === hero.id).length;
    expect(outcomesAfter).toBe(outcomesBefore);
  });

  it("H. explanation contains no unsupported usually-clear claim", () => {
    const store = getStore();
    const hero = store.opportunities.find((o) => o.amount === 48_000_00)!;
    const result = analyzeOpportunity(hero.id);
    expect(result.recommendation.explanation.toLowerCase()).not.toContain("usually clear");
    expect(result.decision.explanation.toLowerCase()).not.toContain("usually clear");
  });

  it("I. expected recovery equals amount × current probability", () => {
    const store = getStore();
    const hero = store.opportunities.find((o) => o.amount === 48_000_00)!;
    const result = analyzeOpportunity(hero.id);
    expect(result.recommendation.expected_recovery_value).toBe(
      Math.round(hero.amount * result.recommendation.recovery_probability)
    );
  });

  it("J. re-analysis does not create a recovery outcome", () => {
    const store = getStore();
    const hero = store.opportunities.find((o) => o.amount === 48_000_00)!;
    hero.status = "RECOVERED";
    hero.attempt_count = 2;
    const before = store.outcomes.length;
    analyzeOpportunity(hero.id);
    expect(store.outcomes.length).toBe(before);
  });

  it("policy blocks RECOVERED opportunities", () => {
    const store = getStore();
    const hero = store.opportunities.find((o) => o.amount === 48_000_00)!;
    hero.status = "RECOVERED";
    const decision = evaluatePolicy({
      opportunity: hero,
      action: "RETRY_LATER",
      rules: defaultPolicyRules(MERCHANT_ID),
      payment: { status: "captured" } as Payment,
      confidence: "HIGH",
    });
    expect(decision.decision).toBe("BLOCKED");
  });
});
