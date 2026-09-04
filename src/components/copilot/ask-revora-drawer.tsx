"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  X,
  Send,
  RotateCcw,
  ExternalLink,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  User,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChatbotIcon } from "@/components/ui/chatbot-icon";

/**
 * Custom REVORA AI Recovery Icon.
 * Features a dark fintech circular housing, stylized gold/amber "R" monogram,
 * and an upward dynamic recovery arrow/vector in emerald representing revenue uplift.
 * Complies strictly with: No robot, no generic chat bubble, no sparkle/stars AI, no emoji.
 */
export function RevoraRecoveryIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      {/* Dark elevated fintech circular base */}
      <circle
        cx="16"
        cy="16"
        r="15"
        fill="#12151e"
        stroke="#d4a574"
        strokeWidth="1.25"
        strokeOpacity="0.45"
      />

      {/* Stylized 'R' Stem & Curved Upper Loop in REVORA Amber/Gold */}
      <path
        d="M9.5 22.5V9.5H16.2C18.6 9.5 20.5 11.1 20.5 13.2C20.5 15.2 19 16.8 17 17.1L12.5 17.1"
        stroke="#d4a574"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dynamic Upward Recovery Vector in Emerald (#5dbe8a) */}
      <path
        d="M14.5 17.2L22.5 9.2M22.5 9.2H17.2M22.5 9.2V14.5"
        stroke="#5dbe8a"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Apex trajectory dot */}
      <circle cx="22.5" cy="9.2" r="1.1" fill="#5dbe8a" />
    </svg>
  );
}

export interface CopilotAction {
  label: string;
  query?: string;
  url?: string;
  action?: string;
  tone?: "amber" | "muted" | "info" | "success";
}

interface ToolUsed {
  tool: string;
  ok: boolean;
  summary: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: ToolUsed[];
  actions?: CopilotAction[];
  timestamp: string;
}

const DEFAULT_GLOBAL_CHIPS = [
  "What's at risk today?",
  "What should I recover first?",
  "Explain the ₹48K opportunity",
  "Compare retry now vs retry later",
  "What caused the most revenue leakage?",
  "Why was this action blocked?",
  "Has the ₹48K opportunity been paid yet?",
];

const DEFAULT_OPPORTUNITY_CHIPS = [
  "Why is this opportunity risky?",
  "Why did REVORA choose this intervention?",
  "Compare retry now vs retry later",
  "Has this opportunity been paid yet?",
  "Check policy status",
  "Simulate recovery",
];

export function AskRevoraDrawer() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showToolsIndex, setShowToolsIndex] = useState<Record<string, boolean>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Extract focused opportunity ID if currently on an opportunity detail page
  const opportunityId = pathname?.startsWith("/opportunities/")
    ? pathname.split("/opportunities/")[1]?.split("/")[0]?.split("?")[0] || null
    : null;

  const currentChips = opportunityId ? DEFAULT_OPPORTUNITY_CHIPS : DEFAULT_GLOBAL_CHIPS;

  const resetSession = useCallback(() => {
    const newSessionId = `cps_${Date.now().toString(36)}`;
    setSessionId(newSessionId);
    setShowToolsIndex({});

    if (opportunityId) {
      setMessages([
        {
          id: `init-${Date.now()}`,
          role: "assistant",
          content: `### Grounded Context: Opportunity ${opportunityId.slice(0, 16)}…\n\nI am grounded in this recovery opportunity's live Supabase state, Razorpay Test Mode actions, and deterministic policy evaluation.\n\nAsk why this action was recommended, compare counterfactual alternatives, or check payment status.`,
          actions: [
            { label: "Why is this opportunity risky?", query: "Why is this opportunity risky?", tone: "amber" },
            { label: "Compare interventions", query: "Compare retry now vs retry later", tone: "info" },
            { label: "Check payment status", query: "Has this opportunity been paid yet?", tone: "muted" },
          ],
          timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } else {
      setMessages([
        {
          id: `init-${Date.now()}`,
          role: "assistant",
          content: `### Welcome to Ask REVORA\n\nI am your **AI Revenue Recovery Copilot**, strictly grounded in live transaction data, Razorpay Test Mode, and deterministic policy guardrails.\n\n• Zero fabricated DB values\n• Actions gated through the Policy Engine\n• Verified settlements clearly separated from expected projections\n\nSelect a prompt below or ask any question about revenue recovery.`,
          actions: [
            { label: "What's at risk today?", query: "What's at risk today?", tone: "amber" },
            { label: "What should I recover first?", query: "What should I recover first?", tone: "info" },
            { label: "Explain the ₹48K opportunity", query: "Explain the ₹48K opportunity", tone: "muted" },
          ],
          timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    }
  }, [opportunityId]);

  useEffect(() => {
    resetSession();
  }, [resetSession]);

  const sendMessage = useCallback(
    async (text: string) => {
      const query = text.trim();
      if (!query || busy) return;

      setInput("");
      setBusy(true);

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: query,
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((m) => [...m, userMsg]);

      try {
        const res = await fetch("/api/copilot/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: query,
            opportunity_id: opportunityId,
            session_id: sessionId,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setMessages((m) => [
            ...m,
            {
              id: `err-${Date.now()}`,
              role: "assistant",
              content: `**Error:** ${data.error || "Copilot query failed"}`,
              timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
            },
          ]);
        } else {
          if (data.session_id) setSessionId(data.session_id);
          setMessages((m) => [
            ...m,
            {
              id: `a-${Date.now()}`,
              role: "assistant",
              content: data.reply,
              tools: data.tools_used,
              actions: data.actions,
              timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
            },
          ]);
        }
      } catch {
        setMessages((m) => [
          ...m,
          {
            id: `net-err-${Date.now()}`,
            role: "assistant",
            content: "Network error talking to REVORA Copilot. Please try again.",
            timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, opportunityId, sessionId]
  );

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, busy, isOpen]);

  // Focus textarea on drawer open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Global event listeners (Keyboard shortcut Ctrl+J / Cmd+J, and custom events)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }

    function handleOpenEvent(e: Event) {
      const ce = e as CustomEvent<{ query?: string }>;
      setIsOpen(true);
      if (ce.detail?.query) {
        void sendMessage(ce.detail.query);
      }
    }

    function handleToggleEvent() {
      setIsOpen((prev) => !prev);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("revora:open-copilot", handleOpenEvent as EventListener);
    window.addEventListener("revora:toggle-copilot", handleToggleEvent as EventListener);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("revora:open-copilot", handleOpenEvent as EventListener);
      window.removeEventListener("revora:toggle-copilot", handleToggleEvent as EventListener);
    };
  }, [isOpen, sendMessage]);

  function handleActionClick(action: CopilotAction) {
    if (action.url) {
      if (action.url.startsWith("http")) {
        window.open(action.url, "_blank", "noopener,noreferrer");
      } else {
        router.push(action.url);
      }
      return;
    }

    const targetQuery = action.query || action.action || action.label;
    if (targetQuery) {
      void sendMessage(targetQuery);
    }
  }

  function toggleTools(id: string) {
    setShowToolsIndex((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  if (pathname === "/login" || pathname?.startsWith("/login")) {
    return null;
  }

  return (
    <>
      {/* Floating Circular Trigger Button in Bottom-Right */}
      <div className="fixed bottom-6 right-6 z-40 group">
        {/* Tooltip on hover/focus */}
        <div
          role="tooltip"
          className="pointer-events-none absolute right-[calc(100%+12px)] top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1.5 rounded-lg border border-revora-border-subtle bg-[#12141c] px-3 py-1.5 text-xs font-medium text-revora-text shadow-xl opacity-0 transition-opacity duration-150 group-hover:opacity-100 whitespace-nowrap"
        >
          <span>Ask REVORA</span>
          <kbd className="rounded border border-revora-border bg-revora-bg/80 px-1 py-0.2 font-mono text-[10px] text-revora-amber">
            ⌘J
          </kbd>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          aria-label="Ask REVORA"
          title="Ask REVORA (⌘J or Ctrl+J)"
          className={cn(
            "relative flex h-14 w-14 items-center justify-center rounded-full border shadow-2xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-revora-amber",
            isOpen
              ? "border-revora-amber bg-[#1a1f2c] text-revora-amber shadow-revora-amber/25 ring-2 ring-revora-amber/40 scale-105"
              : "border-revora-amber/50 bg-[#151821] text-revora-amber hover:border-revora-amber hover:bg-[#1a1f2c] hover:shadow-revora-amber/20 hover:scale-105 active:scale-95"
          )}
        >
          {/* Live Indicator Beacon (top-right emerald pulse dot) */}
          <span className="absolute top-1 right-1 flex h-3 w-3 z-20">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-revora-success opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-[#151821] bg-revora-success" />
          </span>

          <ChatbotIcon size={40} glow={isOpen} className="transition-transform duration-200 group-hover:scale-105" />
        </button>
      </div>

      {/* Slide-over Drawer Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-over Drawer Panel */}
      <aside
        className={cn(
          "fixed top-0 right-0 z-50 flex h-full w-full flex-col border-l border-revora-border-subtle bg-[#0d0f14] shadow-2xl transition-transform duration-300 ease-in-out sm:w-[490px] md:w-[530px]",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
        aria-label="Ask REVORA Copilot Chatbot"
      >
        {/* Drawer Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-revora-border-subtle bg-[#12141c] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-revora-amber/40 bg-[#151821] text-revora-amber shadow-sm">
              <ChatbotIcon size={34} glow />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-wide text-revora-text">
                  Ask REVORA
                </h2>
                <Badge tone="amber" className="text-[9px] py-0 px-1.5 font-mono">
                  AI COPILOT
                </Badge>
              </div>
              <p className="text-[11px] text-revora-muted">
                AI Revenue Recovery Copilot · Grounded in Live Data
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={resetSession}
              title="Reset conversation session"
              className="rounded-md p-1.5 text-revora-faint hover:bg-revora-surface hover:text-revora-muted transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              title="Close drawer (Esc)"
              className="rounded-md p-1.5 text-revora-faint hover:bg-revora-surface hover:text-revora-text transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Status / Context Strip */}
        <div className="flex shrink-0 items-center justify-between border-b border-revora-border-subtle bg-[#10121a] px-5 py-2 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-revora-success" />
            <span className="text-revora-muted font-mono text-[10px]">
              {process.env.NEXT_PUBLIC_DEMO_MODE === "false"
                ? "RAZORPAY TEST MODE"
                : "DEMO MODE"}
            </span>
            <span className="text-revora-faint">·</span>
            <span className="text-revora-faint font-mono text-[10px]">POLICY-GATED</span>
          </div>

          {opportunityId ? (
            <span className="truncate max-w-[200px] text-revora-amber font-mono text-[10px]" title={opportunityId}>
              📍 Scope: {opportunityId.slice(0, 14)}…
            </span>
          ) : (
            <span className="text-revora-muted text-[10px]">🌐 Scope: Aurora Commerce</span>
          )}
        </div>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex flex-col space-y-1.5",
                msg.role === "user" ? "items-end" : "items-start"
              )}
            >
              {/* Message Header */}
              <div className="flex items-center gap-1.5 px-1 text-[10px] text-revora-faint">
                {msg.role === "user" ? (
                  <>
                    <User className="h-3 w-3 text-revora-muted" />
                    <span>Operator</span>
                  </>
                ) : (
                  <>
                    <ChatbotIcon size={18} />
                    <span className="text-revora-amber font-medium">REVORA Copilot</span>
                  </>
                )}
                <span>·</span>
                <span>{msg.timestamp}</span>
              </div>

              {/* Message Body */}
              {msg.role === "user" ? (
                <div className="max-w-[88%] rounded-2xl rounded-tr-xs border border-revora-amber/30 bg-revora-amber/15 px-4 py-2.5 text-sm text-revora-text leading-relaxed whitespace-pre-wrap shadow-sm">
                  {msg.content}
                </div>
              ) : (
                <div className="w-full max-w-[96%] rounded-2xl rounded-tl-xs border border-revora-border-subtle bg-[#141722] px-4 py-3.5 text-sm text-revora-text shadow-sm space-y-3">
                  {/* Rich Formatted Content */}
                  <StructuredContent content={msg.content} />

                  {/* Tools Used Pill Row */}
                  {msg.tools && msg.tools.length > 0 && (
                    <div className="border-t border-revora-border-subtle/80 pt-2.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => toggleTools(msg.id)}
                        className="flex items-center gap-1.5 text-revora-faint hover:text-revora-muted transition-colors font-mono text-[10px]"
                      >
                        <ShieldCheck className="h-3.5 w-3.5 text-revora-success" />
                        <span>
                          {msg.tools.length} grounded tool{msg.tools.length > 1 ? "s" : ""} called
                        </span>
                        {showToolsIndex[msg.id] ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>

                      {showToolsIndex[msg.id] && (
                        <div className="mt-2 space-y-1.5 rounded-lg border border-revora-border-subtle bg-revora-bg/70 p-2 text-[11px]">
                          {msg.tools.map((t, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <span
                                className={cn(
                                  "mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full",
                                  t.ok ? "bg-revora-success" : "bg-revora-danger"
                                )}
                              />
                              <div className="min-w-0 flex-1">
                                <span className="font-mono text-[10px] text-revora-amber">
                                  {t.tool}
                                </span>
                                <p className="text-[10px] text-revora-muted leading-tight mt-0.5">
                                  {t.summary}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Interactive Contextual Action Buttons */}
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="border-t border-revora-border-subtle/80 pt-3">
                      <div className="text-[10px] uppercase tracking-wider text-revora-faint mb-2">
                        Suggested Actions
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {msg.actions.map((act, aIdx) => (
                          <button
                            key={aIdx}
                            type="button"
                            disabled={busy}
                            onClick={() => handleActionClick(act)}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-150 disabled:opacity-40",
                              act.tone === "amber"
                                ? "border-revora-amber/50 bg-revora-amber/15 text-revora-amber hover:bg-revora-amber/25 hover:border-revora-amber"
                                : act.tone === "info"
                                ? "border-revora-info/40 bg-revora-info/10 text-revora-info hover:bg-revora-info/20"
                                : "border-revora-border-subtle bg-revora-surface text-revora-muted hover:border-revora-amber/40 hover:text-revora-text"
                            )}
                          >
                            <span>{act.label}</span>
                            {act.url ? (
                              act.url.startsWith("http") ? (
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              ) : (
                                <ArrowRight className="h-3 w-3 shrink-0" />
                              )
                            ) : (
                              <Zap className="h-3 w-3 shrink-0 text-revora-amber/70" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Loading Indicator */}
          {busy && (
            <div className="flex items-center gap-2.5 rounded-xl border border-revora-border-subtle bg-[#141722] p-3 text-xs text-revora-muted">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-revora-amber opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-revora-amber" />
              </span>
              <span>Querying recovery tools & evaluating policy guardrails…</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Suggestion Chips & Input Footer */}
        <div className="shrink-0 border-t border-revora-border-subtle bg-[#10121a] p-3.5 space-y-3">
          {/* Quick Suggestion Chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            {currentChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                disabled={busy}
                onClick={() => void sendMessage(chip)}
                className="shrink-0 rounded-full border border-revora-border-subtle bg-[#151822] px-3 py-1 text-[11px] text-revora-muted transition-colors hover:border-revora-amber/40 hover:text-revora-amber disabled:opacity-40"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Chat Input Field */}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && input.trim()) {
                void sendMessage(input);
              }
            }}
          >
            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                value={input}
                rows={1}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!busy && input.trim()) {
                      void sendMessage(input);
                    }
                  }
                }}
                placeholder={
                  opportunityId
                    ? "Ask about this opportunity, risk, policy, alternatives…"
                    : "Ask about risk, priority, ₹48k, leakage, policy…"
                }
                disabled={busy}
                className="w-full resize-none rounded-xl border border-revora-border bg-revora-elevated px-3.5 py-2.5 text-sm text-revora-text placeholder:text-revora-faint focus:border-revora-amber/60 focus:outline-none focus:ring-1 focus:ring-revora-amber/40 disabled:opacity-50 min-h-[42px] max-h-[120px]"
              />
            </div>

            <button
              type="submit"
              disabled={busy || !input.trim()}
              title="Send query (Enter, Shift+Enter for newline)"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-revora-amber text-revora-bg transition-colors hover:bg-[#e0b68a] disabled:opacity-30 disabled:hover:bg-revora-amber"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}

/**
 * Structured content renderer that handles markdown tables, headings, bold text,
 * bullet lists, and key-value pairs cleanly without external markdown dependencies.
 */
function StructuredContent({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/).filter(Boolean);

  return (
    <div className="space-y-3 leading-relaxed">
      {blocks.map((block, bIdx) => {
        const lines = block.split("\n");

        // Detect Markdown Table
        if (lines.length >= 2 && lines[0].includes("|") && lines[1].includes("---")) {
          const headerCells = lines[0]
            .split("|")
            .map((c) => c.trim())
            .filter(Boolean);
          const bodyRows = lines
            .slice(2)
            .filter((l) => l.includes("|"))
            .map((l) =>
              l
                .split("|")
                .map((c) => c.trim())
                .filter(Boolean)
            );

          return (
            <div key={bIdx} className="overflow-x-auto my-2 rounded-lg border border-revora-border-subtle bg-revora-bg/60">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-revora-border-subtle bg-revora-surface/60">
                    {headerCells.map((h, hIdx) => (
                      <th key={hIdx} className="p-2 font-medium text-revora-faint uppercase text-[10px] tracking-wider">
                        {renderInline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bodyRows.map((row, rIdx) => (
                    <tr key={rIdx} className="border-b border-revora-border-subtle/50 last:border-b-0 hover:bg-revora-elevated/40">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="p-2 text-revora-muted">
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // Detect Section Header (###)
        if (lines[0].startsWith("### ")) {
          return (
            <div key={bIdx} className="pt-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-revora-amber">
                {lines[0].replace("### ", "")}
              </h3>
              {lines.slice(1).length > 0 && (
                <div className="mt-1 space-y-1">
                  {lines.slice(1).map((sub, sIdx) => renderLine(sub, sIdx))}
                </div>
              )}
            </div>
          );
        }

        // Render standard line list
        return (
          <div key={bIdx} className="space-y-1">
            {lines.map((line, lIdx) => renderLine(line, lIdx))}
          </div>
        );
      })}
    </div>
  );
}

function renderLine(line: string, index: number) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Bullet point
  if (trimmed.startsWith("• ") || trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
    const text = trimmed.slice(2);
    return (
      <div key={index} className="flex items-start gap-2 text-sm text-revora-muted pl-1">
        <span className="text-revora-amber shrink-0 mt-0.5">•</span>
        <span className="flex-1">{renderInline(text)}</span>
      </div>
    );
  }

  // Numbered item
  if (/^\d+\.\s/.test(trimmed)) {
    const match = trimmed.match(/^(\d+\.)\s(.*)$/);
    if (match) {
      return (
        <div key={index} className="flex items-start gap-2 text-sm text-revora-muted pl-1">
          <span className="text-revora-amber/80 font-mono text-xs shrink-0 mt-0.5">{match[1]}</span>
          <span className="flex-1">{renderInline(match[2])}</span>
        </div>
      );
    }
  }

  // Italic / note line
  if (trimmed.startsWith("*") && trimmed.endsWith("*")) {
    return (
      <p key={index} className="text-xs italic text-revora-faint">
        {renderInline(trimmed.slice(1, -1))}
      </p>
    );
  }

  return (
    <p key={index} className="text-sm text-revora-muted">
      {renderInline(trimmed)}
    </p>
  );
}

function renderInline(text: string) {
  // Simple token parser for **bold** and `code`
  const parts: (string | React.ReactNode)[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={match.index} className="font-semibold text-revora-text">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={match.index}
          className="rounded bg-revora-bg px-1 py-0.5 font-mono text-[11px] text-revora-amber border border-revora-border-subtle"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}
