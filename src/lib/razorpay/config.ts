import "server-only";

/**
 * Razorpay TEST MODE configuration — never accept live credentials.
 */

export type RazorpayRuntimeMode = "demo" | "test" | "unavailable";

export class RazorpayConfigError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "RazorpayConfigError";
    this.code = code;
  }
}

export function getConfiguredRazorpayMode(): "test" | "demo" {
  const mode = (process.env.RAZORPAY_MODE || "test").toLowerCase();
  if (mode === "demo") return "demo";
  return "test";
}

/** Reject rzp_live_ keys whenever TEST MODE is required. */
export function assertTestModeCredentials(keyId: string): void {
  if (keyId.startsWith("rzp_live_")) {
    throw new RazorpayConfigError(
      "Live Razorpay credentials (rzp_live_) are refused. Use TEST MODE keys (rzp_test_) only.",
      "LIVE_CREDENTIALS_REFUSED"
    );
  }
}

export function getRazorpayKeyId(): string | undefined {
  return process.env.RAZORPAY_KEY_ID || undefined;
}

export function getRazorpayKeySecret(): string | undefined {
  return process.env.RAZORPAY_KEY_SECRET || undefined;
}

export function getRazorpayWebhookSecret(): string | undefined {
  return process.env.RAZORPAY_WEBHOOK_SECRET || undefined;
}

export function hasUsableRazorpayTestCredentials(): boolean {
  const keyId = getRazorpayKeyId();
  const secret = getRazorpayKeySecret();
  if (!keyId || !secret) return false;
  if (keyId.startsWith("rzp_live_")) return false;
  return true;
}

/**
 * Effective execution environment for UI / dashboards.
 * Never reports "LIVE".
 */
export function resolveRazorpayRuntimeMode(): RazorpayRuntimeMode {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return "demo";
  if (!hasUsableRazorpayTestCredentials()) return "demo";
  if (getConfiguredRazorpayMode() === "demo") return "demo";
  return "test";
}

export function razorpayEnvironmentLabel(): "DEMO MODE" | "RAZORPAY TEST MODE" {
  return resolveRazorpayRuntimeMode() === "test" ? "RAZORPAY TEST MODE" : "DEMO MODE";
}
