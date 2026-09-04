import { createId } from "@/lib/utils";
import type {
  AutonomyMode,
  ConfidenceLevel,
  InterventionType,
  Payment,
  PolicyCheck,
  PolicyDecision,
  PolicyDecisionType,
  PolicyRules,
  RecoveryOpportunity,
} from "@/lib/domain/types";

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

export function defaultPolicyRules(merchantId: string): PolicyRules {
  return {
    id: createId("pol"),
    merchant_id: merchantId,
    max_retry_attempts: 3,
    min_retry_interval_minutes: 30,
    max_auto_action_amount: 50_000_00,
    min_ai_confidence: "MEDIUM",
    max_reminders_per_24h: 2,
    high_risk_requires_approval: true,
    block_already_paid: true,
    allow_auto_retry: true,
    updated_at: new Date().toISOString(),
    updated_by: null,
  };
}

export function evaluatePolicy(params: {
  opportunity: RecoveryOpportunity;
  action: InterventionType;
  rules: PolicyRules;
  payment: Payment | null;
  confidence: ConfidenceLevel | null;
  remindersLast24h?: number;
}): PolicyDecision {
  const { opportunity, action, rules, payment, confidence } = params;
  const checks: PolicyCheck[] = [];
  const blockReasons: string[] = [];
  const approvalReasons: string[] = [];

  if (opportunity.status === "RECOVERED") {
    checks.push({
      rule: "already_recovered",
      passed: false,
      detail: "Opportunity already recovered — further execution blocked",
    });
    blockReasons.push("Opportunity already recovered — duplicate recovery prevented");
  }

  const alreadyPaid = payment?.status === "captured" || payment?.status === "authorized";
  checks.push({
    rule: "duplicate_payment_prevention",
    passed: !(rules.block_already_paid && alreadyPaid) && opportunity.status !== "RECOVERED",
    detail: alreadyPaid
      ? "Payment already captured/authorized — recovery blocked"
      : opportunity.status === "RECOVERED"
        ? "Opportunity marked RECOVERED"
        : "No duplicate payment detected",
  });
  if (rules.block_already_paid && alreadyPaid) {
    blockReasons.push("Payment already captured — duplicate recovery prevented");
  }

  const isRetry = action === "RETRY_NOW" || action === "RETRY_LATER";
  if (isRetry) {
    const withinLimit = opportunity.attempt_count < rules.max_retry_attempts;
    checks.push({
      rule: "max_retry_attempts",
      passed: withinLimit,
      detail: `${opportunity.attempt_count}/${rules.max_retry_attempts} attempts used`,
    });
    if (!withinLimit) {
      blockReasons.push(`Retry limit exceeded (${rules.max_retry_attempts})`);
    }

    if (opportunity.last_action_at) {
      const mins = (Date.now() - new Date(opportunity.last_action_at).getTime()) / 60000;
      const cooled = mins >= rules.min_retry_interval_minutes;
      checks.push({
        rule: "min_retry_interval",
        passed: cooled,
        detail: cooled
          ? `Cooldown satisfied (${Math.floor(mins)}m since last action)`
          : `Minimum interval ${rules.min_retry_interval_minutes}m not met`,
      });
      if (!cooled) {
        blockReasons.push(
          `Minimum retry interval not met (${rules.min_retry_interval_minutes} minutes)`
        );
      }
    } else {
      checks.push({
        rule: "min_retry_interval",
        passed: true,
        detail: "No prior action — cooldown not applicable",
      });
    }
  } else {
    checks.push({
      rule: "max_retry_attempts",
      passed: true,
      detail: "Not a retry action",
    });
  }

  if (action === "REMINDER") {
    const count = params.remindersLast24h ?? 0;
    const ok = count < rules.max_reminders_per_24h;
    checks.push({
      rule: "max_reminders_per_24h",
      passed: ok,
      detail: `${count}/${rules.max_reminders_per_24h} reminders in 24h`,
    });
    if (!ok) blockReasons.push("Reminder frequency limit exceeded");
  }

  const withinAutoAmount = opportunity.amount <= rules.max_auto_action_amount;
  checks.push({
    rule: "max_auto_action_amount",
    passed: true,
    detail: withinAutoAmount
      ? `Amount within auto limit (₹${(rules.max_auto_action_amount / 100).toLocaleString("en-IN")})`
      : `Amount exceeds auto limit (₹${(rules.max_auto_action_amount / 100).toLocaleString("en-IN")})`,
  });
  if (!withinAutoAmount && action !== "DO_NOTHING" && action !== "HUMAN_ESCALATION") {
    approvalReasons.push("Amount exceeds merchant automatic recovery threshold");
  }

  const conf = confidence ?? "LOW";
  const confOk = CONFIDENCE_RANK[conf] >= CONFIDENCE_RANK[rules.min_ai_confidence];
  checks.push({
    rule: "min_ai_confidence",
    passed: confOk || action === "HUMAN_ESCALATION" || action === "DO_NOTHING",
    detail: `Confidence ${conf} vs required ${rules.min_ai_confidence}`,
  });
  if (!confOk && action !== "HUMAN_ESCALATION" && action !== "DO_NOTHING") {
    approvalReasons.push(`AI confidence ${conf} below merchant threshold ${rules.min_ai_confidence}`);
  }

  if (
    rules.high_risk_requires_approval &&
    (opportunity.risk_level === "HIGH" || opportunity.risk_level === "CRITICAL") &&
    action !== "DO_NOTHING" &&
    action !== "HUMAN_ESCALATION"
  ) {
    checks.push({
      rule: "high_risk_requires_approval",
      passed: true,
      detail: `Risk ${opportunity.risk_level} — approval required`,
    });
    approvalReasons.push(`High-risk opportunity (${opportunity.risk_level}) requires approval`);
  } else {
    checks.push({
      rule: "high_risk_requires_approval",
      passed: true,
      detail: `Risk ${opportunity.risk_level} within auto policy`,
    });
  }

  if (isRetry && !rules.allow_auto_retry) {
    approvalReasons.push("Merchant disabled automatic retries");
  }

  if (action === "DO_NOTHING") {
    return makeDecision(opportunity, action, "SAFE_TO_EXECUTE", ["No financial action"], checks);
  }
  if (blockReasons.length > 0) {
    return makeDecision(opportunity, action, "BLOCKED", blockReasons, checks);
  }
  if (approvalReasons.length > 0) {
    return makeDecision(opportunity, action, "REQUIRES_APPROVAL", approvalReasons, checks);
  }
  return makeDecision(opportunity, action, "SAFE_TO_EXECUTE", ["All policy checks passed"], checks);
}

function makeDecision(
  opportunity: RecoveryOpportunity,
  action: InterventionType,
  decision: PolicyDecisionType,
  reasons: string[],
  checks: PolicyCheck[]
): PolicyDecision {
  return {
    id: createId("pdec"),
    merchant_id: opportunity.merchant_id,
    opportunity_id: opportunity.id,
    action,
    decision,
    reasons,
    checks,
    created_at: new Date().toISOString(),
  };
}

export function toAutonomyMode(decision: PolicyDecisionType): AutonomyMode {
  if (decision === "SAFE_TO_EXECUTE") return "AUTO";
  if (decision === "REQUIRES_APPROVAL") return "REVIEW_REQUIRED";
  return "BLOCKED";
}

export function riskFromAmount(amountPaise: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  const rupees = amountPaise / 100;
  if (rupees >= 100_000) return "CRITICAL";
  if (rupees >= 40_000) return "HIGH";
  if (rupees >= 10_000) return "MEDIUM";
  return "LOW";
}
