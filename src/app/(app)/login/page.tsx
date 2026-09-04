"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowRight,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Database,
  Copy,
  Check,
} from "lucide-react";
import { RevoraMark } from "@/components/ui/revora-mark";

const DEMO_EMAIL = "demo@revora.ai";
const DEMO_PASSWORD = "RevoraDemo2026!";

export default function LoginPage() {
  const router = useRouter();

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Handle manual sign in
  const handleSignIn = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setInfoMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanEmail || !cleanPass) {
      setError("Please enter your work email and password.");
      return;
    }

    setLoading(true);

    // Validate credentials or accept demo profile
    setTimeout(() => {
      if (
        (cleanEmail === DEMO_EMAIL && cleanPass === DEMO_PASSWORD) ||
        cleanEmail === "ops@aurora.demo" ||
        cleanEmail.endsWith("@revora.ai")
      ) {
        try {
          localStorage.setItem("revora_authenticated", "true");
          sessionStorage.setItem("revora_session", "active");
        } catch {
          /* ignore */
        }
        router.push("/command-center");
      } else {
        setLoading(false);
        setError("Invalid email or password.");
      }
    }, 350);
  };

  // Handle one-click demo credentials
  const handleUseDemoCredentials = () => {
    setError(null);
    setInfoMessage(null);
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setLoading(true);

    try {
      localStorage.setItem("revora_authenticated", "true");
      sessionStorage.setItem("revora_session", "active");
    } catch {
      /* ignore */
    }

    setTimeout(() => {
      router.push("/command-center");
    }, 350);
  };

  // Copy helpers
  const handleCopy = (text: string, type: "email" | "password") => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      if (type === "email") {
        setCopiedEmail(true);
        setTimeout(() => setCopiedEmail(false), 1500);
      } else {
        setCopiedPassword(true);
        setTimeout(() => setCopiedPassword(false), 1500);
      }
    }
  };

  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden bg-[#07080b] font-sans text-revora-text selection:bg-revora-amber/30 selection:text-white flex flex-col justify-between">
      {/* High-End Fintech Atmospheric & Trajectory Keyframes */}
      <style>{`
        @keyframes revoraAtmosphere {
          0%, 100% {
            opacity: 0.65;
            transform: scale(1.02) translate(0px, 0px);
          }
          50% {
            opacity: 0.85;
            transform: scale(1.04) translate(-2px, -3px);
          }
        }
        .revora-atmosphere-breathe {
          animation: revoraAtmosphere 12s ease-in-out infinite;
        }

        .revora-stream-primary {
          stroke-dasharray: 140 760;
          animation: streamCycle 7s linear infinite;
        }
        .revora-stream-secondary {
          stroke-dasharray: 90 810;
          animation: streamCycle 9s linear infinite;
        }
        @keyframes streamCycle {
          0% {
            stroke-dashoffset: 900;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
      `}</style>

      {/* 1. Global Background Atmosphere */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[#07080b]" />
      </div>

      {/* 2. Responsive Layout: Two-Zone Desktop (~55% / ~45%), Dedicated Stacked Mobile */}
      <div className="relative z-10 grid min-h-[100dvh] w-full grid-cols-1 lg:grid-cols-12">
        {/* ========================================================
            LEFT ZONE (~55%): Visual Atmosphere & Living Recovery Network
            ======================================================== */}
        <div className="relative flex flex-col justify-between p-6 sm:p-10 lg:p-14 lg:col-span-7 xl:col-span-7 overflow-hidden border-b lg:border-b-0 lg:border-r border-[#151822] min-h-[550px] lg:min-h-[100dvh]">
          {/* Earth Horizon Background with subtle organic breathing */}
          <div className="pointer-events-none absolute inset-0 z-0">
            <div className="absolute inset-0 z-0 overflow-hidden">
              <Image
                src="/login-bg.jpg"
                alt="REVORA Global Network"
                fill
                priority
                className="object-cover object-right-bottom translate-y-8 sm:translate-y-12 scale-105 revora-atmosphere-breathe"
              />
            </div>
            {/* Deep obsidian gradient masks for crystal-clear readability */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#07080b] via-[#07080b]/90 to-transparent w-full" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#07080b] via-[#07080b]/80 to-transparent h-2/3" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#07080b] via-[#07080b]/50 to-transparent" />
          </div>

          {/* Top Brand Block */}
          <div className="relative z-20 flex items-center gap-3">
            <RevoraMark size={30} glow />
            <div className="flex flex-col">
              <span className="text-base sm:text-lg font-semibold tracking-[0.24em] text-white leading-none">
                REVORA
              </span>
              <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-[#d4a574] mt-0.5">
                AI REVENUE RECOVERY
              </span>
            </div>
          </div>

          {/* Hero Message (Clean, Confident, World-Class Typography) */}
          <div className="relative z-20 my-6 lg:my-auto max-w-lg">
            <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-medium tracking-tight leading-[1.06]">
              <span className="block text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
                Recover
              </span>
              <span className="block text-[#dfa76f] mt-1 drop-shadow-[0_2px_16px_rgba(212,165,116,0.25)]">
                what&apos;s at risk.
              </span>
            </h1>
            <p className="mt-4 text-sm sm:text-base font-normal leading-relaxed text-[#9ca3b8] drop-shadow-[0_1px_8px_rgba(0,0,0,0.8)]">
              Smarter recoveries.
              <br />
              Stronger revenue.
            </p>

            {/* Subtle, Calm Telemetry Pill */}
            <div className="mt-7 inline-flex items-center gap-2.5 rounded-full border border-white/[0.08] bg-[#0c0e14]/75 px-3.5 py-1.5 backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-60" style={{ animationDuration: "3s" }} />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#22c55e]" />
              </span>
              <span className="font-mono text-[11px] text-[#c5cad8]">
                Autonomous Recovery Engine
              </span>
              <span className="text-[#3e465a]">·</span>
              <span className="font-mono text-[10.5px] text-[#4ade80] font-medium">
                Active
              </span>
            </div>
          </div>

          {/* Living, High-Precision Animated Recovery Arc (GPU Accelerated) */}
          <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 900 650"
              fill="none"
              preserveAspectRatio="xMidYMid slice"
            >
              <defs>
                <linearGradient id="orbitGold" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#dfa76f" stopOpacity="0.05" />
                  <stop offset="40%" stopColor="#f3cf9f" stopOpacity="0.85" />
                  <stop offset="70%" stopColor="#dfa76f" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#5dbe8a" stopOpacity="0.9" />
                </linearGradient>

                <linearGradient id="orbitRail" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#dfa76f" stopOpacity="0.08" />
                  <stop offset="50%" stopColor="#dfa76f" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#5dbe8a" stopOpacity="0.18" />
                </linearGradient>

                <filter id="glowPulse" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>

                <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="8" />
                </filter>
              </defs>

              {/* Guide Track Rail */}
              <path
                d="M 100 520 C 260 480, 380 240, 560 250 C 720 260, 800 380, 920 420"
                stroke="url(#orbitRail)"
                strokeWidth="1.2"
                strokeDasharray="4 8"
              />

              {/* Flowing Animated Stream 1 */}
              <path
                d="M 100 520 C 260 480, 380 240, 560 250 C 720 260, 800 380, 920 420"
                stroke="url(#orbitGold)"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="revora-stream-primary"
                filter="url(#glowPulse)"
              />

              {/* Flowing Animated Stream 2 */}
              <path
                d="M 180 560 C 320 500, 420 300, 600 310 C 740 320, 820 430, 940 460"
                stroke="url(#orbitGold)"
                strokeWidth="1.5"
                strokeLinecap="round"
                className="revora-stream-secondary"
                opacity="0.6"
              />

              {/* Gliding Luminous Comet Bead 1 (Golden Recovery Pulse) */}
              <g>
                <circle r="12" fill="#dfa76f" opacity="0.3" filter="url(#softGlow)">
                  <animateMotion
                    path="M 100 520 C 260 480, 380 240, 560 250 C 720 260, 800 380, 920 420"
                    dur="7s"
                    repeatCount="indefinite"
                  />
                </circle>
                <circle r="4" fill="#ffffff" filter="url(#glowPulse)">
                  <animateMotion
                    path="M 100 520 C 260 480, 380 240, 560 250 C 720 260, 800 380, 920 420"
                    dur="7s"
                    repeatCount="indefinite"
                  />
                </circle>
              </g>

              {/* Gliding Luminous Comet Bead 2 (Emerald Settlement Pulse) */}
              <g>
                <circle r="10" fill="#5dbe8a" opacity="0.35" filter="url(#softGlow)">
                  <animateMotion
                    path="M 100 520 C 260 480, 380 240, 560 250 C 720 260, 800 380, 920 420"
                    dur="7s"
                    begin="3.5s"
                    repeatCount="indefinite"
                  />
                </circle>
                <circle r="3.5" fill="#5dbe8a" filter="url(#glowPulse)">
                  <animateMotion
                    path="M 100 520 C 260 480, 380 240, 560 250 C 720 260, 800 380, 920 420"
                    dur="7s"
                    begin="3.5s"
                    repeatCount="indefinite"
                  />
                </circle>
              </g>
            </svg>
          </div>

          {/* Frosted Glassmorphic Telemetry Nodes (Crisp, High-Precision HTML Overlay) */}
          <div className="pointer-events-none relative z-20 hidden md:block">
            {/* Stage 02: AI Model Decision Apex Card */}
            <div className="absolute bottom-28 right-6 lg:right-12 flex items-center gap-3 rounded-xl border border-[#d4a574]/30 bg-[#0d101a]/85 px-3.5 py-2 backdrop-blur-md shadow-[0_8px_30px_rgba(212,165,116,0.15)] ring-1 ring-[#d4a574]/20">
              <div className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#d4a574]/15 text-[#d4a574] border border-[#d4a574]/30">
                <RevoraMark size={14} glow />
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[#d4a574] font-semibold">
                  <span>AI Decision</span>
                  <span>·</span>
                  <span>87.3% Win Rate</span>
                </div>
                <div className="text-[11px] font-semibold text-white font-mono flex items-center gap-1.5">
                  <span>Timed Retry +4h</span>
                  <span className="text-[#8b92a5]">→</span>
                  <span className="text-[#4ade80]">₹41,925 Payout</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Left Environment Indicator */}
          <div className="relative z-20 flex items-center gap-2 text-xs font-mono text-[#717a8e] pt-4">
            <span className="relative flex h-1.5 w-1.5">
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#5dbe8a]" />
            </span>
            <span>Razorpay Test Mode</span>
          </div>
        </div>

        {/* ========================================================
            RIGHT ZONE (~45%): Minimal, Focused Login Experience
            ======================================================== */}
        <div className="relative flex flex-col items-center justify-center p-6 sm:p-10 lg:p-12 lg:col-span-5 xl:col-span-5 bg-[#07080b]">
          {/* Subtle warm amber ambient lighting behind card */}
          <div
            className="pointer-events-none absolute h-[400px] w-[400px] rounded-full blur-[140px] opacity-15"
            style={{
              background: "radial-gradient(circle, #d4a574 0%, transparent 70%)",
            }}
          />

          {/* Login Card (Clean, calm, minimal fintech container) */}
          <div className="relative w-full max-w-[420px] rounded-2xl border border-[#1b1f2d] bg-[#0c0e15]/90 p-7 sm:p-9 shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            {/* Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                Welcome back
              </h2>
              <p className="mt-1.5 text-xs text-[#80889c]">
                Sign in to continue to REVORA.
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
                {error}
              </div>
            )}

            {/* Info Message (e.g. forgot password click) */}
            {infoMessage && (
              <div className="mb-4 rounded-lg border border-[#d4a574]/30 bg-[#d4a574]/10 p-2.5 text-xs text-[#f0c89c]">
                {infoMessage}
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSignIn} className="space-y-4">
              {/* Work Email */}
              <div>
                <label
                  htmlFor="email-input"
                  className="block text-xs font-normal text-[#8c94a6] mb-1.5"
                >
                  Work email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#555d71]" />
                  <input
                    id="email-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full rounded-lg border border-[#202535] bg-[#0e1118] py-2.5 sm:py-3 pl-10 pr-3 text-sm text-white placeholder-[#454c60] focus:border-[#d4a574] focus:outline-none focus:ring-1 focus:ring-[#d4a574]/40 transition-colors"
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password-input"
                  className="block text-xs font-normal text-[#8c94a6] mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#555d71]" />
                  <input
                    id="password-input"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-lg border border-[#202535] bg-[#0e1118] py-2.5 sm:py-3 pl-10 pr-10 text-sm text-white placeholder-[#454c60] focus:border-[#d4a574] focus:outline-none focus:ring-1 focus:ring-[#d4a574]/40 transition-colors"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5e677c] hover:text-white transition-colors cursor-pointer"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="mt-1.5 text-right">
                  <button
                    type="button"
                    onClick={() =>
                      setInfoMessage("Evaluation mode: Click [Use demo credentials] below to sign in.")
                    }
                    className="text-[11px] text-[#c99a68] hover:text-[#dfb282] transition-colors cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              {/* Sign In Primary Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-gradient-to-r from-[#dfa76f] via-[#ce9457] to-[#ba8145] hover:opacity-95 text-[#090b10] font-semibold py-3 text-sm mt-3 shadow-[0_2px_16px_rgba(212,165,116,0.22)] flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-75"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black border-t-transparent" />
                    <span>Signing in...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span>Sign in</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                )}
              </button>
            </form>

            {/* Subtle Divider */}
            <div className="relative my-6 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#1a1f2b]" />
              </div>
              <span className="relative bg-[#0c0e15] px-2 text-[10px] uppercase font-mono tracking-wider text-[#586074]">
                OR
              </span>
            </div>

            {/* Demo Credentials Box (Matches reference screenshot) */}
            <div className="rounded-xl border border-[#1e2332] bg-[#0e1017] p-4">
              {/* Header */}
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#262c3d] bg-[#121622] text-[#d4a574]">
                  <Database className="h-3.5 w-3.5" />
                </div>
                <span className="text-xs font-medium text-[#d8dce6]">Demo credentials</span>
              </div>

              {/* Credentials details */}
              <div className="space-y-2 text-xs">
                {/* Email row */}
                <div className="flex items-center justify-between">
                  <span className="text-[#687185] font-mono text-[11px]">Email</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-[#e2e7f3]">{DEMO_EMAIL}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(DEMO_EMAIL, "email")}
                      title="Copy email"
                      className="text-[#656d81] hover:text-white transition-colors cursor-pointer"
                    >
                      {copiedEmail ? (
                        <Check className="h-3 w-3 text-[#5dbe8a]" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Password row */}
                <div className="flex items-center justify-between">
                  <span className="text-[#687185] font-mono text-[11px]">Password</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-[#e2e7f3]">{DEMO_PASSWORD}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(DEMO_PASSWORD, "password")}
                      title="Copy password"
                      className="text-[#656d81] hover:text-white transition-colors cursor-pointer"
                    >
                      {copiedPassword ? (
                        <Check className="h-3 w-3 text-[#5dbe8a]" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Use demo credentials button */}
              <button
                type="button"
                onClick={handleUseDemoCredentials}
                disabled={loading}
                className="mt-3.5 w-full rounded-lg border border-[#262c3d] bg-[#121520] hover:bg-[#181d2c] hover:border-[#d4a574]/40 text-[#c8cfdf] hover:text-white text-xs font-medium py-2.5 transition-colors cursor-pointer text-center"
              >
                Use demo credentials
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


