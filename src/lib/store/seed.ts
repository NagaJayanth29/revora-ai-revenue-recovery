import { defaultPolicyRules, evaluatePolicy, riskFromAmount, toAutonomyMode } from "@/lib/policy/engine";
import { compareInterventions, recoveryProbabilityModel } from "@/lib/recovery/probability-model";
import {
  findCustomer,
  findPayment,
  getMerchantId,
  getStore,
  recordIncident,
  resetStore,
  updateOpportunity,
  writeAudit,
  type RevoraStore,
} from "@/lib/store/memory";
import type {
  AiRecommendation,
  AuditEvent,
  Customer,
  Experiment,
  ExperimentAssignment,
  ExperimentResults,
  Merchant,
  OpportunitySource,
  OpportunityStatus,
  Order,
  Payment,
  RecoveryOpportunity,
  SystemIncident,
  Transaction,
  User,
} from "@/lib/domain/types";
import { canTransition } from "@/lib/domain/types";

const MERCHANT_ID = "merchant_demo_revora";
const NOW = () => new Date().toISOString();

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600000).toISOString();
}

function daysAgo(d: number): string {
  return new Date(Date.now() - d * 86400000).toISOString();
}

export function buildSeedStore(): RevoraStore {
  const merchant: Merchant = {
    id: MERCHANT_ID,
    name: "Aurora Commerce",
    slug: "aurora-commerce",
    razorpay_key_id: null,
    created_at: daysAgo(90),
    updated_at: NOW(),
  };

  const user: User = {
    id: "user_demo_ops",
    merchant_id: MERCHANT_ID,
    email: "ops@aurora.demo",
    name: "Priya Sharma",
    role: "owner",
    created_at: daysAgo(90),
  };

  const customers: Customer[] = [
    {
      id: "cust_arjun",
      merchant_id: MERCHANT_ID,
      external_id: "cus_arjun",
      name: "Arjun Mehta",
      email: "arjun.mehta@example.com",
      phone: "+919876543210",
      success_count: 7,
      failure_count: 1,
      total_paid: 312_000_00,
      last_payment_at: daysAgo(12),
      created_at: daysAgo(180),
    },
    {
      id: "cust_neha",
      merchant_id: MERCHANT_ID,
      external_id: "cus_neha",
      name: "Neha Kapoor",
      email: "neha.kapoor@example.com",
      phone: "+919811122233",
      success_count: 2,
      failure_count: 3,
      total_paid: 24_500_00,
      last_payment_at: daysAgo(40),
      created_at: daysAgo(120),
    },
    {
      id: "cust_vikram",
      merchant_id: MERCHANT_ID,
      external_id: "cus_vikram",
      name: "Vikram Singh",
      email: "vikram.singh@example.com",
      phone: null,
      success_count: 15,
      failure_count: 2,
      total_paid: 890_000_00,
      last_payment_at: daysAgo(3),
      created_at: daysAgo(400),
    },
    {
      id: "cust_ananya",
      merchant_id: MERCHANT_ID,
      external_id: "cus_ananya",
      name: "Ananya Rao",
      email: "ananya.rao@example.com",
      phone: "+919700011122",
      success_count: 0,
      failure_count: 2,
      total_paid: 0,
      last_payment_at: null,
      created_at: daysAgo(5),
    },
    {
      id: "cust_rahul",
      merchant_id: MERCHANT_ID,
      external_id: "cus_rahul",
      name: "Rahul Desai",
      email: "rahul.desai@example.com",
      phone: "+919812345678",
      success_count: 4,
      failure_count: 1,
      total_paid: 56_000_00,
      last_payment_at: daysAgo(20),
      created_at: daysAgo(200),
    },
  ];

  const makeOrderPayment = (opts: {
    id: string;
    customer_id: string;
    amount: number;
    status: Payment["status"];
    failure_reason?: string;
    failure_category?: Payment["failure_category"];
    method?: string;
    attempt_count?: number;
    hours?: number;
  }) => {
    const order: Order = {
      id: `ord_${opts.id}`,
      merchant_id: MERCHANT_ID,
      customer_id: opts.customer_id,
      razorpay_order_id: `order_demo_${opts.id}`,
      amount: opts.amount,
      currency: "INR",
      status: opts.status === "captured" ? "paid" : "attempted",
      receipt: `rcpt_${opts.id}`,
      created_at: hoursAgo(opts.hours ?? 2),
    };
    const payment: Payment = {
      id: `pay_${opts.id}`,
      merchant_id: MERCHANT_ID,
      customer_id: opts.customer_id,
      order_id: order.id,
      razorpay_payment_id: `pay_rzp_${opts.id}`,
      amount: opts.amount,
      currency: "INR",
      status: opts.status,
      method: opts.method ?? "upi",
      failure_reason: opts.failure_reason ?? null,
      failure_category: opts.failure_category ?? null,
      error_code: opts.failure_category === "INSUFFICIENT_FUNDS" ? "BAD_REQUEST_ERROR" : null,
      attempt_count: opts.attempt_count ?? 1,
      created_at: hoursAgo(opts.hours ?? 2),
      updated_at: hoursAgo(opts.hours ?? 2),
    };
    const tx: Transaction = {
      id: `txn_${opts.id}`,
      merchant_id: MERCHANT_ID,
      customer_id: opts.customer_id,
      order_id: order.id,
      payment_id: payment.id,
      amount: opts.amount,
      currency: "INR",
      status: opts.status,
      source: "FAILED_PAYMENT",
      created_at: hoursAgo(opts.hours ?? 2),
    };
    return { order, payment, tx };
  };

  const p1 = makeOrderPayment({
    id: "48000",
    customer_id: "cust_arjun",
    amount: 48_000_00,
    status: "failed",
    failure_reason: "Insufficient funds in customer account",
    failure_category: "INSUFFICIENT_FUNDS",
    method: "upi",
    attempt_count: 1,
    hours: 1,
  });
  const p2 = makeOrderPayment({
    id: "retry_limit",
    customer_id: "cust_neha",
    amount: 12_500_00,
    status: "failed",
    failure_reason: "Bank declined transaction",
    failure_category: "BANK_DECLINE",
    method: "card",
    attempt_count: 3,
    hours: 6,
  });
  const p3 = makeOrderPayment({
    id: "approval",
    customer_id: "cust_vikram",
    amount: 95_000_00,
    status: "failed",
    failure_reason: "Payment gateway timed out",
    failure_category: "GATEWAY_TIMEOUT",
    method: "netbanking",
    attempt_count: 0,
    hours: 3,
  });
  const p4 = makeOrderPayment({
    id: "abandon",
    customer_id: "cust_ananya",
    amount: 8_999_00,
    status: "failed",
    failure_reason: "Checkout abandoned",
    failure_category: "CUSTOMER_CANCELLED",
    method: "upi",
    attempt_count: 0,
    hours: 8,
  });
  const p5 = makeOrderPayment({
    id: "recovered",
    customer_id: "cust_rahul",
    amount: 15_000_00,
    status: "captured",
    method: "upi",
    attempt_count: 1,
    hours: 28,
  });
  const p6 = makeOrderPayment({
    id: "link",
    customer_id: "cust_neha",
    amount: 6_200_00,
    status: "failed",
    failure_reason: "Payment link expired",
    failure_category: "EXPIRED_CARD",
    method: "card",
    attempt_count: 1,
    hours: 20,
  });
  const p7 = makeOrderPayment({
    id: "recurring",
    customer_id: "cust_vikram",
    amount: 2_499_00,
    status: "failed",
    failure_reason: "Mandate execution failed",
    failure_category: "INSUFFICIENT_FUNDS",
    method: "upi",
    attempt_count: 1,
    hours: 14,
  });

  const orders = [p1, p2, p3, p4, p5, p6, p7].map((x) => x.order);
  const payments = [p1, p2, p3, p4, p5, p6, p7].map((x) => x.payment);
  const transactions = [p1, p2, p3, p4, p5, p6, p7].map((x) => x.tx);

  p4.tx.source = "CHECKOUT_ABANDONMENT";
  p6.tx.source = "PAYMENT_LINK";
  p7.tx.source = "RECURRING_FAILURE";

  const store = resetStore();
  store.merchants = [merchant];
  store.users = [user];
  store.customers = customers;
  store.orders = orders;
  store.payments = payments;
  store.transactions = transactions;
  store.policy_rules = [defaultPolicyRules(MERCHANT_ID)];

  // Build opportunities with analysis for each failed payment
  const specs: Array<{
    payment: Payment;
    tx: Transaction;
    source: OpportunitySource;
    status?: OpportunityStatus;
    attempt_count?: number;
    arm?: "control" | "treatment";
    hours?: number;
  }> = [
    { payment: p1.payment, tx: p1.tx, source: "FAILED_PAYMENT", hours: 1, arm: "treatment" },
    {
      payment: p2.payment,
      tx: p2.tx,
      source: "FAILED_PAYMENT",
      attempt_count: 3,
      hours: 6,
      arm: "treatment",
    },
    { payment: p3.payment, tx: p3.tx, source: "FAILED_PAYMENT", hours: 3, arm: "treatment" },
    { payment: p4.payment, tx: p4.tx, source: "CHECKOUT_ABANDONMENT", hours: 8, arm: "control" },
    {
      payment: p5.payment,
      tx: p5.tx,
      source: "FAILED_PAYMENT",
      status: "RECOVERED",
      hours: 28,
      arm: "treatment",
    },
    { payment: p6.payment, tx: p6.tx, source: "PAYMENT_LINK", hours: 20, arm: "control" },
    { payment: p7.payment, tx: p7.tx, source: "RECURRING_FAILURE", hours: 14, arm: "treatment" },
  ];

  for (const spec of specs) {
    analyzeAndInsert(store, spec.payment, spec.tx, spec.source, {
      status: spec.status,
      attempt_count: spec.attempt_count,
      hours: spec.hours,
      arm: spec.arm,
    });
  }

  // Hero opportunity should be READY with RETRY_LATER for ₹48,000
  const hero = store.opportunities.find((o) => o.amount === 48_000_00 || o.id === "opp_demo_48000");
  if (hero) {
    // Ensure deterministic demo narrative
    hero.id = "opp_demo_48000";
    hero.recommended_action = "RETRY_LATER";
    hero.status = "READY";
    hero.policy_status = "SAFE_TO_EXECUTE";
    hero.autonomy_mode = "AUTO";
    hero.confidence = "HIGH";
    hero.correlation_id = "corr_demo_48000";

    const heroRec = store.recommendations.find(
      (r) => r.opportunity_id === hero.id || r.opportunity_id === "opp_demo_48000"
    );
    if (heroRec) {
      heroRec.recommended_action = "RETRY_LATER";
      heroRec.confidence = "HIGH";
      heroRec.opportunity_id = "opp_demo_48000";
    }

    const heroPolicy = store.policy_decisions.find(
      (p) => p.opportunity_id === hero.id || p.opportunity_id === "opp_demo_48000"
    );
    if (heroPolicy) {
      heroPolicy.action = "RETRY_LATER";
      heroPolicy.decision = "SAFE_TO_EXECUTE";
      heroPolicy.opportunity_id = "opp_demo_48000";
    }
  }

  // Experiment
  const experiment: Experiment = {
    id: "exp_ai_lift",
    merchant_id: MERCHANT_ID,
    name: "AI Recovery Lift",
    description: "Baseline do-nothing / simple retry vs REVORA counterfactual recovery",
    status: "running",
    control_size: 0,
    treatment_size: 0,
    started_at: daysAgo(14),
    completed_at: null,
    created_at: daysAgo(14),
  };

  const assignments: ExperimentAssignment[] = store.opportunities.map((o) => ({
    id: `asg_demo_${o.id}`,
    experiment_id: experiment.id,
    opportunity_id: o.id,
    arm: o.experiment_arm ?? "treatment",
    created_at: o.created_at,
  }));
  experiment.control_size = assignments.filter((a) => a.arm === "control").length;
  experiment.treatment_size = assignments.filter((a) => a.arm === "treatment").length;

  store.experiments = [experiment];
  store.experiment_assignments = assignments;
  store.experiment_results = [computeExperimentResults(store, experiment.id)];

  // Seed incidents showing prior recovery
  store.incidents = [
    {
      id: "inc_dup_webhook",
      merchant_id: MERCHANT_ID,
      type: "DUPLICATE_WEBHOOK",
      severity: "info",
      title: "Duplicate webhook ignored",
      description: "Razorpay resent payment.failed event; idempotency key prevented double processing.",
      what_broke: "Duplicate webhook delivery",
      recovery_action: "Idempotent event store skipped reprocessing",
      final_state: "Recovered safely — single opportunity retained",
      resolved: true,
      opportunity_id: hero?.id ?? "opp_demo_48000",
      correlation_id: "corr_demo_48000",
      created_at: hoursAgo(5),
      resolved_at: hoursAgo(5),
    },
    {
      id: "inc_timeout",
      merchant_id: MERCHANT_ID,
      type: "API_TIMEOUT",
      severity: "warning",
      title: "Razorpay API timeout during recovery",
      description: "Payment link create timed out; action marked RETRY_PENDING and reconciled.",
      what_broke: "Upstream API timeout",
      recovery_action: "Safe retry with idempotency key + state reconciliation",
      final_state: "Retried successfully",
      resolved: true,
      opportunity_id: null,
      correlation_id: null,
      created_at: hoursAgo(30),
      resolved_at: hoursAgo(29),
    },
  ] satisfies SystemIncident[];

  return store;
}

function analyzeAndInsert(
  store: RevoraStore,
  payment: Payment,
  tx: Transaction,
  source: OpportunitySource,
  opts: {
    status?: OpportunityStatus;
    attempt_count?: number;
    hours?: number;
    arm?: "control" | "treatment";
  }
) {
  const customer = store.customers.find((c) => c.id === payment.customer_id) ?? null;
  const createdAt = hoursAgo(opts.hours ?? 2);
  const suffix = payment.id.replace(/^pay_/, "");
  const opportunityId = `opp_demo_${suffix}`;
  const correlationId = suffix === "48000" ? "corr_demo_48000" : `corr_demo_${suffix}`;

  let opportunity: RecoveryOpportunity = {
    id: opportunityId,
    merchant_id: MERCHANT_ID,
    customer_id: payment.customer_id,
    transaction_id: tx.id,
    order_id: payment.order_id,
    payment_id: payment.id,
    amount: payment.amount,
    currency: "INR",
    source,
    event_type: payment.status === "captured" ? "payment.captured" : "payment.failed",
    failure_reason: payment.failure_reason,
    failure_category: payment.failure_category,
    status: "DETECTED",
    risk_level: riskFromAmount(payment.amount),
    recovery_probability: null,
    confidence: null,
    expected_recovery_value: null,
    recommended_action: null,
    policy_status: null,
    policy_reason: null,
    autonomy_mode: null,
    attempt_count: opts.attempt_count ?? payment.attempt_count,
    last_action_at: (opts.attempt_count ?? 0) > 0 ? hoursAgo((opts.hours ?? 2) + 1) : null,
    next_action_at: null,
    actual_recovered_amount: payment.status === "captured" ? payment.amount : 0,
    incremental_recovered_amount: 0,
    baseline_probability: null,
    experiment_arm: opts.arm ?? "treatment",
    resolved_at: payment.status === "captured" ? createdAt : null,
    created_by: "SYSTEM",
    correlation_id: correlationId,
    metadata: { payment_method: payment.method, demo_seed: true },
    created_at: createdAt,
    updated_at: createdAt,
  };

  const baseline = recoveryProbabilityModel.predict(opportunity, customer, "DO_NOTHING");
  opportunity.baseline_probability = baseline.probability;

  const decision = compareInterventions(opportunity, customer);
  const rules = store.policy_rules[0];
  const policy = evaluatePolicy({
    opportunity,
    action: decision.recommended_action,
    rules,
    payment,
    confidence: decision.confidence,
  });
  policy.id = `pdec_demo_${suffix}`;

  let status: OpportunityStatus = "READY";
  if (opts.status) status = opts.status;
  else if (policy.decision === "BLOCKED") status = "BLOCKED";
  else if (policy.decision === "REQUIRES_APPROVAL") status = "AWAITING_APPROVAL";
  else status = "READY";

  if (payment.status === "captured") {
    status = "RECOVERED";
    opportunity.incremental_recovered_amount = Math.max(
      0,
      payment.amount - Math.round(payment.amount * (opportunity.baseline_probability ?? 0.2))
    );
  }

  opportunity = {
    ...opportunity,
    status,
    recovery_probability: decision.probability,
    confidence: decision.confidence,
    expected_recovery_value: decision.expected_value,
    recommended_action: decision.recommended_action,
    policy_status: policy.decision,
    policy_reason: policy.reasons.join("; "),
    autonomy_mode: toAutonomyMode(policy.decision),
  };

  // Override for retry-limit scenario
  if ((opts.attempt_count ?? 0) >= rules.max_retry_attempts && decision.recommended_action.includes("RETRY")) {
    const blocked = evaluatePolicy({
      opportunity,
      action: "RETRY_NOW",
      rules,
      payment,
      confidence: decision.confidence,
    });
    blocked.id = `pdec_demo_${suffix}_blocked`;
    opportunity.policy_status = blocked.decision;
    opportunity.policy_reason = blocked.reasons.join("; ");
    opportunity.autonomy_mode = toAutonomyMode(blocked.decision);
    opportunity.status = "BLOCKED";
    opportunity.recommended_action = "HUMAN_ESCALATION";
  }

  store.opportunities.push(opportunity);
  store.policy_decisions.push(policy);

  const rec: AiRecommendation = {
    id: `rec_demo_${suffix}`,
    merchant_id: MERCHANT_ID,
    opportunity_id: opportunity.id,
    recommended_action: decision.recommended_action,
    recovery_probability: decision.probability,
    expected_recovery_value: decision.expected_value,
    confidence: decision.confidence,
    key_factors: decision.key_factors,
    alternatives: decision.alternatives,
    explanation: decision.explanation,
    model_version: decision.model_version,
    used_fallback: decision.used_fallback,
    created_at: createdAt,
  };
  store.recommendations.push(rec);

  const audits: AuditEvent[] = [
    {
      id: `aud_demo_${suffix}_webhook`,
      merchant_id: MERCHANT_ID,
      opportunity_id: opportunity.id,
      actor: "razorpay.webhook",
      actor_type: "WEBHOOK",
      event: payment.status === "captured" ? "PAYMENT_CAPTURED" : "PAYMENT_FAILED",
      previous_state: null,
      new_state: "DETECTED",
      reason: payment.failure_reason,
      ai_recommendation: null,
      policy_decision: null,
      execution_result: null,
      request_id: `req_demo_${suffix}_webhook`,
      correlation_id: correlationId,
      metadata: {},
      created_at: createdAt,
    },
    {
      id: `aud_demo_${suffix}_created`,
      merchant_id: MERCHANT_ID,
      opportunity_id: opportunity.id,
      actor: "revora.detector",
      actor_type: "SYSTEM",
      event: "OPPORTUNITY_CREATED",
      previous_state: null,
      new_state: "DETECTED",
      reason: `${formatSource(source)} — ₹${(payment.amount / 100).toLocaleString("en-IN")} at risk`,
      ai_recommendation: null,
      policy_decision: null,
      execution_result: null,
      request_id: null,
      correlation_id: correlationId,
      metadata: {},
      created_at: new Date(new Date(createdAt).getTime() + 1000).toISOString(),
    },
    {
      id: `aud_demo_${suffix}_analysis`,
      merchant_id: MERCHANT_ID,
      opportunity_id: opportunity.id,
      actor: "revora.decision_engine",
      actor_type: "AI",
      event: "AI_ANALYSIS_COMPLETE",
      previous_state: "ANALYZING",
      new_state: status,
      reason: decision.explanation,
      ai_recommendation: decision.recommended_action,
      policy_decision: policy.decision,
      execution_result: null,
      request_id: null,
      correlation_id: correlationId,
      metadata: { probability: decision.probability },
      created_at: new Date(new Date(createdAt).getTime() + 3000).toISOString(),
    },
  ];

  if (status === "RECOVERED") {
    audits.push({
      id: `aud_demo_${suffix}_recovered`,
      merchant_id: MERCHANT_ID,
      opportunity_id: opportunity.id,
      actor: "revora.outcome",
      actor_type: "SYSTEM",
      event: "RECOVERY_CONFIRMED",
      previous_state: "WAITING_FOR_OUTCOME",
      new_state: "RECOVERED",
      reason: `₹${(payment.amount / 100).toLocaleString("en-IN")} recovered`,
      ai_recommendation: null,
      policy_decision: null,
      execution_result: "success",
      request_id: null,
      correlation_id: correlationId,
      metadata: { actual_recovered_amount: payment.amount },
      created_at: new Date(new Date(createdAt).getTime() + 60000).toISOString(),
    });

    store.outcomes.push({
      id: `out_demo_${suffix}`,
      merchant_id: MERCHANT_ID,
      opportunity_id: opportunity.id,
      action_id: null,
      actual_recovered_amount: payment.amount,
      incremental_recovered_amount: opportunity.incremental_recovered_amount,
      baseline_expected: Math.round(payment.amount * (opportunity.baseline_probability ?? 0.2)),
      verified_via: "demo",
      payment_status: "captured",
      created_at: new Date(new Date(createdAt).getTime() + 60000).toISOString(),
    });
  }

  store.audit_events.push(...audits);
}

function formatSource(source: OpportunitySource): string {
  return source.replace(/_/g, " ");
}

export function computeExperimentResults(store: RevoraStore, experimentId: string): ExperimentResults {
  const assignments = store.experiment_assignments.filter((a) => a.experiment_id === experimentId);
  const byArm = (arm: "control" | "treatment") =>
    assignments
      .filter((a) => a.arm === arm)
      .map((a) => store.opportunities.find((o) => o.id === a.opportunity_id))
      .filter(Boolean) as RecoveryOpportunity[];

  const control = byArm("control");
  const treatment = byArm("treatment");

  const sumRecovered = (list: RecoveryOpportunity[]) =>
    list.reduce((s, o) => s + o.actual_recovered_amount, 0);
  const rate = (list: RecoveryOpportunity[]) =>
    list.length === 0 ? 0 : list.filter((o) => o.status === "RECOVERED").length / list.length;
  const interventionRate = (list: RecoveryOpportunity[]) =>
    list.length === 0
      ? 0
      : list.filter((o) => o.recommended_action && o.recommended_action !== "DO_NOTHING").length /
        list.length;

  const controlRecovered = sumRecovered(control);
  const treatmentRecovered = sumRecovered(treatment);

  return {
    id: `eres_demo_${experimentId}`,
    experiment_id: experimentId,
    control_recovered: controlRecovered,
    treatment_recovered: treatmentRecovered,
    control_recovery_rate: rate(control),
    treatment_recovery_rate: rate(treatment),
    incremental_recovery: treatmentRecovered - controlRecovered,
    control_intervention_rate: interventionRate(control),
    treatment_intervention_rate: interventionRate(treatment),
    computed_at: NOW(),
    data_label: "Demo evaluation — synthetic data",
  };
}

export function ensureSeeded() {
  const store = getStore();
  if (store.opportunities.length === 0) {
    buildSeedStore();
  }
  return getStore();
}

export function transitionOpportunity(
  id: string,
  to: OpportunityStatus,
  reason: string,
  actor: { name: string; type: AuditEvent["actor_type"] }
): RecoveryOpportunity {
  const opp = findOpportunity(id);
  if (!opp) throw new Error("Opportunity not found");
  if (opp.status !== to && !canTransition(opp.status, to)) {
    throw new Error(`Invalid transition ${opp.status} → ${to}`);
  }
  const updated = updateOpportunity(opp.id, { status: to })!;
  writeAudit({
    merchant_id: opp.merchant_id,
    opportunity_id: opp.id,
    actor: actor.name,
    actor_type: actor.type,
    event: `STATUS_${to}`,
    previous_state: opp.status,
    new_state: to,
    reason,
    ai_recommendation: null,
    policy_decision: null,
    execution_result: null,
    request_id: null,
    correlation_id: opp.correlation_id,
    metadata: {},
  });
  return updated;
}

function findOpportunity(id: string) {
  const cleanId = id?.trim();
  if (!cleanId) return undefined;
  return getStore().opportunities.find(
    (o) =>
      o.id === cleanId ||
      o.correlation_id === cleanId ||
      o.id.toLowerCase() === cleanId.toLowerCase() ||
      o.correlation_id.toLowerCase() === cleanId.toLowerCase()
  );
}

export { getMerchantId, findCustomer, findPayment, recordIncident, writeAudit, MERCHANT_ID };

