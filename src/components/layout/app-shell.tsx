"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Layers,
  Target,
  ChartNoAxesCombined,
  FlaskConical,
  Activity,
  ShieldAlert,
  ShieldCheck,
  ScrollText,
  PanelLeftClose,
  PanelLeft,
  X,
  LogOut,
} from "lucide-react";
import { fetchLive, onRevoraDataChanged } from "@/lib/api/client-live";
import { cn } from "@/lib/utils";
import { RevoraMark } from "@/components/ui/revora-mark";
import { ChatbotIcon } from "@/components/ui/chatbot-icon";
export { RevoraMark, ChatbotIcon };

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

type NavSection = {
  heading: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    heading: "COMMAND",
    items: [
      { href: "/command-center", label: "Command Center", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    heading: "RECOVERY",
    items: [
      { href: "/queue", label: "Queue", icon: Layers },
      { href: "/opportunities/a0000000-0000-4000-8000-000000000051", label: "Opportunities", icon: Target },
    ],
  },
  {
    heading: "INTELLIGENCE",
    items: [
      { href: "/analytics", label: "Analytics", icon: ChartNoAxesCombined },
      { href: "/experiments", label: "Experiments", icon: FlaskConical },
    ],
  },
  {
    heading: "OPERATIONS",
    items: [
      { href: "/reliability", label: "Reliability", icon: Activity },
      { href: "/failure-lab", label: "Failure Lab", icon: ShieldAlert },
    ],
  },
  {
    heading: "GOVERNANCE",
    items: [
      { href: "/policies", label: "Policies", icon: ShieldCheck },
      { href: "/audit", label: "Audit Trail", icon: ScrollText },
    ],
  },
];

const PAGE_META: Record<string, { title: string; description: string }> = {
  "/command-center": {
    title: "Command Center",
    description: "Real-time AI revenue recovery posture and counterfactual intelligence.",
  },
  "/": {
    title: "Command Center",
    description: "Real-time AI revenue recovery posture and counterfactual intelligence.",
  },
  "/queue": {
    title: "Recovery Queue",
    description: "Open opportunities prioritized strictly by AI expected recoverable value.",
  },
  "/opportunities": {
    title: "Opportunities",
    description: "AI-prioritized recovery cases, counterfactual comparisons, and policy checks.",
  },
  "/analytics": {
    title: "Revenue Analytics",
    description: "Predicted model estimates vs verified cryptographic settlements.",
  },
  "/experiments": {
    title: "Experiments & Lift",
    description: "Randomized control trial: Baseline retries vs REVORA AI intervention.",
  },
  "/reliability": {
    title: "Reliability Center",
    description: "Core pipeline dependencies, circuit health, and immutable audit trace.",
  },
  "/failure-lab": {
    title: "Failure Lab",
    description: "Proving REVORA remains fail-safe under catastrophic infrastructure failures.",
  },
  "/policies": {
    title: "Policy Engine",
    description: "Deterministic guardrails and card network velocity thresholds AI cannot bypass.",
  },
  "/audit": {
    title: "Audit Trail",
    description: "Cryptographic, immutable ledger of all AI recovery decisions, policy evaluations, and payment webhooks.",
  },
  "/copilot": {
    title: "Ask REVORA AI Copilot",
    description: "Grounded conversational intelligence over live merchant recovery state.",
  },
  "/login": {
    title: "Sign in",
    description: "Operator access to REVORA command center.",
  },
};

export function AppShell({
  children,
  pathname,
}: {
  children: React.ReactNode;
  pathname: string;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [merchant, setMerchant] = useState("Aurora Commerce");
  const [operator, setOperator] = useState("Priya Sharma");
  const [systemStatus, setSystemStatus] = useState<"operational" | "degraded">("operational");
  const isLogin = pathname.startsWith("/login");

  const handleSignOut = () => {
    try {
      localStorage.removeItem("revora_authenticated");
      sessionStorage.removeItem("revora_session");
    } catch {
      /* ignore */
    }
    router.push("/login");
  };

  // Load summary
  useEffect(() => {
    let cancelled = false;
    const loadShell = async () => {
      try {
        const data = await fetchLive<{
          merchant?: { name?: string };
          operator?: { name?: string };
          summary?: { system_status?: string };
        }>("/api/dashboard/summary");
        if (cancelled) return;
        if (data.merchant?.name) setMerchant(data.merchant.name);
        if (data.operator?.name) setOperator(data.operator.name);
        if (data.summary?.system_status === "degraded") setSystemStatus("degraded");
      } catch {
        /* ignore */
      }
    };
    void loadShell();
    const off = onRevoraDataChanged(() => void loadShell());
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  // Keyboard shortcut: ⌘B to toggle collapse
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (isLogin) {
    return <div className="min-h-screen bg-revora-bg">{children}</div>;
  }

  const metaKey = Object.keys(PAGE_META).find(
    (k) => k !== "/" && pathname.startsWith(k)
  );
  const meta =
    PAGE_META[metaKey || (pathname === "/" ? "/" : "")] ||
    (pathname.startsWith("/opportunities/")
      ? {
          title: "Opportunity Workspace",
          description: "AI investigation, counterfactual comparisons, and controlled execution.",
        }
      : PAGE_META["/"]);

  const isTestMode = process.env.NEXT_PUBLIC_DEMO_MODE === "false";
  const isCopilotActive = pathname === "/copilot" || pathname.startsWith("/copilot/");

  const renderNavLinks = (isDrawer = false) => (
    <>
      {NAV_SECTIONS.map((section) => (
        <div key={section.heading} className="space-y-0.5">
          {(!collapsed || isDrawer) && (
            <div className="px-3 pb-1 text-[9.5px] font-mono uppercase tracking-[0.2em] text-[#555c70] select-none">
              {section.heading}
            </div>
          )}
          {section.items.map((item) => {
            const active = item.exact
              ? pathname === item.href || (item.href === "/command-center" && pathname === "/")
              : pathname === item.href ||
                pathname.startsWith(item.href.split("?")[0] + "/") ||
                (item.label === "Opportunities" && pathname.startsWith("/opportunities"));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  "group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4a574]",
                  active
                    ? "bg-[#141722] text-white shadow-[0_1px_8px_rgba(212,165,116,0.06)]"
                    : "text-[#8b93a7] hover:bg-[#10131d] hover:text-[#e2e5ed]",
                  collapsed && !isDrawer && "justify-center px-0 py-2.5"
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r-full bg-[#d4a574] shadow-[0_0_8px_rgba(212,165,116,0.6)]" />
                )}
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-colors duration-150",
                    active ? "text-[#d4a574]" : "text-[#6b7285] group-hover:text-[#c5cad6]"
                  )}
                />
                {(!collapsed || isDrawer) && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      ))}

      {/* AI Section: REVORA Copilot */}
      <div className="space-y-0.5 pt-1">
        {(!collapsed || isDrawer) && (
          <div className="px-3 pb-1 text-[9.5px] font-mono uppercase tracking-[0.2em] text-[#555c70] select-none">
            AI
          </div>
        )}
        <Link
          href="/copilot"
          title="REVORA Copilot"
          className={cn(
            "group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4a574]",
            isCopilotActive
              ? "bg-[#181b28] text-white shadow-[0_1px_12px_rgba(212,165,116,0.12)] border border-[#d4a574]/30"
              : "text-[#9ca3b8] hover:bg-[#121522] hover:text-[#f0c89c] hover:border-[#d4a574]/20 border border-transparent",
            collapsed && !isDrawer && "justify-center px-0 py-2.5"
          )}
        >
          {isCopilotActive && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r-full bg-[#d4a574] shadow-[0_0_10px_rgba(212,165,116,0.8)]" />
          )}
          <RevoraMark
            size={20}
            glow={isCopilotActive}
            pulse={isCopilotActive}
            className="shrink-0 transition-transform duration-150 group-hover:scale-110"
          />
          {(!collapsed || isDrawer) && (
            <span className="truncate flex-1 font-semibold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-white via-[#f0c89c] to-[#d4a574]">
              REVORA Copilot
            </span>
          )}
          {(!collapsed || isDrawer) && (
            <span className="rounded bg-[#d4a574]/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#d4a574] border border-[#d4a574]/30">
              AI
            </span>
          )}
        </Link>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-[#08090d] text-revora-text selection:bg-revora-amber/30 selection:text-white">
      {/* 1. Desktop Sidebar Navigation (Width 260px expanded, 68px collapsed) */}
      <aside
        className={cn(
          "sticky top-0 z-30 hidden md:flex h-screen shrink-0 flex-col border-r border-[#161822] bg-[#0b0d13] transition-[width] duration-200 ease-in-out",
          collapsed ? "w-[68px]" : "w-[260px]"
        )}
      >
        {/* Brand Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#161822] px-3.5">
          <Link href="/command-center" className="group flex items-center gap-2.5 focus:outline-none">
            <RevoraMark
              size={26}
              glow
              className="shrink-0 transition-transform duration-200 group-hover:scale-105"
            />
            {!collapsed && (
              <div className="overflow-hidden">
                <div className="text-[13px] font-semibold tracking-[0.24em] text-[#f4f5f8] leading-tight">
                  REVORA
                </div>
                <div className="text-[8.5px] uppercase tracking-[0.2em] text-[#d4a574] font-mono mt-0.5">
                  AI REVENUE RECOVERY
                </div>
              </div>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[#1b1f2d] bg-[#0e1017] text-[#71788e] hover:border-[#2a3045] hover:text-[#d4a574] hover:bg-[#151822] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-revora-amber"
          >
            {collapsed ? (
              <PanelLeft className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" />
            )}
          </button>
        </div>


        {/* Navigation Groupings (Compact, zero subtitles, crisp hierarchy) */}
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-3 scrollbar-none">
          {renderNavLinks(false)}
        </nav>

        {/* Bottom Merchant & Operator Indicator */}
        <div className="border-t border-[#161822] p-3 pb-8 bg-[#090b10]">
          {!collapsed ? (
            <div className="flex items-center justify-between px-1.5 py-1">
              <div className="min-w-0 pr-2">
                <div className="text-[11.5px] font-medium text-[#c5cad8] truncate">
                  {merchant}
                </div>
                <div className="text-[10px] font-mono text-[#6b7285] truncate">
                  {operator}
                </div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                title="Sign out"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#656d82] hover:text-[#e2e6f0] hover:bg-[#151822] transition-colors"
                aria-label="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex justify-center py-1">
              <button
                type="button"
                onClick={handleSignOut}
                title="Sign out"
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#656d82] hover:text-[#e2e6f0] hover:bg-[#151822] transition-colors"
                aria-label="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative flex h-full w-[260px] flex-col border-r border-[#161822] bg-[#0b0d13] z-50">
            {/* Header */}
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#161822] px-4">
              <Link href="/command-center" className="flex items-center gap-2.5">
                <RevoraMark size={26} glow />
                <div>
                  <div className="text-[13px] font-semibold tracking-[0.24em] text-[#f4f5f8] leading-tight">
                    REVORA
                  </div>
                  <div className="text-[8.5px] uppercase tracking-[0.2em] text-[#d4a574] font-mono mt-0.5">
                    AI REVENUE RECOVERY
                  </div>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-[#1b1f2d] bg-[#0e1017] text-[#71788e]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Links */}
            <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4 scrollbar-none">
              {renderNavLinks(true)}
            </nav>

            {/* Footer */}
            <div className="border-t border-[#161822] p-3 bg-[#08090c]">
              <div className="rounded-md border border-[#1b1f2d] bg-[#0b0e15] px-3 py-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#5dbe8a] opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#5dbe8a]" />
                  </span>
                  <span className="font-mono text-[10.5px] font-medium text-[#e2e6f0]">
                    Razorpay Test Mode
                  </span>
                </div>
                <div className="pl-4 text-[10px] text-[#636b80] font-mono mt-0.5 truncate">
                  Demo Environment · {merchant}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  handleSignOut();
                }}
                className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-md border border-[#1e2230] bg-[#0e1017] px-3 py-2 text-xs font-medium text-[#8a92a6] hover:text-[#e2e6f0] hover:border-revora-border transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Return to Cover / Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Top Navbar */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-[#181b26] bg-[#08090d]/92 px-4 sm:px-6 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Hamburger Toggle Button */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex md:hidden h-8 w-8 items-center justify-center rounded-md border border-[#1b1f2d] bg-[#0e1017] text-[#8b92a5] hover:text-white hover:border-[#2a3045] transition-colors"
              aria-label="Open Navigation Menu"
            >
              <PanelLeft className="h-4 w-4" />
            </button>

            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-wide text-revora-text">
                {meta.title}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {/* Unified Status Pill: Single, clean, no clutter */}
            <span
              className={cn(
                "hidden sm:inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-mono",
                systemStatus === "operational"
                  ? "border-[#22c55e]/25 bg-[#22c55e]/10 text-[#4ade80]"
                  : "border-revora-amber/30 bg-revora-amber/10 text-revora-amber"
              )}
            >
              <span className="relative flex h-2 w-2">
                <span
                  className={cn(
                    "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                    systemStatus === "operational" ? "bg-[#22c55e]" : "bg-revora-amber"
                  )}
                />
                <span
                  className={cn(
                    "relative inline-flex h-2 w-2 rounded-full",
                    systemStatus === "operational" ? "bg-[#22c55e]" : "bg-revora-amber"
                  )}
                />
              </span>
              <span>
                {systemStatus === "operational" ? "Operational" : "Degraded"} · {isTestMode ? "Test Mode" : "Live"}
              </span>
            </span>

            {/* Quick Search Palette Trigger */}
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
              }
              className="hidden sm:inline-flex items-center gap-2 rounded-lg border border-[#1e2230] bg-[#121520] px-2.5 py-1.5 text-xs text-revora-muted hover:text-revora-text hover:border-revora-border transition-colors"
            >
              <span>Search</span>
              <kbd className="rounded border border-[#262b3d] bg-[#0e111a] px-1 font-mono text-[9px] text-revora-faint">
                ⌘K
              </kbd>
            </button>

            {/* Ask REVORA Header Trigger */}
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("revora:toggle-copilot"))
              }
              className="inline-flex items-center gap-2 rounded-lg border border-revora-amber/40 bg-revora-amber/10 px-3 py-1.5 text-xs font-medium text-revora-amber hover:bg-revora-amber/20 hover:border-revora-amber transition-all"
            >
              <ChatbotIcon size="xs" glow />
              <span>Ask REVORA</span>
              <kbd className="hidden rounded border border-revora-amber/30 px-1 font-mono text-[9px] text-revora-amber/80 md:inline-block">
                ⌘J
              </kbd>
            </button>

            {/* Sign Out Button */}
            <button
              type="button"
              onClick={handleSignOut}
              title="Sign out & return to cover"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#1e2230] bg-[#10131d] text-[#8a92a6] hover:text-[#e2e6f0] hover:border-revora-border transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* Main Content Body */}
        <main className="relative min-w-0 flex-1 bg-[#08090d]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-96 revora-grid-bg opacity-50" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-64 revora-hero-glow opacity-80" />
          <div className="relative">{children}</div>
        </main>
      </div>
    </div>
  );
}
