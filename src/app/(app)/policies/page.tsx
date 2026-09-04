"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { PageState, SectionLabel } from "@/components/ui/page-state";
import type { ConfidenceLevel, PolicyRules } from "@/lib/domain/types";
import { formatINR } from "@/lib/utils";

export default function PoliciesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<PolicyRules | null>(null);
  const [baseline, setBaseline] = useState<PolicyRules | null>(null);
  const [maxAutoRupees, setMaxAutoRupees] = useState("0");
  const [message, setMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/policies");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load policies");
      const policy = (data.policies?.[0] as PolicyRules) ?? null;
      setRules(policy);
      setBaseline(policy);
      if (policy) setMaxAutoRupees(String(policy.max_auto_action_amount / 100));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load policies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function sensitiveChanged(): boolean {
    if (!rules || !baseline) return false;
    const paise = Math.round(Number(maxAutoRupees || 0) * 100);
    return (
      paise !== baseline.max_auto_action_amount ||
      rules.allow_auto_retry !== baseline.allow_auto_retry
    );
  }

  function requestSave() {
    if (!rules) return;
    setMessage(null);
    if (sensitiveChanged()) {
      setConfirmOpen(true);
      return;
    }
    void save();
  }

  async function save() {
    if (!rules) return;
    setConfirmOpen(false);
    setSaving(true);
    setMessage(null);
    const paise = Math.round(Number(maxAutoRupees || 0) * 100);
    try {
      const res = await fetch("/api/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_retry_attempts: rules.max_retry_attempts,
          min_retry_interval_minutes: rules.min_retry_interval_minutes,
          max_auto_action_amount: paise,
          min_ai_confidence: rules.min_ai_confidence,
          max_reminders_per_24h: rules.max_reminders_per_24h,
          high_risk_requires_approval: rules.high_risk_requires_approval,
          allow_auto_retry: rules.allow_auto_retry,
          block_already_paid: rules.block_already_paid,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Save failed");
        setSaving(false);
        return;
      }
      const updated = data.policies?.[0] as PolicyRules;
      setRules(updated);
      setBaseline(updated);
      setMaxAutoRupees(String(updated.max_auto_action_amount / 100));
      setMessage("Policies saved. New recoveries will respect these gates.");
    } catch {
      setMessage("Network error while saving policies");
    }
    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-revora-amber" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-revora-amber">
              Governance · Policy Engine
            </span>
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white md:text-3xl">
            Deterministic Guardrail Policies
          </h1>
          <p className="mt-1 text-sm text-revora-muted">
            Merchant-enforced guardrails that the AI cannot bypass — controlling financial autonomy, retry limits, and contact throttles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="amber">MERCHANT-CONTROLLED</Badge>
          <Badge tone="muted">HARD GATES</Badge>
        </div>
      </header>

      <PageState loading={loading && !rules} error={error} onRetry={load}>
        {rules && (
          <div className="space-y-6">
            <Panel title="Autonomy" subtitle="How far REVORA may act without a human">
              <div className="space-y-5">
                <Field
                  label="Max auto-action amount (₹)"
                  hint="Sensitive · above this amount requires merchant approval"
                  sensitive
                >
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-revora-faint">
                      ₹
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={maxAutoRupees}
                      onChange={(e) => setMaxAutoRupees(e.target.value)}
                      className={`${inputClass} pl-7`}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-revora-faint">
                    Stored as {formatINR(Math.round(Number(maxAutoRupees || 0) * 100))} ·{" "}
                    {rules.max_auto_action_amount} paise in store
                  </p>
                </Field>

                <Toggle
                  label="Allow auto retry"
                  hint="Sensitive · when off, every retry needs merchant approval"
                  checked={rules.allow_auto_retry}
                  onChange={(v) => setRules({ ...rules, allow_auto_retry: v })}
                  sensitive
                />

                <Field label="Minimum AI confidence" hint="Below this, auto-execute is blocked">
                  <select
                    value={rules.min_ai_confidence}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        min_ai_confidence: e.target.value as ConfidenceLevel,
                      })
                    }
                    className={inputClass}
                  >
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </Field>
              </div>
            </Panel>

            <Panel title="Retry" subtitle="Attempt limits and cooldown">
              <div className="space-y-5">
                <Field
                  label="Max retry attempts"
                  hint="Hard stop after this many recovery attempts per opportunity"
                >
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={rules.max_retry_attempts}
                    onChange={(e) =>
                      setRules({ ...rules, max_retry_attempts: Number(e.target.value) })
                    }
                    className={inputClass}
                  />
                </Field>

                <Field
                  label="Min retry interval (minutes)"
                  hint="Cooldown between automated retries"
                >
                  <input
                    type="number"
                    min={0}
                    value={rules.min_retry_interval_minutes}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        min_retry_interval_minutes: Number(e.target.value),
                      })
                    }
                    className={inputClass}
                  />
                </Field>
              </div>
            </Panel>

            <Panel title="Communication" subtitle="Customer contact throttle">
              <Field label="Max reminders per 24h" hint="Customer reminder throttle">
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={rules.max_reminders_per_24h}
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      max_reminders_per_24h: Number(e.target.value),
                    })
                  }
                  className={inputClass}
                />
              </Field>
            </Panel>

            <Panel title="Risk" subtitle="Risk-based autonomy">
              <Toggle
                label="High-risk requires approval"
                hint="CRITICAL / HIGH risk opportunities never auto-execute"
                checked={rules.high_risk_requires_approval}
                onChange={(v) => setRules({ ...rules, high_risk_requires_approval: v })}
              />
            </Panel>

            <Panel title="Approval" subtitle="Hard safety blocks">
              <Toggle
                label="Block already paid"
                hint="Refuse recovery when payment is already captured"
                checked={rules.block_already_paid}
                onChange={(v) => setRules({ ...rules, block_already_paid: v })}
              />
            </Panel>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-revora-border-subtle bg-revora-surface/80 px-5 py-4">
              <div>
                <SectionLabel>Last update</SectionLabel>
                <p className="mt-1 text-sm text-revora-text">
                  {new Date(rules.updated_at).toLocaleString("en-IN")}
                </p>
                <p className="mt-0.5 text-xs text-revora-faint">
                  Updated by {rules.updated_by || "—"}
                </p>
              </div>
              <Button onClick={requestSave} disabled={saving}>
                {saving ? "Saving…" : "Save policies"}
              </Button>
            </div>

            {message && <p className="text-sm text-revora-amber">{message}</p>}

            {confirmOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
                <div className="w-full max-w-md rounded-xl border border-revora-border bg-revora-surface p-6 shadow-xl">
                  <SectionLabel>Confirm sensitive change</SectionLabel>
                  <h2 className="mt-2 text-lg font-medium text-revora-text">
                    Update autonomy limits?
                  </h2>
                  <p className="mt-2 text-sm text-revora-muted">
                    You are changing max auto-action amount and/or allow auto retry. These gates
                    control unsupervised financial actions.
                  </p>
                  <div className="mt-6 flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={() => void save()} disabled={saving}>
                      {saving ? "Saving…" : "Confirm save"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </PageState>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-revora-border bg-revora-elevated px-3 py-2 text-sm text-revora-text outline-none focus:border-revora-amber/50";

function Field({
  label,
  hint,
  children,
  sensitive,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
  sensitive?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="block text-sm font-medium text-revora-text">{label}</label>
        {sensitive && <Badge tone="amber">Sensitive</Badge>}
      </div>
      <p className="mt-0.5 text-xs text-revora-muted">{hint}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  sensitive,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  sensitive?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-revora-border-subtle bg-revora-elevated/30 px-4 py-3">
      <div>
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-revora-text">{label}</div>
          {sensitive && <Badge tone="amber">Sensitive</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-revora-muted">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={
          checked
            ? "relative h-6 w-11 shrink-0 rounded-full bg-revora-amber transition-colors"
            : "relative h-6 w-11 shrink-0 rounded-full bg-revora-border transition-colors"
        }
      >
        <span
          className={
            checked
              ? "absolute left-6 top-0.5 h-5 w-5 rounded-full bg-revora-bg transition-all"
              : "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-revora-muted transition-all"
          }
        />
      </button>
    </div>
  );
}
