import { razorpayRequest } from "@/lib/razorpay/client";

/** Subscriptions — used for recurring failure context (read/inspect). */
export async function fetchSubscription(subscriptionId: string) {
  return razorpayRequest<Record<string, unknown>>("GET", `/subscriptions/${subscriptionId}`);
}
