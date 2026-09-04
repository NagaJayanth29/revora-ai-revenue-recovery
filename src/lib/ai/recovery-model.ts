/**
 * Recovery probability model — logistic regression loaded from trained artifact.
 * DEMO / SYNTHETIC — not production-grade.
 */

import type {
  ConfidenceLevel,
  Customer,
  InterventionType,
  Payment,
  ProbabilityPrediction,
  RecoveryOpportunity,
} from "@/lib/domain/types";
import {
  extractFeatureVector,
  extractRecoveryFeatures,
  type RecoveryFeatures,
} from "@/lib/ai/features";
import { classifyConfidence } from "@/lib/ai/confidence";
import artifact from "@/lib/ai/artifacts/recovery_probability_v0.1-demo.json";

export const MODEL_NAME = artifact.model_name as string;
export const MODEL_VERSION = artifact.model_version as string;
export const MODEL_DATA_LABEL = artifact.data_label as string;

export type ProbabilitySource = "MODEL" | "HEURISTIC" | "BASELINE";

export interface ModelArtifact {
  model_name: string;
  model_version: string;
  data_label: string;
  feature_names: string[];
  feature_mean?: number[];
  feature_std?: number[];
  weights: Record<string, number>;
  clamp: { min: number; max: number };
  metrics?: Record<string, unknown>;
  notes?: string;
}

const FEATURE_LABELS: Record<string, string> = {
  log_amount: "transaction amount",
  attempt_count: "prior recovery attempts",
  customer_success_rate: "customer historical success rate",
  customer_failure_count_norm: "customer failure history",
  lifetime_paid_log: "customer lifetime paid",
  avg_payment_log: "average payment amount",
  hours_since_failure_norm: "time since failure",
  previous_recovery_rate: "previous recovery rate",
  source_failed_payment: "failed payment source",
  source_abandonment: "checkout abandonment source",
  source_recurring: "recurring failure source",
  insufficient_funds: "insufficient funds pattern",
  bank_decline: "bank decline pattern",
  network_error: "transient network error",
  auth_failed: "authentication failure",
  expired_card: "expired instrument",
  gateway_timeout: "gateway timeout",
  customer_cancelled: "customer cancellation",
  method_upi: "UPI payment method",
  method_card: "card payment method",
  method_netbanking: "netbanking method",
  returning_customer: "returning customer",
  intervention_do_nothing: "do-nothing intervention",
  intervention_retry_now: "retry-now intervention",
  intervention_retry_later: "retry-later intervention",
  intervention_payment_link: "payment-link intervention",
  intervention_reminder: "reminder intervention",
  intervention_human: "human-escalation intervention",
};

function sigmoid(z: number): number {
  if (z > 20) return 1;
  if (z < -20) return 0;
  return 1 / (1 + Math.exp(-z));
}

function standardizeValues(
  values: number[],
  mean?: number[],
  std?: number[]
): number[] {
  if (!mean || !std || mean.length !== values.length) return values;
  return values.map((v, i) => {
    const s = std[i] < 1e-6 ? 1 : std[i];
    return (v - mean[i]) / s;
  });
}

function scoreVector(
  values: number[],
  names: readonly string[],
  weights: Record<string, number>
) {
  let logit = weights.bias ?? 0;
  const contributions: Array<{ feature: string; contribution: number }> = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const value = values[i];
    const w = weights[name] ?? 0;
    const contribution = w * value;
    logit += contribution;
    if (Math.abs(contribution) > 0.04) {
      contributions.push({ feature: name, contribution });
    }
  }
  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { logit, contributions };
}

export interface ExtendedProbabilityPrediction extends ProbabilityPrediction {
  model_name: string;
  prediction_timestamp: string;
  probability_source: ProbabilitySource;
  features?: RecoveryFeatures;
}

export class RecoveryProbabilityModel {
  private unavailable = false;
  private readonly art: ModelArtifact;

  constructor(art: ModelArtifact = artifact as ModelArtifact) {
    this.art = art;
  }

  setUnavailable(flag: boolean) {
    this.unavailable = flag;
  }

  isAvailable(): boolean {
    return !this.unavailable;
  }

  getModelMeta() {
    return {
      model_name: this.art.model_name,
      model_version: this.art.model_version,
      data_label: this.art.data_label,
      metrics: this.art.metrics ?? null,
    };
  }

  predict(
    opportunity: RecoveryOpportunity,
    customer: Customer | null,
    intervention?: InterventionType,
    payment?: Payment | null
  ): ExtendedProbabilityPrediction {
    if (this.unavailable) {
      return this.fallbackPredict(opportunity, customer, intervention, payment);
    }

    const { features, vector } = extractFeatureVector(
      opportunity,
      customer,
      intervention,
      payment
    );
    const scaled = standardizeValues(
      vector.values,
      this.art.feature_mean,
      this.art.feature_std
    );
    const { logit, contributions } = scoreVector(
      scaled,
      vector.names,
      this.art.weights
    );
    const raw = sigmoid(logit);
    const probability = Math.min(
      this.art.clamp.max,
      Math.max(this.art.clamp.min, raw)
    );

    const source: ProbabilitySource =
      intervention === "DO_NOTHING" ? "BASELINE" : "MODEL";

    const confidence = classifyConfidence({
      features,
      probability,
      usedFallback: false,
      supportHint: Math.round(40 * features.featureCompleteness),
    });

    return {
      probability,
      confidence,
      factors: contributions.slice(0, 5).map((c) => ({
        feature: FEATURE_LABELS[c.feature] ?? c.feature,
        contribution: Math.round(c.contribution * 1000) / 1000,
        direction: (c.contribution >= 0 ? "positive" : "negative") as
          | "positive"
          | "negative",
      })),
      model_version: this.art.model_version,
      model_name: this.art.model_name,
      used_fallback: false,
      prediction_timestamp: new Date().toISOString(),
      probability_source: source,
      features,
    };
  }

  explain(
    opportunity: RecoveryOpportunity,
    customer: Customer | null,
    intervention?: InterventionType,
    payment?: Payment | null
  ): ExtendedProbabilityPrediction {
    return this.predict(opportunity, customer, intervention, payment);
  }

  fallbackPredict(
    opportunity: RecoveryOpportunity,
    customer: Customer | null,
    intervention?: InterventionType,
    payment?: Payment | null
  ): ExtendedProbabilityPrediction {
    const features = extractRecoveryFeatures({ opportunity, customer, payment });
    let p = 0.25 + features.customerSuccessRate * 0.35;

    if (features.failureCategory === "INSUFFICIENT_FUNDS") p += 0.2;
    if (
      features.failureCategory === "NETWORK_ERROR" ||
      features.failureCategory === "GATEWAY_TIMEOUT"
    )
      p += 0.15;
    if (
      features.failureCategory === "EXPIRED_CARD" ||
      features.failureCategory === "CUSTOMER_CANCELLED"
    )
      p -= 0.2;
    p -= features.attempts * 0.08;

    if (intervention === "RETRY_LATER") p += 0.18;
    else if (intervention === "RETRY_NOW") p += 0.05;
    else if (intervention === "PAYMENT_LINK") p += 0.12;
    else if (intervention === "DO_NOTHING") p -= 0.15;

    p = Math.min(0.9, Math.max(0.05, p));

    return {
      probability: p,
      confidence: "LOW" as ConfidenceLevel,
      factors: [
        {
          feature: "deterministic heuristic fallback active",
          contribution: 0,
          direction: "positive",
        },
        {
          feature: "customer historical success rate",
          contribution: features.customerSuccessRate,
          direction: features.customerSuccessRate >= 0.5 ? "positive" : "negative",
        },
        {
          feature: "failure category heuristic",
          contribution: 0.1,
          direction: "positive",
        },
      ],
      model_version: `${this.art.model_version}-fallback`,
      model_name: this.art.model_name,
      used_fallback: true,
      prediction_timestamp: new Date().toISOString(),
      probability_source: "HEURISTIC",
      features,
    };
  }
}

export const recoveryProbabilityModel = new RecoveryProbabilityModel();
