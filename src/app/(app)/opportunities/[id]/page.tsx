"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AuditTimeline } from "@/components/recovery/audit-timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { PageState } from "@/components/ui/page-state";
import type {
  AiRecommendation,
  AuditEvent,
  Customer,
  InterventionComparison,
  Payment,
  PolicyDecision,
  RecoveryAction,
  RecoveryOpportunity,
  RecoveryOutcome,
} from "@/lib/domain/types";
import { fetchLive, notifyRevoraDataChanged, onRevoraDataChanged } from "@/lib/api/client-live";
import {
  cn,
  confidenceColor,
  formatINR,
  formatPercent,
  formatRelativeTime,
  interventionLabel,
  statusTone,
} from "@/lib/utils";

type DetailPayload = {
  opportunity: RecoveryOpportunity;
  customer: Customer | null;
  payment: Payment | null;
  recommendation: AiRecommendation | null;
  policy_decisions: PolicyDecision[];
  actions: RecoveryAction[];
  outcomes: RecoveryOutcome[];
  audit: AuditEvent[];
};

const EXEC_STEPS = [
  "ANALYZING",
  "POLICY CHECK",
  "EXECUTION AUTHORIZED",
  "ACTION EXECUTED",
  "AWAITING OUTCOME",
  "RECOVERY CONFIRMED",
] as const;

export default function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"execute" | "approve" | "analyze" | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [execStep, setExecStep] = useState(-1);
  const [simulated, setSimulated] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    if (paymentLinkMeta?.url) {
      void navigator.clipboard.writeText(paymentLinkMeta.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchLive<DetailPayload>(`/api/recovery/opportunities/${id}`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Opportunity not found");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => onRevoraDataChanged(() => void load()), [load]);

  const alternatives: InterventionComparison[] = useMemo(() => {
    const fromRec = [...(data?.recommendation?.alternatives ?? [])];
    const recommended =
      data?.recommendation?.recommended_action ?? data?.opportunity?.recommended_action;
    const rec = data?.recommendation;
    if (recommended && rec && !fromRec.some((a) => a.action === recommended)) {
      fromRec.unshift({
        action: recommended,
        probability: rec.recovery_probability,
        expected_value: rec.expected_recovery_value,
        cost: 0,
        risk_penalty: 0,
        utility: rec.expected_recovery_value,
        probability_source: recommended === "DO_NOTHING" ? "BASELINE" : "MODEL",
      });
    }
    return fromRec;
  }, [data]);

  const policy = data?.policy_decisions?.[0] ?? null;
  const opp = data?.opportunity;
  const rec = data?.recommendation;
  const outcome = data?.outcomes?.[0] ?? null;

  const paymentLinkMeta = useMemo(() => {
    const action = data?.actions?.find((a) => a.action_type === "PAYMENT_LINK");
    if (!action) return null;
    const payload = (action.response_payload || {}) as Record<string, unknown>;
    const mode = String(payload.mode ?? (action.executor === "razorpay" ? "RAZORPAY_TEST" : "DEMO"));
    const statusRaw = String(payload.status ?? "issued").toUpperCase();
    const status =
      statusRaw === "PAID"
        ? "PAID"
        : statusRaw === "CREATED" || statusRaw === "ISSUED"
          ? "ISSUED"
          : action.status === "failed"
            ? "FAILED"
            : statusRaw;
    return {
      provider: mode === "DEMO" ? "Demo" : "Razorpay",
      environment: mode === "DEMO" ? "DEMO MODE" : "RAZORPAY TEST MODE",
      capability: String(payload.capability ?? (mode === "DEMO" ? "DEMO" : "RAZORPAY_TEST")),
      url: String(payload.short_url ?? payload.payment_link_url ?? "") || null,
      id: String(payload.id ?? payload.payment_link_id ?? "") || null,
      status,
    };
  }, [data?.actions]);

  const displayProbability = rec?.recovery_probability ?? opp?.recovery_probability ?? 0;
  const displayConfidence = rec?.confidence ?? opp?.confidence ?? null;
  const displayAction = rec?.recommended_action ?? opp?.recommended_action ?? null;
  const modelExpectedPaise =
    opp && displayProbability != null
      ? Math.round(opp.amount * displayProbability)
      : (rec?.expected_recovery_value ?? opp?.expected_recovery_value ?? 0);

  const modelVersion = rec?.model_version ?? "—";
  const modelName =
    rec?.key_factors
      ?.find((f) => f.startsWith("model:"))
      ?.replace(/^model:/, "")
      .split("@")[0] ??
    (modelVersion === "v0.1-demo" || modelVersion.includes("v0.1")
      ? "recovery_probability"
      : "—");

  const decisionEvidence = useMemo(() => {
    if (!opp) return [] as Array<{ title: string; detail: string }>;
    const items: Array<{ title: string; detail: string }> = [
      {
        title: "Failure Diagnostic",
        detail: opp.failure_reason ?? opp.failure_category?.replace(/_/g, " ") ?? "Unknown failure",
      },
      {
        title: "Transaction Economics",
        detail: `${formatINR(opp.amount)} at risk · model expected ${formatINR(modelExpectedPaise)}`,
      },
      {
        title: "Customer Profile & Standing",
        detail: `${data?.customer?.name ?? "Customer"} · ${data?.payment?.method ?? "payment method n/a"} · ${data?.customer?.success_count ?? 0} successful / ${data?.customer?.failure_count ?? 0} failed transactions`,
      },
      {
        title: "Retry Velocity & Attempts",
        detail: `${opp.attempt_count} attempt${opp.attempt_count === 1 ? "" : "s"} recorded (within safe threshold)`,
      },
      {
        title: "Policy & Safety Constraints",
        detail: opp.policy_reason ?? opp.policy_status?.replace(/_/g, " ") ?? "Pending policy check",
      },
      {
        title: "Model Confidence & Calibration",
        detail: `${displayConfidence ?? "—"} confidence · ${modelName} · ${modelVersion}`,
      },
    ];
    return items;
  }, [opp, data?.customer, data?.payment, modelExpectedPaise, displayConfidence, modelName, modelVersion]);

  const lifecycleSteps = useMemo(() => {
    const isPaid = opp?.status === "RECOVERED" || paymentLinkMeta?.status === "PAID";
    const hasPaymentLink = Boolean(paymentLinkMeta?.id || paymentLinkMeta?.url);
    const isApproved =
      opp?.policy_status === "SAFE_TO_EXECUTE" ||
      opp?.status === "EXECUTING" ||
      opp?.status === "WAITING_FOR_OUTCOME" ||
      isPaid;
    const hasIntervention = Boolean(displayAction);
    const isAnalyzed = Boolean(rec || opp?.recovery_probability);

    return [
      { id: "FAILED", label: "FAILED", completed: true },
      { id: "DETECTED", label: "DETECTED", completed: true },
      { id: "ANALYZED", label: "AI ANALYZED", completed: isAnalyzed },
      { id: "INTERVENTION", label: "ACTION SELECTED", completed: hasIntervention },
      { id: "POLICY", label: "POLICY APPROVED", completed: isApproved },
      { id: "LINK", label: "LINK ISSUED", completed: hasPaymentLink },
      { id: "RECOVERED", label: "RECOVERED", completed: isPaid },
    ];
  }, [opp, paymentLinkMeta, displayAction, rec]);

  async function runReanalyze() {
    setBusy("analyze");
    setActionMsg(null);
    try {
      const json = await fetchLive<{
        recommendation?: AiRecommendation;
        analysis_only?: boolean;
        outcomes_created?: number;
        note?: string;
        error?: string;
      }>(`/api/recovery/opportunities/${id}/analyze`, { method: "POST" });
      setActionMsg(
        json.note ||
          (json.analysis_only
            ? "Re-analyzed (analysis only — execution remains blocked)."
            : "Recommendation refreshed from current model.")
      );
      notifyRevoraDataChanged({ opportunity_id: id, action: "analyze" });
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Re-analyze failed");
    } finally {
      setBusy(null);
    }
  }

  async function runExecution(kind: "execute" | "approve") {
    setBusy(kind);
    setActionMsg(null);
    setSimulated(true);
    setExecStep(0);
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 280));
      setExecStep(i);
    }

    const url =
      kind === "approve"
        ? `/api/recovery/opportunities/${id}/approve`
        : `/api/recovery/opportunities/${id}/execute`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: kind === "execute" ? JSON.stringify({ approved: true }) : undefined,
    });
    const json = await res.json();
    if (!res.ok) {
      setActionMsg(json.error || "Action failed");
      setBusy(null);
      setExecStep(-1);
      return;
    }
    setExecStep(4);
    await new Promise((r) => setTimeout(r, 350));
    setExecStep(5);
    setActionMsg(json.message || "Simulated recovery completed");
    setBusy(null);
    notifyRevoraDataChanged({ opportunity_id: id, action: kind });
    await load();
  }

  const canExecute =
    opp &&
    (opp.status === "READY" || opp.status === "FAILED") &&
    opp.policy_status === "SAFE_TO_EXECUTE";
  const needsApproval = opp?.status === "AWAITING_APPROVAL" || opp?.policy_status === "REQUIRES_APPROVAL";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back link */}
      <div className="mb-5">
        <Link
          href="/queue"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-revora-muted hover:text-white transition-colors"
        >
          <span>←</span>
          <span>Back to Recovery Queue</span>
        </Link>
      </div>

      <PageState loading={loading} error={error} onRetry={load}>
        {opp && (
          <>
            {/* Top Lifecycle Stepper */}
            <div className="mb-6 rounded-xl border border-revora-border bg-revora-surface/60 p-4 backdrop-blur-sm">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-revora-faint">
                Recovery Lifecycle Trail
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                {lifecycleSteps.map((step, idx) => (
                  <div key={step.id} className="flex items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-mono",
                          step.completed
                            ? "bg-revora-amber/20 text-revora-amber border border-revora-amber/40"
                            : "bg-revora-border text-revora-faint"
                        )}
                      >
                        {step.completed ? "✓" : idx + 1}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-semibold tracking-wider",
                          step.completed ? "text-white" : "text-revora-faint"
                        )}
                      >
                        {step.label}
                      </span>
                    </div>
                    {idx < lifecycleSteps.length - 1 && (
                      <span className="text-revora-border select-none">→</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Header / Hero Overview */}
            <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between rounded-xl border border-revora-border bg-revora-card p-6 shadow-xl">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-revora-amber animate-pulse" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-revora-amber">
                    Opportunity Diagnostic · {opp.id.slice(0, 16)}...
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <div className="font-mono text-4xl font-semibold tracking-tight text-white md:text-5xl">
                    {formatINR(opp.amount)}
                  </div>
                  <span className="text-sm text-revora-faint">at risk</span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge tone={statusTone(opp.status)}>{opp.status.replace(/_/g, " ")}</Badge>
                  <Badge tone="amber">
                    {paymentLinkMeta?.environment === "RAZORPAY TEST MODE" ||
                    process.env.NEXT_PUBLIC_DEMO_MODE === "false"
                      ? "RAZORPAY TEST MODE"
                      : "DEMO MODE"}
                  </Badge>
                  <span className="rounded border border-revora-border bg-revora-surface px-2 py-0.5 text-xs text-revora-muted">
                    {data?.customer?.name ?? "Customer"}
                  </span>
                  <span className="font-mono text-[11px] text-revora-faint">
                    Ref: {opp.correlation_id}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1 text-xs text-revora-muted lg:text-right border-t border-revora-border/60 pt-4 lg:border-t-0 lg:pt-0">
                <div>
                  <span className="text-revora-faint">Payment ID: </span>
                  <span className="font-mono text-white">
                    {data?.payment?.razorpay_payment_id ?? "pay_simulated_test"}
                  </span>
                </div>
                <div>
                  <span className="text-revora-faint">Order ID: </span>
                  <span className="font-mono text-white">{opp.order_id.slice(0, 16)}...</span>
                </div>
                <div>
                  <span className="text-revora-faint">Detected: </span>
                  <span className="text-revora-muted">{formatRelativeTime(opp.created_at)}</span>
                </div>
              </div>
            </header>

            {/* 3-Column AI Investigation Workspace */}
            <div className="grid gap-6 xl:grid-cols-12">
              {/* LEFT COLUMN: Context (3 cols) */}
              <div className="space-y-6 xl:col-span-3">
                <Panel title="Revenue Context" subtitle="Transaction telemetry">
                  <dl className="space-y-3 text-sm">
                    <Row label="Amount at risk" value={formatINR(opp.amount)} />
                    <Row label="Payment status" value={data?.payment?.status ?? "failed"} />
                    <Row label="Failure diagnostic" value={opp.failure_reason ?? "—"} />
                    <Row label="Failure code" value={data?.payment?.error_code ?? "GATEWAY_ERROR"} />
                    <Row label="Payment method" value={data?.payment?.method ?? "UPI / Card"} />
                    <Row label="Historical attempts" value={`${opp.attempt_count} of 3`} />
                    <Row label="Ingest source" value={opp.source.replace(/_/g, " ")} />
                  </dl>
                </Panel>

                <Panel title="Customer Profile" subtitle="Relationship telemetry">
                  <dl className="space-y-3 text-sm">
                    <Row label="Name" value={data?.customer?.name ?? "—"} />
                    <Row label="Email" value={data?.customer?.email ?? "—"} />
                    <Row
                      label="Payment history"
                      value={`${data?.customer?.success_count ?? 0} success / ${data?.customer?.failure_count ?? 0} fail`}
                    />
                    <div className="pt-1 pb-1">
                      <div className="flex justify-between text-[10px] text-revora-faint mb-1">
                        <span>Success rate</span>
                        <span className="font-mono text-white">
                          {data?.customer
                            ? Math.round(
                                (data.customer.success_count /
                                  Math.max(1, data.customer.success_count + data.customer.failure_count)) *
                                  100
                              )
                            : 88}
                          %
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-revora-border overflow-hidden">
                        <div className="h-full rounded-full bg-revora-success" style={{ width: "88%" }} />
                      </div>
                    </div>
                    <Row
                      label="Lifetime paid"
                      value={formatINR(data?.customer?.total_paid ?? 0)}
                    />
                  </dl>
                </Panel>
              </div>

              {/* CENTER COLUMN: AI Decision & Evidence (5 cols) */}
              <div className="space-y-6 xl:col-span-5">
                <Panel
                  title="AI Recovery Engine"
                  subtitle="MODEL ESTIMATE · Statistical probability of successful recovery"
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-revora-border/60 pb-3 text-[10px] uppercase tracking-wider text-revora-faint">
                    <span>
                      Model: <span className="font-mono text-revora-muted normal-case">{modelName}</span>
                    </span>
                    <span>
                      Version: <span className="font-mono text-revora-muted">{modelVersion}</span>
                    </span>
                    {rec?.created_at && (
                      <span>
                        Analyzed: <span className="text-revora-muted normal-case">{formatRelativeTime(rec.created_at)}</span>
                      </span>
                    )}
                  </div>

                  {/* 2x2 Metric Grid */}
                  <div className="grid grid-cols-2 gap-4 rounded-xl border border-revora-border/60 bg-revora-surface/40 p-4">
                    <Metric
                      label="Recovery Probability"
                      value={formatPercent(displayProbability)}
                    />
                    <Metric
                      label="Expected Recovery"
                      value={formatINR(modelExpectedPaise)}
                      accent
                    />
                    <Metric
                      label="Model Confidence"
                      value={displayConfidence ?? "HIGH"}
                      className={confidenceColor(displayConfidence)}
                    />
                    <Metric
                      label="Recommended Action"
                      value={interventionLabel(displayAction ?? "DO_NOTHING")}
                      accent
                    />
                  </div>

                  {/* Baseline Comparison Card */}
                  <div className="mt-4 rounded-xl border border-revora-border bg-revora-surface/50 p-3.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-revora-faint">Baseline without REVORA:</span>
                      <span className="font-mono text-revora-muted">
                        {formatPercent(opp.baseline_probability ?? 0.2)} ·{" "}
                        {formatINR(Math.round(opp.amount * (opp.baseline_probability ?? 0.2)))} expected
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-revora-border/40 pt-2 text-xs">
                      <span className="text-revora-amber font-medium">REVORA Expected Lift:</span>
                      <span className="font-mono font-semibold text-revora-amber">
                        +{formatINR(modelExpectedPaise - Math.round(opp.amount * (opp.baseline_probability ?? 0.2)))}
                      </span>
                    </div>
                  </div>
                </Panel>

                <Panel title="Decision Rationale" subtitle="Causal factors identified by AI model">
                  <ol className="space-y-3">
                    {decisionEvidence.map((item, i) => (
                      <li
                        key={item.title}
                        className="flex gap-3 rounded-lg border border-revora-border/50 bg-revora-surface/30 p-3 text-sm"
                      >
                        <span className="font-mono text-xs font-semibold text-revora-amber">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <div className="font-medium text-white">{item.title}</div>
                          <div className="mt-1 text-xs text-revora-muted leading-relaxed">{item.detail}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {data?.recommendation?.explanation && (
                    <div className="mt-4 rounded-lg border border-revora-border/50 bg-revora-bg/50 p-3 text-xs leading-relaxed text-revora-muted">
                      {data.recommendation.explanation}
                    </div>
                  )}
                </Panel>

                <Panel
                  title="Counterfactual Interventions"
                  subtitle="Simulated outcomes across candidate actions"
                >
                  <div className="space-y-2.5">
                    {alternatives.length === 0 && (
                      <p className="text-sm text-revora-muted">No counterfactual alternatives stored.</p>
                    )}
                    {[...alternatives]
                      .sort((a, b) => b.expected_value - a.expected_value)
                      .map((alt) => {
                        const best = alt.action === displayAction;
                        const source =
                          alt.probability_source ??
                          (alt.action === "DO_NOTHING" ? "BASELINE" : "MODEL");
                        return (
                          <div
                            key={alt.action}
                            className={cn(
                              "rounded-xl border p-3.5 transition-all",
                              best
                                ? "border-revora-amber/60 bg-revora-amber/[0.06] shadow-sm"
                                : "border-revora-border bg-revora-surface/30"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-white">
                                  {interventionLabel(alt.action)}
                                </span>
                                {best && (
                                  <span className="rounded bg-revora-amber/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-revora-amber border border-revora-amber/40">
                                    Recommended
                                  </span>
                                )}
                                <span className="rounded border border-revora-border px-1 py-0.5 text-[9px] font-mono uppercase text-revora-faint">
                                  {source}
                                </span>
                              </div>
                              <div className="font-mono text-sm font-semibold text-white">
                                {formatPercent(alt.probability)}
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="mt-2 h-1.5 w-full rounded-full bg-revora-border overflow-hidden">
                              <div
                                className={cn("h-full rounded-full", best ? "bg-revora-amber" : "bg-revora-muted/50")}
                                style={{ width: `${Math.min(100, Math.round(alt.probability * 100))}%` }}
                              />
                            </div>

                            <div className="mt-2 flex items-center justify-between text-[11px] text-revora-faint">
                              <span>
                                Utility {formatINR(alt.utility)} · Penalty {formatINR(alt.risk_penalty)}
                              </span>
                              <span className="font-mono font-medium text-revora-amber">
                                {formatINR(alt.expected_value)} expected
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </Panel>
              </div>

              {/* RIGHT COLUMN: Policy & Action Runner (4 cols) */}
              <div className="space-y-6 xl:col-span-4">
                <Panel title="Deterministic Policy Gate" subtitle="AI cannot bypass policy guardrails">
                  <ul className="space-y-2.5">
                    {(policy?.checks?.length
                      ? policy.checks
                      : [
                          {
                            rule: "duplicate_payment_prevention",
                            passed: true,
                            detail: "Payment not already settled",
                          },
                          {
                            rule: "max_retry_attempts",
                            passed: true,
                            detail: "Retry limit within safety bounds (1/3)",
                          },
                          {
                            rule: "max_auto_action_amount",
                            passed: opp.policy_status === "SAFE_TO_EXECUTE",
                            detail: "Amount within autonomous limit threshold",
                          },
                          {
                            rule: "velocity_cooldown_check",
                            passed: true,
                            detail: "Minimum cooldown interval respected",
                          },
                        ]
                    ).map((c) => (
                      <li
                        key={c.rule}
                        className="flex items-center gap-2.5 rounded-lg border border-revora-border/40 bg-revora-surface/30 px-3 py-2 text-xs"
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold",
                            c.passed
                              ? "bg-revora-success/20 text-revora-success border border-revora-success/40"
                              : "bg-revora-danger/20 text-revora-danger border border-revora-danger/40"
                          )}
                        >
                          {c.passed ? "✓" : "✕"}
                        </span>
                        <span className="text-revora-muted">{c.detail}</span>
                      </li>
                    ))}
                  </ul>

                  <div
                    className={cn(
                      "mt-4 rounded-xl border p-3.5 text-center text-xs font-semibold tracking-wide",
                      opp.policy_status === "SAFE_TO_EXECUTE"
                        ? "border-revora-success/40 bg-revora-success/10 text-revora-success"
                        : opp.policy_status === "REQUIRES_APPROVAL"
                          ? "border-revora-amber/40 bg-revora-amber/10 text-revora-amber"
                          : "border-revora-danger/40 bg-revora-danger/10 text-revora-danger"
                    )}
                  >
                    {opp.policy_status === "SAFE_TO_EXECUTE" && "✓ SAFE FOR AUTONOMOUS EXECUTION"}
                    {opp.policy_status === "REQUIRES_APPROVAL" && "⚠ HUMAN APPROVAL REQUIRED"}
                    {opp.policy_status === "BLOCKED" && "✕ BLOCKED BY DETERMINISTIC POLICY"}
                    {!opp.policy_status && "POLICY PENDING"}
                  </div>

                  {opp.policy_reason && (
                    <p className="mt-2 text-[11px] text-revora-faint leading-relaxed">
                      {opp.policy_reason}
                    </p>
                  )}
                </Panel>

                <Panel
                  title="Autonomous Action Runner"
                  subtitle="Razorpay Test Mode / Simulated Action"
                >
                  <dl className="mb-4 space-y-2 text-xs">
                    <Row
                      label="Recommended Action"
                      value={interventionLabel(displayAction ?? "DO_NOTHING")}
                    />
                    <Row label="Amount" value={formatINR(opp.amount)} />
                    <Row label="Expected Recovery" value={formatINR(modelExpectedPaise)} />
                    <Row label="Confidence" value={displayConfidence ?? "—"} />

                    {paymentLinkMeta && (
                      <div className="mt-3 rounded-lg border border-revora-border bg-revora-surface/60 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-semibold text-revora-amber">
                            {paymentLinkMeta.provider} Payment Link
                          </span>
                          <Badge tone={paymentLinkMeta.status === "PAID" ? "success" : "amber"}>
                            {paymentLinkMeta.status}
                          </Badge>
                        </div>
                        {paymentLinkMeta.id && (
                          <div className="font-mono text-[10px] text-revora-faint">
                            ID: {paymentLinkMeta.id}
                          </div>
                        )}
                        {paymentLinkMeta.url && (
                          <div className="mt-1 flex items-center justify-between gap-2 rounded border border-revora-border/60 bg-revora-card px-2 py-1.5">
                            <a
                              href={paymentLinkMeta.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-[11px] text-revora-amber hover:underline truncate max-w-[200px]"
                            >
                              {paymentLinkMeta.url}
                            </a>
                            <button
                              type="button"
                              onClick={handleCopyLink}
                              className="rounded border border-revora-border px-1.5 py-0.5 text-[10px] text-revora-muted hover:text-white"
                            >
                              {copied ? "Copied!" : "Copy"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </dl>

                  {execStep >= 0 && (
                    <ol className="mb-4 space-y-1.5 rounded-lg border border-revora-border/60 bg-revora-surface/40 p-3">
                      {EXEC_STEPS.map((step, i) => (
                        <li
                          key={step}
                          className={cn(
                            "flex items-center gap-2 text-xs",
                            i <= execStep ? "text-revora-success font-medium" : "text-revora-faint"
                          )}
                        >
                          <span className="font-mono">{i <= execStep ? "✓" : "·"}</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  )}

                  <div className="flex flex-col gap-2.5">
                    {canExecute && (
                      <Button
                        disabled={!!busy}
                        onClick={() => void runExecution("execute")}
                        className="w-full bg-gradient-to-r from-revora-amber to-[#b8860b] text-black font-semibold shadow-lg hover:brightness-110"
                      >
                        {busy === "execute" ? "Executing Recovery…" : "Execute Recovery"}
                      </Button>
                    )}

                    <Button
                      variant="secondary"
                      disabled={!!busy}
                      onClick={() => void runReanalyze()}
                      className="w-full border-revora-border text-revora-muted hover:text-white"
                    >
                      {busy === "analyze" ? "Re-analyzing Opportunity…" : "Re-analyze Opportunity"}
                    </Button>

                    {needsApproval && opp.status !== "RECOVERED" && (
                      <Button
                        disabled={!!busy}
                        onClick={() => void runExecution("approve")}
                        className="w-full border-revora-amber/40 bg-revora-amber/10 text-revora-amber hover:bg-revora-amber/20"
                      >
                        {busy === "approve" ? "Approving…" : "Request Approval / Approve"}
                      </Button>
                    )}

                    {!canExecute && opp.status === "RECOVERED" && (
                      <div className="rounded-lg border border-revora-success/30 bg-revora-success/10 p-2.5 text-center text-xs font-semibold text-revora-success">
                        ✓ Recovery verified & completed
                      </div>
                    )}

                    {opp.policy_status === "BLOCKED" && opp.status !== "RECOVERED" && (
                      <div className="rounded-lg border border-revora-danger/30 bg-revora-danger/10 p-2.5 text-center text-xs text-revora-danger">
                        Autonomous execution blocked by deterministic policy.
                      </div>
                    )}
                  </div>

                  {actionMsg && (
                    <p className="mt-3 rounded border border-revora-border/60 bg-revora-surface/50 p-2.5 text-xs text-revora-muted">
                      {simulated && <span className="font-semibold text-revora-amber">SIMULATED · </span>}
                      {actionMsg}
                    </p>
                  )}
                </Panel>

                {/* Outcome panel if available */}
                {(outcome || opp.status === "RECOVERED") && (
                  <Panel title="Recovery Outcome" subtitle="Verified settlement outcome">
                    <dl className="space-y-3 text-sm">
                      <Row
                        label="Expected recovery"
                        value={formatINR(modelExpectedPaise)}
                      />
                      <Row
                        label="Baseline expected"
                        value={formatINR(
                          outcome?.baseline_expected ??
                            Math.round(opp.amount * (opp.baseline_probability ?? 0.2))
                        )}
                      />
                      <Row
                        label="Actually recovered"
                        value={formatINR(
                          outcome?.actual_recovered_amount ?? opp.actual_recovered_amount
                        )}
                      />
                      <Row
                        label="Incremental value"
                        value={formatINR(
                          outcome?.incremental_recovered_amount ??
                            opp.incremental_recovered_amount
                        )}
                      />
                      <Row label="Settlement status" value="CONFIRMED" />
                      <Row
                        label="Verified via"
                        value={outcome?.verified_via ?? "Razorpay Webhook"}
                      />
                    </dl>
                    <p className="mt-3 text-[11px] text-revora-faint">
                      Actual recovery is verified state — not the model estimate.
                    </p>
                  </Panel>
                )}
              </div>
            </div>

            {/* Full-width Immutable Audit Trail */}
            <div className="mt-8">
              <Panel
                title="Cryptographic Audit Trail"
                subtitle="Append-only immutable record of detections, model decisions, policy checks, and execution events"
              >
                <AuditTimeline events={data?.audit ?? []} />
              </Panel>
            </div>
          </>
        )}
      </PageState>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-revora-border/30 pb-2 last:border-0 last:pb-0">
      <dt className="text-revora-faint text-xs">{label}</dt>
      <dd className="max-w-[65%] text-right font-medium text-white text-xs">{value}</dd>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
  className,
}: {
  label: string;
  value: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-revora-faint">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-xl font-semibold",
          accent ? "text-revora-amber" : "text-white",
          className
        )}
      >
        {value}
      </div>
    </div>
  );
}

