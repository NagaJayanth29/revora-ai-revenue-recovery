/**
 * Recovery feature extraction — server-side, Supabase-available fields only.
 * No sensitive personal attributes (name/email/phone unused as predictors).
 */

import type {
  Customer,
  FailureCategory,
  InterventionType,
  OpportunitySource,
  Payment,
  RecoveryOpportunity,
} from "@/lib/domain/types";

/** Typed feature object for explainability / Copilot / audits. */
export interface RecoveryFeatures {
  amount: number; // paise
  amountRupees: number;
  paymentMethod: string;
  failureCategory: FailureCategory | "UNKNOWN";
  failureReason: string | null;
  attempts: number;
  customerSuccessCount: number;
  customerFailureCount: number;
  customerSuccessRate: number;
  lifetimePaid: number; // paise
  averagePaymentAmount: number; // paise
  hoursSinceFailure: number;
  previousRecoveryRate: number;
  source: OpportunitySource;
  returningCustomer: boolean;
  /** Completeness 0–1 for confidence */
  featureCompleteness: number;
}

/** Ordered numeric feature names — must match trained artifact. */
export const MODEL_FEATURE_NAMES = [
  "log_amount",
  "attempt_count",
  "customer_success_rate",
  "customer_failure_count_norm",
  "lifetime_paid_log",
  "avg_payment_log",
  "hours_since_failure_norm",
  "previous_recovery_rate",
  "source_failed_payment",
  "source_abandonment",
  "source_recurring",
  "insufficient_funds",
  "bank_decline",
  "network_error",
  "auth_failed",
  "expired_card",
  "gateway_timeout",
  "customer_cancelled",
  "method_upi",
  "method_card",
  "method_netbanking",
  "returning_customer",
  "intervention_do_nothing",
  "intervention_retry_now",
  "intervention_retry_later",
  "intervention_payment_link",
  "intervention_reminder",
  "intervention_human",
] as const;

export type ModelFeatureName = (typeof MODEL_FEATURE_NAMES)[number];

export interface FeatureVector {
  names: readonly string[];
  values: number[];
}

export interface FeatureExtractionInput {
  opportunity: RecoveryOpportunity;
  customer: Customer | null;
  payment?: Payment | null;
  now?: Date;
}

function paymentMethodOf(
  opportunity: RecoveryOpportunity,
  payment: Payment | null | undefined
): string {
  const fromPay = payment?.method?.toLowerCase();
  const fromMeta = String(opportunity.metadata?.payment_method ?? "").toLowerCase();
  return fromPay || fromMeta || "unknown";
}

export function extractRecoveryFeatures(input: FeatureExtractionInput): RecoveryFeatures {
  const { opportunity, customer, payment, now = new Date() } = input;
  const successCount = customer?.success_count ?? 0;
  const failureCount = customer?.failure_count ?? 0;
  const total = successCount + failureCount;
  const customerSuccessRate = total > 0 ? successCount / total : 0.3;
  const lifetimePaid = customer?.total_paid ?? 0;
  const averagePaymentAmount =
    successCount > 0 ? Math.round(lifetimePaid / successCount) : opportunity.amount;
  const hoursSinceFailure = Math.min(
    168,
    Math.max(0, (now.getTime() - new Date(opportunity.created_at).getTime()) / 3600000)
  );

  let completeness = 0;
  const checks = [
    opportunity.amount > 0,
    Boolean(opportunity.failure_category),
    Boolean(paymentMethodOf(opportunity, payment) !== "unknown"),
    customer != null,
    customer?.success_count != null,
    customer?.failure_count != null,
    customer?.total_paid != null,
    Boolean(opportunity.source),
    opportunity.attempt_count >= 0,
    Boolean(opportunity.created_at),
  ];
  completeness = checks.filter(Boolean).length / checks.length;

  return {
    amount: opportunity.amount,
    amountRupees: opportunity.amount / 100,
    paymentMethod: paymentMethodOf(opportunity, payment),
    failureCategory: opportunity.failure_category ?? "UNKNOWN",
    failureReason: opportunity.failure_reason,
    attempts: opportunity.attempt_count,
    customerSuccessCount: successCount,
    customerFailureCount: failureCount,
    customerSuccessRate,
    lifetimePaid,
    averagePaymentAmount,
    hoursSinceFailure,
    previousRecoveryRate: customerSuccessRate,
    source: opportunity.source,
    returningCustomer: successCount >= 2,
    featureCompleteness: completeness,
  };
}

const INTERVENTION_ONE_HOT: Record<InterventionType, ModelFeatureName> = {
  DO_NOTHING: "intervention_do_nothing",
  RETRY_NOW: "intervention_retry_now",
  RETRY_LATER: "intervention_retry_later",
  PAYMENT_LINK: "intervention_payment_link",
  REMINDER: "intervention_reminder",
  HUMAN_ESCALATION: "intervention_human",
};

/** Build the numeric vector consumed by the logistic model. */
export function featuresToVector(
  features: RecoveryFeatures,
  intervention?: InterventionType
): FeatureVector {
  const cat = features.failureCategory.toLowerCase();
  const method = features.paymentMethod.toLowerCase();
  const byName: Record<string, number> = {
    log_amount: Math.log1p(features.amountRupees),
    attempt_count: features.attempts,
    customer_success_rate: features.customerSuccessRate,
    customer_failure_count_norm: Math.min(1, features.customerFailureCount / 10),
    lifetime_paid_log: Math.log1p(features.lifetimePaid / 100),
    avg_payment_log: Math.log1p(features.averagePaymentAmount / 100),
    hours_since_failure_norm: Math.min(1, features.hoursSinceFailure / 72),
    previous_recovery_rate: features.previousRecoveryRate,
    source_failed_payment: features.source === "FAILED_PAYMENT" ? 1 : 0,
    source_abandonment: features.source === "CHECKOUT_ABANDONMENT" ? 1 : 0,
    source_recurring: features.source === "RECURRING_FAILURE" ? 1 : 0,
    insufficient_funds: cat.includes("insufficient") ? 1 : 0,
    bank_decline: cat.includes("bank") ? 1 : 0,
    network_error: cat.includes("network") ? 1 : 0,
    auth_failed: cat.includes("auth") ? 1 : 0,
    expired_card: cat.includes("expired") ? 1 : 0,
    gateway_timeout: cat.includes("gateway") || cat.includes("timeout") ? 1 : 0,
    customer_cancelled: cat.includes("cancel") ? 1 : 0,
    method_upi: method.includes("upi") ? 1 : 0,
    method_card: method.includes("card") ? 1 : 0,
    method_netbanking: method.includes("net") ? 1 : 0,
    returning_customer: features.returningCustomer ? 1 : 0,
    intervention_do_nothing: 0,
    intervention_retry_now: 0,
    intervention_retry_later: 0,
    intervention_payment_link: 0,
    intervention_reminder: 0,
    intervention_human: 0,
  };

  if (intervention) {
    byName[INTERVENTION_ONE_HOT[intervention]] = 1;
  }

  const values = MODEL_FEATURE_NAMES.map((n) => byName[n] ?? 0);
  return { names: MODEL_FEATURE_NAMES, values };
}

export function extractFeatureVector(
  opportunity: RecoveryOpportunity,
  customer: Customer | null,
  intervention?: InterventionType,
  payment?: Payment | null,
  now = new Date()
): { features: RecoveryFeatures; vector: FeatureVector } {
  const features = extractRecoveryFeatures({ opportunity, customer, payment, now });
  return { features, vector: featuresToVector(features, intervention) };
}
