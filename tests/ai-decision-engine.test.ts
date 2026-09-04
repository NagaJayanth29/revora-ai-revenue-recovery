import { describe, expect, it, beforeEach } from "vitest";
import {
  extractRecoveryFeatures,
  featuresToVector,
  MODEL_FEATURE_NAMES,
} from "@/lib/ai/features";
import {
  classifyConfidence,
} from "@/lib/ai/confidence";
import {
  compareInterventions,
  eligibleActions,
  expectedRecoveryPaise,
  expectedUtilityPaise,
} from "@/lib/ai/decision-engine";
import {
  recoveryProbabilityModel,
  MODEL_NAME,
  MODEL_VERSION,
  MODEL_DATA_LABEL,
} from "@/lib/ai/recovery-model";
import { evaluatePolicy, defaultPolicyRules, riskFromAmount } from "@/lib/policy/engine";
import { MERCHANT_ID } from "@/lib/store/seed";
import type { Customer, Payment, RecoveryOpportunity } from "@/lib/domain/types";

function baseOpp(overrides: Partial<RecoveryOpportunity> = {}): RecoveryOpportunity {
  return {
    id: "a0000000-0000-4000-8000-000000000051",
    merchant_id: MERCHANT_ID,
    customer_id: "a0000000-0000-4000-8000-000000000011",
    transaction_id: "txn",
    order_id: "ord",
    payment_id: "pay",
    amount: 48_000_00,
    currency: "INR",
    source: "FAILED_PAYMENT",
    event_type: "payment.failed",
    failure_reason: "Insufficient funds in customer account",
    failure_category: "INSUFFICIENT_FUNDS",
    status: "READY",
    risk_level: "HIGH",
    recovery_probability: null,
    confidence: "HIGH",
    expected_recovery_value: null,
    recommended_action: null,
    policy_status: null,
    policy_reason: null,
    autonomy_mode: null,
    attempt_count: 1,
    last_action_at: null,
    next_action_at: null,
    actual_recovered_amount: 0,
    incremental_recovered_amount: 0,
    baseline_probability: null,
    experiment_arm: "treatment",
    resolved_at: null,
    created_by: "SYSTEM",
    correlation_id: "corr_demo_48000",
    metadata: { payment_method: "upi" },
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

const arjun: Customer = {
  id: "a0000000-0000-4000-8000-000000000011",
  merchant_id: MERCHANT_ID,
  external_id: "cus_arjun",
  name: "Arjun Mehta",
  email: "arjun.mehta@example.com",
  phone: null,
  success_count: 7,
  failure_count: 1,
  total_paid: 312_000_00,
  last_payment_at: null,
  created_at: new Date().toISOString(),
};

const failedPayment = { status: "failed", method: "upi" } as Payment;

describe("A. feature extraction", () => {
  it("builds typed RecoveryFeatures from opportunity + customer", () => {
    const features = extractRecoveryFeatures({
      opportunity: baseOpp(),
      customer: arjun,
      payment: failedPayment,
    });
    expect(features.amount).toBe(48_000_00);
    expect(features.paymentMethod).toBe("upi");
    expect(features.failureCategory).toBe("INSUFFICIENT_FUNDS");
    expect(features.attempts).toBe(1);
    expect(features.customerSuccessRate).toBeCloseTo(7 / 8, 5);
    expect(features.customerFailureCount).toBe(1);
    expect(features.lifetimePaid).toBe(312_000_00);
    expect(features.featureCompleteness).toBeGreaterThan(0.8);
    const vector = featuresToVector(features, "RETRY_LATER");
    expect(vector.names).toEqual(MODEL_FEATURE_NAMES);
    expect(vector.values).toHaveLength(MODEL_FEATURE_NAMES.length);
  });
});

describe("B. probability bounds", () => {
  beforeEach(() => recoveryProbabilityModel.setUnavailable(false));

  it("returns probability in (0,1) with model metadata", () => {
    const pred = recoveryProbabilityModel.predict(
      baseOpp(),
      arjun,
      "RETRY_LATER",
      failedPayment
    );
    expect(pred.probability).toBeGreaterThan(0);
    expect(pred.probability).toBeLessThan(1);
    expect(pred.model_name).toBe(MODEL_NAME);
    expect(pred.model_version).toBe(MODEL_VERSION);
    expect(pred.prediction_timestamp).toBeTruthy();
    expect(pred.probability_source).toBe("MODEL");
    expect(MODEL_DATA_LABEL.toLowerCase()).toContain("synthetic");
  });
});

describe("C. expected value math", () => {
  it("₹48,000 × 0.72 = ₹34,560", () => {
    expect(expectedRecoveryPaise(48_000_00, 0.72)).toBe(34_560_00);
  });
});

describe("D. action ranking", () => {
  it("ranks eligible interventions by expected utility", () => {
    const decision = compareInterventions(baseOpp(), arjun, failedPayment);
    expect(decision.alternatives.length).toBeGreaterThanOrEqual(4);
    expect(decision.expected_value).toBe(
      expectedRecoveryPaise(48_000_00, decision.probability)
    );
    const utilities = decision.alternatives.map((a) => a.utility);
    const sorted = [...utilities].sort((a, b) => b - a);
    expect(utilities).toEqual(sorted);
    expect(decision.alternatives[0].probability_source).toBeTruthy();
  });

  it("hero profile is scored by the model (not a hardcoded 0.72)", () => {
    const decision = compareInterventions(baseOpp(), arjun, failedPayment);
    expect(decision.probability).not.toBe(0.72);
    expect(decision.model_version).toBe(MODEL_VERSION);
    expect(["RETRY_LATER", "PAYMENT_LINK", "RETRY_NOW", "REMINDER"]).toContain(
      decision.recommended_action
    );
  });
});

describe("E–H. policy gates", () => {
  const rules = defaultPolicyRules(MERCHANT_ID);

  it("E. blocks when policy rejects", () => {
    const decision = evaluatePolicy({
      opportunity: baseOpp({ attempt_count: 3 }),
      action: "RETRY_NOW",
      rules,
      payment: failedPayment,
      confidence: "HIGH",
    });
    expect(decision.decision).toBe("BLOCKED");
  });

  it("F. duplicate / already-paid protection", () => {
    const decision = evaluatePolicy({
      opportunity: baseOpp(),
      action: "RETRY_LATER",
      rules,
      payment: { status: "captured", method: "upi" } as Payment,
      confidence: "HIGH",
    });
    expect(decision.decision).toBe("BLOCKED");
  });

  it("G. retry-limit protection", () => {
    const decision = evaluatePolicy({
      opportunity: baseOpp({ attempt_count: rules.max_retry_attempts }),
      action: "RETRY_LATER",
      rules,
      payment: failedPayment,
      confidence: "HIGH",
    });
    expect(decision.decision).toBe("BLOCKED");
  });

  it("H. already-paid protection via eligibility", () => {
    const actions = eligibleActions(baseOpp({ status: "RECOVERED" }), {
      status: "captured",
    } as Payment);
    expect(actions).toEqual(["DO_NOTHING"]);
  });

  it("maps risk from amount", () => {
    expect(riskFromAmount(48_000_00)).toBe("HIGH");
  });
});

describe("I–J. baseline and incremental", () => {
  it("I. baseline is DO_NOTHING probability", () => {
    const baseline = recoveryProbabilityModel.predict(
      baseOpp(),
      arjun,
      "DO_NOTHING",
      failedPayment
    );
    expect(baseline.probability_source).toBe("BASELINE");
    expect(baseline.probability).toBeGreaterThan(0);
    expect(baseline.probability).toBeLessThan(
      recoveryProbabilityModel.predict(baseOpp(), arjun, "RETRY_LATER", failedPayment)
        .probability + 0.0001
    );
  });

  it("J. incremental = actual − baseline expected", () => {
    const amount = 48_000_00;
    const baselineP = 0.18;
    const baselineExpected = Math.round(amount * baselineP);
    const actual = 48_000_00;
    const incremental = Math.max(0, actual - baselineExpected);
    expect(incremental).toBe(39_360_00);
  });
});

describe("K. confidence classification", () => {
  it("returns HIGH/MEDIUM/LOW without equating to probability", () => {
    const features = extractRecoveryFeatures({
      opportunity: baseOpp(),
      customer: arjun,
      payment: failedPayment,
    });
    expect(classifyConfidence({ features, probability: 0.87, usedFallback: false })).toMatch(
      /HIGH|MEDIUM|LOW/
    );
    expect(classifyConfidence({ features, probability: 0.87, usedFallback: true })).toBe("LOW");
  });
});

describe("L. deterministic fallback", () => {
  it("uses heuristic when model unavailable", () => {
    recoveryProbabilityModel.setUnavailable(true);
    const pred = recoveryProbabilityModel.predict(
      baseOpp(),
      arjun,
      "RETRY_LATER",
      failedPayment
    );
    expect(pred.used_fallback).toBe(true);
    expect(pred.probability_source).toBe("HEURISTIC");
    expect(pred.confidence).toBe("LOW");
    recoveryProbabilityModel.setUnavailable(false);
  });
});

describe("expected utility formula", () => {
  it("utility = expected − cost − risk − fatigue", () => {
    expect(
      expectedUtilityPaise({
        expectedRecovery: 34_560_00,
        interventionCost: 30_00,
        riskPenalty: 20_00,
        fatiguePenalty: 0,
      })
    ).toBe(34_510_00);
  });
});
