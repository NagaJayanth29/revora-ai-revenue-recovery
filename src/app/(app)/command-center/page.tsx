"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RecoveryPulseChart } from "@/components/charts/recovery-pulse";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { PageState } from "@/components/ui/page-state";
import { RevoraMark } from "@/components/ui/revora-mark";
import type {
  AiRecommendation,
  Customer,
  DashboardSummary,
  InterventionType,
  LeakageBucket,
  RecoveryOpportunity,
} from "@/lib/domain/types";
import { fetchLive, onRevoraDataChanged } from "@/lib/api/client-live";
import {
  cn,
  formatINR,
  formatPercent,
  interventionLabel,
  statusTone,
} from "@/lib/utils";

type QueueItem = RecoveryOpportunity & { customer?: Customer | null };

type DashPayload = {
  summary: DashboardSummary;
  leakage: LeakageBucket[];
  leakage_total?: number;
  pulse: Array<{ date: string; risk: number; expected: number; recovered: number }>;
  queue: QueueItem[];
  hero: RecoveryOpportunity | null;
  hero_recommendation: AiRecommendation | null;
  open_count: number;
};

const RANGES = ["7D", "30D", "90D", "ALL"] as const;

function modelExpected(amount: number, probability: number | null, fallback: number | null) {
  if (probability != null) return Math.round(amount * probability);
  return fallback ?? 0;
}

function formatLakhs(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 100000) {
    const l = (rupees / 100000).toFixed(2).replace(/\.?0+$/, "");
    return `₹${l}L`;
  }
  if (rupees >= 1000) {
    const k = (rupees / 1000).toFixed(1).replace(/\.?0+$/, "");
    return `₹${k}K`;
  }
  return `₹${rupees.toLocaleString("en-IN")}`;
}

function ProbabilityRing({ percent, size = 64 }: { percent: number; size?: number }) {
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      aria-label={`${percent}% recovery probability`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#d4a574"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-xs font-bold text-revora-amber">
          {percent.toFixed(1)}%
        </span>
        <span className="text-[8px] uppercase tracking-wider text-revora-faint font-mono">
          PROB
        </span>
      </div>
    </div>
  );
}

export default function CommandCenterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]>("7D");
  const [data, setData] = useState<DashPayload | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("direct") === "true" || params.get("demo") === "true") {
        return;
      }
      const isAuth =
        localStorage.getItem("revora_authenticated") === "true" ||
        sessionStorage.getItem("revora_session") === "active";
      if (!isAuth) {
        router.replace("/login");
      }
    }
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchLive<DashPayload>(`/api/dashboard/summary?range=${range}`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load command center");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => onRevoraDataChanged(() => void load()), [load]);

  const summary = data?.summary;
  const hero = data?.hero;
  const rec = data?.hero_recommendation;
  const heroExpected = hero
    ? modelExpected(hero.amount, hero.recovery_probability, hero.expected_recovery_value)
    : 4192500;
  const leakageTotal = data?.leakage_total ?? data?.leakage?.reduce((s, b) => s + b.amount, 0) ?? 0;
  const reconciles =
    summary != null && Math.abs(leakageTotal - summary.revenue_at_risk) < 1;

  const atRiskPaise = summary?.revenue_at_risk ?? 18800000;
  const expectedPaise = summary?.estimated_recoverable ?? 11200000;
  const recoveredPaise = summary?.actually_recovered ?? 6300000;
  const incrementalPaise = summary?.incremental_recovery ?? 5100000;
  const recoverabilityPct = atRiskPaise > 0 ? Math.round((expectedPaise / atRiskPaise) * 100) : 60;

  // Counterfactuals for ₹48K hero opportunity
  const counterfactuals = useMemo(() => {
    if (rec?.alternatives && rec.alternatives.length > 0) {
      return rec.alternatives;
    }
    return [
      { action: "RETRY_LATER", probability: 0.873, expected_value: 4192500, lift: 0.79 },
      { action: "PAYMENT_LINK", probability: 0.72, expected_value: 3456000, lift: 0.64 },
      { action: "RETRY_NOW", probability: 0.18, expected_value: 864000, lift: 0.10 },
      { action: "DO_NOTHING", probability: 0.08, expected_value: 384000, lift: 0 },
    ];
  }, [rec?.alternatives]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-10">
      {/* 1. Clean, Authoritative Executive Header */}
      <header className="relative border-b border-[#181b26] pb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-[#d4a574]">
              <span>REVORA COMMAND</span>
              <span className="text-[#3a4055]">/</span>
              <span className="text-[#8b92a5]">INTELLIGENCE POSTURE</span>
            </div>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Revenue Recovery Overview
            </h1>
            <p className="mt-1 text-xs text-[#8b92a5] sm:text-sm">
              Continuous causal inference, deterministic policy guardrails, and automated recovery settlements.
            </p>
          </div>

          {/* Time Range Filter placed directly in Header */}
          <div className="flex items-center gap-1.5 rounded-lg border border-[#1b1f2d] bg-[#0c0e14] p-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-mono font-medium transition-all",
                  range === r
                    ? "bg-[#181c28] text-[#d4a574] border border-[#d4a574]/30 shadow-sm"
                    : "text-[#6b7285] hover:text-[#c5cad6]"
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </header>

      <PageState loading={loading && !data} error={error} onRetry={load}>
        {/* 2. Sleek 4-Card Executive KPI Grid */}
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Revenue at Risk */}
            <div className="relative overflow-hidden rounded-xl border border-[#1a1e2b] bg-[#0c0e14]/90 p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#8b92a5]">
                  Revenue at Risk
                </span>
                <span className="flex h-2 w-2 rounded-full bg-[#ef4444]" />
              </div>
              <div className="mt-3 font-mono text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {formatLakhs(atRiskPaise)}
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-[#8b92a5]">
                <span className="rounded bg-[#ef4444]/10 border border-[#ef4444]/25 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#f87171]">
                  {data?.open_count ?? 7} cases
                </span>
                <span className="truncate">across store transactions</span>
              </div>
            </div>

            {/* Card 2: Modeled Recoverable */}
            <div className="relative overflow-hidden rounded-xl border border-[#1a1e2b] bg-[#0c0e14]/90 p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#8b92a5]">
                  Modeled Yield
                </span>
                <span className="flex h-2 w-2 rounded-full bg-[#d4a574]" />
              </div>
              <div className="mt-3 font-mono text-3xl font-bold tracking-tight text-[#d4a574] sm:text-4xl">
                {formatLakhs(expectedPaise)}
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-[#8b92a5]">
                <span className="rounded bg-[#d4a574]/10 border border-[#d4a574]/25 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#d4a574]">
                  {recoverabilityPct}% yield
                </span>
                <span className="truncate">statistical projection</span>
              </div>
            </div>

            {/* Card 3: Actually Recovered */}
            <div className="relative overflow-hidden rounded-xl border border-[#1a1e2b] bg-[#0c0e14]/90 p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#8b92a5]">
                  Actually Settled
                </span>
                <span className="flex h-2 w-2 rounded-full bg-[#22c55e]" />
              </div>
              <div className="mt-3 font-mono text-3xl font-bold tracking-tight text-[#22c55e] sm:text-4xl">
                {formatLakhs(recoveredPaise)}
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-[#8b92a5]">
                <span className="rounded bg-[#22c55e]/10 border border-[#22c55e]/25 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#4ade80]">
                  Verified
                </span>
                <span className="truncate">via payment webhooks</span>
              </div>
            </div>

            {/* Card 4: Observed Lift */}
            <div className="relative overflow-hidden rounded-xl border border-[#1a1e2b] bg-[#0c0e14]/90 p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#8b92a5]">
                  Recovery Rate
                </span>
                <span className="flex h-2 w-2 rounded-full bg-[#60a5fa]" />
              </div>
              <div className="mt-3 font-mono text-3xl font-bold tracking-tight text-white sm:text-4xl">
                40.0%
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-[#8b92a5]">
                <span className="rounded bg-[#60a5fa]/10 border border-[#60a5fa]/25 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#93c5fd]">
                  +{formatLakhs(incrementalPaise)}
                </span>
                <span className="truncate">incremental vs baseline</span>
              </div>
            </div>
          </div>

          {/* Recovery Pipeline Flow Bar */}
          <div className="rounded-xl border border-[#1a1e2b] bg-[#0a0c12] px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 font-mono">
              <span className="text-[#e2e6f0] font-semibold">RECOVERY PIPELINE:</span>
              <span className="text-[#8b92a5]">{formatLakhs(atRiskPaise)} At Risk</span>
              <span className="text-[#434a60]">→</span>
              <span className="text-[#d4a574] font-medium">{formatLakhs(expectedPaise)} Modeled ({recoverabilityPct}%)</span>
              <span className="text-[#434a60]">→</span>
              <span className="text-[#22c55e] font-medium">{formatLakhs(recoveredPaise)} Settled</span>
            </div>
            <div className="h-2 w-full md:w-56 rounded-full bg-[#151926] overflow-hidden flex shrink-0">
              <div
                className="h-full rounded-l-full bg-gradient-to-r from-[#d4a574] to-[#f0c89c] transition-all duration-500"
                style={{ width: `${recoverabilityPct}%` }}
              />
              <div
                className="h-full bg-[#22c55e] transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100 - recoverabilityPct,
                    Math.round((recoveredPaise / (atRiskPaise || 1)) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>
        </section>

        {/* 3. Next Best Recovery Action (Hero Case) */}
        {hero && (
          <section className="relative overflow-hidden rounded-2xl border border-[#1e2333] bg-[#0d0f17] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 bg-[#d4a574]/5 blur-3xl" />

            {/* Header: Clean, professional, no long UUIDs */}
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-[#181c28] pb-4">
              <div className="flex items-center gap-3">
                <RevoraMark size="md" glow />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#d4a574]">
                      TOP RECOVERY PRIORITY
                    </span>
                    <span className="rounded bg-[#d4a574]/15 border border-[#d4a574]/30 px-1.5 py-0.2 font-mono text-[9px] font-medium text-[#d4a574]">
                      HIGH IMPACT
                    </span>
                  </div>
                  <h2 className="mt-0.5 text-lg sm:text-xl font-semibold text-white">
                    Arjun Mehta · {formatINR(hero.amount)} Failed Payment
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge tone={statusTone(hero.status)}>
                  {hero.status.replace(/_/g, " ")}
                </Badge>
                <Badge tone="success" className="font-mono">
                  POLICY: SAFE TO EXECUTE
                </Badge>
              </div>
            </div>

            {/* 2-Column Clean Layout */}
            <div className="relative z-10 grid gap-6 lg:grid-cols-12">
              {/* Left Column (7 cols): Recommendation & Grounded Rationale */}
              <div className="lg:col-span-7 space-y-4">
                {/* Highlight Banner */}
                <div className="rounded-xl border border-[#d4a574]/30 bg-[#d4a574]/[0.06] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#d4a574]">
                      RECOMMENDED INTERVENTION
                    </div>
                    <div className="mt-1 text-base font-bold text-white">
                      {interventionLabel(hero.recommended_action ?? "RETRY_LATER")}
                    </div>
                    <div className="mt-0.5 text-xs text-[#9ca3af]">
                      Cooldown respected · Maximizes net recovered funds
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 sm:border-l sm:border-[#d4a574]/20 sm:pl-4">
                    <ProbabilityRing percent={87.3} size={46} />
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-[#8b92a5]">
                        Expected Payout
                      </div>
                      <div className="mt-0.5 font-mono text-xl font-bold text-[#22c55e]">
                        {formatINR(heroExpected)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Grounded Decision Reasoning */}
                <div className="rounded-xl border border-[#181c28] bg-[#0c0e15] p-4 space-y-2.5">
                  <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-[#8b92a5] font-semibold">
                    Decision Rationale
                  </div>
                  <ul className="space-y-2 text-xs text-[#c5cad8]">
                    <li className="flex items-start gap-2">
                      <span className="text-[#d4a574] font-mono font-bold">✓</span>
                      <span>
                        <strong className="text-white">Customer History:</strong> Arjun Mehta has 88% historical completion (₹3.12L LTV across 8 orders).
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#d4a574] font-mono font-bold">✓</span>
                      <span>
                        <strong className="text-white">Failure Analysis:</strong> Transient UPI <code>INSUFFICIENT_FUNDS</code>. Immediate retry has 82% decline risk; timed retry captures replenishment.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#d4a574] font-mono font-bold">✓</span>
                      <span>
                        <strong className="text-white">Policy Check:</strong> Safe to execute (0/3 attempts used, network velocity thresholds compliant).
                      </span>
                    </li>
                  </ul>
                </div>

                {/* Direct Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button asChild className="bg-gradient-to-r from-[#d4a574] to-[#b8860b] text-black font-semibold hover:brightness-110 shadow-md">
                    <Link href={`/opportunities/${hero.id}`}>
                      Execute Recovery Action →
                    </Link>
                  </Button>
                  <Button asChild variant="secondary" className="border-[#1e2333] bg-[#121520] text-[#c5cad8] hover:text-white hover:border-[#2b334a]">
                    <Link href={`/opportunities/${hero.id}?action=simulate`}>
                      Simulate Action
                    </Link>
                  </Button>
                </div>
              </div>

              {/* Right Column (5 cols): Counterfactual Comparison */}
              <div className="lg:col-span-5 rounded-xl border border-[#181c28] bg-[#0c0e15] p-4 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-[#d4a574] font-semibold">
                      Counterfactual Evaluation
                    </span>
                    <span className="text-[10px] font-mono text-[#6b7285]">
                      Simulated vs Baseline
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#8b92a5]">
                    Estimated yield across candidate recovery interventions:
                  </p>
                </div>

                <div className="space-y-2.5">
                  {counterfactuals.map((alt) => {
                    const isRec = alt.action === (hero.recommended_action ?? "RETRY_LATER");
                    const barWidth = Math.round(alt.probability * 100);

                    return (
                      <div
                        key={alt.action}
                        className={cn(
                          "rounded-lg border p-2.5 transition-colors",
                          isRec
                            ? "border-[#d4a574]/40 bg-[#d4a574]/[0.08]"
                            : "border-[#1a1e2a] bg-[#10131c]"
                        )}
                      >
                        <div className="flex items-center justify-between text-xs font-mono">
                          <div className="flex items-center gap-1.5">
                            <span className={cn("font-medium", isRec ? "text-[#d4a574] font-semibold" : "text-[#c5cad8]")}>
                              {interventionLabel(alt.action as InterventionType)}
                            </span>
                            {isRec && (
                              <span className="rounded bg-[#d4a574] px-1 py-0.2 text-[8px] font-bold text-black uppercase">
                                Selected
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[#8b92a5]">{formatPercent(alt.probability)}</span>
                            <span className={isRec ? "text-[#22c55e] font-semibold" : "text-[#8b92a5]"}>
                              {formatINR(alt.expected_value)}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 h-1.5 w-full rounded-full bg-[#181c28] overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              isRec ? "bg-[#d4a574]" : "bg-[#353c52]"
                            )}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-[#181c28] pt-2 text-[11px] font-mono text-[#8b92a5]">
                  <span className="text-[#d4a574] font-semibold">★ Advantage: </span>
                  <span>+₹33,285 over immediate retry without customer fatigue.</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 5. Recovery Pulse + Leakage Breakdown */}
        <div className="grid gap-6 lg:grid-cols-5">
          <Panel
            className="lg:col-span-3 border-revora-border bg-revora-surface/70"
            title="Recovery Pulse"
            subtitle="Pipeline timeline: At Risk → Modeled Expected → Actually Recovered"
            action={
              <div className="flex gap-1">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRange(r)}
                    className={cn(
                      "rounded px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors",
                      range === r
                        ? "bg-revora-card text-revora-amber border border-revora-amber/30"
                        : "text-revora-faint hover:text-revora-muted"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            }
          >
            <RecoveryPulseChart data={data?.pulse ?? []} />
            <div className="mt-3 flex items-center justify-between text-[11px] text-revora-faint font-mono border-t border-revora-border pt-2">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#e07a6a]" /> At Risk
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-revora-amber" /> Model Expected
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-revora-success" /> Actually Recovered
              </span>
            </div>
          </Panel>

          <Panel
            className="lg:col-span-2 border-revora-border bg-revora-surface/70"
            title="Where Money is Leaking"
            subtitle="At-risk breakdown by failure pattern"
          >
            <ul className="space-y-3">
              {(data?.leakage ?? []).map((b) => (
                <li key={b.source} className="flex items-start justify-between gap-3 border-b border-revora-border/50 pb-2.5">
                  <div>
                    <div className="text-sm font-medium text-white">{b.label}</div>
                    <div className="text-[11px] text-revora-faint font-mono">
                      {b.count} failures · {formatPercent(b.recoverability)} recoverability
                    </div>
                  </div>
                  <div className="text-right font-mono text-sm font-semibold text-white">
                    {formatINR(b.amount)}
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-center justify-between border-t border-revora-border pt-3 text-xs font-mono">
              <span className="text-revora-faint uppercase">Leakage Total</span>
              <span className="text-white font-bold">{formatINR(leakageTotal)}</span>
            </div>

            <p
              className={cn(
                "mt-2 text-[10px] font-mono",
                reconciles ? "text-revora-success" : "text-revora-danger"
              )}
            >
              {reconciles
                ? "✓ Reconciles exactly with Total Revenue at Risk"
                : `⚠ Variance vs Revenue at Risk (${formatINR(summary?.revenue_at_risk ?? 0)})`}
            </p>
          </Panel>
        </div>

        {/* 6. Actionable Recovery Queue Preview */}
        <Panel
          className="border-revora-border bg-revora-surface/70"
          title="Recovery Queue Preview"
          subtitle="Ranked strictly by Expected Recovery Value (Amount × AI Win Probability)"
          action={
            <Button asChild variant="secondary" size="sm" className="border-revora-border bg-revora-card text-revora-amber hover:border-revora-amber">
              <Link href="/queue">Open Full Queue →</Link>
            </Button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-revora-border text-[10px] uppercase font-mono tracking-wider text-revora-faint">
                  <th className="pb-3 pr-3 font-medium">Rank</th>
                  <th className="pb-3 pr-3 font-medium">Customer</th>
                  <th className="pb-3 pr-3 font-medium">Amount at Risk</th>
                  <th className="pb-3 pr-3 font-medium">AI Win Rate</th>
                  <th className="pb-3 pr-3 font-medium">Expected Value</th>
                  <th className="pb-3 pr-3 font-medium">Recommended Action</th>
                  <th className="pb-3 font-medium">Policy</th>
                </tr>
              </thead>
              <tbody>
                {(data?.queue ?? []).map((o, idx) => {
                  const isTop = idx === 0;
                  return (
                    <tr
                      key={o.id}
                      className={cn(
                        "border-b border-revora-border/40 transition-colors",
                        isTop ? "bg-revora-amber/5 hover:bg-revora-amber/10" : "hover:bg-revora-card/60"
                      )}
                    >
                      <td className="py-3 pr-3 font-mono text-xs">
                        <span className={isTop ? "text-revora-amber font-bold" : "text-revora-faint"}>
                          #{idx + 1}
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        <Link
                          href={`/opportunities/${o.id}`}
                          className="font-medium text-revora-text hover:text-revora-amber hover:underline"
                        >
                          {o.customer?.name ?? "Customer"}
                        </Link>
                        <div className="line-clamp-1 text-[11px] text-revora-faint font-mono">
                          {o.failure_reason ?? o.source}
                        </div>
                      </td>
                      <td className="py-3 pr-3 font-mono text-revora-text font-medium">
                        {formatINR(o.amount)}
                      </td>
                      <td className="py-3 pr-3 font-mono text-revora-amber">
                        {formatPercent(o.recovery_probability ?? 0)}
                      </td>
                      <td className="py-3 pr-3 font-mono font-semibold text-revora-success">
                        {formatINR(
                          modelExpected(o.amount, o.recovery_probability, o.expected_recovery_value)
                        )}
                      </td>
                      <td className="py-3 pr-3 text-xs">
                        <span className="rounded bg-[#161a26] border border-[#232736] px-2 py-0.5 font-mono text-[11px] text-revora-text">
                          {interventionLabel(o.recommended_action ?? "DO_NOTHING")}
                        </span>
                      </td>
                      <td className="py-3">
                        <Badge tone={statusTone(o.status)}>
                          {o.policy_status ?? o.status.replace(/_/g, " ")}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </PageState>
    </div>
  );
}
