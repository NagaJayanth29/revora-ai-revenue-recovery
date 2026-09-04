"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/page-state";
import { ChatbotIcon } from "@/components/ui/chatbot-icon";
import { cn } from "@/lib/utils";

type ToolUsed = {
  tool: string;
  ok: boolean;
  summary: string;
};

type CopilotAction = {
  label: string;
  query?: string;
  url?: string;
  action?: string;
  tone?: "amber" | "muted" | "info" | "success";
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: ToolUsed[];
  actions?: CopilotAction[];
};

const DEFAULT_CHIPS = [
  "What's at risk today?",
  "What should I recover first?",
  "Explain the ₹48,000 opportunity",
  "Compare retry now vs retry later",
  "What caused the most revenue leakage?",
  "Why was this action blocked?",
  "Has the ₹48,000 opportunity been paid yet?",
];

export default function CopilotPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl px-6 py-8">
          <p className="text-sm text-revora-muted">Opening REVORA Copilot…</p>
        </div>
      }
    >
      <CopilotInner />
    </Suspense>
  );
}

function CopilotInner() {
  const searchParams = useSearchParams();
  const opportunityId = searchParams.get("opportunity");

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [chips, setChips] = useState<string[]>(DEFAULT_CHIPS);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (opportunityId) {
      setChips([
        "Compare actions",
        "Why this action?",
        "View policy",
        "Execute approved action",
      ]);
      setMessages([
        {
          id: "sys-ctx",
          role: "assistant",
          content: `Opportunity context loaded · ${opportunityId.slice(0, 18)}…\n\nAsk why this action was chosen, compare interventions, or request a policy check. Tools stay grounded to this recovery opportunity.`,
        },
      ]);
    } else {
      setChips(DEFAULT_CHIPS);
      setMessages([
        {
          id: "sys-welcome",
          role: "assistant",
          content:
            "REVORA Copilot is a recovery command layer — not a general chatbot.\n\nAsk about revenue at risk, approvals, leakage, experiments, or open an opportunity with ?opportunity= for grounded analysis.",
        },
      ]);
    }
  }, [opportunityId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", content: message }]);

    try {
      const res = await fetch("/api/copilot/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          opportunity_id: opportunityId || null,
          session_id: sessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => [
          ...m,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            content: data.error || "Copilot request failed",
          },
        ]);
      } else {
        setSessionId(data.session_id);
        if (Array.isArray(data.suggestion_chips) && data.suggestion_chips.length) {
          setChips(data.suggestion_chips);
        }
        setMessages((m) => [
          ...m,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: data.reply,
            tools: data.tools_used,
            actions: data.actions,
          },
        ]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: "Network error talking to Copilot",
        },
      ]);
    }
    setBusy(false);
  }

  return (
    <div
      className="mx-auto flex max-w-4xl flex-col px-6 py-8"
      style={{ minHeight: "calc(100vh - 2rem)" }}
    >
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <ChatbotIcon size="xl" glow pulse />
          <div>
            <SectionLabel>REVORA COPILOT</SectionLabel>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-revora-text md:text-3xl">
              Recovery command layer
            </h1>
            <p className="mt-1 max-w-xl text-sm text-revora-muted">
              Grounded tools · audited actions · policy-gated execution.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="amber">DEMO MODE</Badge>
          {opportunityId ? (
            <>
              <Badge tone="info">Opportunity context</Badge>
              <Link
                href={`/opportunities/${opportunityId}`}
                className="text-xs text-revora-amber hover:underline"
              >
                Open detail →
              </Link>
            </>
          ) : (
            <Badge tone="muted">Merchant-wide</Badge>
          )}
        </div>
      </header>

      <Panel
        className="flex flex-1 flex-col"
        title="Command session"
        subtitle={sessionId ? `Session ${sessionId.slice(0, 12)}…` : "New session"}
      >
        <div className="flex min-h-[420px] flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto pr-1">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn("max-w-[94%]", msg.role === "user" ? "ml-auto" : "mr-auto")}
              >
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-revora-faint">
                  {msg.role === "user" ? (
                    <span>Operator</span>
                  ) : (
                    <>
                      <ChatbotIcon size={16} />
                      <span className="text-revora-amber font-medium">REVORA Copilot</span>
                    </>
                  )}
                </div>
                {msg.role === "user" ? (
                  <div className="rounded-lg border border-revora-amber/25 bg-revora-amber/10 px-4 py-3 text-sm leading-relaxed text-revora-text whitespace-pre-wrap">
                    {msg.content}
                  </div>
                ) : (
                  <StructuredReply content={msg.content} />
                )}
                {msg.tools && msg.tools.length > 0 && (
                  <div className="mt-2 space-y-1.5 px-0.5">
                    <div className="text-[10px] uppercase tracking-wider text-revora-faint">
                      Tools used
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.tools.map((t) => (
                        <span
                          key={`${t.tool}-${t.summary}`}
                          className={cn(
                            "rounded border px-2 py-1 font-mono text-[10px]",
                            t.ok
                              ? "border-revora-border-subtle bg-revora-bg/80 text-revora-muted"
                              : "border-revora-danger/30 bg-revora-danger/10 text-revora-danger"
                          )}
                          title={t.summary}
                        >
                          {t.tool}
                        </span>
                      ))}
                    </div>
                    <ul className="space-y-1">
                      {msg.tools.map((t) => (
                        <li
                          key={`sum-${t.tool}-${t.summary.slice(0, 24)}`}
                          className="text-[11px] text-revora-faint"
                        >
                          <span className="font-mono text-revora-muted">{t.tool}</span>
                          {" · "}
                          {t.summary}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-revora-border-subtle/60">
                    {msg.actions.map((act, actIdx) => (
                      act.url ? (
                        <Link
                          key={actIdx}
                          href={act.url}
                          target={act.url.startsWith("http") ? "_blank" : undefined}
                          rel={act.url.startsWith("http") ? "noopener noreferrer" : undefined}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                            act.tone === "amber"
                              ? "border-revora-amber/40 bg-revora-amber/10 text-revora-amber hover:bg-revora-amber/20"
                              : act.tone === "info"
                              ? "border-revora-info/40 bg-revora-info/10 text-revora-info hover:bg-revora-info/20"
                              : "border-revora-border-subtle bg-revora-surface text-revora-muted hover:border-revora-amber/30 hover:text-revora-text"
                          )}
                        >
                          {act.label}
                        </Link>
                      ) : (
                        <button
                          key={actIdx}
                          type="button"
                          disabled={busy}
                          onClick={() => act.query && void send(act.query)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40",
                            act.tone === "amber"
                              ? "border-revora-amber/40 bg-revora-amber/10 text-revora-amber hover:bg-revora-amber/20"
                              : act.tone === "info"
                              ? "border-revora-info/40 bg-revora-info/10 text-revora-info hover:bg-revora-info/20"
                              : "border-revora-border-subtle bg-revora-surface text-revora-muted hover:border-revora-amber/30 hover:text-revora-text"
                          )}
                        >
                          {act.label}
                        </button>
                      )
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <p className="text-sm text-revora-faint">Querying recovery tools…</p>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-revora-border-subtle pt-4">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={busy}
                onClick={() => void send(chip)}
                className="rounded-md border border-revora-border-subtle bg-revora-surface px-2.5 py-1.5 text-xs text-revora-muted transition-colors hover:border-revora-amber/40 hover:text-revora-amber disabled:opacity-40"
              >
                {chip}
              </button>
            ))}
          </div>

          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                opportunityId
                  ? "Ask about this opportunity…"
                  : "Ask about risk, approvals, leakage…"
              }
              className="flex-1 rounded-md border border-revora-border bg-revora-elevated px-4 py-2.5 text-sm text-revora-text outline-none placeholder:text-revora-faint focus:border-revora-amber/50"
              disabled={busy}
            />
            <Button type="submit" disabled={busy || !input.trim()}>
              Run
            </Button>
          </form>
        </div>
      </Panel>
    </div>
  );
}

function StructuredReply({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/).filter(Boolean);
  return (
    <div className="rounded-lg border border-revora-border-subtle bg-revora-elevated/50 px-4 py-4">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const looksLikeKv = lines.every(
          (l) => !l.trim() || l.includes(":") || l.startsWith("·") || l.startsWith("-")
        );
        if (looksLikeKv && lines.length > 1) {
          return (
            <div
              key={i}
              className={cn("space-y-1.5", i > 0 && "mt-3 border-t border-revora-border-subtle pt-3")}
            >
              {lines.map((line, j) => {
                const idx = line.indexOf(":");
                if (idx > 0 && idx < 40) {
                  return (
                    <div key={j} className="flex gap-3 text-sm">
                      <span className="shrink-0 text-revora-faint">{line.slice(0, idx)}</span>
                      <span className="text-revora-text">{line.slice(idx + 1).trim()}</span>
                    </div>
                  );
                }
                return (
                  <p key={j} className="text-sm leading-relaxed text-revora-muted">
                    {line}
                  </p>
                );
              })}
            </div>
          );
        }
        return (
          <p
            key={i}
            className={cn(
              "text-sm leading-relaxed whitespace-pre-wrap text-revora-muted",
              i > 0 && "mt-3"
            )}
          >
            {block}
          </p>
        );
      })}
    </div>
  );
}
