"use client";

import { Badge } from "@/components/ui/badge";
import type { AuditEvent } from "@/lib/domain/types";
import { cn, formatINR } from "@/lib/utils";

export function AuditTimeline({ events }: { events: AuditEvent[] }) {
  if (!events.length) {
    return (
      <div className="rounded-md border border-dashed border-revora-border px-4 py-8 text-center text-sm text-revora-muted">
        No audit events yet. Every meaningful action will appear here.
      </div>
    );
  }

  return (
    <ol className="relative space-y-0 border-l border-revora-border-subtle ml-2">
      {events.map((event, idx) => {
        const recovered =
          event.event === "RECOVERY_CONFIRMED" &&
          typeof event.metadata?.actual_recovered_amount === "number"
            ? (event.metadata.actual_recovered_amount as number)
            : null;
        return (
          <li key={event.id} className="relative pb-6 pl-6 last:pb-0">
            <span
              className={cn(
                "absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border",
                idx === events.length - 1
                  ? "border-revora-amber bg-revora-amber"
                  : "border-revora-border bg-revora-surface"
              )}
            />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <time className="font-mono text-[11px] text-revora-faint">
                {new Date(event.created_at).toLocaleTimeString("en-IN", {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </time>
              <span className="text-sm font-medium tracking-wide text-revora-text">
                {event.event}
              </span>
              <Badge tone="muted">{event.actor_type}</Badge>
            </div>
            {event.reason && (
              <p className="mt-1 text-sm text-revora-muted">{event.reason}</p>
            )}
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-revora-faint">
              {event.ai_recommendation && <span>AI: {event.ai_recommendation}</span>}
              {event.policy_decision && <span>Policy: {event.policy_decision}</span>}
              {event.previous_state && event.new_state && (
                <span>
                  {event.previous_state} → {event.new_state}
                </span>
              )}
            </div>
            {recovered != null && (
              <p className="mt-2 text-sm font-medium text-revora-success">
                {formatINR(recovered)} RECOVERED
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
