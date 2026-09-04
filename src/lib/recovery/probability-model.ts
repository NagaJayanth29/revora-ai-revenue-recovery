/**
 * Compatibility façade — prefer `@/lib/ai/*` for new code.
 * Keeps existing imports (`probability-model`) working.
 */

export {
  MODEL_NAME,
  MODEL_VERSION,
  MODEL_DATA_LABEL,
  recoveryProbabilityModel,
  RecoveryProbabilityModel,
} from "@/lib/ai/recovery-model";

export {
  extractRecoveryFeatures as extractTypedFeatures,
  extractFeatureVector,
  featuresToVector,
  MODEL_FEATURE_NAMES,
} from "@/lib/ai/features";

export {
  compareInterventions,
  eligibleActions,
  expectedRecoveryPaise,
  expectedUtilityPaise,
  INTERVENTION_COSTS,
  RISK_PENALTIES,
} from "@/lib/ai/decision-engine";

import type { Customer, InterventionType, RecoveryOpportunity } from "@/lib/domain/types";
import { extractFeatureVector } from "@/lib/ai/features";

/** Legacy helper used by older tests/callers. */
export function extractFeatures(
  opportunity: RecoveryOpportunity,
  customer: Customer | null,
  intervention?: string
) {
  return extractFeatureVector(
    opportunity,
    customer,
    intervention as InterventionType | undefined
  ).vector;
}
