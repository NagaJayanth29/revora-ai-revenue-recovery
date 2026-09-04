/**
 * Explainability helpers — evidence from actual features, no unsupported claims.
 */

import type {
  Customer,
  InterventionType,
  RecoveryOpportunity,
} from "@/lib/domain/types";
import { formatINR } from "@/lib/utils";
import type { RecoveryFeatures } from "@/lib/ai/features";
import type {
  ExtendedProbabilityPrediction,
  ProbabilitySource,
} from "@/lib/ai/recovery-model";
import { MODEL_DATA_LABEL } from "@/lib/ai/recovery-model";

export interface DecisionEvidenceItem {
  title: string;
  detail: string;
}

type RecommendedSummary = {
  action: InterventionType;
  expected_value: number;
  utility: number;
  probability_source: ProbabilitySource;
};

export function buildDecisionEvidence(params: {
  opportunity: RecoveryOpportunity;
  customer: Customer | null;
  features?: RecoveryFeatures;
  modelExpectedPaise: number;
  policyReason?: string | null;
}): DecisionEvidenceItem[] {
  const { opportunity, customer, features, modelExpectedPaise, policyReason } = params;
  const successRate = features?.customerSuccessRate;
  const items: DecisionEvidenceItem[] = [
    {
      title: "Failure reason",
      detail:
        opportunity.failure_reason ??
        opportunity.failure_category?.replace(/_/g, " ") ??
        "Unknown",
    },
    {
      title: "Transaction economics",
      detail: `${formatINR(opportunity.amount)} at risk · model expected ${formatINR(modelExpectedPaise)}`,
    },
    {
      title: "Customer / payment context",
      detail:
        successRate != null
          ? `${((successRate ?? 0) * 100).toFixed(1)}% historical payment success · ${features?.customerSuccessCount ?? customer?.success_count ?? 0} successful / ${features?.customerFailureCount ?? customer?.failure_count ?? 0} failed · method ${features?.paymentMethod ?? "n/a"}`
          : `${customer?.name ?? "Customer"} · success ${customer?.success_count ?? 0} / fail ${customer?.failure_count ?? 0}`,
    },
    {
      title: "Previous attempts",
      detail: `${opportunity.attempt_count} attempt${opportunity.attempt_count === 1 ? "" : "s"} recorded`,
    },
    {
      title: "Policy constraints",
      detail: policyReason ?? opportunity.policy_reason ?? opportunity.policy_status?.replace(/_/g, " ") ?? "Pending",
    },
    {
      title: "Confidence",
      detail: `${opportunity.confidence ?? "—"} · ${MODEL_DATA_LABEL}`,
    },
  ];
  return items;
}

export function buildKeyFactors(params: {
  opportunity: RecoveryOpportunity;
  customer: Customer | null;
  prediction: ExtendedProbabilityPrediction;
  recommended: InterventionType;
}): string[] {
  const factors = params.prediction.factors.slice(0, 4).map((f) => {
    const dir = f.direction === "positive" ? "supports recovery" : "reduces recovery odds";
    return `${f.feature} (${dir})`;
  });

  const features = params.prediction.features;
  if (features && features.customerSuccessRate >= 0.7) {
    factors.unshift(
      `customer success rate ${(features.customerSuccessRate * 100).toFixed(0)}% from observed payment history`
    );
  }
  if (features?.failureCategory === "INSUFFICIENT_FUNDS") {
    factors.unshift(
      `observed failure category INSUFFICIENT_FUNDS with ${params.recommended.replace(/_/g, " ")} ranked highest by expected utility`
    );
  }

  return factors.slice(0, 5);
}

export function buildDecisionExplanation(params: {
  opportunity: RecoveryOpportunity;
  customer: Customer | null;
  recommended: RecommendedSummary;
  prediction: ExtendedProbabilityPrediction;
}): string {
  const { opportunity, recommended, prediction } = params;
  if (prediction.used_fallback) {
    return `AI model unavailable — deterministic heuristic fallback active. Recommendation derived from failure category, customer history, and attempt count. ${MODEL_DATA_LABEL}.`;
  }

  const actionLabel = recommended.action.replace(/_/g, " ");
  const features = prediction.features;
  const historyBit =
    features != null
      ? `customer payment history (${(features.customerSuccessRate * 100).toFixed(0)}% success), `
      : "";

  return (
    `Given the observed failure reason (${opportunity.failure_reason ?? opportunity.failure_category ?? "unknown"}), ` +
    `${historyBit}and available retry window, the model estimates ${actionLabel} has the highest expected recovery value ` +
    `(${formatINR(recommended.expected_value)} expected · utility ${formatINR(recommended.utility)} after costs and risk). ` +
    `Source: ${recommended.probability_source}. Model ${prediction.model_name}@${prediction.model_version}. ${MODEL_DATA_LABEL}.`
  );
}
