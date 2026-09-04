/** REVORA domain types — source of truth for recovery lifecycle */

export type Currency = "INR";

export type OpportunityStatus =
  | "DETECTED"
  | "ANALYZING"
  | "READY"
  | "AWAITING_APPROVAL"
  | "EXECUTING"
  | "WAITING_FOR_OUTCOME"
  | "RECOVERED"
  | "FAILED"
  | "EXPIRED"
  | "ESCALATED"
  | "BLOCKED"
  | "CANCELLED";

export type OpportunitySource =
  | "FAILED_PAYMENT"
  | "CHECKOUT_ABANDONMENT"
  | "RECURRING_FAILURE"
  | "PAYMENT_LINK"
  | "OVERDUE_RECEIVABLE";

export type FailureCategory =
  | "INSUFFICIENT_FUNDS"
  | "BANK_DECLINE"
  | "NETWORK_ERROR"
  | "AUTHENTICATION_FAILED"
  | "EXPIRED_CARD"
  | "GATEWAY_TIMEOUT"
  | "CUSTOMER_CANCELLED"
  | "UNKNOWN";

export type InterventionType =
  | "DO_NOTHING"
  | "RETRY_NOW"
  | "RETRY_LATER"
  | "PAYMENT_LINK"
  | "REMINDER"
  | "HUMAN_ESCALATION";

export type PolicyDecisionType = "SAFE_TO_EXECUTE" | "REQUIRES_APPROVAL" | "BLOCKED";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AutonomyMode = "AUTO" | "REVIEW_REQUIRED" | "BLOCKED";

export type ActorType = "AI" | "SYSTEM" | "MERCHANT" | "RAZORPAY" | "CUSTOMER" | "WEBHOOK";

export type PaymentStatus =
  | "created"
  | "authorized"
  | "captured"
  | "failed"
  | "refunded"
  | "pending";

export interface Merchant {
  id: string;
  name: string;
  slug: string;
  razorpay_key_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  merchant_id: string;
  email: string;
  name: string;
  role: "owner" | "ops" | "viewer";
  created_at: string;
}

export interface Customer {
  id: string;
  merchant_id: string;
  external_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  success_count: number;
  failure_count: number;
  total_paid: number;
  last_payment_at: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  merchant_id: string;
  customer_id: string;
  razorpay_order_id: string | null;
  amount: number;
  currency: Currency;
  status: "created" | "attempted" | "paid";
  receipt: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  merchant_id: string;
  customer_id: string;
  order_id: string;
  razorpay_payment_id: string | null;
  amount: number;
  currency: Currency;
  status: PaymentStatus;
  method: string | null;
  failure_reason: string | null;
  failure_category: FailureCategory | null;
  error_code: string | null;
  attempt_count: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  merchant_id: string;
  customer_id: string;
  order_id: string;
  payment_id: string | null;
  amount: number;
  currency: Currency;
  status: string;
  source: OpportunitySource;
  created_at: string;
}

export interface RecoveryOpportunity {
  id: string;
  merchant_id: string;
  customer_id: string;
  transaction_id: string;
  order_id: string;
  payment_id: string | null;
  amount: number;
  currency: Currency;
  source: OpportunitySource;
  event_type: string;
  failure_reason: string | null;
  failure_category: FailureCategory | null;
  status: OpportunityStatus;
  risk_level: RiskLevel;
  recovery_probability: number | null;
  confidence: ConfidenceLevel | null;
  expected_recovery_value: number | null;
  recommended_action: InterventionType | null;
  policy_status: PolicyDecisionType | null;
  policy_reason: string | null;
  autonomy_mode: AutonomyMode | null;
  attempt_count: number;
  last_action_at: string | null;
  next_action_at: string | null;
  actual_recovered_amount: number;
  incremental_recovered_amount: number;
  baseline_probability: number | null;
  experiment_arm: "control" | "treatment" | null;
  resolved_at: string | null;
  created_by: ActorType;
  correlation_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InterventionComparison {
  action: InterventionType;
  probability: number;
  expected_value: number;
  cost: number;
  risk_penalty: number;
  utility: number;
  rejected_reason?: string;
  /** MODEL | HEURISTIC | BASELINE */
  probability_source?: "MODEL" | "HEURISTIC" | "BASELINE";
}

export interface AiRecommendation {
  id: string;
  merchant_id: string;
  opportunity_id: string;
  recommended_action: InterventionType;
  recovery_probability: number;
  expected_recovery_value: number;
  confidence: ConfidenceLevel;
  key_factors: string[];
  alternatives: InterventionComparison[];
  explanation: string;
  model_version: string;
  used_fallback: boolean;
  created_at: string;
}

export interface PolicyRules {
  id: string;
  merchant_id: string;
  max_retry_attempts: number;
  min_retry_interval_minutes: number;
  max_auto_action_amount: number;
  min_ai_confidence: ConfidenceLevel;
  max_reminders_per_24h: number;
  high_risk_requires_approval: boolean;
  block_already_paid: boolean;
  allow_auto_retry: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface PolicyDecision {
  id: string;
  merchant_id: string;
  opportunity_id: string;
  action: InterventionType;
  decision: PolicyDecisionType;
  reasons: string[];
  checks: PolicyCheck[];
  created_at: string;
}

export interface PolicyCheck {
  rule: string;
  passed: boolean;
  detail: string;
}

export interface RecoveryAction {
  id: string;
  merchant_id: string;
  opportunity_id: string;
  action_type: InterventionType;
  status: "pending" | "executing" | "succeeded" | "failed" | "timeout" | "cancelled";
  executor: "demo" | "razorpay";
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  error_message: string | null;
  idempotency_key: string;
  correlation_id: string;
  created_at: string;
  completed_at: string | null;
}

export interface WebhookEvent {
  id: string;
  merchant_id: string | null;
  razorpay_event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  signature_valid: boolean;
  processed: boolean;
  processing_error: string | null;
  received_at: string;
  processed_at: string | null;
}

export interface AuditEvent {
  id: string;
  merchant_id: string;
  opportunity_id: string | null;
  actor: string;
  actor_type: ActorType;
  event: string;
  previous_state: string | null;
  new_state: string | null;
  reason: string | null;
  ai_recommendation: string | null;
  policy_decision: string | null;
  execution_result: string | null;
  request_id: string | null;
  correlation_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RecoveryOutcome {
  id: string;
  merchant_id: string;
  opportunity_id: string;
  action_id: string | null;
  actual_recovered_amount: number;
  incremental_recovered_amount: number;
  baseline_expected: number;
  verified_via: "webhook" | "api_reconcile" | "demo";
  payment_status: PaymentStatus;
  created_at: string;
}

export interface Experiment {
  id: string;
  merchant_id: string;
  name: string;
  description: string;
  status: "draft" | "running" | "completed";
  control_size: number;
  treatment_size: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ExperimentAssignment {
  id: string;
  experiment_id: string;
  opportunity_id: string;
  arm: "control" | "treatment";
  created_at: string;
}

export interface ExperimentResults {
  id: string;
  experiment_id: string;
  control_recovered: number;
  treatment_recovered: number;
  control_recovery_rate: number;
  treatment_recovery_rate: number;
  incremental_recovery: number;
  control_intervention_rate: number;
  treatment_intervention_rate: number;
  computed_at: string;
  data_label: string;
}

export interface SystemIncident {
  id: string;
  merchant_id: string | null;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  what_broke: string;
  recovery_action: string;
  final_state: string;
  resolved: boolean;
  opportunity_id: string | null;
  correlation_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface CopilotSession {
  id: string;
  merchant_id: string;
  opportunity_id: string | null;
  created_at: string;
}

export interface CopilotMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_name: string | null;
  tool_result: Record<string, unknown> | null;
  created_at: string;
}

export interface ProbabilityPrediction {
  probability: number;
  confidence: ConfidenceLevel;
  factors: Array<{ feature: string; contribution: number; direction: "positive" | "negative" }>;
  model_version: string;
  used_fallback: boolean;
  model_name?: string;
  prediction_timestamp?: string;
  probability_source?: "MODEL" | "HEURISTIC" | "BASELINE";
}

export interface CounterfactualDecision {
  recommended_action: InterventionType;
  probability: number;
  expected_value: number;
  confidence: ConfidenceLevel;
  key_factors: string[];
  alternatives: InterventionComparison[];
  explanation: string;
  used_fallback: boolean;
  model_version: string;
  model_name?: string;
}

export interface DashboardSummary {
  revenue_at_risk: number;
  estimated_recoverable: number;
  actually_recovered: number;
  incremental_recovery: number;
  pending_approvals: number;
  executing_count: number;
  system_status: "operational" | "degraded" | "outage";
  mode: "demo" | "razorpay_test";
  data_label: string;
}

export interface LeakageBucket {
  source: OpportunitySource;
  label: string;
  amount: number;
  percentage: number;
  trend: number;
  recoverability: number;
  count: number;
}

export const OPPORTUNITY_TRANSITIONS: Record<OpportunityStatus, OpportunityStatus[]> = {
  DETECTED: ["ANALYZING", "CANCELLED"],
  ANALYZING: ["READY", "AWAITING_APPROVAL", "BLOCKED", "ESCALATED", "FAILED"],
  READY: ["EXECUTING", "AWAITING_APPROVAL", "BLOCKED", "CANCELLED", "EXPIRED"],
  AWAITING_APPROVAL: ["READY", "EXECUTING", "BLOCKED", "CANCELLED", "ESCALATED"],
  EXECUTING: ["WAITING_FOR_OUTCOME", "FAILED", "BLOCKED"],
  WAITING_FOR_OUTCOME: ["RECOVERED", "FAILED", "EXPIRED", "READY"],
  RECOVERED: [],
  FAILED: ["READY", "ESCALATED", "CANCELLED"],
  EXPIRED: [],
  ESCALATED: ["READY", "CANCELLED", "BLOCKED"],
  BLOCKED: ["ESCALATED", "CANCELLED"],
  CANCELLED: [],
};

export function canTransition(from: OpportunityStatus, to: OpportunityStatus): boolean {
  return OPPORTUNITY_TRANSITIONS[from]?.includes(to) ?? false;
}
