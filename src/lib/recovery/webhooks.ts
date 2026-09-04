/**
 * Razorpay webhook pipeline (TEST MODE).
 * verify → idempotency → persist → normalize → domain update → analyze (no auto-execute)
 */

import { createUuid } from "@/lib/utils";
import { riskFromAmount } from "@/lib/policy/engine";
import { verifyWebhookSignature } from "@/lib/razorpay/verification";
import {
  getStore,
  recordIncident,
  writeAudit,
} from "@/lib/store/memory";
import { ensureSeeded, MERCHANT_ID } from "@/lib/store/seed";
import { analyzeOpportunity, confirmOutcome } from "@/lib/recovery/executor";
import type { FailureCategory, WebhookEvent } from "@/lib/domain/types";

export interface WebhookProcessResult {
  accepted: boolean;
  duplicate: boolean;
  event_id: string;
  message: string;
  opportunity_id?: string;
}

const SUPPORTED_EVENTS = new Set([
  "payment.failed",
  "payment.authorized",
  "payment.captured",
  "order.paid",
  "payment_link.paid",
  "payment_link.partially_paid",
]);

function mapFailureCategory(reason: string | null | undefined): FailureCategory {
  const r = (reason || "").toLowerCase();
  if (r.includes("fund") || r.includes("insufficient")) return "INSUFFICIENT_FUNDS";
  if (r.includes("timeout") || r.includes("gateway")) return "GATEWAY_TIMEOUT";
  if (r.includes("network")) return "NETWORK_ERROR";
  if (r.includes("auth") || r.includes("otp")) return "AUTHENTICATION_FAILED";
  if (r.includes("expir")) return "EXPIRED_CARD";
  if (r.includes("cancel") || r.includes("abandon")) return "CUSTOMER_CANCELLED";
  if (r.includes("declin") || r.includes("bank")) return "BANK_DECLINE";
  return "UNKNOWN";
}

function paymentEntityFrom(payload: Record<string, unknown>): Record<string, unknown> {
  const entity = (payload.payload as Record<string, unknown>) || payload;
  return (
    ((entity.payment as Record<string, unknown>)?.entity as Record<string, unknown>) ||
    (entity as Record<string, unknown>)
  );
}

function paymentLinkEntityFrom(payload: Record<string, unknown>): Record<string, unknown> {
  const entity = (payload.payload as Record<string, unknown>) || payload;
  return (
    ((entity.payment_link as Record<string, unknown>)?.entity as Record<string, unknown>) ||
    ((entity.payment_link as Record<string, unknown>) as Record<string, unknown>) ||
    {}
  );
}

function orderEntityFrom(payload: Record<string, unknown>): Record<string, unknown> {
  const entity = (payload.payload as Record<string, unknown>) || payload;
  return (
    ((entity.order as Record<string, unknown>)?.entity as Record<string, unknown>) || {}
  );
}

/**
 * Idempotent webhook pipeline:
 * verify → extract event id → dedupe → persist → normalize → domain update → analyze
 * Never auto-executes recovery on payment.failed.
 */
export async function processRazorpayWebhook(params: {
  rawBody: string;
  signature: string | null;
  demo?: boolean;
}): Promise<WebhookProcessResult> {
  ensureSeeded();
  const store = getStore();

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(params.rawBody) as Record<string, unknown>;
  } catch {
    return { accepted: false, duplicate: false, event_id: "invalid", message: "Invalid JSON body" };
  }

  const eventId =
    (payload.event_id as string) ||
    (payload.id as string) ||
    `evt_${createUuid().replace(/-/g, "").slice(0, 24)}`;
  const eventType = (payload.event as string) || "unknown";

  // Idempotency — same Razorpay event id never processed twice
  const existing = store.webhook_events.find((e) => e.razorpay_event_id === eventId);
  if (existing?.processed) {
    recordIncident({
      merchant_id: MERCHANT_ID,
      type: "DUPLICATE_WEBHOOK",
      severity: "info",
      title: "Duplicate webhook ignored",
      description: `Event ${eventId} already processed.`,
      what_broke: "Duplicate webhook delivery",
      recovery_action: "Idempotent skip — no double processing",
      final_state: "Recovered safely",
      resolved: true,
      opportunity_id: null,
      correlation_id: null,
    });
    return {
      accepted: true,
      duplicate: true,
      event_id: eventId,
      message: "Duplicate event — already processed",
    };
  }

  // Signature verification — never trust payload without it
  const signatureValid = verifyWebhookSignature(params.rawBody, params.signature);

  const webhookEvent: WebhookEvent = existing ?? {
    id: createUuid(),
    merchant_id: MERCHANT_ID,
    razorpay_event_id: eventId,
    event_type: eventType,
    payload,
    signature_valid: signatureValid,
    processed: false,
    processing_error: null,
    received_at: new Date().toISOString(),
    processed_at: null,
  };
  if (!existing) {
    store.webhook_events.unshift(webhookEvent);
  } else {
    webhookEvent.payload = payload;
    webhookEvent.signature_valid = signatureValid;
  }

  writeAudit({
    merchant_id: MERCHANT_ID,
    opportunity_id: null,
    actor: "razorpay.webhook",
    actor_type: "WEBHOOK",
    event: "RAZORPAY_WEBHOOK_RECEIVED",
    previous_state: null,
    new_state: null,
    reason: eventType,
    ai_recommendation: null,
    policy_decision: null,
    execution_result: null,
    request_id: createUuid(),
    correlation_id: eventId,
    metadata: {
      event_id: eventId,
      event_type: eventType,
      demo_fixture: Boolean(params.demo),
    },
  });

  if (!signatureValid) {
    webhookEvent.processing_error = "Invalid signature";
    writeAudit({
      merchant_id: MERCHANT_ID,
      opportunity_id: null,
      actor: "razorpay.webhook",
      actor_type: "WEBHOOK",
      event: "WEBHOOK_SIGNATURE_REJECTED",
      previous_state: null,
      new_state: null,
      reason: "Invalid X-Razorpay-Signature",
      ai_recommendation: null,
      policy_decision: null,
      execution_result: "rejected",
      request_id: createUuid(),
      correlation_id: eventId,
      metadata: { event_id: eventId },
    });
    return {
      accepted: false,
      duplicate: false,
      event_id: eventId,
      message: "Webhook signature verification failed",
    };
  }

  writeAudit({
    merchant_id: MERCHANT_ID,
    opportunity_id: null,
    actor: "razorpay.webhook",
    actor_type: "WEBHOOK",
    event: "WEBHOOK_SIGNATURE_VERIFIED",
    previous_state: null,
    new_state: null,
    reason: eventType,
    ai_recommendation: null,
    policy_decision: null,
    execution_result: "verified",
    request_id: createUuid(),
    correlation_id: eventId,
    metadata: { event_id: eventId },
  });

  try {
    const result = await handleEvent(eventType, payload, eventId);
    webhookEvent.processed = true;
    webhookEvent.processed_at = new Date().toISOString();
    webhookEvent.processing_error = null;
    return {
      accepted: true,
      duplicate: false,
      event_id: eventId,
      message: result.message,
      opportunity_id: result.opportunity_id,
    };
  } catch (err) {
    webhookEvent.processing_error = err instanceof Error ? err.message : "processing failed";
    // Keep raw event; do not mark processed — safe retry
    recordIncident({
      merchant_id: MERCHANT_ID,
      type: "WEBHOOK_PROCESSING_FAILURE",
      severity: "critical",
      title: "Webhook processing failed",
      description: webhookEvent.processing_error,
      what_broke: "Webhook handler exception",
      recovery_action: "Event persisted for retry; not marked processed",
      final_state: "Unprocessed — safe to retry",
      resolved: false,
      opportunity_id: null,
      correlation_id: eventId,
    });
    return {
      accepted: false,
      duplicate: false,
      event_id: eventId,
      message: webhookEvent.processing_error,
    };
  }
}

async function handleEvent(
  eventType: string,
  payload: Record<string, unknown>,
  eventId: string
): Promise<{ message: string; opportunity_id?: string }> {
  if (!SUPPORTED_EVENTS.has(eventType) && !eventType.includes("failed") && !eventType.includes("captured")) {
    return { message: `Event ${eventType} acknowledged (unsupported — no side effects)` };
  }

  if (eventType === "payment.failed" || (eventType.includes("failed") && eventType.startsWith("payment"))) {
    return handlePaymentFailed(payload, eventId);
  }

  if (eventType === "payment.authorized") {
    return handlePaymentAuthorized(payload, eventId);
  }

  if (eventType === "payment.captured" || eventType.includes("captured")) {
    return handlePaymentCaptured(payload, eventId);
  }

  if (eventType === "order.paid") {
    return handleOrderPaid(payload, eventId);
  }

  if (eventType === "payment_link.paid" || eventType === "payment_link.partially_paid") {
    return handlePaymentLinkPaid(payload, eventId);
  }

  return { message: `Event ${eventType} acknowledged` };
}

async function handlePaymentFailed(
  payload: Record<string, unknown>,
  eventId: string
): Promise<{ message: string; opportunity_id?: string }> {
  const store = getStore();
  const paymentEntity = paymentEntityFrom(payload);
  const amount = Number(paymentEntity.amount ?? 0);
  const rzpPaymentId = String(paymentEntity.id ?? createUuid());
  const existingPayment = store.payments.find((p) => p.razorpay_payment_id === rzpPaymentId);

  // Out-of-order: captured / recovered wins
  if (existingPayment?.status === "captured") {
    recordIncident({
      merchant_id: MERCHANT_ID,
      type: "OUT_OF_ORDER_WEBHOOK",
      severity: "warning",
      title: "Out-of-order failure ignored",
      description: "Received payment.failed after payment already captured.",
      what_broke: "Out-of-order webhook",
      recovery_action: "Trusted captured state retained",
      final_state: "captured",
      resolved: true,
      opportunity_id: null,
      correlation_id: eventId,
    });
    return { message: "Out-of-order failure ignored — payment already captured" };
  }

  const existingOpp = existingPayment
    ? store.opportunities.find((o) => o.payment_id === existingPayment.id)
    : undefined;

  if (existingOpp) {
    if (existingOpp.status === "RECOVERED") {
      return {
        message: "Failure ignored — opportunity already RECOVERED",
        opportunity_id: existingOpp.id,
      };
    }
    // Same payment.failed again (different event id) — do not create another opportunity
    return {
      message: "Payment already known — opportunity retained (no duplicate)",
      opportunity_id: existingOpp.id,
    };
  }

  const customer =
    store.customers.find((c) => c.email && String(paymentEntity.email || "") === c.email) ||
    store.customers[0];
  if (!customer) {
    throw new Error("No customer available to attach failed payment");
  }

  const orderId = createUuid();
  const paymentId = createUuid();
  const txId = createUuid();
  const failureReason = String(
    paymentEntity.error_description || paymentEntity.error_reason || "Payment failed"
  );

  store.orders.push({
    id: orderId,
    merchant_id: MERCHANT_ID,
    customer_id: customer.id,
    razorpay_order_id: String(paymentEntity.order_id ?? ""),
    amount,
    currency: "INR",
    status: "attempted",
    receipt: null,
    created_at: new Date().toISOString(),
  });

  store.payments.push({
    id: paymentId,
    merchant_id: MERCHANT_ID,
    customer_id: customer.id,
    order_id: orderId,
    razorpay_payment_id: rzpPaymentId,
    amount,
    currency: "INR",
    status: "failed",
    method: String(paymentEntity.method ?? "upi"),
    failure_reason: failureReason,
    failure_category: mapFailureCategory(failureReason),
    error_code: String(paymentEntity.error_code ?? ""),
    attempt_count: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  store.transactions.push({
    id: txId,
    merchant_id: MERCHANT_ID,
    customer_id: customer.id,
    order_id: orderId,
    payment_id: paymentId,
    amount,
    currency: "INR",
    status: "failed",
    source: "FAILED_PAYMENT",
    created_at: new Date().toISOString(),
  });

  const oppId = createUuid();
  store.opportunities.unshift({
    id: oppId,
    merchant_id: MERCHANT_ID,
    customer_id: customer.id,
    transaction_id: txId,
    order_id: orderId,
    payment_id: paymentId,
    amount,
    currency: "INR",
    source: "FAILED_PAYMENT",
    event_type: "payment.failed",
    failure_reason: failureReason,
    failure_category: mapFailureCategory(failureReason),
    status: "DETECTED",
    risk_level: riskFromAmount(amount),
    recovery_probability: null,
    confidence: null,
    expected_recovery_value: null,
    recommended_action: null,
    policy_status: null,
    policy_reason: null,
    autonomy_mode: null,
    attempt_count: 0,
    last_action_at: null,
    next_action_at: null,
    actual_recovered_amount: 0,
    incremental_recovered_amount: 0,
    baseline_probability: null,
    experiment_arm: "treatment",
    resolved_at: null,
    created_by: "WEBHOOK",
    correlation_id: eventId,
    metadata: { payment_method: paymentEntity.method, razorpay_payment_id: rzpPaymentId },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  writeAudit({
    merchant_id: MERCHANT_ID,
    opportunity_id: oppId,
    actor: "razorpay.webhook",
    actor_type: "WEBHOOK",
    event: "PAYMENT_FAILED",
    previous_state: null,
    new_state: "DETECTED",
    reason: failureReason,
    ai_recommendation: null,
    policy_decision: null,
    execution_result: null,
    request_id: createUuid(),
    correlation_id: eventId,
    metadata: { razorpay_payment_id: rzpPaymentId, amount },
  });

  writeAudit({
    merchant_id: MERCHANT_ID,
    opportunity_id: oppId,
    actor: "revora.detector",
    actor_type: "SYSTEM",
    event: "OPPORTUNITY_CREATED",
    previous_state: null,
    new_state: "DETECTED",
    reason: `₹${(amount / 100).toLocaleString("en-IN")} at risk`,
    ai_recommendation: null,
    policy_decision: null,
    execution_result: null,
    request_id: null,
    correlation_id: eventId,
    metadata: {},
  });

  // AI analysis + policy — never auto-execute
  await analyzeOpportunity(oppId);
  return { message: "Failed payment ingested and analyzed", opportunity_id: oppId };
}

function handlePaymentAuthorized(
  payload: Record<string, unknown>,
  eventId: string
): { message: string; opportunity_id?: string } {
  const store = getStore();
  const paymentEntity = paymentEntityFrom(payload);
  const rzpPaymentId = String(paymentEntity.id ?? "");
  const payment = store.payments.find((p) => p.razorpay_payment_id === rzpPaymentId);
  if (payment && payment.status !== "captured") {
    payment.status = "authorized";
    payment.updated_at = new Date().toISOString();
  }
  writeAudit({
    merchant_id: MERCHANT_ID,
    opportunity_id: null,
    actor: "razorpay.webhook",
    actor_type: "WEBHOOK",
    event: "PAYMENT_AUTHORIZED",
    previous_state: null,
    new_state: "authorized",
    reason: `Payment ${rzpPaymentId} authorized (not yet recovered)`,
    ai_recommendation: null,
    policy_decision: null,
    execution_result: null,
    request_id: createUuid(),
    correlation_id: eventId,
    metadata: { razorpay_payment_id: rzpPaymentId },
  });
  return { message: "payment.authorized acknowledged — awaiting capture/link paid" };
}

function handlePaymentCaptured(
  payload: Record<string, unknown>,
  _eventId: string
): { message: string; opportunity_id?: string } {
  const store = getStore();
  const paymentEntity = paymentEntityFrom(payload);
  const rzpPaymentId = String(paymentEntity.id ?? "");
  const verifiedAmount = Number(paymentEntity.amount ?? 0);
  const payment = store.payments.find((p) => p.razorpay_payment_id === rzpPaymentId);

  const opportunity =
    store.opportunities.find((o) => o.payment_id === payment?.id) ||
    store.opportunities.find(
      (o) =>
        o.status === "WAITING_FOR_OUTCOME" &&
        verifiedAmount > 0 &&
        o.amount === verifiedAmount
    ) ||
    findOpportunityByPaymentLinkNotes(payload);

  if (!opportunity) {
    return { message: "Captured event noted — no matching open opportunity" };
  }

  if (opportunity.status === "RECOVERED") {
    return {
      message: "Already recovered — capture acknowledged (no duplicate outcome)",
      opportunity_id: opportunity.id,
    };
  }

  confirmOutcome(opportunity.id, {
    success: true,
    via: "webhook",
    amount: verifiedAmount > 0 ? verifiedAmount : opportunity.amount,
  });
  return { message: "Recovery confirmed via payment.captured", opportunity_id: opportunity.id };
}

function handleOrderPaid(
  payload: Record<string, unknown>,
  _eventId: string
): { message: string; opportunity_id?: string } {
  const store = getStore();
  const order = orderEntityFrom(payload);
  const paymentEntity = paymentEntityFrom(payload);
  const rzpOrderId = String(order.id ?? paymentEntity.order_id ?? "");
  const verifiedAmount = Number(order.amount ?? paymentEntity.amount ?? 0);

  const dbOrder = store.orders.find((o) => o.razorpay_order_id === rzpOrderId);
  const opportunity =
    (dbOrder && store.opportunities.find((o) => o.order_id === dbOrder.id)) ||
    store.opportunities.find(
      (o) => o.status === "WAITING_FOR_OUTCOME" && verifiedAmount > 0 && o.amount === verifiedAmount
    );

  if (!opportunity) {
    return { message: "order.paid acknowledged — no matching open opportunity" };
  }
  if (opportunity.status === "RECOVERED") {
    return {
      message: "Already recovered — order.paid acknowledged",
      opportunity_id: opportunity.id,
    };
  }

  confirmOutcome(opportunity.id, {
    success: true,
    via: "webhook",
    amount: verifiedAmount > 0 ? verifiedAmount : opportunity.amount,
  });
  return { message: "Recovery confirmed via order.paid", opportunity_id: opportunity.id };
}

function handlePaymentLinkPaid(
  payload: Record<string, unknown>,
  eventId: string
): { message: string; opportunity_id?: string } {
  const store = getStore();
  const link = paymentLinkEntityFrom(payload);
  const paymentEntity = paymentEntityFrom(payload);
  const linkId = String(link.id ?? "");
  const notes = (link.notes as Record<string, string>) || {};
  const referenceId = String(link.reference_id ?? "");
  const verifiedAmount = Number(
    paymentEntity.amount ?? link.amount_paid ?? link.amount ?? 0
  );

  const opportunity =
    (notes.revora_opportunity_id
      ? store.opportunities.find((o) => o.id === notes.revora_opportunity_id)
      : undefined) ||
    (notes.revora_correlation_id
      ? store.opportunities.find((o) => o.correlation_id === notes.revora_correlation_id)
      : undefined) ||
    findOpportunityByPaymentLinkId(linkId) ||
    findOpportunityByReferenceId(referenceId);

  if (!opportunity) {
    return { message: "payment_link.paid acknowledged — no matching opportunity" };
  }

  if (opportunity.status === "RECOVERED") {
    return {
      message: "Already recovered — payment_link.paid ignored (no duplicate outcome)",
      opportunity_id: opportunity.id,
    };
  }

  // Amount must match opportunity recoverable amount (tolerance: exact paise)
  const amount = verifiedAmount > 0 ? verifiedAmount : opportunity.amount;
  if (verifiedAmount > 0 && verifiedAmount !== opportunity.amount) {
    recordIncident({
      merchant_id: MERCHANT_ID,
      type: "AMOUNT_MISMATCH",
      severity: "critical",
      title: "Payment Link amount mismatch",
      description: `Verified ${verifiedAmount} vs opportunity ${opportunity.amount}`,
      what_broke: "Paid amount does not match recoverable amount",
      recovery_action: "Held for review — no automatic RECOVERED",
      final_state: opportunity.status,
      resolved: false,
      opportunity_id: opportunity.id,
      correlation_id: eventId,
    });
    return {
      message: "Amount mismatch — recovery not confirmed",
      opportunity_id: opportunity.id,
    };
  }

  // Mark Payment Link action as paid
  const action = store.actions.find(
    (a) =>
      a.opportunity_id === opportunity.id &&
      a.action_type === "PAYMENT_LINK" &&
      a.status === "succeeded"
  );
  if (action) {
    action.response_payload = {
      ...(action.response_payload || {}),
      status: "paid",
      paid_at: new Date().toISOString(),
      verified_amount: amount,
      payment_link_id: linkId || (action.response_payload as Record<string, unknown>)?.id,
    };
  }

  writeAudit({
    merchant_id: opportunity.merchant_id,
    opportunity_id: opportunity.id,
    actor: "razorpay.webhook",
    actor_type: "WEBHOOK",
    event: "PAYMENT_LINK_PAID",
    previous_state: opportunity.status,
    new_state: "WAITING_FOR_OUTCOME",
    reason: `Payment Link ${linkId || "unknown"} paid — verified amount ${amount}`,
    ai_recommendation: "PAYMENT_LINK",
    policy_decision: null,
    execution_result: "paid",
    request_id: createUuid(),
    correlation_id: eventId,
    metadata: {
      payment_link_id: linkId,
      verified_amount: amount,
      razorpay_payment_id: paymentEntity.id,
    },
  });

  confirmOutcome(opportunity.id, { success: true, via: "webhook", amount });
  touchExperimentMetrics(opportunity.id);

  return {
    message: "Recovery confirmed via payment_link.paid (verified amount)",
    opportunity_id: opportunity.id,
  };
}

function findOpportunityByPaymentLinkId(linkId: string) {
  if (!linkId) return undefined;
  const store = getStore();
  const action = store.actions.find((a) => {
    const p = (a.response_payload || {}) as Record<string, unknown>;
    return (
      a.action_type === "PAYMENT_LINK" &&
      (p.id === linkId || p.payment_link_id === linkId)
    );
  });
  if (action) {
    const byAction = store.opportunities.find((o) => o.id === action.opportunity_id);
    if (byAction) return byAction;
  }
  return store.opportunities.find((o) => {
    const meta = (o.metadata || {}) as Record<string, unknown>;
    return meta.payment_link_id === linkId || meta.id === linkId;
  });
}

function findOpportunityByReferenceId(referenceId: string) {
  if (!referenceId) return undefined;
  const store = getStore();
  const action = store.actions.find((a) => {
    const req = (a.request_payload || {}) as Record<string, unknown>;
    const res = (a.response_payload || {}) as Record<string, unknown>;
    return req.reference_id === referenceId || res.reference_id === referenceId;
  });
  if (action) {
    const byAction = store.opportunities.find((o) => o.id === action.opportunity_id);
    if (byAction) return byAction;
  }
  return store.opportunities.find((o) => {
    const meta = (o.metadata || {}) as Record<string, unknown>;
    return meta.reference_id === referenceId;
  });
}

function findOpportunityByPaymentLinkNotes(payload: Record<string, unknown>) {
  const link = paymentLinkEntityFrom(payload);
  const notes = (link.notes as Record<string, string>) || {};
  if (notes.revora_opportunity_id) {
    const opp = getStore().opportunities.find((o) => o.id === notes.revora_opportunity_id);
    if (opp) return opp;
  }
  if (notes.revora_correlation_id) {
    const opp = getStore().opportunities.find((o) => o.correlation_id === notes.revora_correlation_id);
    if (opp) return opp;
  }
  return undefined;
}

function touchExperimentMetrics(opportunityId: string) {
  const store = getStore();
  const opp = store.opportunities.find((o) => o.id === opportunityId);
  if (!opp) return;
  const result = store.experiment_results[0];
  if (!result) return;
  // Verified payment only — bump arm recovered count; rates recomputed elsewhere
  if (opp.experiment_arm === "treatment") {
    result.treatment_recovered += 1;
  } else if (opp.experiment_arm === "control") {
    result.control_recovered += 1;
  }
  result.computed_at = new Date().toISOString();
}
