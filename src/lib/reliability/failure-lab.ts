import { createId } from "@/lib/utils";
import { recoveryProbabilityModel } from "@/lib/recovery/probability-model";
import { analyzeOpportunity, executeRecovery } from "@/lib/recovery/executor";
import { processRazorpayWebhook } from "@/lib/recovery/webhooks";
import { getStore, recordIncident } from "@/lib/store/memory";
import { ensureSeeded, MERCHANT_ID } from "@/lib/store/seed";
import { signDemoWebhook } from "@/lib/razorpay/verification";

export type SimulationType =
  | "API_TIMEOUT"
  | "DUPLICATE_WEBHOOK"
  | "ALREADY_PAID"
  | "RETRY_LIMIT"
  | "LOW_CONFIDENCE"
  | "AI_OUTAGE"
  | "EXECUTION_FAILURE"
  | "OUT_OF_ORDER_WEBHOOK";

export interface SimulationResult {
  type: SimulationType;
  title: string;
  what_broke: string;
  system_response: string;
  recovery_mechanism: string;
  final_state: string;
  audit_event_id: string;
  incident_id: string;
  opportunity_id?: string;
  details: Record<string, unknown>;
}

export async function runFailureSimulation(type: SimulationType): Promise<SimulationResult> {
  ensureSeeded();
  const store = getStore();

  switch (type) {
    case "API_TIMEOUT": {
      store.simulation_flags.api_timeout = true;
      store.simulation_flags.api_timeout_count = 0;
      const opp =
        store.opportunities.find((o) => o.status === "READY" && o.policy_status === "SAFE_TO_EXECUTE") ||
        store.opportunities.find((o) => o.amount === 48_000_00)!;
      // Reset to READY for demo
      opp.status = "READY";
      opp.policy_status = "SAFE_TO_EXECUTE";
      const first = await executeRecovery(opp.id, { approvedByMerchant: true, actor: "failure_lab" });
      const second = await executeRecovery(opp.id, { approvedByMerchant: true, actor: "failure_lab" });
      const incident = store.incidents[0];
      return {
        type,
        title: "Razorpay API timeout",
        what_broke: "Upstream Razorpay API timed out during recovery execution",
        system_response: first.message,
        recovery_mechanism:
          "Action marked retry-pending with idempotency key; second attempt reconciled trusted state without duplicate charge",
        final_state: second.opportunity.status,
        audit_event_id: store.audit_events[0]?.id,
        incident_id: incident?.id,
        opportunity_id: opp.id,
        details: { first: first.message, second: second.message, final: second.opportunity },
      };
    }
    case "DUPLICATE_WEBHOOK": {
      const body = JSON.stringify({
        event_id: "evt_demo_duplicate_001",
        event: "payment.failed",
        payload: {
          payment: {
            entity: {
              id: "pay_dup_test",
              amount: 250000,
              method: "upi",
              error_description: "Insufficient funds",
            },
          },
        },
      });
      const sig = signDemoWebhook(body);
      const first = await processRazorpayWebhook({ rawBody: body, signature: sig, demo: true });
      const second = await processRazorpayWebhook({ rawBody: body, signature: sig, demo: true });
      const incident = store.incidents.find((i) => i.type === "DUPLICATE_WEBHOOK")!;
      return {
        type,
        title: "Duplicate webhook",
        what_broke: "Razorpay delivered the same event twice",
        system_response: second.message,
        recovery_mechanism: "Event ID idempotency store — second delivery skipped",
        final_state: "Single opportunity retained",
        audit_event_id: store.audit_events[0]?.id,
        incident_id: incident.id,
        opportunity_id: first.opportunity_id,
        details: { first, second },
      };
    }
    case "ALREADY_PAID": {
      store.simulation_flags.force_already_paid = true;
      const opp = store.opportunities.find((o) => o.status === "READY") || store.opportunities[0];
      opp.status = "READY";
      const result = await executeRecovery(opp.id, { approvedByMerchant: true, actor: "failure_lab" });
      store.simulation_flags.force_already_paid = false;
      return {
        type,
        title: "Already-paid transaction",
        what_broke: "Execute requested on payment already captured",
        system_response: result.message,
        recovery_mechanism: "Deterministic policy engine blocked duplicate recovery",
        final_state: result.opportunity.status,
        audit_event_id: store.audit_events[0]?.id,
        incident_id: store.incidents[0]?.id,
        opportunity_id: opp.id,
        details: { result },
      };
    }
    case "RETRY_LIMIT": {
      const opp =
        store.opportunities.find((o) => o.attempt_count >= 3) ||
        store.opportunities.find((o) => o.id.includes("retry")) ||
        store.opportunities[1];
      opp.attempt_count = 3;
      opp.status = "READY";
      opp.recommended_action = "RETRY_NOW";
      const result = await executeRecovery(opp.id, {
        action: "RETRY_NOW",
        approvedByMerchant: true,
        actor: "failure_lab",
      });
      return {
        type,
        title: "Retry limit exceeded",
        what_broke: "AI recommended retry after merchant max attempts",
        system_response: result.message,
        recovery_mechanism: "Policy engine blocked action; human escalation path available",
        final_state: result.opportunity.status,
        audit_event_id: store.audit_events[0]?.id,
        incident_id: store.incidents[0]?.id,
        opportunity_id: opp.id,
        details: { policy: result.opportunity.policy_reason },
      };
    }
    case "LOW_CONFIDENCE": {
      const opp = store.opportunities.find((o) => o.amount === 95_000_00) || store.opportunities[2];
      opp.confidence = "LOW";
      opp.status = "READY";
      opp.recommended_action = "PAYMENT_LINK";
      const result = await executeRecovery(opp.id, {
        action: "PAYMENT_LINK",
        approvedByMerchant: false,
        actor: "failure_lab",
      });
      return {
        type,
        title: "Low confidence / high value",
        what_broke: "Medium/low confidence on high-value recovery",
        system_response: result.message,
        recovery_mechanism: "Confidence-based autonomy → REVIEW REQUIRED — no auto execution",
        final_state: result.opportunity.status,
        audit_event_id: store.audit_events[0]?.id,
        incident_id: createId("inc"),
        opportunity_id: opp.id,
        details: { autonomy: result.opportunity.autonomy_mode },
      };
    }
    case "AI_OUTAGE": {
      store.simulation_flags.llm_unavailable = true;
      store.simulation_flags.model_unavailable = true;
      recoveryProbabilityModel.setUnavailable(true);
      const opp = store.opportunities.find((o) => o.status === "READY") || store.opportunities[0];
      const result = analyzeOpportunity(opp.id);
      store.simulation_flags.llm_unavailable = false;
      store.simulation_flags.model_unavailable = false;
      recoveryProbabilityModel.setUnavailable(false);
      const incident = recordIncident({
        merchant_id: MERCHANT_ID,
        type: "AI_OUTAGE",
        severity: "warning",
        title: "AI / model unavailable",
        description: "Deterministic fallback produced recommendation.",
        what_broke: "LLM and recovery model unavailable",
        recovery_action: "Deterministic fallback using failure category + history + attempts",
        final_state: result.opportunity.status,
        resolved: true,
        opportunity_id: opp.id,
        correlation_id: opp.correlation_id,
      });
      return {
        type,
        title: "AI outage",
        what_broke: "LLM and probability model unavailable",
        system_response: result.decision.explanation,
        recovery_mechanism: "Deterministic fallback — system did not collapse",
        final_state: result.opportunity.status,
        audit_event_id: store.audit_events[0]?.id,
        incident_id: incident.id,
        opportunity_id: opp.id,
        details: { used_fallback: result.decision.used_fallback, action: result.decision.recommended_action },
      };
    }
    case "EXECUTION_FAILURE": {
      store.simulation_flags.execution_failure = true;
      const opp = store.opportunities.find((o) => o.status === "READY") || store.opportunities[0];
      opp.status = "READY";
      opp.policy_status = "SAFE_TO_EXECUTE";
      const result = await executeRecovery(opp.id, { approvedByMerchant: true, actor: "failure_lab" });
      return {
        type,
        title: "Execution failure",
        what_broke: "Executor returned failure mid-flight",
        system_response: result.message,
        recovery_mechanism: "Failed closed — no duplicate financial side effect",
        final_state: result.opportunity.status,
        audit_event_id: store.audit_events[0]?.id,
        incident_id: store.incidents[0]?.id,
        opportunity_id: opp.id,
        details: { error: result.action.error_message },
      };
    }
    case "OUT_OF_ORDER_WEBHOOK": {
      const payId = `pay_ooo_${Date.now()}`;
      // First capture
      const captured = JSON.stringify({
        event_id: `evt_ooo_cap_${Date.now()}`,
        event: "payment.captured",
        payload: { payment: { entity: { id: payId, amount: 100000, status: "captured" } } },
      });
      // Insert payment as captured linked to an opportunity waiting
      const opp = store.opportunities[0];
      const payment = store.payments.find((p) => p.id === opp.payment_id);
      if (payment) {
        payment.razorpay_payment_id = payId;
        payment.status = "captured";
      }
      await processRazorpayWebhook({
        rawBody: captured,
        signature: signDemoWebhook(captured),
        demo: true,
      });
      // Then failure for same payment
      const failed = JSON.stringify({
        event_id: `evt_ooo_fail_${Date.now()}`,
        event: "payment.failed",
        payload: {
          payment: {
            entity: {
              id: payId,
              amount: 100000,
              error_description: "Late failure",
            },
          },
        },
      });
      const result = await processRazorpayWebhook({
        rawBody: failed,
        signature: signDemoWebhook(failed),
        demo: true,
      });
      return {
        type,
        title: "Out-of-order webhook",
        what_broke: "payment.failed arrived after payment.captured",
        system_response: result.message,
        recovery_mechanism: "Trusted captured state wins — failure ignored",
        final_state: "captured retained",
        audit_event_id: store.audit_events[0]?.id,
        incident_id: store.incidents.find((i) => i.type === "OUT_OF_ORDER_WEBHOOK")?.id || createId("inc"),
        details: { result },
      };
    }
    default:
      throw new Error("Unknown simulation");
  }
}
