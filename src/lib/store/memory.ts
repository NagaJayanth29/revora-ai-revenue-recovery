import { createUuid } from "@/lib/utils";
import type {
  ActorType,
  AiRecommendation,
  AuditEvent,
  CopilotMessage,
  CopilotSession,
  Customer,
  Experiment,
  ExperimentAssignment,
  ExperimentResults,
  Merchant,
  Order,
  Payment,
  PolicyDecision,
  PolicyRules,
  RecoveryAction,
  RecoveryOpportunity,
  RecoveryOutcome,
  SystemIncident,
  Transaction,
  User,
  WebhookEvent,
} from "@/lib/domain/types";

/**
 * In-memory + optional file-backed store for Demo Mode.
 * Used when Supabase is not configured so the product is fully runnable locally.
 */
export interface RevoraStore {
  merchants: Merchant[];
  users: User[];
  customers: Customer[];
  orders: Order[];
  payments: Payment[];
  transactions: Transaction[];
  opportunities: RecoveryOpportunity[];
  recommendations: AiRecommendation[];
  policy_rules: PolicyRules[];
  policy_decisions: PolicyDecision[];
  actions: RecoveryAction[];
  webhook_events: WebhookEvent[];
  audit_events: AuditEvent[];
  outcomes: RecoveryOutcome[];
  experiments: Experiment[];
  experiment_assignments: ExperimentAssignment[];
  experiment_results: ExperimentResults[];
  incidents: SystemIncident[];
  copilot_sessions: CopilotSession[];
  copilot_messages: CopilotMessage[];
  simulation_flags: SimulationFlags;
}

export interface SimulationFlags {
  api_timeout: boolean;
  api_timeout_count: number;
  llm_unavailable: boolean;
  model_unavailable: boolean;
  execution_failure: boolean;
  force_already_paid: boolean;
}

function emptyStore(): RevoraStore {
  return {
    merchants: [],
    users: [],
    customers: [],
    orders: [],
    payments: [],
    transactions: [],
    opportunities: [],
    recommendations: [],
    policy_rules: [],
    policy_decisions: [],
    actions: [],
    webhook_events: [],
    audit_events: [],
    outcomes: [],
    experiments: [],
    experiment_assignments: [],
    experiment_results: [],
    incidents: [],
    copilot_sessions: [],
    copilot_messages: [],
    simulation_flags: {
      api_timeout: false,
      api_timeout_count: 0,
      llm_unavailable: false,
      model_unavailable: false,
      execution_failure: false,
      force_already_paid: false,
    },
  };
}

declare global {
  var __revoraStore: RevoraStore | undefined;
}

export function getStore(): RevoraStore {
  if (!globalThis.__revoraStore) {
    globalThis.__revoraStore = emptyStore();
  }
  return globalThis.__revoraStore;
}

export function resetStore(seed?: RevoraStore) {
  globalThis.__revoraStore = seed ?? emptyStore();
  return globalThis.__revoraStore;
}

export function isDemoMode(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return true;
  if (process.env.RAZORPAY_MODE === "demo") return true;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !secret) return true;
  if (keyId.startsWith("rzp_live_")) return true; // refuse live → stay in demo
  return false;
}

export function hasRazorpayCredentials(): boolean {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !secret) return false;
  if (keyId.startsWith("rzp_live_")) return false;
  return true;
}

export function getMerchantId(): string {
  const store = getStore();
  return store.merchants[0]?.id ?? "merchant_demo_revora";
}

export function writeAudit(partial: Omit<AuditEvent, "id" | "created_at"> & { id?: string }): AuditEvent {
  const store = getStore();
  const event: AuditEvent = {
    id: partial.id ?? createUuid(),
    created_at: new Date().toISOString(),
    ...partial,
  };
  store.audit_events.unshift(event);
  return event;
}

export function recordIncident(
  partial: Omit<SystemIncident, "id" | "created_at" | "resolved_at"> & { id?: string }
): SystemIncident {
  const store = getStore();
  const incident: SystemIncident = {
    id: partial.id ?? createUuid(),
    created_at: new Date().toISOString(),
    resolved_at: partial.resolved ? new Date().toISOString() : null,
    ...partial,
  };
  store.incidents.unshift(incident);
  return incident;
}

export function findOpportunity(id: string): RecoveryOpportunity | undefined {
  return getStore().opportunities.find((o) => o.id === id);
}

export function findCustomer(id: string): Customer | undefined {
  return getStore().customers.find((c) => c.id === id);
}

export function findPayment(id: string | null | undefined): Payment | undefined {
  if (!id) return undefined;
  return getStore().payments.find((p) => p.id === id);
}

export function updateOpportunity(
  id: string,
  patch: Partial<RecoveryOpportunity>
): RecoveryOpportunity | undefined {
  const store = getStore();
  const idx = store.opportunities.findIndex((o) => o.id === id);
  if (idx < 0) return undefined;
  store.opportunities[idx] = {
    ...store.opportunities[idx],
    ...patch,
    updated_at: new Date().toISOString(),
  };
  return store.opportunities[idx];
}

export function actorLabel(type: ActorType): string {
  return type;
}
