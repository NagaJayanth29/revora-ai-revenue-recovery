import {
  compareInterventions,
  recoveryProbabilityModel,
  extractRecoveryFeatures,
  MODEL_VERSION,
  MODEL_NAME,
  MODEL_DATA_LABEL,
} from "../src/lib/ai/index";
import type { Customer, Payment, RecoveryOpportunity } from "../src/lib/domain/types";

const opp = {
  id: "a0000000-0000-4000-8000-000000000051",
  merchant_id: "a0000000-0000-4000-8000-000000000001",
  customer_id: "a0000000-0000-4000-8000-000000000011",
  transaction_id: "t",
  order_id: "o",
  payment_id: "p",
  amount: 4_800_000,
  currency: "INR",
  source: "FAILED_PAYMENT",
  event_type: "payment.failed",
  failure_reason: "Insufficient funds in customer account",
  failure_category: "INSUFFICIENT_FUNDS",
  status: "READY",
  risk_level: "HIGH",
  recovery_probability: null,
  confidence: null,
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
} as RecoveryOpportunity;

const customer = {
  id: "a0000000-0000-4000-8000-000000000011",
  merchant_id: opp.merchant_id,
  external_id: null,
  name: "Arjun Mehta",
  email: "a@x.com",
  phone: null,
  success_count: 7,
  failure_count: 1,
  total_paid: 31_200_000,
  last_payment_at: null,
  created_at: new Date().toISOString(),
} as Customer;

const payment = { status: "failed", method: "upi" } as Payment;
const features = extractRecoveryFeatures({ opportunity: opp, customer, payment });
const decision = compareInterventions(opp, customer, payment);
const baseline = recoveryProbabilityModel.predict(opp, customer, "DO_NOTHING", payment);

console.log(
  JSON.stringify(
    {
      model_name: MODEL_NAME,
      model_version: MODEL_VERSION,
      data_label: MODEL_DATA_LABEL,
      features: {
        amount: features.amountRupees,
        method: features.paymentMethod,
        failure: features.failureCategory,
        attempts: features.attempts,
        success_rate: features.customerSuccessRate,
        lifetime_paid: features.lifetimePaid / 100,
      },
      recommended: decision.recommended_action,
      probability: decision.probability,
      expected_paise: decision.expected_value,
      expected_inr: decision.expected_value / 100,
      confidence: decision.confidence,
      baseline_probability: baseline.probability,
      alternatives: decision.alternatives.map((a) => ({
        action: a.action,
        p: Number(a.probability.toFixed(4)),
        ev: a.expected_value / 100,
        src: a.probability_source,
      })),
    },
    null,
    2
  )
);
