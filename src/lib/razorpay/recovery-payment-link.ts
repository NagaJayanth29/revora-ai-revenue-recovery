/**
 * Policy-gated Payment Link recovery adapter (Razorpay TEST MODE).
 * Amount always comes from the server-side opportunity — never from the browser.
 */

import "server-only";

import { evaluatePolicy, toAutonomyMode } from "@/lib/policy/engine";
import { createPaymentLink, fetchPaymentLink } from "@/lib/razorpay/payment-links";
import { razorpayEnvironmentLabel, resolveRazorpayRuntimeMode } from "@/lib/razorpay/config";
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
import { createUuid } from "@/lib/utils";
import type { InterventionType, RecoveryAction, RecoveryOpportunity } from "@/lib/domain/types";

export type ActionCapability = "RAZORPAY_TEST" | "DEMO" | "SCHEDULED_RECOVERY";

export function actionCapability(action: InterventionType): ActionCapability {
  if (action === "PAYMENT_LINK") {
    return !isDemoMode() && hasRazorpayCredentials() ? "RAZORPAY_TEST" : "DEMO";
  }
  if (action === "RETRY_LATER" || action === "RETRY_NOW") {
    return "SCHEDULED_RECOVERY";
  }
  return "DEMO";
}

export interface CreateRecoveryPaymentLinkResult {
  ok: boolean;
  opportunity: RecoveryOpportunity;
  action: RecoveryAction | null;
  payment_link_id: string | null;
  payment_link_url: string | null;
  status: "ISSUED" | "EXISTING" | "BLOCKED" | "FAILED" | "DEMO_ISSUED";
  environment: "DEMO MODE" | "RAZORPAY TEST MODE";
  capability: ActionCapability;
  message: string;
  reused: boolean;
}

function findExistingPaymentLinkAction(opportunityId: string): RecoveryAction | null {
  const store = getStore();
  const candidates = store.actions.filter(
    (a) =>
      a.opportunity_id === opportunityId &&
      a.action_type === "PAYMENT_LINK" &&
      (a.status === "succeeded" || a.status === "executing" || a.status === "pending")
  );
  for (const a of candidates) {
    const payload = a.response_payload as Record<string, unknown> | null;
    if (payload?.id || payload?.payment_link_id || payload?.short_url) return a;
  }
  return candidates[0] ?? null;
}

function linkFromAction(action: RecoveryAction): {
  id: string | null;
  url: string | null;
  status: string;
} {
  const payload = (action.response_payload || {}) as Record<string, unknown>;
  return {
    id: String(payload.id ?? payload.payment_link_id ?? "") || null,
    url: String(payload.short_url ?? payload.payment_link_url ?? "") || null,
    status: String(payload.status ?? "issued"),
  };
}

/**
 * Create (or reuse) a Razorpay TEST MODE Payment Link for an opportunity.
 * Never auto-executes without prior policy evaluation.
 */
export async function createRecoveryPaymentLink(
  opportunityId: string,
  opts: { actor?: string; approvedByMerchant?: boolean } = {}
): Promise<CreateRecoveryPaymentLinkResult> {
  const store = getStore();
  const opportunity = store.opportunities.find((o) => o.id === opportunityId);
  if (!opportunity) {
    throw new Error("Opportunity not found");
  }

  const environment = razorpayEnvironmentLabel();
  const capability = actionCapability("PAYMENT_LINK");
  const customer = findCustomer(opportunity.customer_id) ?? null;
  const payment = findPayment(opportunity.payment_id) ?? null;
  const rules = store.policy_rules.find((r) => r.merchant_id === opportunity.merchant_id)!;

  if (opportunity.status === "RECOVERED") {
    return {
      ok: false,
      opportunity,
      action: null,
      payment_link_id: null,
      payment_link_url: null,
      status: "BLOCKED",
      environment,
      capability,
      message: "Already recovered — Payment Link creation blocked",
      reused: false,
    };
  }

  const policy = evaluatePolicy({
    opportunity,
    action: "PAYMENT_LINK",
    rules,
    payment,
    confidence: opportunity.confidence,
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
    ai_recommendation: "PAYMENT_LINK",
    policy_decision: policy.decision,
    execution_result: null,
    request_id: createUuid(),
    correlation_id: opportunity.correlation_id,
    metadata: { action: "PAYMENT_LINK", capability },
  });

  if (policy.decision === "BLOCKED") {
    updateOpportunity(opportunity.id, {
      policy_status: "BLOCKED",
      policy_reason: policy.reasons.join("; "),
      autonomy_mode: "BLOCKED",
    });
    return {
      ok: false,
      opportunity: findOpp(opportunity.id)!,
      action: null,
      payment_link_id: null,
      payment_link_url: null,
      status: "BLOCKED",
      environment,
      capability,
      message: `Blocked: ${policy.reasons[0]}`,
      reused: false,
    };
  }

  if (policy.decision === "REQUIRES_APPROVAL" && !opts.approvedByMerchant) {
    updateOpportunity(opportunity.id, {
      status: opportunity.status === "READY" ? "AWAITING_APPROVAL" : opportunity.status,
      policy_status: "REQUIRES_APPROVAL",
      policy_reason: policy.reasons.join("; "),
      autonomy_mode: "REVIEW_REQUIRED",
    });
    return {
      ok: false,
      opportunity: findOpp(opportunity.id)!,
      action: null,
      payment_link_id: null,
      payment_link_url: null,
      status: "BLOCKED",
      environment,
      capability,
      message: `Requires approval: ${policy.reasons[0]}`,
      reused: false,
    };
  }

  const existing = findExistingPaymentLinkAction(opportunity.id);
  if (existing) {
    const link = linkFromAction(existing);
    writeAudit({
      merchant_id: opportunity.merchant_id,
      opportunity_id: opportunity.id,
      actor: opts.actor ?? "revora.executor",
      actor_type: "SYSTEM",
      event: "RAZORPAY_PAYMENT_LINK_REUSED",
      previous_state: opportunity.status,
      new_state: opportunity.status,
      reason: "Active Payment Link already exists — idempotent reuse",
      ai_recommendation: "PAYMENT_LINK",
      policy_decision: policy.decision,
      execution_result: "reused",
      request_id: createUuid(),
      correlation_id: opportunity.correlation_id,
      metadata: { payment_link_id: link.id, action_id: existing.id },
    });
    return {
      ok: true,
      opportunity,
      action: existing,
      payment_link_id: link.id,
      payment_link_url: link.url,
      status: "EXISTING",
      environment,
      capability,
      message: "Existing Payment Link returned (idempotent)",
      reused: true,
    };
  }

  const referenceId = `revora_${opportunity.id.replace(/-/g, "").slice(0, 32)}`;
  const action: RecoveryAction = {
    id: createUuid(),
    merchant_id: opportunity.merchant_id,
    opportunity_id: opportunity.id,
    action_type: "PAYMENT_LINK",
    status: "executing",
    executor: capability === "RAZORPAY_TEST" ? "razorpay" : "demo",
    request_payload: {
      amount: opportunity.amount,
      currency: "INR",
      reference_id: referenceId,
      capability,
    },
    response_payload: null,
    error_message: null,
    idempotency_key: `plink_${opportunity.id}_${opportunity.attempt_count}`,
    correlation_id: opportunity.correlation_id,
    created_at: new Date().toISOString(),
    completed_at: null,
  };
  store.actions.unshift(action);

  writeAudit({
    merchant_id: opportunity.merchant_id,
    opportunity_id: opportunity.id,
    actor: opts.actor ?? "revora.executor",
    actor_type: "SYSTEM",
    event: "RECOVERY_ACTION_REQUESTED",
    previous_state: opportunity.status,
    new_state: "EXECUTING",
    reason: "PAYMENT_LINK requested",
    ai_recommendation: "PAYMENT_LINK",
    policy_decision: policy.decision,
    execution_result: null,
    request_id: createUuid(),
    correlation_id: opportunity.correlation_id,
    metadata: { action_id: action.id, amount: opportunity.amount, capability },
  });

  // DEMO path — no real Razorpay API call
  if (capability === "DEMO" || resolveRazorpayRuntimeMode() !== "test") {
    const demoId = `plink_demo_${opportunity.id.slice(0, 8)}`;
    const demoUrl = `https://rzp.io/demo/${demoId}`;
    action.status = "succeeded";
    action.completed_at = new Date().toISOString();
    action.response_payload = {
      mode: "DEMO",
      id: demoId,
      payment_link_id: demoId,
      short_url: demoUrl,
      amount: opportunity.amount,
      currency: "INR",
      status: "created",
      reference_id: referenceId,
      note: "Demo Mode — no real Razorpay API call",
      capability: "DEMO",
    };

    updateOpportunity(opportunity.id, {
      status: "WAITING_FOR_OUTCOME",
      last_action_at: new Date().toISOString(),
      attempt_count: opportunity.attempt_count + 1,
      recommended_action: "PAYMENT_LINK",
      policy_status: "SAFE_TO_EXECUTE",
      autonomy_mode: toAutonomyMode("SAFE_TO_EXECUTE"),
    });

    writeAudit({
      merchant_id: opportunity.merchant_id,
      opportunity_id: opportunity.id,
      actor: opts.actor ?? "revora.executor",
      actor_type: "SYSTEM",
      event: "RAZORPAY_PAYMENT_LINK_CREATED",
      previous_state: "EXECUTING",
      new_state: "WAITING_FOR_OUTCOME",
      reason: "Demo Payment Link issued",
      ai_recommendation: "PAYMENT_LINK",
      policy_decision: policy.decision,
      execution_result: "demo_issued",
      request_id: createUuid(),
      correlation_id: opportunity.correlation_id,
      metadata: { payment_link_id: demoId, environment: "DEMO MODE" },
    });

    return {
      ok: true,
      opportunity: findOpp(opportunity.id)!,
      action,
      payment_link_id: demoId,
      payment_link_url: demoUrl,
      status: "DEMO_ISSUED",
      environment: "DEMO MODE",
      capability: "DEMO",
      message: "Demo Payment Link issued — awaiting simulated confirmation",
      reused: false,
    };
  }

  // RAZORPAY TEST MODE — real API call
  try {
    const link = await createPaymentLink({
      amount: opportunity.amount, // server-side amount only
      currency: "INR",
      description: `REVORA recovery · ${opportunity.correlation_id}`,
      customer: {
        name: customer?.name,
        email: customer?.email ?? undefined,
        contact: customer?.phone ?? undefined,
      },
      notes: {
        revora_opportunity_id: opportunity.id,
        revora_merchant_id: opportunity.merchant_id,
        revora_action: "PAYMENT_LINK",
      },
      reference_id: referenceId,
    });

    action.status = "succeeded";
    action.completed_at = new Date().toISOString();
    action.response_payload = {
      mode: "RAZORPAY_TEST",
      id: link.id,
      payment_link_id: link.id,
      short_url: link.short_url,
      amount: link.amount,
      currency: link.currency,
      status: link.status,
      reference_id: link.reference_id,
      capability: "RAZORPAY_TEST",
    };

    updateOpportunity(opportunity.id, {
      status: "WAITING_FOR_OUTCOME",
      last_action_at: new Date().toISOString(),
      attempt_count: opportunity.attempt_count + 1,
      recommended_action: "PAYMENT_LINK",
      policy_status: policy.decision,
      autonomy_mode: toAutonomyMode(policy.decision),
      metadata: {
        ...opportunity.metadata,
        payment_link_id: link.id,
        payment_link_url: link.short_url,
      },
    });

    writeAudit({
      merchant_id: opportunity.merchant_id,
      opportunity_id: opportunity.id,
      actor: opts.actor ?? "revora.executor",
      actor_type: "SYSTEM",
      event: "RAZORPAY_PAYMENT_LINK_CREATED",
      previous_state: "EXECUTING",
      new_state: "WAITING_FOR_OUTCOME",
      reason: `Payment Link ${link.id} created in TEST MODE`,
      ai_recommendation: "PAYMENT_LINK",
      policy_decision: policy.decision,
      execution_result: "issued",
      request_id: createUuid(),
      correlation_id: opportunity.correlation_id,
      metadata: {
        payment_link_id: link.id,
        amount: opportunity.amount,
        environment: "RAZORPAY TEST MODE",
      },
    });

    return {
      ok: true,
      opportunity: findOpp(opportunity.id)!,
      action,
      payment_link_id: link.id,
      payment_link_url: link.short_url,
      status: "ISSUED",
      environment: "RAZORPAY TEST MODE",
      capability: "RAZORPAY_TEST",
      message: "Razorpay TEST MODE Payment Link issued — awaiting webhook confirmation",
      reused: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Razorpay Payment Link failed";
    action.status = "failed";
    action.error_message = message;
    action.completed_at = new Date().toISOString();

    writeAudit({
      merchant_id: opportunity.merchant_id,
      opportunity_id: opportunity.id,
      actor: opts.actor ?? "revora.executor",
      actor_type: "SYSTEM",
      event: "RAZORPAY_PAYMENT_LINK_FAILED",
      previous_state: "EXECUTING",
      new_state: opportunity.status,
      reason: message,
      ai_recommendation: "PAYMENT_LINK",
      policy_decision: policy.decision,
      execution_result: "failed",
      request_id: createUuid(),
      correlation_id: opportunity.correlation_id,
      metadata: { error: message },
    });

    recordIncident({
      merchant_id: opportunity.merchant_id,
      type: "EXECUTION_FAILURE",
      severity: "critical",
      title: "Razorpay Payment Link API failure",
      description: message,
      what_broke: "Razorpay Payment Link create failed",
      recovery_action: "Failed action recorded; opportunity preserved for safe retry",
      final_state: opportunity.status,
      resolved: true,
      opportunity_id: opportunity.id,
      correlation_id: opportunity.correlation_id,
    });

    return {
      ok: false,
      opportunity,
      action,
      payment_link_id: null,
      payment_link_url: null,
      status: "FAILED",
      environment: "RAZORPAY TEST MODE",
      capability: "RAZORPAY_TEST",
      message,
      reused: false,
    };
  }
}

function findOpp(id: string) {
  return getStore().opportunities.find((o) => o.id === id);
}

/** Resolve Payment Link status for UI / Copilot (read-only). */
export function getPaymentLinkStatus(opportunityId: string) {
  const action = findExistingPaymentLinkAction(opportunityId);
  if (!action) {
    return {
      has_link: false,
      payment_link_id: null,
      payment_link_url: null,
      status: null as string | null,
      provider: null as string | null,
      environment: razorpayEnvironmentLabel(),
      capability: actionCapability("PAYMENT_LINK"),
    };
  }
  const link = linkFromAction(action);
  const payload = (action.response_payload || {}) as Record<string, unknown>;
  return {
    has_link: true,
    payment_link_id: link.id,
    payment_link_url: link.url,
    status: String(payload.status ?? "ISSUED").toUpperCase(),
    provider: payload.mode === "DEMO" ? "Demo" : "Razorpay",
    environment: razorpayEnvironmentLabel(),
    capability: actionCapability("PAYMENT_LINK"),
    action_id: action.id,
    executor: action.executor,
  };
}

export async function refreshPaymentLinkFromProvider(paymentLinkId: string) {
  return fetchPaymentLink(paymentLinkId);
}
