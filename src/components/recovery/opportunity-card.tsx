"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import type { Customer, RecoveryOpportunity } from "@/lib/domain/types";
import {
  cn,
  confidenceColor,
  formatPercent,
  interventionLabel,
  policyColor,
  statusTone,
} from "@/lib/utils";

export function OpportunityCard({
  opportunity,
  customer,
  compact,
}: {
  opportunity: RecoveryOpportunity;
  customer?: Customer | null;
  compact?: boolean;
}) {
  const tone = statusTone(opportunity.status);
  return (
    <article className="group rounded-lg border border-revora-border-subtle bg-revora-elevated/40 p-4 transition-colors hover:border-revora-border hover:bg-revora-elevated/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Money paise={opportunity.amount} size={compact ? "md" : "lg"} className="text-revora-text" />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone={tone}>{opportunity.status.replace(/_/g, " ")}</Badge>
            <span className="text-xs text-revora-muted">
              {opportunity.source.replace(/_/g, " ")}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-revora-faint">Expected</div>
          <div className="text-sm tabular-nums text-revora-amber">
            {opportunity.expected_recovery_value != null
              ? formatINRShort(opportunity.expected_recovery_value)
              : "—"}
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm text-revora-muted">
        {opportunity.failure_reason || "Revenue at risk"}
      </p>

      {customer && (
        <p className="mt-1 text-xs text-revora-faint">
          {customer.name} · {customer.success_count} successful payments
        </p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-revora-border-subtle pt-3">
        <Metric
          label="Probability"
          value={
            opportunity.recovery_probability != null
              ? formatPercent(opportunity.recovery_probability)
              : "—"
          }
        />
        <Metric
          label="Confidence"
          value={opportunity.confidence || "—"}
          className={confidenceColor(opportunity.confidence)}
        />
        <Metric
          label="Policy"
          value={
            opportunity.policy_status === "SAFE_TO_EXECUTE"
              ? "AUTO"
              : opportunity.policy_status?.replace(/_/g, " ") || "—"
          }
          className={policyColor(opportunity.policy_status)}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="text-xs text-revora-muted">
          Rec:{" "}
          <span className="text-revora-text">
            {opportunity.recommended_action
              ? interventionLabel(opportunity.recommended_action)
              : "Analyzing…"}
          </span>
        </div>
        <Button asChild size="sm" variant="secondary">
          <Link href={`/opportunities/${opportunity.id}`}>Open</Link>
        </Button>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-revora-faint">{label}</div>
      <div className={cn("mt-0.5 text-sm font-medium tabular-nums", className)}>{value}</div>
    </div>
  );
}

function formatINRShort(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}
