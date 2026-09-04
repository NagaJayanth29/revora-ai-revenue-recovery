"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { Panel } from "@/components/ui/panel";
import { PageState, SectionLabel } from "@/components/ui/page-state";
import type { Experiment, ExperimentResults } from "@/lib/domain/types";
import { fetchLive, onRevoraDataChanged } from "@/lib/api/client-live";
import { cn, formatPercent } from "@/lib/utils";

type ExperimentResultsExt = ExperimentResults & {
  control_count?: number;
  treatment_count?: number;
};

type ExperimentView = {
  experiment: Experiment;
  results: ExperimentResultsExt;
  data_label: string;
} | null;

export default function ExperimentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [current, setCurrent] = useState<ExperimentView>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLive<{ experiments: Experiment[]; current: ExperimentView }>(
        "/api/experiments"
      );
      setExperiments(data.experiments ?? []);
      setCurrent(data.current ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load experiments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => onRevoraDataChanged(() => void load()), [load]);

  const results = current?.results;
  const experiment = current?.experiment;
  const controlCount = results?.control_count ?? experiment?.control_size ?? 0;
  const treatmentCount = results?.treatment_count ?? experiment?.treatment_size ?? 0;
  const liftAmount = results ? results.treatment_recovered - results.control_recovered : 0;
  const liftRate =
    results && results.control_recovery_rate > 0
      ? (results.treatment_recovery_rate - results.control_recovery_rate) /
        results.control_recovery_rate
      : results
        ? results.treatment_recovery_rate - results.control_recovery_rate
        : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-revora-amber" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-revora-amber">
              Intelligence · Experiments
            </span>
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white md:text-3xl">
            A/B Empirical Validation
          </h1>
          <p className="mt-1 text-sm text-revora-muted">
            Deterministic baseline control versus autonomous REVORA treatment — measured settlements, not vanity rates
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="amber">DEMO EVALUATION</Badge>
          {current?.data_label && <Badge tone="muted">{current.data_label}</Badge>}
        </div>
      </header>

      <PageState
        loading={loading && !current && experiments.length === 0}
        error={error}
        onRetry={load}
        empty={!loading && !error && !results}
        emptyTitle="No active experiment"
        emptyBody="Seed the demo store to load CONTROL vs REVORA assignments."
      >
        {results && experiment && (
          <>
            <Panel
              title={experiment.name}
              subtitle={experiment.description}
              action={
                <Badge tone={experiment.status === "running" ? "info" : "muted"}>
                  {experiment.status.toUpperCase()}
                </Badge>
              }
            >
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <Badge tone="success">ACTUAL SETTLED</Badge>
                <Badge tone="muted">Observed Intervention Rates</Badge>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <ArmCard
                  label="CONTROL GROUP"
                  subtitle="Baseline rule engine — no REVORA intervention"
                  recovered={results.control_recovered}
                  rate={results.control_recovery_rate}
                  interventionRate={results.control_intervention_rate}
                  size={controlCount}
                />
                <ArmCard
                  label="REVORA TREATMENT"
                  subtitle="Autonomous AI recovery with deterministic policy gates"
                  recovered={results.treatment_recovered}
                  rate={results.treatment_recovery_rate}
                  interventionRate={results.treatment_intervention_rate}
                  size={treatmentCount}
                  accent
                />
              </div>

              <div className="mt-8 grid gap-4 rounded-xl border border-revora-border/70 bg-revora-surface/40 p-5 sm:grid-cols-3">
                <LiftStat
                  label="Incremental Settlement"
                  value={
                    <Money paise={results.incremental_recovery} size="lg" className="text-revora-amber font-semibold" />
                  }
                  hint="Actual treatment − control settlement"
                />
                <LiftStat
                  label="Absolute Settlement Delta"
                  value={<Money paise={liftAmount} size="lg" className="font-semibold text-white" />}
                  hint="Direct net revenue addition"
                />
                <LiftStat
                  label="Relative Efficiency Lift"
                  value={<span className="text-revora-success font-semibold">{formatPercent(liftRate, 1)}</span>}
                  hint="Recovery rate multiplier over baseline"
                />
              </div>

              <p className="mt-4 text-[11px] text-revora-faint">
                {results.data_label || current.data_label} · Computed{" "}
                {new Date(results.computed_at).toLocaleString("en-IN")}
              </p>
            </Panel>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Panel title="Arm detail" subtitle="Counts, rates, and intervention intensity">
                <dl className="space-y-3 text-sm">
                  <Row label="Control count" value={String(controlCount)} />
                  <Row label="REVORA count" value={String(treatmentCount)} />
                  <Row
                    label="Control recovery rate"
                    value={formatPercent(results.control_recovery_rate)}
                    tag="ACTUAL"
                  />
                  <Row
                    label="REVORA recovery rate"
                    value={formatPercent(results.treatment_recovery_rate)}
                    tag="ACTUAL"
                  />
                  <Row
                    label="Control intervention rate"
                    value={formatPercent(results.control_intervention_rate)}
                  />
                  <Row
                    label="REVORA intervention rate"
                    value={formatPercent(results.treatment_intervention_rate)}
                  />
                </dl>
                <p className="mt-4 text-[10px] uppercase tracking-wider text-revora-faint">
                  PREDICTED model estimates appear on opportunity detail · experiment lift uses ACTUAL
                  recovered amounts
                </p>
              </Panel>

              <Panel title="Experiment registry" subtitle="Merchant experiment list">
                <ul className="space-y-3">
                  {experiments.map((ex) => (
                    <li
                      key={ex.id}
                      className="flex items-start justify-between gap-3 border-b border-revora-border-subtle pb-3 last:border-0 last:pb-0"
                    >
                      <div>
                        <div className="text-sm text-revora-text">{ex.name}</div>
                        <div className="mt-0.5 text-xs text-revora-faint">{ex.description}</div>
                        <div className="mt-1 text-[11px] text-revora-faint">
                          n={ex.control_size + ex.treatment_size} · control {ex.control_size} · treatment{" "}
                          {ex.treatment_size}
                        </div>
                      </div>
                      <Badge tone={ex.status === "running" ? "info" : "muted"}>{ex.status}</Badge>
                    </li>
                  ))}
                  {!experiments.length && (
                    <li className="text-sm text-revora-muted">No experiments registered.</li>
                  )}
                </ul>
              </Panel>
            </div>
          </>
        )}
      </PageState>
    </div>
  );
}

function ArmCard({
  label,
  subtitle,
  recovered,
  rate,
  interventionRate,
  size,
  accent,
}: {
  label: string;
  subtitle: string;
  recovered: number;
  rate: number;
  interventionRate: number;
  size: number;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-6 transition-all",
        accent
          ? "border-revora-amber/40 bg-revora-amber/[0.05] shadow-lg ring-1 ring-revora-amber/20"
          : "border-revora-border bg-revora-card shadow-md"
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("text-[11px] font-semibold uppercase tracking-widest", accent ? "text-revora-amber" : "text-revora-faint")}>
          {label}
        </span>
        {accent && (
          <span className="rounded bg-revora-amber/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-revora-amber border border-revora-amber/30">
            Active Treatment
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs text-revora-muted">{subtitle}</p>
      <div className="mt-5">
        <Money
          paise={recovered}
          size="lg"
          className={accent ? "text-revora-amber font-semibold text-3xl" : "text-white font-semibold text-3xl"}
        />
        <div className="mt-1 text-[10px] uppercase tracking-wider text-revora-faint">
          Verified Settlement
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 border-t border-revora-border/60 pt-4 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-revora-faint">Recovery Rate</div>
          <div className="mt-1 font-mono text-base font-semibold text-white">{formatPercent(rate)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-revora-faint">Intervention Rate</div>
          <div className="mt-1 font-mono text-base font-semibold text-white">
            {formatPercent(interventionRate)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-revora-faint">Sample Size (n)</div>
          <div className="mt-1 font-mono text-base font-semibold text-revora-muted">{size}</div>
        </div>
      </div>
    </div>
  );
}

function LiftStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
}) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-2 text-2xl font-medium tabular-nums text-revora-text">{value}</div>
      <div className="mt-1 text-[11px] text-revora-faint">{hint}</div>
    </div>
  );
}

function Row({
  label,
  value,
  tag,
}: {
  label: string;
  value: string;
  tag?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-revora-muted">
        {label}
        {tag && (
          <span className="ml-2 text-[9px] uppercase tracking-wider text-revora-faint">{tag}</span>
        )}
      </dt>
      <dd className={cn("tabular-nums text-revora-text")}>{value}</dd>
    </div>
  );
}
