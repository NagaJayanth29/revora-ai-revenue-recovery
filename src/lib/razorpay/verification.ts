import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify Razorpay webhook signature.
 * Official: HMAC SHA256 of webhook body with webhook secret.
 * Header: X-Razorpay-Signature
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret = process.env.RAZORPAY_WEBHOOK_SECRET
): boolean {
  if (!signature) return false;

  // Local/demo fixtures only — never skips HMAC when a real signature is supplied.
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && signature === "demo_signature") {
    return true;
  }

  if (!secret) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function signDemoWebhook(rawBody: string): string {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "demo_webhook_secret";
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}
