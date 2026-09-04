"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { PageState } from "@/components/ui/page-state";
import type { SystemIncident } from "@/lib/domain/types";
import { cn, formatRelativeTime } from "@/lib/utils";

type Health = {
  webhook_processor?: string;
  razorpay?: string;
  ai_service?: string;
  recovery_model?: string;
  database?: string;
  policy_engine?: string;
  audit_service?: string;
  execution_service?: string;
  mode?: string;
};

const SERVICE_TILES: Array<{ key: keyof Health; label: string; short: string }> = [
  { key: "webhook_processor", label: "Webhook", short: "Event ingest" },
  { key: "ai_service", label: "AI", short: "Decision layer" },
  { key: "policy_engine", label: "Policy", short: "Safety gates" },
  { key: "execution_service", label: "Execution", short: "Action runner" },
  { key: "database", label: "Database", short: "Source of truth" },
  { key: "audit_service", label: "Audit", short: "Evidence trail" },
];

export default function ReliabilityPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [incidents, setIncidents] = useState<SystemIncident[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reliability/incidents");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load reliability");
      setHealth(data.health ?? null);
      setIncidents(data.incidents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load reliability");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const degraded = health
    ? SERVICE_TILES.some(({ key }) => {
        const v = health[key];
        return v === "degraded" || v === "outage";
      })
    : false;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-revora-amber" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-revora-amber">
              Operations · Reliability
            </span>
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white md:text-3xl">
            System Reliability & Telemetry
          </h1>
          <p className="mt-1 text-sm text-revora-muted">
            Microservice health status, fail-safe fallbacks, and autonomous self-healing telemetry
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={degraded ? "amber" : "success"}>
            {degraded ? "DEGRADED" : "ALL SYSTEMS OPERATIONAL"}
          </Badge>
          {health?.mode && <Badge tone="amber">{health.mode}</Badge>}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void load()}
            className="border-revora-border text-xs text-revora-muted hover:text-white"
          >
            Refresh
          </Button>
        </div>
      </header>

      <PageState loading={loading && !health} error={error} onRetry={load}>
        <Panel title="Infrastructure Service Health" subtitle="Core recovery pipeline dependencies">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICE_TILES.map(({ key, label, short }) => {
              const status = health?.[key] ?? "operational";
              return (
                <div
                  key={key}
                  className="rounded-xl border border-revora-border bg-revora-card p-4 shadow-md transition-all hover:border-revora-border/80"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">{label}</span>
                    <HealthDot status={status} />
                  </div>
                  <div className="mt-1 text-xs text-revora-muted">{short}</div>
                  <div className="mt-4 flex items-center justify-between border-t border-revora-border/40 pt-3 text-[10px] uppercase font-mono text-revora-faint">
                    <span>Status:</span>
                    <span className="font-semibold text-revora-success">{status}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {(health?.razorpay || health?.recovery_model) && (
            <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-revora-border/60 bg-revora-surface/40 px-4 py-3 text-xs text-revora-muted">
              {health.razorpay && (
                <div>
                  <span className="text-revora-faint">Razorpay Gateway API: </span>
                  <span className="font-mono font-medium text-white">{health.razorpay}</span>
                </div>
              )}
              {health.recovery_model && (
                <div>
                  <span className="text-revora-faint">Primary Inference Model: </span>
                  <span className="font-mono font-medium text-revora-amber">{health.recovery_model}</span>
                </div>
              )}
            </div>
          )}
        </Panel>

        <div className="mt-5 flex justify-end">
          <Link
            href="/failure-lab"
            className="inline-flex items-center gap-1.5 rounded-lg border border-revora-amber/30 bg-revora-amber/10 px-3.5 py-1.5 text-xs font-semibold text-revora-amber hover:bg-revora-amber/20 transition-colors"
          >
            <span>Open Failure Lab & Chaos Simulator</span>
            <span>→</span>
          </Link>
        </div>

        <Panel
          className="mt-6"
          title="Incidents"
          subtitle={`${incidents.length} recent · expand for recovery path`}
        >
          {incidents.length === 0 ? (
            <p className="py-8 text-center text-sm text-revora-muted">
              No incidents recorded. Run Failure Lab simulations to generate them.
            </p>
          ) : (
            <ul className="divide-y divide-revora-border-subtle">
              {incidents.map((inc) => {
                const open = openId === inc.id;
                return (
                  <li key={inc.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : inc.id)}
                      className="flex w-full items-start justify-between gap-4 py-4 text-left transition-colors hover:bg-revora-elevated/30"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <SeverityBadge severity={inc.severity} />
                          <span className="text-sm font-medium text-revora-text">{inc.title}</span>
                          {inc.resolved ? (
                            <Badge tone="success">Resolved</Badge>
                          ) : (
                            <Badge tone="amber">Open</Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-revora-muted">{inc.description}</p>
                        <p className="mt-1 text-[11px] text-revora-faint">
                          {inc.type} · {formatRelativeTime(inc.created_at)}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-revora-faint">
                        {open ? "Collapse" : "Expand"}
                      </span>
                    </button>
                    {open && (
                      <div className="mb-4 grid gap-3 rounded-md border border-revora-border-subtle bg-revora-elevated/40 p-4 sm:grid-cols-3">
                        <Detail label="What broke" body={inc.what_broke} />
                        <Detail label="Recovery" body={inc.recovery_action} />
                        <Detail label="Final state" body={inc.final_state} />
                        {inc.opportunity_id && (
                          <div className="sm:col-span-3">
                            <Link
                              href={`/opportunities/${inc.opportunity_id}`}
                              className="text-xs text-revora-amber hover:underline"
                            >
                              View related opportunity →
                            </Link>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </PageState>
    </div>
  );
}

function HealthDot({ status }: { status: string }) {
  const tone =
    status === "operational"
      ? "bg-revora-success"
      : status === "demo"
        ? "bg-revora-amber"
        : status === "degraded"
          ? "bg-revora-amber"
          : status === "unknown"
            ? "bg-revora-faint"
            : "bg-revora-danger";
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-40", tone)} />
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", tone)} />
    </span>
  );
}

function SeverityBadge({ severity }: { severity: SystemIncident["severity"] }) {
  const tone =
    severity === "critical" ? "danger" : severity === "warning" ? "amber" : "muted";
  return <Badge tone={tone}>{severity}</Badge>;
}

function Detail({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-revora-faint">{label}</div>
      <p className="mt-1 text-sm leading-relaxed text-revora-text">{body}</p>
    </div>
  );
}
