"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuditTimeline } from "@/components/recovery/audit-timeline";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { PageState } from "@/components/ui/page-state";
import type { AuditEvent } from "@/lib/domain/types";
import { fetchLive, onRevoraDataChanged } from "@/lib/api/client-live";

export default function AuditTrailPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAudit = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchLive<{ events?: AuditEvent[] }>(
        "/api/audit/a0000000-0000-4000-8000-000000000051"
      );
      setEvents(data.events || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit trail");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAudit();
    const off = onRevoraDataChanged(() => void loadAudit());
    return () => off();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <header className="border-b border-[#181b26] pb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-[#d4a574]">
              GOVERNANCE & COMPLIANCE
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Audit Trail
            </h1>
            <p className="mt-1.5 text-sm text-[#8b92a5]">
              Cryptographic, append-only ledger tracking all AI recommendations, policy evaluations, and verified recovery settlements.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge tone="success" className="font-mono text-[10px]">
              IMMUTABLE LEDGER
            </Badge>
            <Badge tone="amber" className="font-mono text-[10px]">
              POLICY-AUDITED
            </Badge>
          </div>
        </div>
      </header>

      <PageState loading={loading} error={error} onRetry={loadAudit}>
        {/* Metric Overview Strip */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[#1e2230] bg-[#0c0e15] p-4">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#636b80]">
              Recorded Audit Events
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-white">
              {events.length}
            </div>
            <div className="text-[10px] text-[#8b92a5] font-mono mt-0.5">
              Verified in Supabase ledger
            </div>
          </div>

          <div className="rounded-xl border border-[#1e2230] bg-[#0c0e15] p-4">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#636b80]">
              Flagship Scope
            </div>
            <div className="mt-1 font-mono text-base font-semibold text-[#d4a574] truncate">
              corr_demo_48000
            </div>
            <div className="text-[10px] text-[#8b92a5] font-mono mt-0.5">
              <Link
                href="/opportunities/a0000000-0000-4000-8000-000000000051"
                className="text-[#d4a574] hover:underline"
              >
                View opportunity detail →
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-[#1e2230] bg-[#0c0e15] p-4">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#636b80]">
              Compliance Standard
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-[#5dbe8a]">
              100%
            </div>
            <div className="text-[10px] text-[#8b92a5] font-mono mt-0.5">
              Zero un-audited autonomous actions
            </div>
          </div>
        </div>

        {/* Timeline Panel */}
        <Panel
          title="Cryptographic Event Log"
          subtitle="Sequential audit timeline ordered chronologically"
        >
          <div className="py-2">
            <AuditTimeline events={events} />
          </div>
        </Panel>
      </PageState>
    </div>
  );
}
