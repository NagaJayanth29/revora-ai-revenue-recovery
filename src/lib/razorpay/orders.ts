import { razorpayRequest } from "@/lib/razorpay/client";

export interface RazorpayOrder {
  id: string;
  entity: "order";
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
  created_at: number;
}

/** POST /v1/orders — create order (prerequisite for checkout / new payment attempt) */
export async function createOrder(input: {
  amount: number;
  currency?: string;
  receipt?: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  return razorpayRequest<RazorpayOrder>("POST", "/orders", {
    amount: input.amount,
    currency: input.currency ?? "INR",
    receipt: input.receipt,
    notes: input.notes,
  });
}

/** GET /v1/orders/:id */
export async function fetchOrder(orderId: string): Promise<RazorpayOrder> {
  return razorpayRequest<RazorpayOrder>("GET", `/orders/${orderId}`);
}
