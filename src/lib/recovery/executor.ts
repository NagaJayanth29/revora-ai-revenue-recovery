import { createId, createUuid, sleep } from "@/lib/utils";
import { evaluatePolicy, toAutonomyMode } from "@/lib/policy/engine";
import { compareInterventions, recoveryProbabilityModel } from "@/lib/recovery/probability-model";
import {
  findCustomer,
  findPayment,
  getStore,
  hasRazorpayCredentials,
  isDemoMode,
  recordIncident,
  updateOpportunity,
  writeAudit,
} from "@/lib/store/memory";
import { ensureSeeded, transitionOpportunity } from "@/lib/store/seed";
import type {
  InterventionType,
  RecoveryAction,
  RecoveryOpportunity,
  RecoveryOutcome,
} from "@/lib/domain/types";

export interface ExecutionResult {
  opportunity: RecoveryOpportunity;
  action: RecoveryAction;
  outcome?: RecoveryOutcome;
  message: string;
  simulated_failure?: string;
}

/**
 * DemoRecoveryExecutor — simulates supported recovery workflows without real money.
 * RazorpayRecoveryExecutor — uses Test Mode APIs when credentials are present.
 *
 * Supported recovery actions (honest about capabilities):
 * - RETRY_LATER / RETRY_NOW: create a new order + payment link for the customer to complete
 * - PAYMENT_LINK: create Razorpay Payment Link (or demo equivalent)
 * - REMINDER: record outreach event (no charge)
 * - HUMAN_ESCALATION: escalate without charging
 * - DO_NOTHING: no-op
 *
 * We do NOT claim Payments API silently charges the customer.
 */
export async function executeRecovery(
  opportunityId: string,
  opts: {
    action?: InterventionType;
    approvedByMerchant?: boolean;
    actor?: string;
  } = {}
): Promise<ExecutionResult> {
  ensureSeeded();
  const store = getStore();
  const flags = store.simulation_flags;
  const opportunity = store.opportunities.find((o) => o.id === opportunityId);
  if (!opportunity) throw new Error("Opportunity not found");

  if (opportunity.status === "RECOVERED") {
    return {
      opportunity,
      action: createAction(
        opportunity,
        opportunity.recommended_action ?? "DO_NOTHING",
        "cancelled",
        "Already recovered — execution blocked"
      ),
      message: "Already recovered — execution blocked. Re-analyze may refresh the model decision only.",
      simulated_failure: "already_recovered",
    };
  }

  const customer = findCustomer(opportunity.customer_id) ?? null;
  let payment = findPayment(opportunity.payment_id) ?? null;

  if (flags.force_already_paid && payment) {
    payment = { ...payment, status: "captured" };
    const idx = store.payments.findIndex((p) => p.id === payment!.id);
    if (idx >= 0) store.payments[idx] = payment;
  }

  const recommended =
    opts.action ??
    opportunity.recommended_action ??
    compareInterventions(opportunity, customer).recommended_action;

  const rules = store.policy_rules.find((r) => r.merchant_id === opportunity.merchant_id)!;
  const confidence = opportunity.confidence;
  const policy = evaluatePolicy({
    opportunity,
    action: recommended,
    rules,
    payment,
    confidence,
  });
  store.policy_decisions.unshift(policy);

  writeAudit({
    merchant_id: opportunity.merchant_id,
    opportunity_id: opportunity.id,
    actor: "revora.policy",
    actor_type: "SYSTEM",
    event: "POLICY_EVALUATED",
    previous_state: opportunity.status,
    new_state: opportunity.status,
    reason: policy.reasons.join("; "),
    ai_recommendation: recommended,
    policy_decision: policy.decision,
    execution_result: null,
    request_id: createId("req"),
    correlation_id: opportunity.correlation_id,
    metadata: { checks: policy.checks },
  });

  if (policy.decision === "BLOCKED") {
    const updated = updateOpportunity(opportunity.id, {
      status: "BLOCKED",
      policy_status: "BLOCKED",
      policy_reason: policy.reasons.join("; "),
      autonomy_mode: "BLOCKED",
    })!;
    recordIncident({
      merchant_id: opportunity.merchant_id,
      type: "POLICY_BLOCK",
      severity: "warning",
      title: "Recovery action blocked by policy",
      description: policy.reasons.join("; "),
      what_broke: "Requested action violated merchant policy",
      recovery_action: "Blocked execution; escalated to human review path",
      final_state: "BLOCKED",
      resolved: true,
      opportunity_id: opportunity.id,
      correlation_id: opportunity.correlation_id,
    });
    const action = createAction(opportunity, recommended, "cancelled", "Blocked by policy");
    return {
      opportunity: updated,
      action,
      message: `Blocked: ${policy.reasons[0]}`,
      simulated_failure: "policy_block",
    };
  }

  if (policy.decision === "REQUIRES_APPROVAL" && !opts.approvedByMerchant) {
    const updated = updateOpportunity(opportunity.id, {
      status: "AWAITING_APPROVAL",
      policy_status: "REQUIRES_APPROVAL",
      policy_reason: policy.reasons.join("; "),
      autonomy_mode: "REVIEW_REQUIRED",
    })!;
    return {
      opportunity: updated,
      action: createAction(opportunity, recommended, "pending", "Awaiting merchant approval"),
      message: `Requires approval: ${policy.reasons[0]}`,
    };
  }

  // PAYMENT_LINK — first real Razorpay TEST MODE adapter (policy + idempotent link)
  if (recommended === "PAYMENT_LINK") {
    const { createRecoveryPaymentLink, actionCapability } = await import(
      "@/lib/razorpay/recovery-payment-link"
    );
    const linkResult = await createRecoveryPaymentLink(opportunity.id, {
      actor: opts.actor ?? "merchant.ops",
      approvedByMerchant: opts.approvedByMerchant,
    });
    const action =
      linkResult.action ??
      createAction(
        opportunity,
        "PAYMENT_LINK",
        linkResult.status === "BLOCKED" ? "cancelled" : "failed",
        linkResult.message
      );
    action.executor =
      actionCapability("PAYMENT_LINK") === "RAZORPAY_TEST" ? "razorpay" : "demo";
    return {
      opportunity: linkResult.opportunity,
      action,
      message: linkResult.message,
      simulated_failure:
        linkResult.status === "BLOCKED"
          ? "policy_block"
          : linkResult.status === "FAILED"
            ? "execution_failure"
            : undefined,
    };
  }

  // Duplicate in-flight execution guard
  const inflight = store.actions.find(
    (a) =>
      a.opportunity_id === opportunity.id &&
      (a.status === "pending" || a.status === "executing")
  );
  if (inflight) {
    recordIncident({
      merchant_id: opportunity.merchant_id,
      type: "DUPLICATE_ACTION",
      severity: "warning",
      title: "Duplicate execution prevented",
      description: "An in-flight recovery action already exists for this opportunity.",
      what_broke: "Duplicate execute request",
      recovery_action: "Idempotent guard rejected second execution",
      final_state: opportunity.status,
      resolved: true,
      opportunity_id: opportunity.id,
      correlation_id: opportunity.correlation_id,
    });
    return {
      opportunity,
      action: inflight,
      message: "Duplicate execution prevented — action already in flight",
      simulated_failure: "duplicate_action",
    };
  }

  transitionOpportunity(opportunity.id, "EXECUTING", "Starting recovery execution", {
    name: opts.actor ?? "merchant.ops",
    type: "MERCHANT",
  });

  const idempotencyKey = `exec_${opportunity.id}_${recommended}_${opportunity.attempt_count}`;
  const existingSameKey = store.actions.find((a) => a.idempotency_key === idempotencyKey);
  if (existingSameKey?.status === "succeeded") {
    return {
      opportunity: findOpp(opportunity.id)!,
      action: existingSameKey,
      message: "Idempotent replay — prior successful execution returned",
    };
  }

  const action = createAction(opportunity, recommended, "executing");
  action.idempotency_key = idempotencyKey;

  // Simulated API timeout
  if (flags.api_timeout) {
    flags.api_timeout_count += 1;
    action.status = "timeout";
    action.error_message = "Razorpay API timeout";
    action.completed_at = new Date().toISOString();

    writeAudit({
      merchant_id: opportunity.merchant_id,
      opportunity_id: opportunity.id,
      actor: "razorpay.api",
      actor_type: "RAZORPAY",
      event: "API_TIMEOUT",
      previous_state: "EXECUTING",
      new_state: "WAITING_FOR_OUTCOME",
      reason: "Upstream timeout — safe retry pending reconciliation",
      ai_recommendation: recommended,
      policy_decision: policy.decision,
      execution_result: "timeout",
      request_id: createId("req"),
      correlation_id: opportunity.correlation_id,
      metadata: { attempt: flags.api_timeout_count },
    });

    recordIncident({
      merchant_id: opportunity.merchant_id,
      type: "API_TIMEOUT",
      severity: "warning",
      title: "Razorpay API timeout",
      description: "Execution timed out. Marked RETRY_PENDING and reconciled trusted state without recharging.",
      what_broke: "Razorpay API timeout",
      recovery_action: "Idempotent retry + payment state reconciliation",
      final_state: "RETRY_PENDING → reconciled",
      resolved: true,
      opportunity_id: opportunity.id,
      correlation_id: opportunity.correlation_id,
    });

    // After 2 timeouts, clear flag and succeed via reconcile path
    if (flags.api_timeout_count >= 2) {
      flags.api_timeout = false;
      flags.api_timeout_count = 0;
      return finalizeSuccess(opportunity, action, recommended, "Reconciled after timeout — demo recovery succeeded");
    }

    const updated = updateOpportunity(opportunity.id, {
      status: "WAITING_FOR_OUTCOME",
      last_action_at: new Date().toISOString(),
    })!;
    return {
      opportunity: updated,
      action,
      message: "API timeout — marked retry pending, will reconcile safely",
      simulated_failure: "api_timeout",
    };
  }

  if (flags.execution_failure) {
    flags.execution_failure = false;
    action.status = "failed";
    action.error_message = "Simulated execution failure";
    action.completed_at = new Date().toISOString();
    const updated = updateOpportunity(opportunity.id, { status: "FAILED" })!;
    recordIncident({
      merchant_id: opportunity.merchant_id,
      type: "EXECUTION_FAILURE",
      severity: "critical",
      title: "Recovery execution failed",
      description: "Executor returned failure. No duplicate charge issued.",
      what_broke: "Execution failure",
      recovery_action: "Failed closed; opportunity marked FAILED for review",
      final_state: "FAILED",
      resolved: true,
      opportunity_id: opportunity.id,
      correlation_id: opportunity.correlation_id,
    });
    return {
      opportunity: updated,
      action,
      message: "Execution failed — no financial side effect committed",
      simulated_failure: "execution_failure",
    };
  }

  // Soft delay for demo realism
  await sleep(400);

  if (recommended === "DO_NOTHING") {
    action.status = "succeeded";
    action.completed_at = new Date().toISOString();
    const updated = updateOpportunity(opportunity.id, { status: "CANCELLED" })!;
    return { opportunity: updated, action, message: "No action taken" };
  }

  if (recommended === "HUMAN_ESCALATION") {
    action.status = "succeeded";
    action.completed_at = new Date().toISOString();
    const updated = updateOpportunity(opportunity.id, {
      status: "ESCALATED",
      last_action_at: new Date().toISOString(),
    })!;
    return { opportunity: updated, action, message: "Escalated to human operations" };
  }

  // Demo vs Razorpay path
  // RETRY_* = SCHEDULED_RECOVERY / DEMO capability — do NOT claim Payments API silent retry
  const executor = !isDemoMode() && hasRazorpayCredentials() ? "razorpay" : "demo";
  action.executor = executor;

  if (executor === "razorpay" && (recommended === "RETRY_NOW" || recommended === "RETRY_LATER")) {
    // No supported Razorpay silent-retry API — stay on scheduled/demo adapter
    action.executor = "demo";
    action.response_payload = {
      mode: "DEMO",
      capability: "SCHEDULED_RECOVERY",
      workflow: "scheduled_recovery",
      note: "RETRY_* is a REVORA decision state — not a Razorpay Payments API silent retry",
      next_action_at:
        recommended === "RETRY_LATER"
          ? new Date(Date.now() + 2 * 3600000).toISOString()
          : new Date().toISOString(),
    };
  } else if (executor === "razorpay") {
    const rzp = await executeRazorpayWorkflow(opportunity, recommended, action);
    if (!rzp.ok) {
      action.status = "failed";
      action.error_message = rzp.error ?? null;
      action.completed_at = new Date().toISOString();
      const updated = updateOpportunity(opportunity.id, { status: "FAILED" })!;
      recordIncident({
        merchant_id: opportunity.merchant_id,
        type: "EXECUTION_FAILURE",
        severity: "critical",
        title: "Razorpay API failure",
        description: rzp.error ?? "Razorpay execution failed",
        what_broke: "Upstream Razorpay API error",
        recovery_action: "Failed closed; opportunity preserved for safe retry",
        final_state: "FAILED",
        resolved: true,
        opportunity_id: opportunity.id,
        correlation_id: opportunity.correlation_id,
      });
      return { opportunity: updated, action, message: rzp.error ?? "Razorpay execution failed" };
    }
    action.response_payload = rzp.payload ?? null;
  } else {
    action.response_payload = {
      mode: "DEMO",
      capability:
        recommended === "RETRY_LATER" || recommended === "RETRY_NOW"
          ? "SCHEDULED_RECOVERY"
          : "DEMO",
      workflow:
        recommended === "RETRY_NOW" || recommended === "RETRY_LATER"
          ? "scheduled_recovery"
          : "reminder_recorded",
      note: "Demo Mode — no real Razorpay API call",
    };
  }

  return finalizeSuccess(
    opportunity,
    action,
    recommended,
    action.executor === "demo"
      ? "Demo recovery workflow executed — awaiting simulated payment confirmation"
      : "Razorpay Test Mode workflow executed — awaiting webhook confirmation"
  );
}

async function executeRazorpayWorkflow(
  opportunity: RecoveryOpportunity,
  action: InterventionType,
  record: RecoveryAction
): Promise<{ ok: boolean; error?: string; payload?: Record<string, unknown> }> {
  try {
    if (action === "REMINDER") {
      return { ok: true, payload: { type: "reminder", status: "recorded", capability: "DEMO" } };
    }
    // PAYMENT_LINK is handled by createRecoveryPaymentLink — should not reach here
    if (action === "PAYMENT_LINK") {
      const { createRecoveryPaymentLink } = await import("@/lib/razorpay/recovery-payment-link");
      const result = await createRecoveryPaymentLink(opportunity.id, { approvedByMerchant: true });
      if (!result.ok) return { ok: false, error: result.message };
      return {
        ok: true,
        payload: (result.action?.response_payload as Record<string, unknown>) ?? {
          payment_link_id: result.payment_link_id,
          short_url: result.payment_link_url,
        },
      };
    }
    return {
      ok: true,
      payload: {
        mode: "DEMO",
        capability: "SCHEDULED_RECOVERY",
        note: `${action} has no direct Razorpay charge API in this integration`,
        reference: record.idempotency_key,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Razorpay error" };
  }
}

function finalizeSuccess(
  opportunity: RecoveryOpportunity,
  action: RecoveryAction,
  recommended: InterventionType,
  message: string
): ExecutionResult {
  action.status = "succeeded";
  action.completed_at = new Date().toISOString();

  writeAudit({
    merchant_id: opportunity.merchant_id,
    opportunity_id: opportunity.id,
    actor: "revora.executor",
    actor_type: "SYSTEM",
    event: "ACTION_EXECUTED",
    previous_state: "EXECUTING",
    new_state: "WAITING_FOR_OUTCOME",
    reason: message,
    ai_recommendation: recommended,
    policy_decision: "SAFE_TO_EXECUTE",
    execution_result: "succeeded",
    request_id: createId("req"),
    correlation_id: opportunity.correlation_id,
    metadata: { action_id: action.id, executor: action.executor },
  });

  const updated = updateOpportunity(opportunity.id, {
    status: "WAITING_FOR_OUTCOME",
    attempt_count: opportunity.attempt_count + (recommended.includes("RETRY") || recommended === "PAYMENT_LINK" ? 1 : 0),
    last_action_at: new Date().toISOString(),
    next_action_at:
      recommended === "RETRY_LATER"
        ? new Date(Date.now() + 2 * 3600000).toISOString()
        : null,
    policy_status: "SAFE_TO_EXECUTE",
    autonomy_mode: toAutonomyMode("SAFE_TO_EXECUTE"),
  })!;

  // In demo mode, auto-confirm success shortly for the hero narrative via confirmOutcome
  if (action.executor === "demo" && recommended !== "REMINDER") {
    // Schedule immediate confirmation for demo UX (sync for reliability)
    const outcome = confirmOutcome(updated.id, { success: true, via: "demo" });
    return {
      opportunity: findOpp(updated.id)!,
      action,
      outcome,
      message: `${message}. Payment captured — recovery confirmed.`,
    };
  }

  return { opportunity: updated, action, message };
}

export function confirmOutcome(
  opportunityId: string,
  opts: { success: boolean; via: "webhook" | "api_reconcile" | "demo"; amount?: number }
): RecoveryOutcome {
  ensureSeeded();
  const store = getStore();
  const opportunity = findOpp(opportunityId);
  if (!opportunity) throw new Error("Opportunity not found");

  // Idempotent — never create duplicate financial outcomes
  if (opportunity.status === "RECOVERED") {
    const existing = store.outcomes.find((o) => o.opportunity_id === opportunityId);
    if (existing) return existing;
  }

  // Actual recovery = verified payment amount only (never model expected)
  const amount = opts.success ? (opts.amount ?? opportunity.amount) : 0;
  const baselineExpected = Math.round(
    opportunity.amount * (opportunity.baseline_probability ?? 0.2)
  );
  const incremental = Math.max(0, amount - baselineExpected);

  if (opts.success) {
    const payment = findPayment(opportunity.payment_id);
    if (payment) {
      payment.status = "captured";
      payment.updated_at = new Date().toISOString();
    }
  }

  updateOpportunity(opportunityId, {
    status: opts.success ? "RECOVERED" : "FAILED",
    actual_recovered_amount: amount,
    incremental_recovered_amount: opts.success ? incremental : 0,
    resolved_at: new Date().toISOString(),
  });

  const outcome: RecoveryOutcome = {
    id: createUuid(),
    merchant_id: opportunity.merchant_id,
    opportunity_id: opportunityId,
    action_id: store.actions.find((a) => a.opportunity_id === opportunityId)?.id ?? null,
    actual_recovered_amount: amount,
    incremental_recovered_amount: opts.success ? incremental : 0,
    baseline_expected: baselineExpected,
    verified_via: opts.via,
    payment_status: opts.success ? "captured" : "failed",
    created_at: new Date().toISOString(),
  };
  store.outcomes.unshift(outcome);

  writeAudit({
    merchant_id: opportunity.merchant_id,
    opportunity_id: opportunityId,
    actor: opts.via === "webhook" ? "razorpay.webhook" : "revora.outcome",
    actor_type: opts.via === "webhook" ? "WEBHOOK" : "SYSTEM",
    event: opts.success ? "RECOVERY_CONFIRMED" : "RECOVERY_FAILED",
    previous_state: "WAITING_FOR_OUTCOME",
    new_state: opts.success ? "RECOVERED" : "FAILED",
    reason: opts.success
      ? `₹${(amount / 100).toLocaleString("en-IN")} recovered (incremental ₹${(incremental / 100).toLocaleString("en-IN")} vs baseline)`
      : "Payment not recovered",
    ai_recommendation: null,
    policy_decision: null,
    execution_result: opts.success ? "recovered" : "failed",
    request_id: createId("req"),
    correlation_id: opportunity.correlation_id,
    metadata: {
      verified_via: opts.via,
      actual: amount,
      incremental,
      // Explicit: never confuse with model expected
      is_verified_payment_amount: true,
    },
  });

  return outcome;
}

function createAction(
  opportunity: RecoveryOpportunity,
  actionType: InterventionType,
  status: RecoveryAction["status"],
  error?: string
): RecoveryAction {
  const store = getStore();
  const action: RecoveryAction = {
    id: createUuid(),
    merchant_id: opportunity.merchant_id,
    opportunity_id: opportunity.id,
    action_type: actionType,
    status,
    executor: isDemoMode() ? "demo" : "razorpay",
    request_payload: { action: actionType },
    response_payload: null,
    error_message: error ?? null,
    idempotency_key: createUuid(),
    correlation_id: opportunity.correlation_id,
    created_at: new Date().toISOString(),
    completed_at: status === "executing" || status === "pending" ? null : new Date().toISOString(),
  };
  store.actions.unshift(action);
  return action;
}

function findOpp(id: string) {
  return getStore().opportunities.find((o) => o.id === id);
}

export function analyzeOpportunity(opportunityId: string) {
  ensureSeeded();
  const store = getStore();
  if (store.simulation_flags.model_unavailable) {
    recoveryProbabilityModel.setUnavailable(true);
  } else {
    recoveryProbabilityModel.setUnavailable(false);
  }

  const opportunity = findOpp(opportunityId);
  if (!opportunity) throw new Error("Opportunity not found");
  const customer = findCustomer(opportunity.customer_id) ?? null;
  const payment = findPayment(opportunity.payment_id) ?? null;
  const priorStatus = opportunity.status;
  const terminalStatuses = new Set(["RECOVERED", "CANCELLED", "EXPIRED"]);
  const preserveStatus = terminalStatuses.has(priorStatus);

  // Analysis-only: never mutate toward a new recovery outcome.
  if (!preserveStatus) {
    updateOpportunity(opportunityId, { status: "ANALYZING" });
  }

  writeAudit({
    merchant_id: opportunity.merchant_id,
    opportunity_id: opportunityId,
    actor: "revora.decision_engine",
    actor_type: "AI",
    event: "ANALYSIS_STARTED",
    previous_state: priorStatus,
    new_state: preserveStatus ? priorStatus : "ANALYZING",
    reason: store.simulation_flags.llm_unavailable
      ? "AI unavailable — deterministic fallback active"
      : preserveStatus
        ? `Re-analyzing ${priorStatus} opportunity (analysis only — no execution)`
        : "Running counterfactual analysis",
    ai_recommendation: null,
    policy_decision: null,
    execution_result: null,
    request_id: createId("req"),
    correlation_id: opportunity.correlation_id,
    metadata: {
      preserve_status: preserveStatus,
      attempt_count: opportunity.attempt_count,
      model_version: recoveryProbabilityModel.getModelMeta().model_version,
    },
  });

  // Features use CURRENT DB state (including attempt_count after prior executions).
  const decision = compareInterventions(opportunity, customer, payment);
  const baselinePred = recoveryProbabilityModel.predict(
    opportunity,
    customer,
    "DO_NOTHING",
    payment
  );
  const rules = store.policy_rules[0];
  const policy = evaluatePolicy({
    opportunity: { ...opportunity, confidence: decision.confidence },
    action: decision.recommended_action,
    rules,
    payment,
    confidence: decision.confidence,
  });
  store.policy_decisions.unshift(policy);

  let status: RecoveryOpportunity["status"] = priorStatus;
  if (!preserveStatus) {
    status = "READY";
    if (policy.decision === "BLOCKED") status = "BLOCKED";
    else if (policy.decision === "REQUIRES_APPROVAL") status = "AWAITING_APPROVAL";
  }

  const updated = updateOpportunity(opportunityId, {
    status,
    recovery_probability: decision.probability,
    confidence: decision.confidence,
    expected_recovery_value: decision.expected_value,
    recommended_action: decision.recommended_action,
    policy_status: preserveStatus ? "BLOCKED" : policy.decision,
    policy_reason: preserveStatus
      ? `Already ${priorStatus} — analysis only; execution blocked. ${policy.reasons.join("; ")}`
      : policy.reasons.join("; "),
    autonomy_mode: preserveStatus ? "BLOCKED" : toAutonomyMode(policy.decision),
    // Current model baseline (opportunity-level). Historical outcome.baseline_expected is unchanged.
    baseline_probability: baselinePred.probability,
  })!;

  const recommendation = {
    id: createUuid(),
    merchant_id: opportunity.merchant_id,
    opportunity_id: opportunityId,
    recommended_action: decision.recommended_action,
    recovery_probability: decision.probability,
    expected_recovery_value: decision.expected_value,
    confidence: decision.confidence,
    key_factors: [
      `model:${decision.model_name ?? "recovery_probability"}@${decision.model_version}`,
      ...decision.key_factors,
    ].slice(0, 6),
    alternatives: decision.alternatives,
    explanation: decision.explanation,
    model_version: decision.model_version,
    used_fallback: decision.used_fallback || store.simulation_flags.llm_unavailable,
    created_at: new Date().toISOString(),
  };
  store.recommendations.unshift(recommendation);

  writeAudit({
    merchant_id: opportunity.merchant_id,
    opportunity_id: opportunityId,
    actor: "revora.decision_engine",
    actor_type: "AI",
    event: "AI_ANALYSIS_COMPLETE",
    previous_state: preserveStatus ? priorStatus : "ANALYZING",
    new_state: status,
    reason: decision.explanation,
    ai_recommendation: decision.recommended_action,
    policy_decision: preserveStatus ? "BLOCKED" : policy.decision,
    execution_result: null,
    request_id: createId("req"),
    correlation_id: opportunity.correlation_id,
    metadata: {
      alternatives: decision.alternatives.map((a) => ({
        action: a.action,
        probability: a.probability,
        probability_source: a.probability_source,
      })),
      model_name: decision.model_name ?? "recovery_probability",
      model_version: decision.model_version,
      probability: decision.probability,
      expected_value: decision.expected_value,
      baseline_probability: baselinePred.probability,
      attempt_count: opportunity.attempt_count,
      analysis_only: preserveStatus,
    },
  });

  return {
    opportunity: updated,
    decision: { ...decision, model_name: decision.model_name ?? "recovery_probability" },
    policy: preserveStatus
      ? {
          ...policy,
          decision: "BLOCKED" as const,
          reasons: [
            `Already ${priorStatus} — re-analysis does not authorize execution`,
            ...policy.reasons,
          ],
        }
      : policy,
    recommendation,
    analysis_only: preserveStatus,
  };
}
