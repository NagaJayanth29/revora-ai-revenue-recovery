export {
  extractRecoveryFeatures,
  extractFeatureVector,
  featuresToVector,
  MODEL_FEATURE_NAMES,
  type RecoveryFeatures,
} from "@/lib/ai/features";

export {
  recoveryProbabilityModel,
  RecoveryProbabilityModel,
  MODEL_NAME,
  MODEL_VERSION,
  MODEL_DATA_LABEL,
  type ExtendedProbabilityPrediction,
  type ProbabilitySource,
} from "@/lib/ai/recovery-model";

export {
  compareInterventions,
  eligibleActions,
  expectedRecoveryPaise,
  expectedUtilityPaise,
  INTERVENTION_COSTS,
  RISK_PENALTIES,
} from "@/lib/ai/decision-engine";

export { classifyConfidence } from "@/lib/ai/confidence";

export {
  buildDecisionEvidence,
  buildDecisionExplanation,
  buildKeyFactors,
} from "@/lib/ai/explanations";
