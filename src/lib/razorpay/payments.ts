import { razorpayRequest } from "@/lib/razorpay/client";

export interface RazorpayPayment {
  id: string;
  entity: "payment";
  amount: number;
  currency: string;
  status: string;
  order_id: string | null;
  method: string | null;
  email: string | null;
  contact: string | null;
  error_code: string | null;
  error_description: string | null;
  error_reason: string | null;
  created_at: number;
}

/** GET /v1/payments/:id — fetch payment (does NOT collect a new payment) */
export async function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  return razorpayRequest<RazorpayPayment>("GET", `/payments/${paymentId}`);
}

/** GET /v1/payments — list payments */
export async function listPayments(params?: { count?: number; skip?: number }) {
  const q = new URLSearchParams();
  if (params?.count) q.set("count", String(params.count));
  if (params?.skip) q.set("skip", String(params.skip));
  const qs = q.toString();
  return razorpayRequest<{ entity: string; count: number; items: RazorpayPayment[] }>(
    "GET",
    `/payments${qs ? `?${qs}` : ""}`
  );
}
