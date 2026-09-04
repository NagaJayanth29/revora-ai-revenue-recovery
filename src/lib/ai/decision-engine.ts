/**
 * Counterfactual decision engine.
 *
 * expectedUtility = expectedRecovery − interventionCost − riskPenalty − fatiguePenalty
 * where expectedRecovery = amount × probability(action)
 *
 * Probability comes from the recovery model (or heuristic fallback).
 * Policy is applied separately — this module only ranks actions.
 */

import type {
  Customer,
  CounterfactualDecision,
  InterventionComparison,
  InterventionType,
  Payment,
  RecoveryOpportunity,
} from "@/lib/domain/types";
import {
  recoveryProbabilityModel,
  type ProbabilitySource,
} from "@/lib/ai/recovery-model";
import { buildDecisionExplanation, buildKeyFactors } from "@/lib/ai/explanations";

/** Intervention cost in paise (ops / messaging / processor). */
export const INTERVENTION_COSTS: Record<InterventionType, number> = {
  DO_NOTHING: 0,
  RETRY_NOW: 50_00,
  RETRY_LATER: 30_00,
  PAYMENT_LINK: 40_00,
  REMINDER: 20_00,
  HUMAN_ESCALATION: 200_00,
};

/** Customer / contact risk penalty in paise. */
export const RISK_PENALTIES: Record<InterventionType, number> = {
  DO_NOTHING: 0,
  RETRY_NOW: 80_00,
  RETRY_LATER: 20_00,
  PAYMENT_LINK: 15_00,
  REMINDER: 25_00,
  HUMAN_ESCALATION: 10_00,
};

const ALL_ACTIONS: InterventionType[] = [
  "DO_NOTHING",
  "RETRY_NOW",
  "RETRY_LATER",
  "PAYMENT_LINK",
  "REMINDER",
  "HUMAN_ESCALATION",
];

export interface ScoredIntervention extends InterventionComparison {
  probability_source: ProbabilitySource;
}

/**
 * Action eligibility — not every intervention is valid for every opportunity.
 */
export function eligibleActions(
  opportunity: RecoveryOpportunity,
  payment?: Payment | null
): InterventionType[] {
  const actions: InterventionType[] = ["DO_NOTHING"];
  const paid =
    payment?.status === "captured" ||
    payment?.status === "authorized" ||
    opportunity.status === "RECOVERED";

  if (paid) return actions;

  const source = opportunity.source;
  const canRetry =
    source === "FAILED_PAYMENT" ||
    source === "RECURRING_FAILURE" ||
    source === "PAYMENT_LINK";

  if (canRetry) {
    actions.push("RETRY_NOW", "RETRY_LATER");
  }

  if (
    source === "FAILED_PAYMENT" ||
    source === "CHECKOUT_ABANDONMENT" ||
    source === "PAYMENT_LINK" ||
    source === "OVERDUE_RECEIVABLE"
  ) {
    actions.push("PAYMENT_LINK");
  }

  if (opportunity.failure_category !== "CUSTOMER_CANCELLED") {
    actions.push("REMINDER");
  }

  if (opportunity.amount >= 20_000_00 || opportunity.risk_level === "CRITICAL") {
    actions.push("HUMAN_ESCALATION");
  }

  return [...new Set(actions)];
}

export function expectedRecoveryPaise(amountPaise: number, probability: number): number {
  return Math.round(amountPaise * probability);
}

export function expectedUtilityPaise(params: {
  expectedRecovery: number;
  interventionCost: number;
  riskPenalty: number;
  fatiguePenalty?: number;
}): number {
  return (
    params.expectedRecovery -
    params.interventionCost -
    params.riskPenalty -
    (params.fatiguePenalty ?? 0)
  );
}

export function compareInterventions(
  opportunity: RecoveryOpportunity,
  customer: Customer | null,
  payment?: Payment | null,
  opts?: { analysisMode?: boolean }
): CounterfactualDecision {
  // For RECOVERED / analysis-only refreshes, score the full intervention set as a
  // counterfactual on current features (attempts, etc.) — do not collapse to DO_NOTHING
  // merely because payment is already captured.
  const analysisMode = Boolean(opts?.analysisMode || opportunity.status === "RECOVERED");
  const eligibilityOpp = analysisMode
    ? { ...opportunity, status: "READY" as const }
    : opportunity;
  const eligibilityPayment = analysisMode
    ? payment
      ? { ...payment, status: "failed" as const }
      : payment
    : payment;

  const candidates = eligibleActions(eligibilityOpp, eligibilityPayment);

  const comparisons: ScoredIntervention[] = candidates.map((action) => {
    const pred = recoveryProbabilityModel.predict(
      opportunity,
      customer,
      action,
      payment
    );
    const probability = pred.probability;
    const expectedValue = expectedRecoveryPaise(opportunity.amount, probability);
    const cost = INTERVENTION_COSTS[action];
    const riskPenalty = RISK_PENALTIES[action];
    const fatigue =
      action === "RETRY_NOW" && opportunity.attempt_count >= 1
        ? 100_00 * opportunity.attempt_count
        : 0;
    const utility = expectedUtilityPaise({
      expectedRecovery: expectedValue,
      interventionCost: cost,
      riskPenalty,
      fatiguePenalty: fatigue,
    });

    return {
      action,
      probability,
      expected_value: expectedValue,
      cost: cost + fatigue,
      risk_penalty: riskPenalty,
      utility,
      probability_source: pred.probability_source,
    };
  });

  comparisons.sort((a, b) => b.utility - a.utility);
  const best = comparisons[0];
  const bestPred = recoveryProbabilityModel.predict(
    opportunity,
    customer,
    best.action,
    payment
  );

  const alternatives: InterventionComparison[] = comparisons.map((c, idx) => {
    if (idx === 0) return c;
    let rejected_reason = "Lower expected utility than recommended action";
    if (c.action === "DO_NOTHING" && best.action !== "DO_NOTHING") {
      rejected_reason = "Leaves recoverable revenue unaddressed";
    } else if (c.action === "RETRY_NOW" && best.action === "RETRY_LATER") {
      rejected_reason =
        "Immediate retry has lower expected utility for this opportunity profile";
    } else if (c.utility < best.utility - 500_00) {
      rejected_reason = `Expected utility ₹${Math.round((best.utility - c.utility) / 100)} lower`;
    }
    return { ...c, rejected_reason };
  });

  const key_factors = buildKeyFactors({
    opportunity,
    customer,
    prediction: bestPred,
    recommended: best.action,
  });

  const explanation = buildDecisionExplanation({
    opportunity,
    customer,
    recommended: best,
    prediction: bestPred,
  });

  return {
    recommended_action: best.action,
    probability: best.probability,
    expected_value: best.expected_value,
    confidence: bestPred.confidence,
    key_factors,
    alternatives,
    explanation,
    used_fallback: bestPred.used_fallback,
    model_version: bestPred.model_version,
    model_name: bestPred.model_name,
  };
}
