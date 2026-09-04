import type {
  DashboardSummary,
  LeakageBucket,
  OpportunitySource,
  OpportunityStatus,
  RecoveryAction,
  RecoveryOpportunity,
  RecoveryOutcome,
} from "@/lib/domain/types";
import { MODEL_DATA_LABEL } from "@/lib/recovery/probability-model";
import { isDemoMode, hasRazorpayCredentials } from "@/lib/store/memory";
import type { MerchantSnapshot } from "@/lib/store/supabase-repo";

/** Terminal statuses — no longer count toward revenue at risk. */
const TERMINAL_STATUSES = new Set<OpportunityStatus>(["RECOVERED", "CANCELLED", "EXPIRED"]);

/**
 * Eligible / open book for Revenue at Risk + leakage.
 * Includes READY, AWAITING_APPROVAL, BLOCKED, EXECUTING, etc.
 * Excludes recovered / cancelled / expired.
 */
export function isAtRiskOpportunity(o: RecoveryOpportunity): boolean {
  return !TERMINAL_STATUSES.has(o.status);
}

/** @deprecated Use isAtRiskOpportunity — kept for transitional imports */
export const OPEN_STATUSES = new Set([
  "DETECTED",
  "ANALYZING",
  "READY",
  "AWAITING_APPROVAL",
  "EXECUTING",
  "WAITING_FOR_OUTCOME",
  "ESCALATED",
  "BLOCKED",
  "FAILED",
]);

export function atRiskOpportunities(opps: RecoveryOpportunity[]): RecoveryOpportunity[] {
  return opps.filter(isAtRiskOpportunity);
}

/** Model estimate: Σ (amount × recovery_probability) for at-risk opportunities. */
export function estimatedRecoverablePaise(opps: RecoveryOpportunity[]): number {
  return opps.reduce((s, o) => {
    const p = o.recovery_probability;
    if (p == null) return s + (o.expected_recovery_value ?? 0);
    return s + Math.round(o.amount * p);
  }, 0);
}

export function summarizeFromSnapshot(
  snap: MerchantSnapshot,
  opts?: { aiDegraded?: boolean }
): DashboardSummary {
  const atRisk = atRiskOpportunities(snap.opportunities);
  const revenueAtRisk = atRisk.reduce((s, o) => s + o.amount, 0);
  const estimatedRecoverable = estimatedRecoverablePaise(atRisk);

  // Actual Recovery = verified outcomes when present; for RECOVERED opportunities
  // missing an outcome row (legacy persist failures), fall back to opportunity fields.
  const outcomeActual = new Map<string, number>();
  const outcomeIncremental = new Map<string, number>();
  for (const o of snap.outcomes) {
    outcomeActual.set(
      o.opportunity_id,
      (outcomeActual.get(o.opportunity_id) ?? 0) + o.actual_recovered_amount
    );
    outcomeIncremental.set(
      o.opportunity_id,
      (outcomeIncremental.get(o.opportunity_id) ?? 0) + o.incremental_recovered_amount
    );
  }
  let actuallyRecovered = 0;
  let incremental = 0;
  for (const o of snap.opportunities) {
    if (outcomeActual.has(o.id)) {
      actuallyRecovered += outcomeActual.get(o.id)!;
      incremental += outcomeIncremental.get(o.id) ?? 0;
    } else if (o.status === "RECOVERED" && o.actual_recovered_amount > 0) {
      actuallyRecovered += o.actual_recovered_amount;
      incremental += o.incremental_recovered_amount;
    }
  }
  // Outcomes for opportunities no longer in the snapshot (should be rare)
  for (const [oppId, amount] of outcomeActual) {
    if (!snap.opportunities.some((o) => o.id === oppId)) {
      actuallyRecovered += amount;
      incremental += outcomeIncremental.get(oppId) ?? 0;
    }
  }

  return {
    revenue_at_risk: revenueAtRisk,
    estimated_recoverable: estimatedRecoverable,
    actually_recovered: actuallyRecovered,
    incremental_recovery: incremental,
    pending_approvals: snap.opportunities.filter((o) => o.status === "AWAITING_APPROVAL").length,
    executing_count: snap.opportunities.filter(
      (o) => o.status === "EXECUTING" || o.status === "WAITING_FOR_OUTCOME"
    ).length,
    system_status: opts?.aiDegraded ? "degraded" : "operational",
    mode: isDemoMode() || !hasRazorpayCredentials() ? "demo" : "razorpay_test",
    data_label: MODEL_DATA_LABEL,
  };
}

/**
 * Leakage breakdown of the SAME at-risk population as Revenue at Risk.
 * Pass full opportunity list — this filters to at-risk internally.
 */
export function leakageFromOpportunities(opps: RecoveryOpportunity[]): LeakageBucket[] {
  const pool = atRiskOpportunities(opps);
  const total = pool.reduce((s, o) => s + o.amount, 0) || 1;
  const sources: OpportunitySource[] = [
    "FAILED_PAYMENT",
    "CHECKOUT_ABANDONMENT",
    "RECURRING_FAILURE",
    "PAYMENT_LINK",
    "OVERDUE_RECEIVABLE",
  ];
  const labels: Record<OpportunitySource, string> = {
    FAILED_PAYMENT: "Failed payments",
    CHECKOUT_ABANDONMENT: "Checkout abandonment",
    RECURRING_FAILURE: "Recurring failures",
    PAYMENT_LINK: "Payment links",
    OVERDUE_RECEIVABLE: "Overdue receivables",
  };

  return sources
    .map((source) => {
      const items = pool.filter((o) => o.source === source);
      const amount = items.reduce((s, o) => s + o.amount, 0);
      const recoverability =
        items.length === 0
          ? 0
          : items.reduce((s, o) => s + (o.recovery_probability ?? 0), 0) / items.length;
      return {
        source,
        label: labels[source],
        amount,
        percentage: amount / total,
        trend: 0,
        recoverability,
        count: items.length,
      };
    })
    .filter((b) => b.count > 0)
    .sort((a, b) => b.amount - a.amount);
}

export function pulseFromData(
  opps: RecoveryOpportunity[],
  actions: RecoveryAction[],
  rangeDays: number | "all" = 7
): Array<{ date: string; risk: number; expected: number; recovered: number }> {
  const days = rangeDays === "all" ? 90 : rangeDays;
  const atRisk = atRiskOpportunities(opps);
  const points = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const inDay = (iso: string) => {
      const t = new Date(iso).getTime();
      return t >= day.getTime() && t < next.getTime();
    };
    const dayCreated = atRisk.filter((o) => inDay(o.created_at));
    const recovered = opps.filter(
      (o) => o.status === "RECOVERED" && o.resolved_at && inDay(o.resolved_at)
    );
    points.push({
      date: day.toISOString().slice(0, 10),
      risk: dayCreated.reduce((s, o) => s + o.amount, 0) / 100,
      expected: estimatedRecoverablePaise(dayCreated) / 100,
      recovered: recovered.reduce((s, o) => s + o.actual_recovered_amount, 0) / 100,
    });
  }

  // Demo seed uses a fixed clock — when no day matches, place the current open book
  // on the latest day only (honest snapshot, not fabricated multi-day spikes).
  if (points.every((p) => p.risk === 0 && p.recovered === 0 && p.expected === 0)) {
    const last = points[points.length - 1];
    last.risk = atRisk.reduce((s, o) => s + o.amount, 0) / 100;
    last.expected = estimatedRecoverablePaise(atRisk) / 100;
    last.recovered =
      opps
        .filter((o) => o.status === "RECOVERED")
        .reduce((s, o) => s + o.actual_recovered_amount, 0) / 100;
  }

  void actions;
  return points;
}

export function metricsFromOpportunities(opps: RecoveryOpportunity[]) {
  const recovered = opps.filter((o) => o.status === "RECOVERED");
  const atRisk = atRiskOpportunities(opps);
  const byFailure: Record<string, { count: number; amount: number; recovered: number }> = {};
  for (const o of atRisk) {
    const key = o.failure_category || "UNKNOWN";
    byFailure[key] ??= { count: 0, amount: 0, recovered: 0 };
    byFailure[key].count += 1;
    byFailure[key].amount += o.amount;
    byFailure[key].recovered += o.actual_recovered_amount;
  }
  const byIntervention: Record<string, { count: number; recovered: number }> = {};
  for (const o of opps) {
    const key = o.recommended_action || "NONE";
    byIntervention[key] ??= { count: 0, recovered: 0 };
    byIntervention[key].count += 1;
    byIntervention[key].recovered += o.actual_recovered_amount;
  }

  const buckets = [0.1, 0.3, 0.5, 0.7, 0.9].map((center) => {
    const lo = center - 0.1;
    const hi = center + 0.1;
    const group = opps.filter(
      (o) => o.recovery_probability != null && o.recovery_probability >= lo && o.recovery_probability < hi
    );
    const actualRate =
      group.length === 0 ? 0 : group.filter((o) => o.status === "RECOVERED").length / group.length;
    return { predicted: center, actual: actualRate, n: group.length };
  });

  const times = recovered
    .filter((o) => o.resolved_at)
    .map((o) => (new Date(o.resolved_at!).getTime() - new Date(o.created_at).getTime()) / 3600000);

  return {
    recovery_rate: opps.length ? recovered.length / opps.length : 0,
    avg_time_to_recovery_hours: times.length
      ? times.reduce((a, b) => a + b, 0) / times.length
      : 0,
    by_failure: byFailure,
    by_intervention: byIntervention,
    calibration: buckets,
    data_label: MODEL_DATA_LABEL,
    open_count: atRisk.length,
    recovered_count: recovered.length,
  };
}

export function experimentLiftFromSnapshot(snap: MerchantSnapshot, experimentId?: string) {
  const experiment = experimentId
    ? snap.experiments.find((e) => e.id === experimentId)
    : snap.experiments[0];
  if (!experiment) return null;

  const assignments = snap.experiment_assignments.filter((a) => a.experiment_id === experiment.id);
  const byArm = (arm: "control" | "treatment") =>
    assignments
      .filter((a) => a.arm === arm)
      .map((a) => snap.opportunities.find((o) => o.id === a.opportunity_id))
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
  const stored = snap.experiment_results.find((r) => r.experiment_id === experiment.id);

  const results = {
    id: stored?.id ?? "computed",
    experiment_id: experiment.id,
    control_recovered: controlRecovered,
    treatment_recovered: treatmentRecovered,
    control_recovery_rate: rate(control),
    treatment_recovery_rate: rate(treatment),
    incremental_recovery: treatmentRecovered - controlRecovered,
    control_intervention_rate: interventionRate(control),
    treatment_intervention_rate: interventionRate(treatment),
    computed_at: new Date().toISOString(),
    data_label: stored?.data_label ?? MODEL_DATA_LABEL,
    control_count: control.length,
    treatment_count: treatment.length,
  };

  return { experiment, results, data_label: MODEL_DATA_LABEL };
}

export function systemHealthFromFlags(aiDegraded = false) {
  return {
    webhook_processor: "operational" as const,
    razorpay: hasRazorpayCredentials() ? ("operational" as const) : ("demo" as const),
    ai_service: aiDegraded ? ("degraded" as const) : ("operational" as const),
    recovery_model: aiDegraded ? ("degraded" as const) : ("operational" as const),
    database: "operational" as const,
    policy_engine: "operational" as const,
    audit_service: "operational" as const,
    execution_service: "operational" as const,
    mode: isDemoMode() ? "DEMO MODE" : "RAZORPAY TEST MODE",
  };
}

export {
  summarizeFromSnapshot as getDashboardSummaryCompat,
};

export function expectedVsActual(opps: RecoveryOpportunity[], outcomes: RecoveryOutcome[]) {
  return opps.map((o) => ({
    id: o.id,
    amount: o.amount,
    expected:
      o.recovery_probability != null
        ? Math.round(o.amount * o.recovery_probability)
        : (o.expected_recovery_value ?? 0),
    actual:
      outcomes.find((x) => x.opportunity_id === o.id)?.actual_recovered_amount ??
      o.actual_recovered_amount,
    status: o.status,
    action: o.recommended_action,
  }));
}
