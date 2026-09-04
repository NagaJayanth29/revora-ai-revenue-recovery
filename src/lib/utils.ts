import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ConfidenceLevel, InterventionType, OpportunityStatus, PolicyDecisionType } from "@/lib/domain/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Amounts stored in paise (Razorpay convention). Display in rupees. */
export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: rupees % 1 === 0 ? 0 : 2,
  }).format(rupees);
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function interventionLabel(action: InterventionType): string {
  const labels: Record<InterventionType, string> = {
    DO_NOTHING: "Do nothing",
    RETRY_NOW: "Retry now",
    RETRY_LATER: "Retry later",
    PAYMENT_LINK: "Payment link",
    REMINDER: "Reminder",
    HUMAN_ESCALATION: "Human escalation",
  };
  return labels[action];
}

export function statusLabel(status: OpportunityStatus): string {
  return status.replace(/_/g, " ");
}

export function confidenceColor(c: ConfidenceLevel | null): string {
  if (c === "HIGH") return "text-revora-success";
  if (c === "MEDIUM") return "text-revora-amber";
  if (c === "LOW") return "text-revora-danger";
  return "text-revora-muted";
}

export function policyColor(p: PolicyDecisionType | null): string {
  if (p === "SAFE_TO_EXECUTE") return "text-revora-success";
  if (p === "REQUIRES_APPROVAL") return "text-revora-amber";
  if (p === "BLOCKED") return "text-revora-danger";
  return "text-revora-muted";
}

export function statusTone(status: OpportunityStatus): "success" | "danger" | "amber" | "info" | "muted" {
  switch (status) {
    case "RECOVERED":
      return "success";
    case "FAILED":
    case "BLOCKED":
    case "CANCELLED":
      return "danger";
    case "AWAITING_APPROVAL":
    case "ESCALATED":
    case "EXPIRED":
      return "amber";
    case "EXECUTING":
    case "WAITING_FOR_OUTCOME":
    case "ANALYZING":
      return "info";
    default:
      return "muted";
  }
}

export function createId(prefix?: string): string {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

/** UUID suitable for Supabase uuid primary keys (no prefix). */
export function createUuid(): string {
  return crypto.randomUUID();
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
