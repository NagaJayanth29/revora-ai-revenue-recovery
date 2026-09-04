/**
 * Razorpay Test Mode client.
 * Uses official Basic Auth against https://api.razorpay.com/v1
 * Never invents endpoints — only documented resources.
 * Never accepts rzp_live_ credentials.
 */

import "server-only";

import {
  assertTestModeCredentials,
  getRazorpayKeyId,
  getRazorpayKeySecret,
} from "@/lib/razorpay/config";

export class RazorpayError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "RazorpayError";
    this.status = status;
    this.code = code;
  }
}

export function getRazorpayConfig() {
  const keyId = getRazorpayKeyId();
  const keySecret = getRazorpayKeySecret();
  if (!keyId || !keySecret) {
    throw new RazorpayError("Razorpay credentials not configured", 500, "CREDENTIALS_MISSING");
  }
  assertTestModeCredentials(keyId);
  return { keyId, keySecret, baseUrl: "https://api.razorpay.com/v1", mode: "test" as const };
}

export async function razorpayRequest<T>(
  method: "GET" | "POST" | "PATCH" | "PUT",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const { keyId, keySecret, baseUrl } = getRazorpayConfig();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  // Safe metadata only — never log secrets or full bodies with PII.
  console.info("[razorpay]", method, path);

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.info("[razorpay]", method, path, "status", res.status);
    const message =
      (data as { error?: { description?: string } })?.error?.description ||
      `Razorpay API error ${res.status}`;
    throw new RazorpayError(
      message,
      res.status,
      (data as { error?: { code?: string } })?.error?.code
    );
  }
  return data as T;
}
