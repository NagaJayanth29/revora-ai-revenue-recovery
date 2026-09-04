import "server-only";

import {
  getStore,
  resetStore,
  type RevoraStore,
} from "@/lib/store/memory";
import {
  loadMerchantSnapshot,
  updateOpportunity as sbUpdateOpportunity,
  insertAudit,
  insertAction,
  insertOutcome,
  insertPolicyDecision,
  insertIncident,
  insertRecommendation,
  updatePolicyRules,
  type MerchantSnapshot,
} from "@/lib/store/supabase-repo";
import type {
  AuditEvent,
  AiRecommendation,
  PolicyRules,
  RecoveryAction,
  RecoveryOpportunity,
  RecoveryOutcome,
  SystemIncident,
} from "@/lib/domain/types";
import { createUuid, isUuid } from "@/lib/utils";

/**
 * Load demo merchant snapshot from Supabase into the in-memory store
 * so existing engines (executor, failure-lab, copilot) keep working,
 * while Supabase remains the durable source of truth.
 */
export async function hydrateFromSupabase(): Promise<RevoraStore> {
  const snap = await loadMerchantSnapshot();
  return applySnapshot(snap);
}

function applySnapshot(snap: MerchantSnapshot): RevoraStore {
  const store = resetStore();
  store.merchants = [snap.merchant];
  store.users = snap.users;
  store.customers = snap.customers;
  store.opportunities = snap.opportunities;
  store.recommendations = snap.recommendations;
  store.policy_rules = snap.policy_rules;
  store.policy_decisions = snap.policy_decisions;
  store.actions = snap.actions;
  store.outcomes = snap.outcomes;
  store.audit_events = snap.audit_events;
  store.experiments = snap.experiments;
  store.experiment_assignments = snap.experiment_assignments;
  store.experiment_results = snap.experiment_results;
  store.incidents = snap.incidents;
  store.payments = snap.payments;
  store.orders = snap.orders;
  store.transactions = snap.transactions;
  if (snap.webhook_events?.length) {
    store.webhook_events = snap.webhook_events;
  }
  return store;
}

function ensureUuid(id: string): string {
  return isUuid(id) ? id : createUuid();
}

/** Persist mutated opportunity + related rows after an in-memory engine run. */
export async function persistOpportunityState(opportunityId: string): Promise<void> {
  const store = getStore();
  const opp = store.opportunities.find((o) => o.id === opportunityId);
  if (!opp) return;

  await sbUpdateOpportunity(opportunityId, {
    status: opp.status,
    risk_level: opp.risk_level,
    recovery_probability: opp.recovery_probability,
    confidence: opp.confidence,
    expected_recovery_value: opp.expected_recovery_value,
    recommended_action: opp.recommended_action,
    policy_status: opp.policy_status,
    policy_reason: opp.policy_reason,
    autonomy_mode: opp.autonomy_mode,
    attempt_count: opp.attempt_count,
    last_action_at: opp.last_action_at,
    next_action_at: opp.next_action_at,
    actual_recovered_amount: opp.actual_recovered_amount,
    incremental_recovered_amount: opp.incremental_recovered_amount,
    baseline_probability: opp.baseline_probability,
    experiment_arm: opp.experiment_arm,
    resolved_at: opp.resolved_at,
    metadata: opp.metadata,
  });

  const recentAudits = store.audit_events
    .filter((a) => a.opportunity_id === opportunityId)
    .slice(0, 8);
  for (const a of recentAudits) {
    await upsertAudit({ ...a, id: ensureUuid(a.id) });
  }

  const recentActions = store.actions.filter((a) => a.opportunity_id === opportunityId).slice(0, 5);
  for (const a of recentActions) {
    const fixed: RecoveryAction = {
      ...a,
      id: ensureUuid(a.id),
      // action_id FK on outcomes needs a persisted uuid — keep memory id aligned when rewritten
    };
    if (fixed.id !== a.id) {
      a.id = fixed.id;
    }
    await upsertAction(fixed);
  }

  const recentOutcomes = store.outcomes.filter((o) => o.opportunity_id === opportunityId).slice(0, 3);
  for (const o of recentOutcomes) {
    let actionId = o.action_id;
    if (actionId && !isUuid(actionId)) {
      const match = store.actions.find(
        (a) => a.opportunity_id === opportunityId && (a.id === actionId || !isUuid(a.id))
      );
      actionId = match && isUuid(match.id) ? match.id : null;
    }
    const fixed: RecoveryOutcome = {
      ...o,
      id: ensureUuid(o.id),
      action_id: actionId && isUuid(actionId) ? actionId : null,
    };
    if (fixed.id !== o.id) o.id = fixed.id;
    o.action_id = fixed.action_id;
    await upsertOutcome(fixed);
  }

  // If opportunity is RECOVERED but no outcome row exists in memory, synthesize one so
  // Actual Recovery stays outcome-backed (canonical verified result).
  if (
    opp.status === "RECOVERED" &&
    opp.actual_recovered_amount > 0 &&
    !store.outcomes.some((o) => o.opportunity_id === opportunityId)
  ) {
    const baselineExpected = Math.round(opp.amount * (opp.baseline_probability ?? 0.2));
    const synthesized: RecoveryOutcome = {
      id: createUuid(),
      merchant_id: opp.merchant_id,
      opportunity_id: opportunityId,
      action_id:
        store.actions.find((a) => a.opportunity_id === opportunityId && isUuid(a.id))?.id ?? null,
      actual_recovered_amount: opp.actual_recovered_amount,
      incremental_recovered_amount:
        opp.incremental_recovered_amount ||
        Math.max(0, opp.actual_recovered_amount - baselineExpected),
      baseline_expected: baselineExpected,
      verified_via: "demo",
      payment_status: "captured",
      created_at: opp.resolved_at ?? new Date().toISOString(),
    };
    store.outcomes.unshift(synthesized);
    await upsertOutcome(synthesized);
  }

  const recentPolicies = store.policy_decisions
    .filter((p) => p.opportunity_id === opportunityId)
    .slice(0, 3);
  for (const p of recentPolicies) {
    try {
      await insertPolicyDecision({ ...p, id: ensureUuid(p.id) });
    } catch {
      // already exists
    }
  }

  const recentRecs = store.recommendations
    .filter((r) => r.opportunity_id === opportunityId)
    .slice(0, 2);
  for (const r of recentRecs) {
    await upsertRecommendation({ ...r, id: ensureUuid(r.id) });
  }
}

async function upsertRecommendation(r: AiRecommendation) {
  try {
    await insertRecommendation(r);
  } catch (e) {
    console.error(
      "[persist] recommendation insert failed",
      r.id,
      e instanceof Error ? e.message : e
    );
  }
}

async function upsertAudit(a: AuditEvent) {
  try {
    await insertAudit(a);
  } catch {
    // duplicate id — ignore
  }
}

async function upsertAction(a: RecoveryAction) {
  try {
    await insertAction(a);
  } catch (e) {
    console.error("[persist] action insert failed", a.id, e instanceof Error ? e.message : e);
  }
}

async function upsertOutcome(o: RecoveryOutcome) {
  try {
    await insertOutcome(o);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Already persisted (common on re-analyze of RECOVERED opportunities).
    if (/duplicate|unique/i.test(msg)) return;
    console.error("[persist] outcome insert failed", o.id, msg);
    throw e instanceof Error ? e : new Error("Failed to persist recovery outcome");
  }
}

export async function persistIncident(incident: SystemIncident) {
  try {
    await insertIncident(incident);
  } catch {
    // ignore
  }
}

export async function persistPolicy(rules: PolicyRules, updatedBy: string) {
  await updatePolicyRules(rules.merchant_id, rules, updatedBy);
}

export async function persistOpportunityPatch(
  id: string,
  patch: Partial<RecoveryOpportunity>
) {
  await sbUpdateOpportunity(id, patch);
}
