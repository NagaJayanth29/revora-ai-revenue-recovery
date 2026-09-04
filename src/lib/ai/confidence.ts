import type { ConfidenceLevel } from "@/lib/domain/types";
import type { RecoveryFeatures } from "@/lib/ai/features";

export interface ConfidenceInput {
  features: RecoveryFeatures;
  probability: number;
  usedFallback: boolean;
  /** Approximate historical support for this failure×intervention cell (synthetic demo). */
  supportHint?: number;
}

/**
 * Confidence ≠ probability.
 * Probability = chance of recovery.
 * Confidence = reliability of that estimate given evidence / model quality.
 */
export function classifyConfidence(input: ConfidenceInput): ConfidenceLevel {
  if (input.usedFallback) return "LOW";

  const completeness = input.features.featureCompleteness;
  const extremity = Math.abs(input.probability - 0.5);
  const support = input.supportHint ?? (completeness > 0.8 ? 40 : 10);
  const attemptsOk = input.features.attempts <= 2;

  let score = 0;
  score += completeness * 0.4;
  score += Math.min(1, support / 50) * 0.3;
  score += extremity * 0.2;
  score += attemptsOk ? 0.1 : 0;

  if (score >= 0.72 && completeness >= 0.7) return "HIGH";
  if (score >= 0.45) return "MEDIUM";
  return "LOW";
}
