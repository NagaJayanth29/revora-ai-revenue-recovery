import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseServerConfigured } from "@/lib/supabase/env";
import { isDemoMode } from "@/lib/store/memory";
import { ensureSeeded } from "@/lib/store/seed";
import { createUuid } from "@/lib/utils";
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Determine if we should serve from the in-memory demo store.
 * Always true when NEXT_PUBLIC_DEMO_MODE=true or when Supabase server credentials are missing.
 */
export function shouldUseDemoStore(): boolean {
  return isDemoMode() || !isSupabaseServerConfigured();
}

export function getSupabase() {
  return createServerClient();
}

function getDemoSnapshot(): MerchantSnapshot {
  const store = ensureSeeded();
  return {
    merchant: store.merchants[0] ?? {
      id: "merchant_demo_revora",
      name: "Aurora Commerce",
      slug: DEMO_MERCHANT_SLUG,
      razorpay_key_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    users: store.users,
    customers: store.customers,
    opportunities: store.opportunities,
    recommendations: store.recommendations,
    policy_rules: store.policy_rules,
    policy_decisions: store.policy_decisions,
    actions: store.actions,
    outcomes: store.outcomes,
    audit_events: store.audit_events,
    experiments: store.experiments,
    experiment_assignments: store.experiment_assignments,
    experiment_results: store.experiment_results,
    incidents: store.incidents,
    payments: store.payments,
    orders: store.orders,
    transactions: store.transactions,
    webhook_events: store.webhook_events,
  };
}

export async function getDemoMerchant(): Promise<Merchant> {
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    return (
      store.merchants[0] ?? {
        id: "merchant_demo_revora",
        name: "Aurora Commerce",
        slug: DEMO_MERCHANT_SLUG,
        razorpay_key_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    );
  }
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
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    return store.merchants[0]?.id ?? "merchant_demo_revora";
  }
  const m = await getDemoMerchant();
  return m.id;
}

export async function listOpportunities(merchantId: string): Promise<RecoveryOpportunity[]> {
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    return [...store.opportunities].sort(
      (a, b) => (b.expected_recovery_value ?? 0) - (a.expected_recovery_value ?? 0)
    );
  }
  const { data, error } = await getSupabase()
    .from("recovery_opportunities")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("expected_recovery_value", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as RecoveryOpportunity[];
}

export async function getOpportunity(id: string): Promise<RecoveryOpportunity | null> {
  const cleanId = id?.trim();
  if (!cleanId || cleanId === "undefined" || cleanId === "null") return null;

  const isDemoPattern =
    cleanId.startsWith("opp_demo_") ||
    cleanId.startsWith("corr_demo_") ||
    cleanId === "a0000000-0000-4000-8000-000000000051";

  if (shouldUseDemoStore() || isDemoPattern) {
    const store = ensureSeeded();
    let opp = store.opportunities.find(
      (o) =>
        o.id === cleanId ||
        o.correlation_id === cleanId ||
        o.id.toLowerCase() === cleanId.toLowerCase() ||
        o.correlation_id.toLowerCase() === cleanId.toLowerCase()
    );

    if (!opp && cleanId === "a0000000-0000-4000-8000-000000000051") {
      opp =
        store.opportunities.find((o) => o.id === "opp_demo_48000") ??
        store.opportunities.find((o) => o.correlation_id === HERO_CORRELATION_ID) ??
        store.opportunities.find((o) => o.amount === 48_000_00) ??
        store.opportunities[0];
    }

    if (opp) return opp;
    if (shouldUseDemoStore()) return null;
  }

  try {
    if (UUID_REGEX.test(cleanId)) {
      const { data, error } = await getSupabase()
        .from("recovery_opportunities")
        .select("*")
        .eq("id", cleanId)
        .maybeSingle();
      if (!error && data) return data as RecoveryOpportunity;
    }

    // Fallback: lookup by correlation_id
    const corrId = cleanId === "opp_demo_48000" ? HERO_CORRELATION_ID : cleanId;
    const { data: byCorr, error: corrErr } = await getSupabase()
      .from("recovery_opportunities")
      .select("*")
      .eq("correlation_id", corrId)
      .maybeSingle();
    if (!corrErr && byCorr) return byCorr as RecoveryOpportunity;
  } catch {
    // Supabase query failed or unreachable; fall back to demo store
  }

  // Graceful fallback to demo store for demo identifiers
  const store = ensureSeeded();
  return (
    store.opportunities.find(
      (o) =>
        o.id === cleanId ||
        o.correlation_id === cleanId ||
        o.id.toLowerCase() === cleanId.toLowerCase() ||
        o.correlation_id.toLowerCase() === cleanId.toLowerCase()
    ) ??
    (cleanId === "a0000000-0000-4000-8000-000000000051"
      ? (store.opportunities.find((o) => o.id === "opp_demo_48000") ?? null)
      : null)
  );
}

export async function resolveOpportunityUuid(idOrCorr: string): Promise<string | null> {
  const clean = idOrCorr?.trim();
  if (!clean || clean === "undefined" || clean === "null") return null;
  if (
    shouldUseDemoStore() ||
    clean.startsWith("opp_demo_") ||
    clean.startsWith("corr_demo_") ||
    clean === "a0000000-0000-4000-8000-000000000051"
  ) {
    const opp = await getOpportunity(clean);
    return opp?.id ?? null;
  }
  if (UUID_REGEX.test(clean)) return clean;
  const opp = await getOpportunity(clean);
  return opp?.id ?? null;
}

export async function getHeroOpportunity(
  merchantId: string
): Promise<RecoveryOpportunity | null> {
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    return (
      store.opportunities.find((o) => o.correlation_id === HERO_CORRELATION_ID) ??
      store.opportunities.find((o) => o.amount === 48_000_00) ??
      null
    );
  }
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
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    return store.customers;
  }
  const { data, error } = await getSupabase()
    .from("customers")
    .select("*")
    .eq("merchant_id", merchantId);
  if (error) throw new Error(error.message);
  return (data ?? []) as Customer[];
}

export async function getCustomer(id: string): Promise<Customer | null> {
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    return store.customers.find((c) => c.id === id) ?? null;
  }
  const { data, error } = await getSupabase().from("customers").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Customer) ?? null;
}

export async function getPayment(id: string | null): Promise<Payment | null> {
  if (!id) return null;
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    return store.payments.find((p) => p.id === id) ?? null;
  }
  const { data, error } = await getSupabase().from("payments").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Payment) ?? null;
}

export async function getRecommendationForOpportunity(
  opportunityId: string
): Promise<AiRecommendation | null> {
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    const opp = await getOpportunity(opportunityId);
    const targetId = opp?.id ?? opportunityId;
    const targetCorr = opp?.correlation_id;
    const matchesOpp = (oid: string | null | undefined) =>
      oid === targetId || oid === opportunityId || (Boolean(targetCorr) && oid === targetCorr);
    const list = store.recommendations
      .filter((r) => matchesOpp(r.opportunity_id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list[0] ?? null;
  }
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
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    return store.recommendations;
  }
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
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    store.recommendations.unshift(rec);
    return rec;
  }
  const { data, error } = await getSupabase()
    .from("ai_recommendations")
    .insert(rec)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as AiRecommendation;
}

export async function listPolicyDecisions(opportunityId: string): Promise<PolicyDecision[]> {
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    const opp = await getOpportunity(opportunityId);
    const targetId = opp?.id ?? opportunityId;
    const targetCorr = opp?.correlation_id;
    const matchesOpp = (oid: string | null | undefined) =>
      oid === targetId || oid === opportunityId || (Boolean(targetCorr) && oid === targetCorr);
    return store.policy_decisions
      .filter((p) => matchesOpp(p.opportunity_id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
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
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    const opp = await getOpportunity(opportunityId);
    const targetId = opp?.id ?? opportunityId;
    const targetCorr = opp?.correlation_id;
    const matchesOpp = (oid: string | null | undefined) =>
      oid === targetId || oid === opportunityId || (Boolean(targetCorr) && oid === targetCorr);
    return store.actions
      .filter((a) => matchesOpp(a.opportunity_id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
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
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    const opp = await getOpportunity(opportunityId);
    const targetId = opp?.id ?? opportunityId;
    const targetCorr = opp?.correlation_id;
    const matchesOpp = (oid: string | null | undefined) =>
      oid === targetId || oid === opportunityId || (Boolean(targetCorr) && oid === targetCorr);
    return store.outcomes
      .filter((o) => matchesOpp(o.opportunity_id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
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
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    return store.outcomes;
  }
  const { data, error } = await getSupabase()
    .from("recovery_outcomes")
    .select("*")
    .eq("merchant_id", merchantId);
  if (error) throw new Error(error.message);
  return (data ?? []) as RecoveryOutcome[];
}

export async function listAudit(opportunityId: string): Promise<AuditEvent[]> {
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    const opp = await getOpportunity(opportunityId);
    const targetId = opp?.id ?? opportunityId;
    const targetCorr = opp?.correlation_id;
    const matchesOpp = (oid: string | null | undefined) =>
      oid === targetId || oid === opportunityId || (Boolean(targetCorr) && oid === targetCorr);
    return store.audit_events
      .filter((a) => matchesOpp(a.opportunity_id))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
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
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    return store.audit_events.slice(0, limit);
  }
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
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    return store.policy_rules[0] ?? null;
  }
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
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    const current = store.policy_rules[0] ?? {
      id: "pol_default",
      merchant_id: merchantId,
      max_retry_attempts: 2,
      min_retry_interval_minutes: 60,
      max_auto_action_amount: 50_000_00,
      min_ai_confidence: "MEDIUM",
      max_reminders_per_24h: 1,
      high_risk_requires_approval: true,
      allow_auto_retry: true,
      block_already_paid: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    };
    const updated: PolicyRules = {
      ...current,
      ...patch,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    };
    store.policy_rules[0] = updated;
    return updated;
  }
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
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    return store.experiments;
  }
  const { data, error } = await getSupabase()
    .from("experiments")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Experiment[];
}

export async function getExperiment(id: string): Promise<Experiment | null> {
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    return store.experiments.find((e) => e.id === id) ?? null;
  }
  const { data, error } = await getSupabase().from("experiments").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Experiment) ?? null;
}

export async function listAssignments(experimentId: string): Promise<ExperimentAssignment[]> {
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    return store.experiment_assignments.filter((a) => a.experiment_id === experimentId);
  }
  const { data, error } = await getSupabase()
    .from("experiment_assignments")
    .select("*")
    .eq("experiment_id", experimentId);
  if (error) throw new Error(error.message);
  return (data ?? []) as ExperimentAssignment[];
}

export async function getExperimentResults(experimentId: string): Promise<ExperimentResults | null> {
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    return store.experiment_results.find((r) => r.experiment_id === experimentId) ?? null;
  }
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
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    return store.incidents.slice(0, limit);
  }
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
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    const row: SystemIncident = {
      id: incident.id ?? createUuid(),
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
    store.incidents.unshift(row);
    return row;
  }
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
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    const row: AuditEvent = {
      id: event.id ?? createUuid(),
      merchant_id: event.merchant_id,
      opportunity_id: event.opportunity_id,
      actor: event.actor,
      actor_type: event.actor_type,
      event: event.event,
      previous_state: event.previous_state,
      new_state: event.new_state,
      reason: event.reason,
      ai_recommendation: event.ai_recommendation,
      policy_decision: event.policy_decision,
      execution_result: event.execution_result,
      request_id: event.request_id,
      correlation_id: event.correlation_id,
      metadata: event.metadata,
      created_at: event.created_at ?? new Date().toISOString(),
    };
    store.audit_events.unshift(row);
    return row;
  }
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
  const cleanId = id?.trim();
  if (!cleanId || cleanId === "undefined" || cleanId === "null") {
    throw new Error(`Invalid opportunity id: ${id}`);
  }

  const isDemoPattern =
    cleanId.startsWith("opp_demo_") ||
    cleanId.startsWith("corr_demo_") ||
    cleanId === "a0000000-0000-4000-8000-000000000051";

  if (shouldUseDemoStore() || isDemoPattern) {
    const store = ensureSeeded();
    let idx = store.opportunities.findIndex(
      (o) =>
        o.id === cleanId ||
        o.correlation_id === cleanId ||
        o.id.toLowerCase() === cleanId.toLowerCase() ||
        o.correlation_id.toLowerCase() === cleanId.toLowerCase()
    );
    if (idx < 0 && cleanId === "a0000000-0000-4000-8000-000000000051") {
      idx = store.opportunities.findIndex(
        (o) => o.id === "opp_demo_48000" || o.correlation_id === HERO_CORRELATION_ID
      );
    }
    if (idx >= 0) {
      store.opportunities[idx] = {
        ...store.opportunities[idx],
        ...patch,
        updated_at: new Date().toISOString(),
      };
      return store.opportunities[idx];
    }
    if (shouldUseDemoStore()) {
      throw new Error(`Opportunity not found: ${id}`);
    }
  }

  const targetId = (await resolveOpportunityUuid(cleanId)) ?? cleanId;
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
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    store.actions.unshift(action);
    return action;
  }
  const { data, error } = await getSupabase().from("recovery_actions").insert(action).select("*").single();
  if (error) throw new Error(error.message);
  return data as RecoveryAction;
}

export async function insertOutcome(outcome: RecoveryOutcome): Promise<RecoveryOutcome> {
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    store.outcomes.unshift(outcome);
    return outcome;
  }
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
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    const row = {
      id: createUuid(),
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
    if (!store.webhook_events) store.webhook_events = [];
    const existingIdx = store.webhook_events.findIndex(
      (w) => w.razorpay_event_id === event.razorpay_event_id
    );
    if (existingIdx >= 0) {
      store.webhook_events[existingIdx] = row;
    } else {
      store.webhook_events.unshift(row);
    }
    return;
  }
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
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    store.policy_decisions.unshift(decision);
    return decision;
  }
  const { data, error } = await getSupabase()
    .from("policy_decisions")
    .insert(decision)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as PolicyDecision;
}

export async function getOperator(merchantId: string): Promise<User | null> {
  if (shouldUseDemoStore()) {
    const store = ensureSeeded();
    return store.users[0] ?? null;
  }
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
  if (shouldUseDemoStore()) {
    return getDemoSnapshot();
  }

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
