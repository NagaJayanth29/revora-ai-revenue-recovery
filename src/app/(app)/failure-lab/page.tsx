"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

type SimulationType =
  | "API_TIMEOUT"
  | "DUPLICATE_WEBHOOK"
  | "ALREADY_PAID"
  | "RETRY_LIMIT"
  | "LOW_CONFIDENCE"
  | "AI_OUTAGE"
  | "EXECUTION_FAILURE"
  | "OUT_OF_ORDER_WEBHOOK";

type SimulationResult = {
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
  demo_mode?: boolean;
  simulated?: boolean;
};

const PIPELINE = ["EVENT", "VALIDATION", "DECISION", "POLICY", "ACTION", "RESULT"] as const;

const SIMULATIONS: Array<{
  type: SimulationType;
  title: string;
  blurb: string;
}> = [
  {
    type: "API_TIMEOUT",
    title: "API timeout",
    blurb: "Upstream Razorpay hangs mid-execute — prove idempotent retry.",
  },
  {
    type: "DUPLICATE_WEBHOOK",
    title: "Duplicate webhook",
    blurb: "Same event delivered twice — one opportunity, no double charge.",
  },
  {
    type: "ALREADY_PAID",
    title: "Already paid",
    blurb: "Customer paid elsewhere — block redundant recovery.",
  },
  {
    type: "RETRY_LIMIT",
    title: "Retry limit",
    blurb: "Exhausted attempts — policy hard-stops further retries.",
  },
  {
    type: "LOW_CONFIDENCE",
    title: "Low confidence",
    blurb: "Model uncertain — escalate instead of silent auto-action.",
  },
  {
    type: "AI_OUTAGE",
    title: "AI outage",
    blurb: "LLM unavailable — fall back to deterministic model.",
  },
  {
    type: "EXECUTION_FAILURE",
    title: "Execution failure",
    blurb: "Action fails mid-flight — mark failed, keep audit trail.",
  },
  {
    type: "OUT_OF_ORDER_WEBHOOK",
    title: "Out-of-order webhook",
    blurb: "Captured arrives before created — reconcile trusted state.",
  },
];

const SAFE_BLOCK_TYPES: SimulationType[] = ["ALREADY_PAID", "RETRY_LIMIT", "LOW_CONFIDENCE"];

function isSafeBlock(result: SimulationResult): boolean {
  if (SAFE_BLOCK_TYPES.includes(result.type)) return true;
  const blob = `${result.recovery_mechanism} ${result.system_response} ${result.final_state}`.toLowerCase();
  return (
    blob.includes("block") ||
    blob.includes("review required") ||
    result.final_state === "BLOCKED" ||
    result.final_state === "AWAITING_APPROVAL"
  );
}

function pipelineStages(result: SimulationResult | null, running: boolean) {
  if (!result && !running) {
    return PIPELINE.map((label) => ({ label, status: "idle" as const, detail: "" }));
  }
  if (running && !result) {
    return PIPELINE.map((label, i) => ({
      label,
      status: (i === 0 ? "active" : "pending") as "active" | "pending",
      detail: i === 0 ? "Injecting fault…" : "",
    }));
  }
  if (!result) return PIPELINE.map((label) => ({ label, status: "idle" as const, detail: "" }));

  const blocked = isSafeBlock(result);
  return [
    { label: "EVENT", status: "done" as const, detail: result.type },
    { label: "VALIDATION", status: "done" as const, detail: result.what_broke },
    { label: "DECISION", status: "done" as const, detail: result.system_response },
    {
      label: "POLICY",
      status: (blocked ? "blocked" : "done") as "blocked" | "done",
      detail: blocked ? "SAFE BLOCK" : "Cleared",
    },
    {
      label: "ACTION",
      status: (blocked ? "skipped" : "done") as "skipped" | "done",
      detail: blocked ? "Not executed" : result.recovery_mechanism,
    },
    { label: "RESULT", status: "done" as const, detail: result.final_state },
  ];
}

export default function FailureLabPage() {
  const [running, setRunning] = useState<SimulationType | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SimulationResult[]>([]);

  async function run(type: SimulationType) {
    setRunning(type);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/reliability/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Simulation failed");
        setRunning(null);
        return;
      }
      setResult(data);
      setHistory((h) => [data, ...h].slice(0, 8));
    } catch {
      setError("Simulation request failed");
    }
    setRunning(null);
  }

  const stages = pipelineStages(result, running !== null);
  const safeBlock = result ? isSafeBlock(result) : false;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-revora-amber" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-revora-amber">
              Operations · Failure Lab
            </span>
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white md:text-3xl">
            Chaos & Fault Injection Workbench
          </h1>
          <p className="mt-1 text-sm text-revora-muted">
            Simulate real-world gateway dropouts, race conditions, and out-of-order webhooks to verify deterministic safety
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="amber">DEMO CHAOS ENGINE</Badge>
          <Badge tone="muted">SIMULATED</Badge>
        </div>
      </header>

      <Panel className="mb-6" title="Pipeline Telemetry Sequence" subtitle="Live state transition: EVENT → VALIDATION → DECISION → POLICY → ACTION → RESULT">
        <div className="flex flex-wrap items-stretch gap-2">
          {stages.map((stage, i) => (
            <div key={stage.label} className="flex items-center gap-2">
              <div
                className={cn(
                  "min-w-[110px] rounded-lg border px-3 py-3",
                  stage.status === "blocked" && "border-revora-amber/50 bg-revora-amber/10",
                  stage.status === "done" && "border-revora-success/30 bg-revora-success/5",
                  stage.status === "active" && "border-revora-amber/40 bg-revora-amber/5",
                  stage.status === "skipped" && "border-revora-border-subtle bg-revora-elevated/20 opacity-60",
                  stage.status === "pending" && "border-revora-border-subtle bg-revora-elevated/20 opacity-40",
                  stage.status === "idle" && "border-revora-border-subtle bg-revora-elevated/30"
                )}
              >
                <div className="font-mono text-[10px] uppercase tracking-wider text-revora-faint">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div
                  className={cn(
                    "mt-1 text-xs font-medium",
                    stage.status === "blocked" ? "text-revora-amber" : "text-revora-text"
                  )}
                >
                  {stage.label}
                </div>
                {stage.detail && (
                  <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-revora-muted">
                    {stage.detail}
                  </p>
                )}
              </div>
              {i < stages.length - 1 && (
                <span className="hidden text-revora-faint sm:inline">→</span>
              )}
            </div>
          ))}
        </div>
        {safeBlock && (
          <div className="mt-4 rounded-lg border border-revora-amber/40 bg-revora-amber/10 px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-revora-amber">
              SAFE BLOCK
            </div>
            <p className="mt-1 text-sm text-revora-text">
              Policy prevented unsafe execution. No financial side effect was committed.
            </p>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Panel title="Inject failure" subtitle="Each run writes a real incident + audit · SIMULATED">
            <div className="grid gap-2">
              {SIMULATIONS.map((sim) => {
                const active = running === sim.type;
                const selected = result?.type === sim.type;
                return (
                  <button
                    key={sim.type}
                    type="button"
                    disabled={running !== null}
                    onClick={() => void run(sim.type)}
                    className={cn(
                      "rounded-lg border px-4 py-3 text-left transition-all",
                      selected
                        ? "border-revora-amber/40 bg-revora-amber/10"
                        : "border-revora-border-subtle bg-revora-elevated/30 hover:border-revora-border hover:bg-revora-elevated/60",
                      running !== null && !active && "opacity-50"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-revora-text">{sim.title}</span>
                      {active ? (
                        <span className="text-[10px] uppercase tracking-wider text-revora-amber">
                          Running
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] text-revora-faint">{sim.type}</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-revora-muted">{sim.blurb}</p>
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>

        <div className="space-y-6 lg:col-span-3">
          <Panel
            title="Simulation result"
            subtitle={
              running
                ? "Injecting fault and observing recovery…"
                : result
                  ? result.title
                  : "Select a failure mode to begin"
            }
            action={
              result ? (
                <div className="flex gap-2">
                  <Badge tone="amber">SIMULATED</Badge>
                  {safeBlock && <Badge tone="amber">SAFE BLOCK</Badge>}
                </div>
              ) : null
            }
          >
            {error && <p className="text-sm text-revora-danger">{error}</p>}

            {!result && !error && !running && (
              <div className="flex min-h-[240px] flex-col items-center justify-center rounded-md border border-dashed border-revora-border px-6 text-center">
                <p className="text-sm text-revora-muted">
                  No simulation active. Pick a failure on the left.
                </p>
                <p className="mt-2 max-w-sm text-xs text-revora-faint">
                  Pipeline stages light up as the fault is validated, decided, policy-gated, and
                  resolved.
                </p>
              </div>
            )}

            {running && !result && (
              <div className="flex min-h-[240px] flex-col items-center justify-center">
                <div className="h-1 w-32 overflow-hidden rounded-full bg-revora-elevated">
                  <div className="h-full w-1/2 animate-pulse bg-revora-amber" />
                </div>
                <p className="mt-4 text-sm text-revora-muted">Observing fault isolation…</p>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                <ResultStage step="01" label="What broke" body={result.what_broke} tone="danger" />
                <ResultStage
                  step="02"
                  label="System response"
                  body={result.system_response}
                  tone="info"
                />
                <ResultStage
                  step="03"
                  label="Recovery mechanism"
                  body={result.recovery_mechanism}
                  tone="amber"
                />
                <ResultStage
                  step="04"
                  label="Final state"
                  body={result.final_state}
                  tone="success"
                />

                <div className="flex flex-wrap gap-3 border-t border-revora-border-subtle pt-4 text-xs text-revora-faint">
                  <span>
                    Incident{" "}
                    <span className="font-mono text-revora-muted">
                      {result.incident_id?.slice(0, 12)}…
                    </span>
                  </span>
                  <span>
                    Audit{" "}
                    <span className="font-mono text-revora-muted">
                      {result.audit_event_id?.slice(0, 12)}…
                    </span>
                  </span>
                  {result.opportunity_id && (
                    <Link
                      href={`/opportunities/${result.opportunity_id}`}
                      className="text-revora-amber hover:underline"
                    >
                      Open opportunity →
                    </Link>
                  )}
                  <Link href="/reliability" className="text-revora-amber hover:underline">
                    View Reliability →
                  </Link>
                </div>
              </div>
            )}
          </Panel>

          {history.length > 0 && (
            <Panel title="Session history" subtitle="Runs this visit · SIMULATED">
              <ul className="space-y-2">
                {history.map((h, i) => (
                  <li key={`${h.incident_id}-${i}`}>
                    <button
                      type="button"
                      onClick={() => setResult(h)}
                      className="flex w-full items-center justify-between gap-3 rounded-md border border-revora-border-subtle bg-revora-elevated/30 px-3 py-2 text-left text-sm hover:border-revora-border"
                    >
                      <span className="flex items-center gap-2 text-revora-text">
                        {h.title}
                        {isSafeBlock(h) && <Badge tone="amber">SAFE BLOCK</Badge>}
                      </span>
                      <span className="truncate text-xs text-revora-faint">{h.final_state}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              disabled={!result || running !== null}
              onClick={() => result && void run(result.type)}
            >
              Re-run last
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultStage({
  step,
  label,
  body,
  tone,
}: {
  step: string;
  label: string;
  body: string;
  tone: "danger" | "info" | "amber" | "success";
}) {
  const accents = {
    danger: "border-revora-danger/30 bg-revora-danger/5",
    info: "border-revora-info/30 bg-revora-info/5",
    amber: "border-revora-amber/30 bg-revora-amber/5",
    success: "border-revora-success/30 bg-revora-success/5",
  };
  const labels = {
    danger: "text-revora-danger",
    info: "text-revora-info",
    amber: "text-revora-amber",
    success: "text-revora-success",
  };
  return (
    <div className={cn("rounded-lg border px-4 py-4", accents[tone])}>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[11px] text-revora-faint">{step}</span>
        <span className={cn("text-[11px] uppercase tracking-[0.14em]", labels[tone])}>
          {label}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-revora-text">{body}</p>
    </div>
  );
}
