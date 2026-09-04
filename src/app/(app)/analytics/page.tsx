"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RecoveryPulseChart } from "@/components/charts/recovery-pulse";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { Panel } from "@/components/ui/panel";
import { PageState } from "@/components/ui/page-state";
import type { DashboardSummary, InterventionType, LeakageBucket } from "@/lib/domain/types";
import { fetchLive, onRevoraDataChanged } from "@/lib/api/client-live";
import { cn, formatINR, formatPercent, interventionLabel } from "@/lib/utils";

type MetricsPayload = {
  summary: DashboardSummary;
  recovery_rate: number;
  avg_time_to_recovery_hours: number;
  by_failure: Record<string, { count: number; amount: number; recovered: number }>;
  by_intervention: Record<string, { count: number; recovered: number }>;
  calibration: Array<{ predicted: number; actual: number; n: number }>;
  data_label: string;
  open_count?: number;
  recovered_count?: number;
  leakage: LeakageBucket[];
  pulse: Array<{ date: string; risk: number; expected: number; recovered: number }>;
  expected_vs_actual: Array<{
    id: string;
    amount: number;
    expected: number;
    actual: number;
    status: string;
    action: InterventionType | null;
  }>;
};

const RANGES = ["7D", "30D", "90D", "ALL"] as const;

const CHART_TOOLTIP = {
  background: "#181b24",
  border: "1px solid #2a2e3a",
  borderRadius: 8,
  fontSize: 12,
};

const TICK = { fill: "#6b675e", fontSize: 11 };

export default function AnalyticsPage() {
  const [range, setRange] = useState<(typeof RANGES)[number]>("30D");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MetricsPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchLive<MetricsPayload>(`/api/recovery/metrics?range=${range}`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load analytics");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => onRevoraDataChanged(() => void load()), [load]);

  const failureChart = useMemo(() => {
    if (!data?.by_failure) return [];
    return Object.entries(data.by_failure).map(([key, v]) => ({
      name: key.replace(/_/g, " "),
      atRisk: Math.round(v.amount / 100),
      recovered: Math.round(v.recovered / 100),
      count: v.count,
    }));
  }, [data]);

  const interventionChart = useMemo(() => {
    if (!data?.by_intervention) return [];
    return Object.entries(data.by_intervention).map(([key, v]) => ({
      name: key === "NONE" ? "None" : interventionLabel(key as InterventionType),
      recovered: Math.round(v.recovered / 100),
      count: v.count,
    }));
  }, [data]);

  const calibrationChart = useMemo(() => {
    if (!data?.calibration) return [];
    return data.calibration.map((c) => ({
      bucket: `${Math.round(c.predicted * 100)}%`,
      predicted: Math.round(c.predicted * 100),
      actual: Math.round(c.actual * 100),
      n: c.n,
    }));
  }, [data]);

  const expectedVsActualChart = useMemo(() => {
    if (!data?.expected_vs_actual) return [];
    return [...data.expected_vs_actual]
      .sort((a, b) => b.expected - a.expected)
      .slice(0, 12)
      .map((row, i) => ({
        name: `#${i + 1}`,
        expected: Math.round(row.expected / 100),
        actual: Math.round(row.actual / 100),
        status: row.status,
      }));
  }, [data]);

  const summary = data?.summary;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-revora-amber" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-revora-amber">
              Intelligence · Analytics
            </span>
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white md:text-3xl">
            Recovery Analytics
          </h1>
          <p className="mt-1 text-sm text-revora-muted">
            Model projections versus verified settlement outcomes across leakage, actions, and calibration
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="amber">DEMO EVALUATION</Badge>
          {data?.data_label && <Badge tone="muted">{data.data_label}</Badge>}
          <div className="flex items-center gap-1 rounded-lg border border-revora-border bg-revora-surface/60 p-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                  range === r
                    ? "bg-revora-card text-revora-amber border border-revora-amber/30 shadow-sm"
                    : "text-revora-muted hover:text-white"
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </header>

      <PageState loading={loading && !data} error={error} onRetry={load}>
        <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile
            label="Recovery Rate"
            value={data ? formatPercent(data.recovery_rate) : "—"}
            hint="Actual verified / Opportunities"
          />
          <MetricTile
            label="Avg Time to Recovery"
            value={data ? `${data.avg_time_to_recovery_hours.toFixed(1)}h` : "—"}
            hint="Detection to Settlement"
          />
          <MetricTile
            label="Actually Recovered"
            value={<Money paise={summary?.actually_recovered ?? 0} size="md" />}
            hint="Settled bank funds"
            tone="success"
          />
          <MetricTile
            label="Estimated Recoverable"
            value={<Money paise={summary?.estimated_recoverable ?? 0} size="md" />}
            hint="Model estimate · Expected value"
            tone="amber"
          />
        </section>

        <div className="mb-6 flex items-center justify-between text-[11px] text-revora-faint">
          <div>
            <span>Evaluation Dataset: </span>
            <span className="text-revora-muted">{data?.data_label || summary?.data_label || "Demo evaluation"}</span>
          </div>
          <div className="font-mono">
            Active Pulse: {range} · {data?.open_count ?? 0} Open · {data?.recovered_count ?? 0} Settled
          </div>
        </div>

        <Panel
          className="mb-6"
          title="Recovery pulse"
          subtitle="Revenue at risk · MODEL ESTIMATE expected · ACTUAL recovered"
          action={<Badge tone="muted">{range}</Badge>}
        >
          <RecoveryPulseChart data={data?.pulse ?? []} />
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Leakage by failure" subtitle="At-risk amount vs ACTUAL recovered">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={failureChart} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                  <CartesianGrid stroke="#1e2230" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={TICK}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    tick={TICK}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `₹${Number(v).toLocaleString("en-IN")}`}
                    width={72}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP}
                    labelStyle={{ color: "#9a958a" }}
                    formatter={(value: number, name: string) => [
                      `₹${value.toLocaleString("en-IN")}`,
                      name === "atRisk" ? "At risk" : "ACTUAL recovered",
                    ]}
                  />
                  <Bar dataKey="atRisk" name="atRisk" fill="#e07a6a" radius={[3, 3, 0, 0]} opacity={0.85} />
                  <Bar dataKey="recovered" name="recovered" fill="#5dbe8a" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="By intervention" subtitle="ACTUAL recovered by recommended action">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={interventionChart} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                  <CartesianGrid stroke="#1e2230" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={TICK}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    tick={TICK}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `₹${Number(v).toLocaleString("en-IN")}`}
                    width={72}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP}
                    labelStyle={{ color: "#9a958a" }}
                    formatter={(value: number) => [
                      `₹${value.toLocaleString("en-IN")}`,
                      "ACTUAL recovered",
                    ]}
                  />
                  <Bar dataKey="recovered" radius={[3, 3, 0, 0]}>
                    {interventionChart.map((_, i) => (
                      <Cell key={i} fill={i % 2 === 0 ? "#d4a574" : "#a67c52"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <Panel
            className="lg:col-span-3"
            title="Expected vs actual"
            subtitle="Top opportunities · MODEL ESTIMATE vs ACTUAL recovered"
          >
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expectedVsActualChart} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="#1e2230" vertical={false} />
                  <XAxis dataKey="name" tick={TICK} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={TICK}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `₹${Number(v).toLocaleString("en-IN")}`}
                    width={72}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP}
                    labelStyle={{ color: "#9a958a" }}
                    formatter={(value: number, name: string) => [
                      `₹${value.toLocaleString("en-IN")}`,
                      name === "expected" ? "MODEL ESTIMATE" : "ACTUAL",
                    ]}
                  />
                  <Bar dataKey="expected" name="expected" fill="#d4a574" radius={[3, 3, 0, 0]} opacity={0.7} />
                  <Bar dataKey="actual" name="actual" fill="#5dbe8a" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel className="lg:col-span-2" title="Leakage map" subtitle="Where revenue is slipping">
            <ul className="space-y-3">
              {(data?.leakage ?? []).map((bucket) => (
                <li key={bucket.source} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-revora-text">{bucket.label}</div>
                    <div className="text-[11px] text-revora-faint">
                      {bucket.count} · recoverability {formatPercent(bucket.recoverability)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm text-revora-text">{formatINR(bucket.amount)}</div>
                    <div className="text-[11px] text-revora-faint">{formatPercent(bucket.percentage)}</div>
                  </div>
                </li>
              ))}
              {!data?.leakage?.length && (
                <li className="text-sm text-revora-muted">No leakage buckets.</li>
              )}
            </ul>
          </Panel>
        </div>

        <Panel
          className="mt-6"
          title="Model calibration"
          subtitle="When the model predicts X%, what actually recovers?"
        >
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone="muted">MODEL ESTIMATE · dashed</Badge>
            <Badge tone="amber">ACTUAL · solid</Badge>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={calibrationChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1e2230" vertical={false} />
                <XAxis dataKey="bucket" tick={TICK} axisLine={false} tickLine={false} />
                <YAxis
                  tick={TICK}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  width={40}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP}
                  labelStyle={{ color: "#9a958a" }}
                  formatter={(value: number, name: string) => [
                    `${value}%`,
                    name === "predicted" ? "MODEL ESTIMATE" : "ACTUAL",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  stroke="#6b675e"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: "#6b675e" }}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#d4a574"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#d4a574" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </PageState>
    </div>
  );
}

function MetricTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
  tone?: "amber" | "success";
}) {
  return (
    <div className="rounded-xl border border-revora-border bg-revora-card p-5 shadow-lg backdrop-blur-sm transition-all hover:border-revora-border/80">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-revora-faint">{label}</div>
      <div
        className={cn(
          "mt-2 font-mono text-2xl font-semibold tabular-nums text-white",
          tone === "amber" && "text-revora-amber",
          tone === "success" && "text-revora-success"
        )}
      >
        {value}
      </div>
      <div className="mt-2.5 text-[10px] uppercase tracking-wider text-revora-muted font-medium">{hint}</div>
    </div>
  );
}
