/**
 * Razorpay TEST MODE integration foundation — tests A–O.
 * Uses signed fixtures; never disables signature verification.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore } from "@/lib/store/memory";
import { buildSeedStore } from "@/lib/store/seed";
import {
  assertTestModeCredentials,
  getRazorpayConfig,
  RazorpayConfigError,
  RazorpayError,
  signDemoWebhook,
  verifyWebhookSignature,
} from "@/lib/razorpay";
import { createRecoveryPaymentLink } from "@/lib/razorpay/recovery-payment-link";
import { processRazorpayWebhook } from "@/lib/recovery/webhooks";
import { analyzeOpportunity, confirmOutcome, executeRecovery } from "@/lib/recovery/executor";
import { getStore } from "@/lib/store/memory";

function failedPaymentBody(opts: {
  eventId: string;
  paymentId: string;
  amount: number;
}) {
  return JSON.stringify({
    event_id: opts.eventId,
    event: "payment.failed",
    payload: {
      payment: {
        entity: {
          id: opts.paymentId,
          amount: opts.amount,
          currency: "INR",
          method: "upi",
          error_description: "Insufficient funds",
          error_code: "BAD_REQUEST_ERROR",
        },
      },
    },
  });
}

function paymentLinkPaidBody(opts: {
  eventId: string;
  opportunityId?: string;
  correlationId?: string;
  linkId: string;
  amount: number;
  paidAmount?: number;
  notes?: Record<string, string>;
}) {
  const notes =
    opts.notes ??
    (opts.correlationId
      ? { revora_correlation_id: opts.correlationId, revora_action: "PAYMENT_LINK" }
      : { revora_opportunity_id: opts.opportunityId ?? "" });
  const refId = opts.opportunityId
    ? `revora_${opts.opportunityId.replace(/-/g, "").slice(0, 32)}`
    : `revora_${opts.correlationId ?? "ref"}`;
  return JSON.stringify({
    event_id: opts.eventId,
    event: "payment_link.paid",
    payload: {
      payment_link: {
        entity: {
          id: opts.linkId,
          amount: opts.amount,
          amount_paid: opts.paidAmount ?? opts.amount,
          currency: "INR",
          status: "paid",
          reference_id: refId,
          notes,
        },
      },
      payment: {
        entity: {
          id: `pay_verified_${opts.eventId}`,
          amount: opts.paidAmount ?? opts.amount,
          status: "captured",
        },
      },
    },
  });
}

describe("A/B — Razorpay client credential safety", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env = { ...prev };
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    process.env.RAZORPAY_MODE = "test";
  });

  it("A. refuses live credentials in test mode", () => {
    expect(() => assertTestModeCredentials("rzp_live_abc123")).toThrow(RazorpayConfigError);
    process.env.RAZORPAY_KEY_ID = "rzp_live_abc123";
    process.env.RAZORPAY_KEY_SECRET = "secret";
    expect(() => getRazorpayConfig()).toThrow(/Live Razorpay|refused/i);
  });

  it("B. missing credentials handled safely", () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    expect(() => getRazorpayConfig()).toThrow(RazorpayError);
    expect(() => getRazorpayConfig()).toThrow(/not configured/i);
  });
});

describe("C/D/E — webhook signature + idempotency", () => {
  beforeEach(() => {
    resetStore();
    buildSeedStore();
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret";
  });

  it("C. verifies webhook signatures", () => {
    const body = '{"event":"payment.failed"}';
    const sig = signDemoWebhook(body);
    expect(verifyWebhookSignature(body, sig, "test_webhook_secret")).toBe(true);
  });

  it("D. rejects invalid signatures", async () => {
    const body = failedPaymentBody({
      eventId: "evt_bad_sig",
      paymentId: "pay_bad_sig",
      amount: 100000,
    });
    const result = await processRazorpayWebhook({
      rawBody: body,
      signature: "not_a_valid_signature",
    });
    expect(result.accepted).toBe(false);
    expect(result.message).toMatch(/signature/i);
  });

  it("E. duplicate webhook ignored", async () => {
    const body = failedPaymentBody({
      eventId: "evt_dup_1",
      paymentId: "pay_dup_1",
      amount: 150000,
    });
    const sig = signDemoWebhook(body);
    const first = await processRazorpayWebhook({ rawBody: body, signature: sig });
    const second = await processRazorpayWebhook({ rawBody: body, signature: sig });
    expect(first.accepted).toBe(true);
    expect(second.duplicate).toBe(true);
  });
});

describe("F/G — payment.failed opportunity creation", () => {
  beforeEach(() => {
    resetStore();
    buildSeedStore();
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret";
  });

  it("F. payment.failed creates exactly one opportunity", async () => {
    const before = getStore().opportunities.length;
    const body = failedPaymentBody({
      eventId: "evt_fail_one",
      paymentId: "pay_fail_one",
      amount: 220000,
    });
    const result = await processRazorpayWebhook({
      rawBody: body,
      signature: signDemoWebhook(body),
    });
    expect(result.accepted).toBe(true);
    expect(result.opportunity_id).toBeTruthy();
    expect(getStore().opportunities.length).toBe(before + 1);
    const opp = getStore().opportunities.find((o) => o.id === result.opportunity_id)!;
    expect(opp.status).not.toBe("RECOVERED");
    expect(opp.recommended_action).toBeTruthy(); // analyzed, not executed
  });

  it("G. duplicate payment.failed does not create another opportunity", async () => {
    const body1 = failedPaymentBody({
      eventId: "evt_fail_a",
      paymentId: "pay_same_payment",
      amount: 330000,
    });
    const body2 = failedPaymentBody({
      eventId: "evt_fail_b",
      paymentId: "pay_same_payment",
      amount: 330000,
    });
    const first = await processRazorpayWebhook({
      rawBody: body1,
      signature: signDemoWebhook(body1),
    });
    const before = getStore().opportunities.length;
    const second = await processRazorpayWebhook({
      rawBody: body2,
      signature: signDemoWebhook(body2),
    });
    expect(first.opportunity_id).toBeTruthy();
    expect(second.opportunity_id).toBe(first.opportunity_id);
    expect(getStore().opportunities.length).toBe(before);
  });
});

describe("H/I/J/O — Payment Link creation + policy", () => {
  beforeEach(() => {
    resetStore();
    buildSeedStore();
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    process.env.RAZORPAY_MODE = "test";
  });

  it("H. Payment Link cannot be created for already recovered opportunity", async () => {
    const hero = getStore().opportunities.find((o) => o.amount === 48_000_00)!;
    hero.status = "RECOVERED";
    hero.actual_recovered_amount = hero.amount;
    const result = await createRecoveryPaymentLink(hero.id, { approvedByMerchant: true });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("BLOCKED");
    expect(result.payment_link_id).toBeNull();
  });

  it("I. Payment Link amount comes from server-side opportunity", async () => {
    const opp = getStore().opportunities.find((o) => o.status === "READY") || getStore().opportunities[0];
    opp.status = "READY";
    opp.policy_status = "SAFE_TO_EXECUTE";
    opp.confidence = "HIGH";
    opp.attempt_count = 0;
    const result = await createRecoveryPaymentLink(opp.id, { approvedByMerchant: true });
    expect(result.ok).toBe(true);
    expect(result.action?.request_payload?.amount).toBe(opp.amount);
    expect((result.action?.response_payload as Record<string, unknown>)?.amount).toBe(opp.amount);
  });

  it("J. Payment Link creation creates recovery action", async () => {
    const opp = getStore().opportunities.find((o) => o.status === "READY") || getStore().opportunities[0];
    opp.status = "READY";
    opp.policy_status = "SAFE_TO_EXECUTE";
    opp.confidence = "HIGH";
    opp.attempt_count = 0;
    const before = getStore().actions.filter((a) => a.opportunity_id === opp.id).length;
    const result = await createRecoveryPaymentLink(opp.id, { approvedByMerchant: true });
    expect(result.ok).toBe(true);
    expect(result.action?.action_type).toBe("PAYMENT_LINK");
    expect(getStore().actions.filter((a) => a.opportunity_id === opp.id).length).toBeGreaterThan(
      before
    );
    // Issued link does NOT mark recovered
    expect(result.opportunity.status).not.toBe("RECOVERED");
  });

  it("O. Policy blocks unsafe execution", async () => {
    const opp = getStore().opportunities.find((o) => o.amount === 95_000_00) || getStore().opportunities[2];
    opp.status = "READY";
    opp.confidence = "LOW";
    opp.recommended_action = "PAYMENT_LINK";
    opp.attempt_count = 0;
    const result = await createRecoveryPaymentLink(opp.id, { approvedByMerchant: false });
    expect(result.ok).toBe(false);
    expect(["BLOCKED", "REQUIRES_APPROVAL"].includes(result.opportunity.policy_status || "") || result.status === "BLOCKED").toBe(
      true
    );
  });
});

describe("K/L/M/N — Payment Link paid + outcome safety", () => {
  beforeEach(() => {
    resetStore();
    buildSeedStore();
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret";
  });

  it("K. Payment Link paid webhook creates exactly one recovery outcome", async () => {
    const opp = getStore().opportunities.find((o) => o.status === "READY") || getStore().opportunities[0];
    opp.status = "READY";
    opp.policy_status = "SAFE_TO_EXECUTE";
    opp.confidence = "HIGH";
    opp.attempt_count = 0;
    const link = await createRecoveryPaymentLink(opp.id, { approvedByMerchant: true });
    expect(link.ok).toBe(true);
    expect(link.opportunity.status).toBe("WAITING_FOR_OUTCOME");

    const body = paymentLinkPaidBody({
      eventId: "evt_plink_paid_1",
      opportunityId: opp.id,
      linkId: link.payment_link_id!,
      amount: opp.amount,
    });
    const paid = await processRazorpayWebhook({
      rawBody: body,
      signature: signDemoWebhook(body),
    });
    expect(paid.accepted).toBe(true);

    const outcomes = getStore().outcomes.filter((o) => o.opportunity_id === opp.id);
    expect(outcomes.length).toBe(1);
    expect(getStore().opportunities.find((o) => o.id === opp.id)!.status).toBe("RECOVERED");

    // Duplicate paid event
    const body2 = paymentLinkPaidBody({
      eventId: "evt_plink_paid_2",
      opportunityId: opp.id,
      linkId: link.payment_link_id!,
      amount: opp.amount,
    });
    await processRazorpayWebhook({
      rawBody: body2,
      signature: signDemoWebhook(body2),
    });
    expect(getStore().outcomes.filter((o) => o.opportunity_id === opp.id).length).toBe(1);
  });

  it("L. Actual recovery comes from verified payment amount", async () => {
    const opp = getStore().opportunities.find((o) => o.status === "READY") || getStore().opportunities[0];
    opp.status = "WAITING_FOR_OUTCOME";
    opp.recovery_probability = 0.9;
    opp.expected_recovery_value = Math.round(opp.amount * 0.9);
    const verified = opp.amount;
    confirmOutcome(opp.id, { success: true, via: "webhook", amount: verified });
    const outcome = getStore().outcomes.find((o) => o.opportunity_id === opp.id)!;
    expect(outcome.actual_recovered_amount).toBe(verified);
    expect(outcome.actual_recovered_amount).not.toBe(opp.expected_recovery_value);
  });

  it("M. API failure does not create recovery outcome", async () => {
    const opp = getStore().opportunities.find((o) => o.status === "READY") || getStore().opportunities[0];
    opp.status = "READY";
    opp.policy_status = "SAFE_TO_EXECUTE";
    opp.confidence = "HIGH";
    opp.attempt_count = 0;
    opp.recommended_action = "PAYMENT_LINK";

    // Force Razorpay path + mock API failure
    const prevDemo = process.env.NEXT_PUBLIC_DEMO_MODE;
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    process.env.RAZORPAY_KEY_ID = "rzp_test_fake";
    process.env.RAZORPAY_KEY_SECRET = "fake_secret";

    vi.spyOn(await import("@/lib/razorpay/payment-links"), "createPaymentLink").mockRejectedValue(
      new Error("Razorpay API unavailable")
    );

    const beforeOutcomes = getStore().outcomes.filter((o) => o.opportunity_id === opp.id).length;
    const result = await createRecoveryPaymentLink(opp.id, { approvedByMerchant: true });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(getStore().opportunities.find((o) => o.id === opp.id)!.status).not.toBe("RECOVERED");
    expect(getStore().outcomes.filter((o) => o.opportunity_id === opp.id).length).toBe(
      beforeOutcomes
    );

    process.env.NEXT_PUBLIC_DEMO_MODE = prevDemo;
    vi.restoreAllMocks();
  });

  it("N. Out-of-order webhook cannot corrupt recovered state", async () => {
    const store = getStore();
    const opp = store.opportunities[0];
    const payId = "pay_ooo_recovered";
    const payment = store.payments.find((p) => p.id === opp.payment_id)!;
    payment.razorpay_payment_id = payId;
    payment.status = "captured";
    opp.status = "RECOVERED";
    opp.actual_recovered_amount = opp.amount;

    // Seed one outcome
    confirmOutcome(opp.id, { success: true, via: "webhook", amount: opp.amount });
    const outcomeCount = store.outcomes.filter((o) => o.opportunity_id === opp.id).length;

    const failed = failedPaymentBody({
      eventId: "evt_ooo_late_fail",
      paymentId: payId,
      amount: opp.amount,
    });
    const result = await processRazorpayWebhook({
      rawBody: failed,
      signature: signDemoWebhook(failed),
    });
    expect(result.message.toLowerCase()).toMatch(/ignored|recovered|captured/);
    expect(store.opportunities.find((o) => o.id === opp.id)!.status).toBe("RECOVERED");
    expect(store.outcomes.filter((o) => o.opportunity_id === opp.id).length).toBe(outcomeCount);
  });
});

describe("executeRecovery PAYMENT_LINK path", () => {
  beforeEach(() => {
    resetStore();
    buildSeedStore();
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
  });

  it("does not mark RECOVERED merely because Payment Link was created", async () => {
    const opp = getStore().opportunities.find((o) => o.status === "READY") || getStore().opportunities[0];
    opp.status = "READY";
    opp.policy_status = "SAFE_TO_EXECUTE";
    opp.confidence = "HIGH";
    opp.attempt_count = 0;
    analyzeOpportunity(opp.id);
    const result = await executeRecovery(opp.id, {
      action: "PAYMENT_LINK",
      approvedByMerchant: true,
    });
    expect(result.opportunity.status).toBe("WAITING_FOR_OUTCOME");
    expect(result.outcome).toBeUndefined();
  });

  it("P. payment_link.paid identifies opportunity by revora_correlation_id", async () => {
    const opp = getStore().opportunities.find((o) => o.correlation_id === "corr_demo_48000")!;
    opp.status = "WAITING_FOR_OUTCOME";
    opp.actual_recovered_amount = 0;

    const body = paymentLinkPaidBody({
      eventId: "evt_plink_corr_test",
      correlationId: "corr_demo_48000",
      linkId: "plink_TXf59BB7H4fmeX",
      amount: opp.amount,
    });
    const paid = await processRazorpayWebhook({
      rawBody: body,
      signature: signDemoWebhook(body),
    });
    expect(paid.accepted).toBe(true);
    expect(paid.opportunity_id).toBe(opp.id);

    const updated = getStore().opportunities.find((o) => o.id === opp.id)!;
    expect(updated.status).toBe("RECOVERED");
    expect(updated.actual_recovered_amount).toBe(opp.amount);

    const outcomes = getStore().outcomes.filter((o) => o.opportunity_id === opp.id);
    expect(outcomes.length).toBe(1);
    expect(outcomes[0].verified_via).toBe("webhook");
  });

  it("Q. payment_link.paid identifies opportunity by metadata.payment_link_id", async () => {
    const opp = getStore().opportunities.find((o) => o.status === "READY") || getStore().opportunities[0];
    opp.status = "WAITING_FOR_OUTCOME";
    opp.actual_recovered_amount = 0;
    opp.metadata = { ...opp.metadata, payment_link_id: "plink_meta_123" };

    const body = paymentLinkPaidBody({
      eventId: "evt_plink_meta_test",
      linkId: "plink_meta_123",
      amount: opp.amount,
      notes: { revora_action: "PAYMENT_LINK" },
    });
    const paid = await processRazorpayWebhook({
      rawBody: body,
      signature: signDemoWebhook(body),
    });
    expect(paid.accepted).toBe(true);
    expect(paid.opportunity_id).toBe(opp.id);
    expect(getStore().opportunities.find((o) => o.id === opp.id)!.status).toBe("RECOVERED");
  });

  it("R. payment_link.paid rejects amount mismatch and does not mark RECOVERED", async () => {
    const opp = getStore().opportunities.find((o) => o.status === "READY") || getStore().opportunities[0];
    opp.status = "WAITING_FOR_OUTCOME";
    opp.actual_recovered_amount = 0;

    const body = paymentLinkPaidBody({
      eventId: "evt_mismatch_test",
      opportunityId: opp.id,
      linkId: "plink_mismatch",
      amount: opp.amount,
      paidAmount: opp.amount - 10000, // mismatch
    });
    const paid = await processRazorpayWebhook({
      rawBody: body,
      signature: signDemoWebhook(body),
    });
    expect(paid.accepted).toBe(true);
    expect(paid.message).toMatch(/mismatch/i);
    expect(getStore().opportunities.find((o) => o.id === opp.id)!.status).toBe("WAITING_FOR_OUTCOME");
    expect(getStore().outcomes.filter((o) => o.opportunity_id === opp.id).length).toBe(0);
  });
});

describe("POST /api/webhooks/razorpay route handler", () => {
  beforeEach(() => {
    resetStore();
    buildSeedStore();
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret";
  });

  it("handles payment_link.paid via HTTP Request object", async () => {
    const { POST } = await import("@/app/api/webhooks/razorpay/route");
    const opp = getStore().opportunities.find((o) => o.correlation_id === "corr_demo_48000")!;
    opp.status = "WAITING_FOR_OUTCOME";
    opp.actual_recovered_amount = 0;

    const body = paymentLinkPaidBody({
      eventId: "evt_route_test_1",
      correlationId: "corr_demo_48000",
      linkId: "plink_TXf59BB7H4fmeX",
      amount: opp.amount,
    });
    const sig = signDemoWebhook(body);

    const req = new Request("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-signature": sig,
        "content-type": "application/json",
      },
      body,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.accepted).toBe(true);
    expect(json.opportunity_id).toBe(opp.id);
  });

  it("rejects invalid signature with 400", async () => {
    const { POST } = await import("@/app/api/webhooks/razorpay/route");
    const body = '{"event":"payment_link.paid"}';
    const req = new Request("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-signature": "bad_sig",
      },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.accepted).toBe(false);
  });
});
