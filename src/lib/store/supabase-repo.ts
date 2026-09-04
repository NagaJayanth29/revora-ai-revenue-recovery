import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import type {
  AiRecommendation,
  AuditEvent,
  Customer,
  Experiment,
  ExperimentAssignment,
  ExperimentResults,
  Merchant,
  Payment,
  PolicyDecision,
  PolicyRules,
  RecoveryAction,
  RecoveryOpportunity,
  RecoveryOutcome,
  SystemIncident,
  User,
} from "@/lib/domain/types";

export const DEMO_MERCHANT_SLUG = "aurora-commerce";
export const HERO_CORRELATION_ID = "corr_demo_48000";

export function getSupabase() {
  return createServerClient();
}

export async function getDemoMerchant(): Promise<Merchant> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("merchants")
    .select("*")
    .eq("slug", DEMO_MERCHANT_SLUG)
    .single();
  if (error || !data) throw new Error(`Demo merchant not found: ${error?.message ?? "missing"}`);
  return data as Merchant;
}

export async function getMerchantId(): Promise<string> {
  const m = await getDemoMerchant();
  return m.id;
}

export async function listOpportunities(merchantId: string): Promise<RecoveryOpportunity[]> {
  const { data, error } = await getSupabase()
    .from("recovery_opportunities")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("expected_recovery_value", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as RecoveryOpportunity[];
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getOpportunity(id: string): Promise<RecoveryOpportunity | null> {
  if (UUID_REGEX.test(id)) {
    const { data, error } = await getSupabase()
      .from("recovery_opportunities")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as RecoveryOpportunity;
  }

  // Fallback: lookup by correlation_id
  const { data: byCorr, error: corrErr } = await getSupabase()
    .from("recovery_opportunities")
    .select("*")
    .eq("correlation_id", id)
    .maybeSingle();
  if (corrErr) throw new Error(corrErr.message);
  return (byCorr as RecoveryOpportunity) ?? null;
}

export async function resolveOpportunityUuid(idOrCorr: string): Promise<string | null> {
  if (UUID_REGEX.test(idOrCorr)) return idOrCorr;
  const opp = await getOpportunity(idOrCorr);
  return opp?.id ?? null;
}

export async function getHeroOpportunity(
  merchantId: string
): Promise<RecoveryOpportunity | null> {
  const { data, error } = await getSupabase()
    .from("recovery_opportunities")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("correlation_id", HERO_CORRELATION_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RecoveryOpportunity) ?? null;
}

export async function listCustomers(merchantId: string): Promise<Customer[]> {
  const { data, error } = await getSupabase()
    .from("customers")
    .select("*")
    .eq("merchant_id", merchantId);
  if (error) throw new Error(error.message);
  return (data ?? []) as Customer[];
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const { data, error } = await getSupabase().from("customers").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Customer) ?? null;
}

export async function getPayment(id: string | null): Promise<Payment | null> {
  if (!id) return null;
  const { data, error } = await getSupabase().from("payments").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Payment) ?? null;
}

export async function getRecommendationForOpportunity(
  opportunityId: string
): Promise<AiRecommendation | null> {
  const targetId = await resolveOpportunityUuid(opportunityId);
  if (!targetId) return null;
  const { data, error } = await getSupabase()
    .from("ai_recommendations")
    .select("*")
    .eq("opportunity_id", targetId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AiRecommendation) ?? null;
}

export async function listRecommendations(merchantId: string): Promise<AiRecommendation[]> {
  const { data, error } = await getSupabase()
    .from("ai_recommendations")
    .select("*")
    .eq("merchant_id", merchantId);
  if (error) throw new Error(error.message);
  return (data ?? []) as AiRecommendation[];
}

export async function insertRecommendation(
  rec: AiRecommendation
): Promise<AiRecommendation> {
  const { data, error } = await getSupabase()
    .from("ai_recommendations")
    .insert(rec)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as AiRecommendation;
}

export async function listPolicyDecisions(opportunityId: string): Promise<PolicyDecision[]> {
  const targetId = await resolveOpportunityUuid(opportunityId);
  if (!targetId) return [];
  const { data, error } = await getSupabase()
    .from("policy_decisions")
    .select("*")
    .eq("opportunity_id", targetId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PolicyDecision[];
}

export async function listActions(opportunityId: string): Promise<RecoveryAction[]> {
  const targetId = await resolveOpportunityUuid(opportunityId);
  if (!targetId) return [];
  const { data, error } = await getSupabase()
    .from("recovery_actions")
    .select("*")
    .eq("opportunity_id", targetId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as RecoveryAction[];
}

export async function listOutcomes(opportunityId: string): Promise<RecoveryOutcome[]> {
  const targetId = await resolveOpportunityUuid(opportunityId);
  if (!targetId) return [];
  const { data, error } = await getSupabase()
    .from("recovery_outcomes")
    .select("*")
    .eq("opportunity_id", targetId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as RecoveryOutcome[];
}

export async function listAllOutcomes(merchantId: string): Promise<RecoveryOutcome[]> {
  const { data, error } = await getSupabase()
    .from("recovery_outcomes")
    .select("*")
    .eq("merchant_id", merchantId);
  if (error) throw new Error(error.message);
  return (data ?? []) as RecoveryOutcome[];
}

export async function listAudit(opportunityId: string): Promise<AuditEvent[]> {
  const targetId = await resolveOpportunityUuid(opportunityId);
  if (!targetId) return [];
  const { data, error } = await getSupabase()
    .from("audit_events")
    .select("*")
    .eq("opportunity_id", targetId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditEvent[];
}

export async function listMerchantAudit(merchantId: string, limit = 100): Promise<AuditEvent[]> {
  const { data, error } = await getSupabase()
    .from("audit_events")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditEvent[];
}

export async function getPolicyRules(merchantId: string): Promise<PolicyRules | null> {
  const { data, error } = await getSupabase()
    .from("policy_rules")
    .select("*")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PolicyRules) ?? null;
}

export async function updatePolicyRules(
  merchantId: string,
  patch: Partial<PolicyRules>,
  updatedBy: string
): Promise<PolicyRules> {
  const { data, error } = await getSupabase()
    .from("policy_rules")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
    .eq("merchant_id", merchantId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as PolicyRules;
}

export async function listExperiments(merchantId: string): Promise<Experiment[]> {
  const { data, error } = await getSupabase()
    .from("experiments")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Experiment[];
}

export async function getExperiment(id: string): Promise<Experiment | null> {
  const { data, error } = await getSupabase().from("experiments").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Experiment) ?? null;
}

export async function listAssignments(experimentId: string): Promise<ExperimentAssignment[]> {
  const { data, error } = await getSupabase()
    .from("experiment_assignments")
    .select("*")
    .eq("experiment_id", experimentId);
  if (error) throw new Error(error.message);
  return (data ?? []) as ExperimentAssignment[];
}

export async function getExperimentResults(experimentId: string): Promise<ExperimentResults | null> {
  const { data, error } = await getSupabase()
    .from("experiment_results")
    .select("*")
    .eq("experiment_id", experimentId)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ExperimentResults) ?? null;
}

export async function listIncidents(merchantId: string, limit = 50): Promise<SystemIncident[]> {
  const { data, error } = await getSupabase()
    .from("system_incidents")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as SystemIncident[];
}

export async function insertIncident(
  incident: Omit<SystemIncident, "id" | "created_at" | "resolved_at"> & {
    id?: string;
    created_at?: string;
    resolved_at?: string | null;
  }
): Promise<SystemIncident> {
  const row = {
    id: incident.id,
    merchant_id: incident.merchant_id,
    type: incident.type,
    severity: incident.severity,
    title: incident.title,
    description: incident.description,
    what_broke: incident.what_broke,
    recovery_action: incident.recovery_action,
    final_state: incident.final_state,
    resolved: incident.resolved,
    opportunity_id: incident.opportunity_id,
    correlation_id: incident.correlation_id,
    created_at: incident.created_at ?? new Date().toISOString(),
    resolved_at: incident.resolved_at ?? (incident.resolved ? new Date().toISOString() : null),
  };
  const { data, error } = await getSupabase().from("system_incidents").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return data as SystemIncident;
}

export async function insertAudit(
  event: Omit<AuditEvent, "id" | "created_at"> & { id?: string; created_at?: string }
): Promise<AuditEvent> {
  const row = {
    ...event,
    id: event.id,
    created_at: event.created_at ?? new Date().toISOString(),
  };
  const { data, error } = await getSupabase().from("audit_events").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return data as AuditEvent;
}

export async function updateOpportunity(
  id: string,
  patch: Partial<RecoveryOpportunity>
): Promise<RecoveryOpportunity> {
  const targetId = (await resolveOpportunityUuid(id)) ?? id;
  const { data, error } = await getSupabase()
    .from("recovery_opportunities")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", targetId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as RecoveryOpportunity;
}

export async function insertAction(action: RecoveryAction): Promise<RecoveryAction> {
  const { data, error } = await getSupabase().from("recovery_actions").insert(action).select("*").single();
  if (error) throw new Error(error.message);
  return data as RecoveryAction;
}

export async function insertOutcome(outcome: RecoveryOutcome): Promise<RecoveryOutcome> {
  const { data, error } = await getSupabase()
    .from("recovery_outcomes")
    .insert(outcome)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as RecoveryOutcome;
}

export async function insertWebhookEvent(event: {
  merchant_id?: string | null;
  razorpay_event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  signature_valid: boolean;
  processed: boolean;
  processing_error?: string | null;
}): Promise<void> {
  const row = {
    merchant_id: event.merchant_id ?? null,
    razorpay_event_id: event.razorpay_event_id,
    event_type: event.event_type,
    payload: event.payload,
    signature_valid: event.signature_valid,
    processed: event.processed,
    processing_error: event.processing_error ?? null,
    received_at: new Date().toISOString(),
    processed_at: event.processed ? new Date().toISOString() : null,
  };
  const { error } = await getSupabase()
    .from("webhook_events")
    .upsert(row, { onConflict: "razorpay_event_id" });
  if (error) {
    console.warn("[supabase] insertWebhookEvent error:", error.message);
  }
}

export async function insertPolicyDecision(decision: PolicyDecision): Promise<PolicyDecision> {
  const { data, error } = await getSupabase()
    .from("policy_decisions")
    .insert(decision)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as PolicyDecision;
}

export async function getOperator(merchantId: string): Promise<User | null> {
  const { data, error } = await getSupabase()
    .from("users")
    .select("*")
    .eq("merchant_id", merchantId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as User) ?? null;
}

export async function getOpportunityDetail(id: string) {
  const opportunity = await getOpportunity(id);
  if (!opportunity) return null;
  const oppUuid = opportunity.id;
  const [customer, payment, recommendation, policy_decisions, actions, outcomes, audit] =
    await Promise.all([
      getCustomer(opportunity.customer_id),
      getPayment(opportunity.payment_id),
      getRecommendationForOpportunity(oppUuid),
      listPolicyDecisions(oppUuid),
      listActions(oppUuid),
      listOutcomes(oppUuid),
      listAudit(oppUuid),
    ]);
  return {
    opportunity,
    customer,
    payment,
    recommendation,
    policy_decisions,
    actions,
    outcomes,
    audit,
  };
}

export type MerchantSnapshot = {
  merchant: Merchant;
  users: User[];
  customers: Customer[];
  opportunities: RecoveryOpportunity[];
  recommendations: AiRecommendation[];
  policy_rules: PolicyRules[];
  policy_decisions: PolicyDecision[];
  actions: RecoveryAction[];
  outcomes: RecoveryOutcome[];
  audit_events: AuditEvent[];
  experiments: Experiment[];
  experiment_assignments: ExperimentAssignment[];
  experiment_results: ExperimentResults[];
  incidents: SystemIncident[];
  payments: Payment[];
  orders: import("@/lib/domain/types").Order[];
  transactions: import("@/lib/domain/types").Transaction[];
  webhook_events?: import("@/lib/domain/types").WebhookEvent[];
};

export async function loadMerchantSnapshot(merchantId?: string): Promise<MerchantSnapshot> {
  const merchant = merchantId
    ? ((
        await getSupabase().from("merchants").select("*").eq("id", merchantId).single()
      ).data as Merchant)
    : await getDemoMerchant();
  const mid = merchant.id;

  const [
    users,
    customers,
    opportunities,
    recommendations,
    policy_rules,
    actions,
    outcomes,
    audit_events,
    experiments,
    incidents,
    payments,
  ] = await Promise.all([
    getSupabase().from("users").select("*").eq("merchant_id", mid),
    getSupabase().from("customers").select("*").eq("merchant_id", mid),
    getSupabase()
      .from("recovery_opportunities")
      .select("*")
      .eq("merchant_id", mid)
      .order("created_at", { ascending: false }),
    getSupabase().from("ai_recommendations").select("*").eq("merchant_id", mid),
    getSupabase().from("policy_rules").select("*").eq("merchant_id", mid),
    getSupabase().from("recovery_actions").select("*").eq("merchant_id", mid),
    getSupabase().from("recovery_outcomes").select("*").eq("merchant_id", mid),
    getSupabase()
      .from("audit_events")
      .select("*")
      .eq("merchant_id", mid)
      .order("created_at", { ascending: false }),
    getSupabase().from("experiments").select("*").eq("merchant_id", mid),
    getSupabase()
      .from("system_incidents")
      .select("*")
      .eq("merchant_id", mid)
      .order("created_at", { ascending: false }),
    getSupabase().from("payments").select("*").eq("merchant_id", mid),
  ]);

  const exps = (experiments.data ?? []) as Experiment[];
  const expIds = exps.map((e) => e.id);
  let assignments: ExperimentAssignment[] = [];
  let results: ExperimentResults[] = [];
  if (expIds.length) {
    const [a, r] = await Promise.all([
      getSupabase().from("experiment_assignments").select("*").in("experiment_id", expIds),
      getSupabase().from("experiment_results").select("*").in("experiment_id", expIds),
    ]);
    assignments = (a.data ?? []) as ExperimentAssignment[];
    results = (r.data ?? []) as ExperimentResults[];
  }

  const oppIds = ((opportunities.data ?? []) as RecoveryOpportunity[]).map((o) => o.id);
  let policy_decisions: PolicyDecision[] = [];
  if (oppIds.length) {
    const pd = await getSupabase().from("policy_decisions").select("*").in("opportunity_id", oppIds);
    policy_decisions = (pd.data ?? []) as PolicyDecision[];
  }

  const orders = await getSupabase().from("orders").select("*").eq("merchant_id", mid);
  const transactions = await getSupabase().from("transactions").select("*").eq("merchant_id", mid);
  const webhookEvents = await getSupabase()
    .from("webhook_events")
    .select("*")
    .order("received_at", { ascending: false })
    .limit(100);

  return {
    merchant,
    users: (users.data ?? []) as User[],
    customers: (customers.data ?? []) as Customer[],
    opportunities: (opportunities.data ?? []) as RecoveryOpportunity[],
    recommendations: (recommendations.data ?? []) as AiRecommendation[],
    policy_rules: (policy_rules.data ?? []) as PolicyRules[],
    policy_decisions,
    actions: (actions.data ?? []) as RecoveryAction[],
    outcomes: (outcomes.data ?? []) as RecoveryOutcome[],
    audit_events: (audit_events.data ?? []) as AuditEvent[],
    experiments: exps,
    experiment_assignments: assignments,
    experiment_results: results,
    incidents: (incidents.data ?? []) as SystemIncident[],
    payments: (payments.data ?? []) as Payment[],
    orders: (orders.data ?? []) as import("@/lib/domain/types").Order[],
    transactions: (transactions.data ?? []) as import("@/lib/domain/types").Transaction[],
    webhook_events: (webhookEvents.data ?? []) as import("@/lib/domain/types").WebhookEvent[],
  };
}
