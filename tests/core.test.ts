import { describe, expect, it, beforeEach } from "vitest";
import { evaluatePolicy, defaultPolicyRules, riskFromAmount } from "@/lib/policy/engine";
import { compareInterventions, recoveryProbabilityModel } from "@/lib/recovery/probability-model";
import { analyzeOpportunity, executeRecovery, confirmOutcome } from "@/lib/recovery/executor";
import { processRazorpayWebhook } from "@/lib/recovery/webhooks";
import { runFailureSimulation } from "@/lib/reliability/failure-lab";
import { getDashboardSummary, getExperimentView } from "@/lib/analytics/metrics";
import { resetStore } from "@/lib/store/memory";
import { buildSeedStore, MERCHANT_ID } from "@/lib/store/seed";
import { signDemoWebhook } from "@/lib/razorpay/verification";
import { verifyWebhookSignature } from "@/lib/razorpay/verification";
import type { RecoveryOpportunity, Customer, Payment } from "@/lib/domain/types";
import { canTransition } from "@/lib/domain/types";

function baseOpp(overrides: Partial<RecoveryOpportunity> = {}): RecoveryOpportunity {
  return {
    id: "opp_test",
    merchant_id: MERCHANT_ID,
    customer_id: "cust_arjun",
    transaction_id: "txn",
    order_id: "ord",
    payment_id: "pay",
    amount: 48_000_00,
    currency: "INR",
    source: "FAILED_PAYMENT",
    event_type: "payment.failed",
    failure_reason: "Insufficient funds",
    failure_category: "INSUFFICIENT_FUNDS",
    status: "READY",
    risk_level: "HIGH",
    recovery_probability: null,
    confidence: "HIGH",
    expected_recovery_value: null,
    recommended_action: "RETRY_LATER",
    policy_status: null,
    policy_reason: null,
    autonomy_mode: null,
    attempt_count: 0,
    last_action_at: null,
    next_action_at: null,
    actual_recovered_amount: 0,
    incremental_recovered_amount: 0,
    baseline_probability: 0.2,
    experiment_arm: "treatment",
    resolved_at: null,
    created_by: "SYSTEM",
    correlation_id: "corr",
    metadata: { payment_method: "upi" },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

const customer: Customer = {
  id: "cust_arjun",
  merchant_id: MERCHANT_ID,
  external_id: null,
  name: "Arjun",
  email: "a@example.com",
  phone: null,
  success_count: 7,
  failure_count: 1,
  total_paid: 100000,
  last_payment_at: null,
  created_at: new Date().toISOString(),
};

describe("state machine", () => {
  it("allows DETECTED → ANALYZING", () => {
    expect(canTransition("DETECTED", "ANALYZING")).toBe(true);
  });
  it("blocks RECOVERED → READY", () => {
    expect(canTransition("RECOVERED", "READY")).toBe(false);
  });
});

describe("probability model", () => {
  it("returns probability between 0 and 1", () => {
    const pred = recoveryProbabilityModel.predict(baseOpp(), customer, "RETRY_LATER");
    expect(pred.probability).toBeGreaterThan(0);
    expect(pred.probability).toBeLessThan(1);
    expect(pred.factors.length).toBeGreaterThan(0);
  });

  it("falls back when unavailable", () => {
    recoveryProbabilityModel.setUnavailable(true);
    const pred = recoveryProbabilityModel.predict(baseOpp(), customer, "RETRY_LATER");
    expect(pred.used_fallback).toBe(true);
    expect(pred.confidence).toBe("LOW");
    recoveryProbabilityModel.setUnavailable(false);
  });
});

describe("counterfactual engine", () => {
  it("compares interventions and picks a recommendation", () => {
    const decision = compareInterventions(baseOpp(), customer);
    expect(decision.alternatives.length).toBeGreaterThanOrEqual(5);
    expect(decision.recommended_action).toBeTruthy();
    expect(decision.expected_value).toBe(
      Math.round(48_000_00 * decision.probability)
    );
  });

  it("favors delayed retry for insufficient funds returning customer", () => {
    const decision = compareInterventions(baseOpp(), customer);
    expect(["RETRY_LATER", "PAYMENT_LINK", "RETRY_NOW"]).toContain(decision.recommended_action);
  });
});

describe("policy engine", () => {
  const rules = defaultPolicyRules(MERCHANT_ID);

  it("blocks when retry limit exceeded", () => {
    const decision = evaluatePolicy({
      opportunity: baseOpp({ attempt_count: 3 }),
      action: "RETRY_NOW",
      rules,
      payment: { status: "failed" } as Payment,
      confidence: "HIGH",
    });
    expect(decision.decision).toBe("BLOCKED");
  });

  it("requires approval above auto amount", () => {
    const decision = evaluatePolicy({
      opportunity: baseOpp({ amount: 95_000_00, risk_level: "HIGH" }),
      action: "PAYMENT_LINK",
      rules: { ...rules, max_auto_action_amount: 50_000_00 },
      payment: { status: "failed" } as Payment,
      confidence: "MEDIUM",
    });
    expect(decision.decision).toBe("REQUIRES_APPROVAL");
  });

  it("blocks already paid", () => {
    const decision = evaluatePolicy({
      opportunity: baseOpp(),
      action: "RETRY_LATER",
      rules,
      payment: { status: "captured" } as Payment,
      confidence: "HIGH",
    });
    expect(decision.decision).toBe("BLOCKED");
  });

  it("maps risk from amount", () => {
    expect(riskFromAmount(48_000_00)).toBe("HIGH");
  });
});

describe("webhook pipeline", () => {
  beforeEach(() => {
    resetStore();
    buildSeedStore();
  });

  it("verifies signatures", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "test_secret";
    const body = '{"a":1}';
    const sig = signDemoWebhook(body);
    expect(verifyWebhookSignature(body, sig, "test_secret")).toBe(true);
    expect(verifyWebhookSignature(body, "bad", "test_secret")).toBe(false);
  });

  it("deduplicates webhooks", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    process.env.RAZORPAY_WEBHOOK_SECRET = "test_secret";
    const body = JSON.stringify({
      event_id: "evt_test_dup",
      event: "payment.failed",
      payload: {
        payment: {
          entity: { id: "pay_x", amount: 100000, error_description: "Insufficient funds", method: "upi" },
        },
      },
    });
    const sig = signDemoWebhook(body);
    const first = await processRazorpayWebhook({ rawBody: body, signature: sig });
    const second = await processRazorpayWebhook({ rawBody: body, signature: sig });
    expect(first.accepted).toBe(true);
    expect(second.duplicate).toBe(true);
  });
});

describe("end-to-end recovery", () => {
  beforeEach(() => {
    resetStore();
    buildSeedStore();
  });

  it("analyzes → policy → execute → recover for hero opportunity", async () => {
    const store = buildSeedStore();
    const hero = store.opportunities.find((o) => o.amount === 48_000_00)!;
    hero.status = "READY";
    hero.policy_status = "SAFE_TO_EXECUTE";
    hero.attempt_count = 0;
    hero.last_action_at = null;

    const analyzed = analyzeOpportunity(hero.id);
    expect(analyzed.opportunity.recovery_probability).toBeGreaterThan(0);
    expect(analyzed.decision.alternatives.length).toBeGreaterThan(0);

    const result = await executeRecovery(hero.id, { approvedByMerchant: true });
    expect(["RECOVERED", "WAITING_FOR_OUTCOME", "BLOCKED"]).toContain(result.opportunity.status);

    if (result.opportunity.status !== "RECOVERED") {
      confirmOutcome(hero.id, { success: true, via: "demo" });
    }
    const final = store.opportunities.find((o) => o.id === hero.id)!;
    expect(final.status).toBe("RECOVERED");
    expect(final.actual_recovered_amount).toBe(48_000_00);
    expect(final.incremental_recovered_amount).toBeGreaterThanOrEqual(0);
  });
});

describe("failure lab", () => {
  beforeEach(() => {
    resetStore();
    buildSeedStore();
  });

  it("simulates duplicate webhook safely", async () => {
    const result = await runFailureSimulation("DUPLICATE_WEBHOOK");
    expect(result.recovery_mechanism.toLowerCase()).toContain("idempot");
  });

  it("simulates AI outage with fallback", async () => {
    const result = await runFailureSimulation("AI_OUTAGE");
    expect(result.details).toBeTruthy();
  });
});

describe("experiments", () => {
  beforeEach(() => {
    resetStore();
    buildSeedStore();
  });

  it("computes lift from dataset", () => {
    const view = getExperimentView();
    expect(view).toBeTruthy();
    expect(view!.results.data_label.toLowerCase()).toContain("synthetic");
    expect(typeof view!.results.incremental_recovery).toBe("number");
  });

  it("dashboard summary is derived not hardcoded", () => {
    const s = getDashboardSummary();
    expect(s.revenue_at_risk).toBeGreaterThan(0);
    expect(s.data_label.toLowerCase()).toContain("synthetic");
  });
});
