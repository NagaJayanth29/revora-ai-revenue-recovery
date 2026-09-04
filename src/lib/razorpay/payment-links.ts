import { razorpayRequest } from "@/lib/razorpay/client";

/**
 * Payment Links — supported recovery workflow.
 * Official: POST /v1/payment_links
 * This creates a link the customer can use to complete payment.
 * It does NOT silently charge a saved instrument.
 */
export interface RazorpayPaymentLink {
  id: string;
  short_url: string;
  amount: number;
  currency: string;
  status: string;
  reference_id: string | null;
}

export async function createPaymentLink(input: {
  amount: number;
  currency?: string;
  description?: string;
  customer?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  reference_id?: string;
  callback_url?: string;
}): Promise<RazorpayPaymentLink> {
  return razorpayRequest<RazorpayPaymentLink>("POST", "/payment_links", {
    amount: input.amount,
    currency: input.currency ?? "INR",
    description: input.description,
    customer: input.customer,
    notes: input.notes,
    reference_id: input.reference_id,
    callback_url: input.callback_url,
    notify: {
      sms: false,
      email: true,
    },
  });
}

export async function fetchPaymentLink(id: string): Promise<RazorpayPaymentLink> {
  return razorpayRequest<RazorpayPaymentLink>("GET", `/payment_links/${id}`);
}
