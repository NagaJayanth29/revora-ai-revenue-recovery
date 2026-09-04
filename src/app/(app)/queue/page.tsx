"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageState } from "@/components/ui/page-state";
import type { Customer, InterventionType, RecoveryOpportunity, RiskLevel } from "@/lib/domain/types";
import { fetchLive, onRevoraDataChanged } from "@/lib/api/client-live";
import {
  cn,
  confidenceColor,
  formatINR,
  formatPercent,
  formatRelativeTime,
  interventionLabel,
  statusTone,
} from "@/lib/utils";

type Row = RecoveryOpportunity & { customer?: Customer | null };

const STATUS_FILTERS = [
  { id: "ALL", label: "All" },
  { id: "READY", label: "Ready" },
  { id: "NEEDS_APPROVAL", label: "Pending approval" },
  { id: "EXECUTING", label: "Executing" },
  { id: "RECOVERED", label: "Recovered" },
  { id: "FAILED", label: "Failed" },
  { id: "BLOCKED", label: "Blocked" },
  { id: "DISMISSED", label: "Dismissed" },
] as const;

const RISK_FILTERS: Array<RiskLevel | "ALL"> = ["ALL", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
const ACTION_FILTERS: Array<InterventionType | "ALL"> = [
  "ALL",
  "RETRY_NOW",
  "RETRY_LATER",
  "REMINDER",
  "PAYMENT_LINK",
  "HUMAN_ESCALATION",
  "DO_NOTHING",
];

export default function RecoveryQueuePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-6 py-8">
          <p className="text-sm text-revora-muted">Loading recovery queue…</p>
        </div>
      }
    >
      <RecoveryQueueInner />
    </Suspense>
  );
}

function RecoveryQueueInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filter = searchParams.get("filter") || "ALL";
  const sort = searchParams.get("sort") || "expected";
  const risk = searchParams.get("risk") || "ALL";
  const action = searchParams.get("action") || "ALL";
  const q = searchParams.get("q") || "";

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (!value || value === "ALL") next.delete(key);
      else next.set(key, value);
      if (key !== "q" && value === "") next.delete(key);
      router.push(`/queue?${next.toString()}`);
    },
    [router, searchParams]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        filter,
        sort,
        risk,
        action,
        q,
      });
      const json = await fetchLive<{ opportunities: Row[] }>(
        `/api/recovery/opportunities?${params}`
      );
      setRows(json.opportunities ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load recovery queue");
    } finally {
      setLoading(false);
    }
  }, [filter, sort, risk, action, q]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => onRevoraDataChanged(() => void load()), [load]);

  const totals = useMemo(() => {
    const terminal = new Set(["RECOVERED", "CANCELLED", "EXPIRED"]);
    const atRisk = rows.filter((r) => !terminal.has(r.status));
    const amount = atRisk.reduce((s, r) => s + r.amount, 0);
    const expected = atRisk.reduce((s, r) => s + (r.expected_recovery_value ?? 0), 0);
    return { amount, expected, count: rows.length, open: atRisk.length };
  }, [rows]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Banner Header */}
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-revora-amber" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-revora-amber">
              Operations · Recovery Queue
            </span>
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white md:text-3xl">
            Recovery Queue
          </h1>
          <p className="mt-1 text-sm text-revora-muted">
            {totals.count} opportunities ranked by expected recoverable value
          </p>
        </div>

        {/* Aggregated Quick Metrics Strip */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-revora-border bg-revora-surface/70 px-4 py-2.5 backdrop-blur-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-revora-faint">At Risk</div>
            <div className="font-mono text-sm font-medium text-white">{formatINR(totals.amount)}</div>
          </div>
          <div className="h-6 w-px bg-revora-border" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-revora-faint">Model Expected</div>
            <div className="font-mono text-sm font-semibold text-revora-amber">{formatINR(totals.expected)}</div>
          </div>
          <div className="h-6 w-px bg-revora-border" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-revora-faint">Open Items</div>
            <div className="font-mono text-sm font-medium text-revora-muted">
              {totals.open} / {totals.count}
            </div>
          </div>
          <div className="ml-1">
            <span className="inline-flex items-center rounded border border-revora-border-subtle bg-revora-bg/60 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-revora-faint">
              Expected ≠ Recovered
            </span>
          </div>
        </div>
      </header>

      {/* Segmented Status Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-xl border border-revora-border/60 bg-revora-surface/40 p-1.5">
        {STATUS_FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setParam("filter", f.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                active
                  ? "bg-revora-card text-revora-amber border border-revora-amber/30 shadow-sm"
                  : "text-revora-muted hover:text-white hover:bg-revora-surface/70"
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Search and Secondary Filter Controls */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-revora-faint"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={q}
            onChange={(e) => setParam("q", e.target.value)}
            placeholder="Search customer, failure reason, correlation..."
            className="h-9 w-full rounded-lg border border-revora-border bg-revora-surface/60 pl-8 pr-3 text-xs text-white outline-none placeholder:text-revora-faint focus:border-revora-amber/50 focus:ring-1 focus:ring-revora-amber/30"
          />
        </div>

        <select
          value={sort}
          onChange={(e) => setParam("sort", e.target.value)}
          className="h-9 rounded-lg border border-revora-border bg-revora-surface/60 px-3 text-xs text-revora-muted outline-none focus:border-revora-amber/50"
        >
          <option value="expected">Sort: Expected value</option>
          <option value="amount">Sort: Amount</option>
          <option value="probability">Sort: Probability</option>
          <option value="risk">Sort: Risk</option>
          <option value="newest">Sort: Newest</option>
          <option value="oldest">Sort: Oldest</option>
          <option value="confidence">Sort: Confidence</option>
        </select>

        <select
          value={risk}
          onChange={(e) => setParam("risk", e.target.value)}
          className="h-9 rounded-lg border border-revora-border bg-revora-surface/60 px-3 text-xs text-revora-muted outline-none focus:border-revora-amber/50"
        >
          {RISK_FILTERS.map((r) => (
            <option key={r} value={r}>
              Risk: {r}
            </option>
          ))}
        </select>

        <select
          value={action}
          onChange={(e) => setParam("action", e.target.value)}
          className="h-9 rounded-lg border border-revora-border bg-revora-surface/60 px-3 text-xs text-revora-muted outline-none focus:border-revora-amber/50"
        >
          {ACTION_FILTERS.map((a) => (
            <option key={a} value={a}>
              Action: {a === "ALL" ? "All Actions" : interventionLabel(a)}
            </option>
          ))}
        </select>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => void load()}
          className="border-revora-border text-xs text-revora-muted hover:text-white"
        >
          Refresh
        </Button>
      </div>

      <PageState
        loading={loading}
        error={error}
        onRetry={load}
        empty={!loading && rows.length === 0}
        emptyTitle="No opportunities match these filters"
        emptyBody="Adjust status, risk, or action filters to view opportunities."
      >
        {/* Table Container */}
        <div className="overflow-hidden rounded-xl border border-revora-border bg-revora-card shadow-2xl backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-revora-border bg-revora-surface/80">
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-revora-faint">
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Amount at Risk</th>
                  <th className="px-4 py-3">Failure Diagnostic</th>
                  <th className="px-4 py-3">Recovery Prob.</th>
                  <th className="px-4 py-3">Expected Recovery</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-revora-border/40">
                {rows.map((o, idx) => {
                  const isTopRank = idx === 0;
                  const isHighPriority =
                    (o.expected_recovery_value ?? 0) >= 20_000_00 || o.risk_level === "CRITICAL";

                  return (
                    <tr
                      key={o.id}
                      className={cn(
                        "group cursor-pointer transition-colors",
                        isTopRank
                          ? "bg-revora-amber/[0.03] hover:bg-revora-amber/[0.07]"
                          : "bg-revora-card/40 hover:bg-revora-elevated/60"
                      )}
                      onClick={() => router.push(`/opportunities/${o.id}`)}
                    >
                      {/* Priority / Rank */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "font-mono text-xs font-semibold",
                              isTopRank
                                ? "rounded border border-revora-amber/40 bg-revora-amber/10 px-1.5 py-0.5 text-revora-amber"
                                : "text-revora-faint"
                            )}
                          >
                            #{idx + 1}
                          </span>
                          {isHighPriority && (
                            <span className="rounded bg-revora-danger/10 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-revora-danger border border-revora-danger/30">
                              High Priority
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-white group-hover:text-revora-amber transition-colors">
                          {o.customer?.name ?? "Anonymous Customer"}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-revora-faint">
                          <span>{formatRelativeTime(o.created_at)}</span>
                          <span>·</span>
                          <span className="font-mono text-[10px]">{o.correlation_id.slice(0, 14)}...</span>
                        </div>
                      </td>

                      {/* Amount at risk */}
                      <td className="px-4 py-3.5 font-mono text-sm font-semibold text-white whitespace-nowrap">
                        {formatINR(o.amount)}
                      </td>

                      {/* Failure Diagnostic */}
                      <td className="max-w-[200px] px-4 py-3.5">
                        <div className="line-clamp-1 text-xs text-revora-muted font-medium">
                          {o.failure_reason ?? o.failure_category ?? "Unknown failure"}
                        </div>
                        <div className="mt-0.5 text-[10px] font-mono uppercase text-revora-faint">
                          {o.failure_category?.replace(/_/g, " ") ?? "Transient"}
                        </div>
                      </td>

                      {/* Probability */}
                      <td className="px-4 py-3.5 font-mono text-xs whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">
                            {formatPercent(o.recovery_probability ?? 0)}
                          </span>
                          <div className="h-1.5 w-12 rounded-full bg-revora-border overflow-hidden">
                            <div
                              className="h-full rounded-full bg-revora-amber"
                              style={{ width: `${Math.min(100, Math.round((o.recovery_probability ?? 0) * 100))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Expected Recovery */}
                      <td className="px-4 py-3.5 font-mono text-sm font-semibold text-revora-amber whitespace-nowrap">
                        {formatINR(o.expected_recovery_value ?? 0)}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center rounded border border-revora-border-subtle bg-revora-surface/60 px-2 py-0.5 text-xs text-revora-muted">
                          {interventionLabel(o.recommended_action ?? "DO_NOTHING")}
                        </span>
                      </td>

                      {/* Confidence */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={cn("text-xs font-medium", confidenceColor(o.confidence))}>
                          {o.confidence ?? "—"}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <Badge tone={statusTone(o.status)}>{o.status.replace(/_/g, " ")}</Badge>
                      </td>

                      {/* Arrow indicator */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <span className="text-xs text-revora-faint group-hover:text-revora-amber group-hover:translate-x-0.5 inline-block transition-all">
                          →
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Guidance */}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-[11px] text-revora-faint">
          <div>
            <span>Model Estimate: </span>
            <span className="text-revora-muted">
              Expected recovery is a statistical projection. Actual recovery is verified only upon payment settlement.
            </span>
          </div>
          <div className="font-mono">
            REVORA Track 03 · Autonomous Revenue Recovery
          </div>
        </div>
      </PageState>
    </div>
  );
}
