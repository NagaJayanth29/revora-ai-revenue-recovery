/**
 * Legacy metrics entrypoints — prefer @/lib/analytics/from-snapshot with Supabase snapshots.
 * Kept so transitional imports keep compiling during the overhaul.
 */
export {
  summarizeFromSnapshot as getDashboardSummaryFromSnap,
  leakageFromOpportunities as getLeakageFromOpps,
  pulseFromData,
  metricsFromOpportunities,
  experimentLiftFromSnapshot,
  systemHealthFromFlags,
  OPEN_STATUSES,
} from "@/lib/analytics/from-snapshot";

import { ensureSeeded, computeExperimentResults } from "@/lib/store/seed";
import { getStore, isDemoMode, hasRazorpayCredentials } from "@/lib/store/memory";
import { MODEL_DATA_LABEL } from "@/lib/recovery/probability-model";
import {
  leakageFromOpportunities,
  metricsFromOpportunities,
  OPEN_STATUSES,
  pulseFromData,
  summarizeFromSnapshot,
  systemHealthFromFlags,
} from "@/lib/analytics/from-snapshot";
import type { DashboardSummary, LeakageBucket } from "@/lib/domain/types";

/** Memory-store fallback (tests / offline). Production APIs use Supabase snapshots. */
export function getDashboardSummary(): DashboardSummary {
  ensureSeeded();
  const store = getStore();
  return summarizeFromSnapshot({
    merchant: store.merchants[0]!,
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
  });
}

export function getLeakageAnalytics(): LeakageBucket[] {
  ensureSeeded();
  return leakageFromOpportunities(getStore().opportunities);
}

export function getRecoveryPulse() {
  ensureSeeded();
  const store = getStore();
  return pulseFromData(store.opportunities, store.actions, 7).map((p) => ({
    date: p.date,
    risk: p.risk,
    activity: p.expected,
    recovered: p.recovered,
  }));
}

export function getMetrics() {
  ensureSeeded();
  return metricsFromOpportunities(getStore().opportunities);
}

export function getExperimentView(experimentId?: string) {
  ensureSeeded();
  const store = getStore();
  const experiment = experimentId
    ? store.experiments.find((e) => e.id === experimentId)
    : store.experiments[0];
  if (!experiment) return null;
  const results = computeExperimentResults(store, experiment.id);
  return { experiment, results, data_label: MODEL_DATA_LABEL };
}

export function getSystemHealth() {
  ensureSeeded();
  const flags = getStore().simulation_flags;
  return systemHealthFromFlags(flags.llm_unavailable || flags.model_unavailable);
}

void OPEN_STATUSES;
void isDemoMode;
void hasRazorpayCredentials;
