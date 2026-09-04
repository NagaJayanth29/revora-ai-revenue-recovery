/**
 * Train REVORA recovery probability logistic regression.
 *
 * Dataset: DEMO / SYNTHETIC — not Razorpay production statistics.
 * Outputs:
 *   - ml/models/recovery_probability_v0.1-demo.json
 *   - src/lib/ai/artifacts/recovery_probability_v0.1-demo.json
 *   - ml/models/training_summary.json
 *
 * Run: npx tsx scripts/train-recovery-model.ts
 */

import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createHash, randomUUID } from "crypto";

const MODEL_NAME = "recovery_probability";
const MODEL_VERSION = "v0.1-demo";
const DATA_LABEL = "Demo evaluation — synthetic data (DEMO / SYNTHETIC)";
const SEED = 42;

const FEATURE_NAMES = [
  "log_amount",
  "attempt_count",
  "customer_success_rate",
  "customer_failure_count_norm",
  "lifetime_paid_log",
  "avg_payment_log",
  "hours_since_failure_norm",
  "previous_recovery_rate",
  "source_failed_payment",
  "source_abandonment",
  "source_recurring",
  "insufficient_funds",
  "bank_decline",
  "network_error",
  "auth_failed",
  "expired_card",
  "gateway_timeout",
  "customer_cancelled",
  "method_upi",
  "method_card",
  "method_netbanking",
  "returning_customer",
  "intervention_do_nothing",
  "intervention_retry_now",
  "intervention_retry_later",
  "intervention_payment_link",
  "intervention_reminder",
  "intervention_human",
] as const;

type FeatureName = (typeof FEATURE_NAMES)[number];

/** Mulberry32 PRNG — deterministic synthetic generation. */
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sigmoid(z: number): number {
  if (z > 20) return 1;
  if (z < -20) return 0;
  return 1 / (1 + Math.exp(-z));
}

/** Generative process for synthetic labels (documented, not claimed as production). */
const GEN_WEIGHTS: Record<string, number> = {
  bias: -0.9,
  log_amount: 0.1,
  attempt_count: -0.42,
  customer_success_rate: 1.65,
  customer_failure_count_norm: -0.4,
  lifetime_paid_log: 0.08,
  avg_payment_log: 0.05,
  hours_since_failure_norm: 0.12,
  previous_recovery_rate: 0.35,
  source_failed_payment: 0.1,
  source_abandonment: -0.15,
  source_recurring: -0.25,
  insufficient_funds: 0.5,
  bank_decline: -0.3,
  network_error: 0.35,
  auth_failed: -0.45,
  expired_card: -0.85,
  gateway_timeout: 0.3,
  customer_cancelled: -1.1,
  method_upi: 0.22,
  method_card: 0.08,
  method_netbanking: -0.08,
  returning_customer: 0.55,
  intervention_do_nothing: -1.0,
  intervention_retry_now: -0.15,
  intervention_retry_later: 0.7,
  intervention_payment_link: 0.38,
  intervention_reminder: 0.05,
  intervention_human: 0.18,
};

const INTERVENTIONS = [
  "intervention_do_nothing",
  "intervention_retry_now",
  "intervention_retry_later",
  "intervention_payment_link",
  "intervention_reminder",
  "intervention_human",
] as const;

interface Row {
  x: number[];
  y: number;
}

function synthesize(n: number, rng: () => number): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const amountRupees = Math.exp(8.5 + rng() * 2.5); // ~₹5k–₹150k-ish
    const attempt = Math.floor(rng() * 5);
    const successRate = rng() < 0.35 ? 0.2 + rng() * 0.35 : 0.55 + rng() * 0.4;
    const failureNorm = Math.min(1, (1 - successRate) * (0.5 + rng()));
    const lifetime = amountRupees * (2 + rng() * 12);
    const avgPay = lifetime * (0.08 + rng() * 0.2);
    const hoursNorm = rng();
    const insufficient = rng() < 0.32 ? 1 : 0;
    const bank = !insufficient && rng() < 0.15 ? 1 : 0;
    const network = !insufficient && !bank && rng() < 0.12 ? 1 : 0;
    const auth = !insufficient && !bank && !network && rng() < 0.1 ? 1 : 0;
    const expired = !insufficient && !bank && !network && !auth && rng() < 0.08 ? 1 : 0;
    const gateway = !insufficient && !bank && !network && !auth && !expired && rng() < 0.1 ? 1 : 0;
    const cancelled =
      !insufficient && !bank && !network && !auth && !expired && !gateway && rng() < 0.08
        ? 1
        : 0;
    const methodRoll = rng();
    const upi = methodRoll < 0.55 ? 1 : 0;
    const card = methodRoll >= 0.55 && methodRoll < 0.85 ? 1 : 0;
    const net = methodRoll >= 0.85 ? 1 : 0;
    const returning = successRate >= 0.55 ? 1 : 0;
    const sourceRoll = rng();
    const srcFailed = sourceRoll < 0.55 ? 1 : 0;
    const srcAbandon = sourceRoll >= 0.55 && sourceRoll < 0.75 ? 1 : 0;
    const srcRecurring = sourceRoll >= 0.75 ? 1 : 0;
    const intervention = INTERVENTIONS[Math.floor(rng() * INTERVENTIONS.length)];

    const byName: Record<string, number> = {
      log_amount: Math.log1p(amountRupees),
      attempt_count: attempt,
      customer_success_rate: successRate,
      customer_failure_count_norm: failureNorm,
      lifetime_paid_log: Math.log1p(lifetime),
      avg_payment_log: Math.log1p(avgPay),
      hours_since_failure_norm: hoursNorm,
      previous_recovery_rate: successRate,
      source_failed_payment: srcFailed,
      source_abandonment: srcAbandon,
      source_recurring: srcRecurring,
      insufficient_funds: insufficient,
      bank_decline: bank,
      network_error: network,
      auth_failed: auth,
      expired_card: expired,
      gateway_timeout: gateway,
      customer_cancelled: cancelled,
      method_upi: upi,
      method_card: card,
      method_netbanking: net,
      returning_customer: returning,
      intervention_do_nothing: 0,
      intervention_retry_now: 0,
      intervention_retry_later: 0,
      intervention_payment_link: 0,
      intervention_reminder: 0,
      intervention_human: 0,
    };
    byName[intervention] = 1;

    const x = FEATURE_NAMES.map((n) => byName[n]);
    let logit = GEN_WEIGHTS.bias;
    for (let j = 0; j < FEATURE_NAMES.length; j++) {
      logit += (GEN_WEIGHTS[FEATURE_NAMES[j]] ?? 0) * x[j];
    }
    logit += (rng() - 0.5) * 0.7; // noise
    const p = sigmoid(logit);
    const y = rng() < p ? 1 : 0;
    rows.push({ x, y });
  }
  return rows;
}

/** Include a few narrative demo rows so hero-like profiles appear in training. */
function narrativeRows(): Row[] {
  const heroBase = {
    log_amount: Math.log1p(48000),
    attempt_count: 1,
    customer_success_rate: 7 / 8,
    customer_failure_count_norm: Math.min(1, 1 / 10),
    lifetime_paid_log: Math.log1p(312000),
    avg_payment_log: Math.log1p(312000 / 7),
    hours_since_failure_norm: 2 / 72,
    previous_recovery_rate: 7 / 8,
    source_failed_payment: 1,
    source_abandonment: 0,
    source_recurring: 0,
    insufficient_funds: 1,
    bank_decline: 0,
    network_error: 0,
    auth_failed: 0,
    expired_card: 0,
    gateway_timeout: 0,
    customer_cancelled: 0,
    method_upi: 1,
    method_card: 0,
    method_netbanking: 0,
    returning_customer: 1,
  };

  const mk = (intervention: FeatureName, y: number): Row => {
    const byName: Record<string, number> = {
      ...heroBase,
      intervention_do_nothing: 0,
      intervention_retry_now: 0,
      intervention_retry_later: 0,
      intervention_payment_link: 0,
      intervention_reminder: 0,
      intervention_human: 0,
      [intervention]: 1,
    };
    return { x: FEATURE_NAMES.map((n) => byName[n] ?? 0), y };
  };

  const rows: Row[] = [];
  // Mild narrative prior — insufficient-funds + delayed retry tends to recover for returning customers
  for (let i = 0; i < 18; i++) rows.push(mk("intervention_retry_later", i < 14 ? 1 : 0));
  for (let i = 0; i < 12; i++) rows.push(mk("intervention_retry_now", i < 5 ? 1 : 0));
  for (let i = 0; i < 16; i++) rows.push(mk("intervention_do_nothing", i < 3 ? 1 : 0));
  for (let i = 0; i < 10; i++) rows.push(mk("intervention_payment_link", i < 6 ? 1 : 0));
  for (let i = 0; i < 8; i++) rows.push(mk("intervention_reminder", i < 3 ? 1 : 0));
  return rows;
}

function fitLogistic(
  rows: Row[],
  opts: { lr: number; epochs: number; l2: number }
): { bias: number; weights: number[] } {
  const d = FEATURE_NAMES.length;
  let bias = 0;
  const w = new Array(d).fill(0);
  const n = rows.length;
  const nPos = rows.reduce((s, r) => s + r.y, 0) || 1;
  const nNeg = n - nPos || 1;

  for (let epoch = 0; epoch < opts.epochs; epoch++) {
    let gBias = 0;
    const gW = new Array(d).fill(0);
    for (const row of rows) {
      let z = bias;
      for (let j = 0; j < d; j++) z += w[j] * row.x[j];
      const p = sigmoid(z);
      const cw = row.y === 1 ? n / (2 * nPos) : n / (2 * nNeg);
      const err = cw * (p - row.y);
      gBias += err;
      for (let j = 0; j < d; j++) gW[j] += err * row.x[j];
    }
    bias -= (opts.lr / n) * (gBias + opts.l2 * bias);
    for (let j = 0; j < d; j++) {
      w[j] -= (opts.lr / n) * (gW[j] + opts.l2 * w[j]);
    }
  }
  return { bias, weights: w };
}

function standardize(train: Row[], test: Row[]) {
  const d = FEATURE_NAMES.length;
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(1);
  for (const row of train) {
    for (let j = 0; j < d; j++) mean[j] += row.x[j];
  }
  for (let j = 0; j < d; j++) mean[j] /= train.length || 1;
  for (const row of train) {
    for (let j = 0; j < d; j++) {
      const dlt = row.x[j] - mean[j];
      std[j] += dlt * dlt;
    }
  }
  for (let j = 0; j < d; j++) {
    std[j] = Math.sqrt(std[j] / (train.length || 1));
    if (std[j] < 1e-6) std[j] = 1;
  }
  const apply = (rows: Row[]) =>
    rows.map((r) => ({
      y: r.y,
      x: r.x.map((v, j) => (v - mean[j]) / std[j]),
    }));
  return { mean, std, train: apply(train), test: apply(test) };
}

function predictProba(bias: number, weights: number[], x: number[]): number {
  let z = bias;
  for (let j = 0; j < weights.length; j++) z += weights[j] * x[j];
  return sigmoid(z);
}

function evaluate(bias: number, weights: number[], rows: Row[]) {
  let brier = 0;
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  const pairs: Array<{ y: number; p: number }> = [];
  for (const row of rows) {
    const p = predictProba(bias, weights, row.x);
    pairs.push({ y: row.y, p });
    brier += (p - row.y) ** 2;
    const pred = p >= 0.5 ? 1 : 0;
    if (pred === 1 && row.y === 1) tp++;
    else if (pred === 1 && row.y === 0) fp++;
    else if (pred === 0 && row.y === 0) tn++;
    else fn++;
  }
  const n = rows.length || 1;
  const accuracy = (tp + tn) / n;
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);

  // Mann-Whitney AUC
  const pos = pairs.filter((r) => r.y === 1).map((r) => r.p);
  const neg = pairs.filter((r) => r.y === 0).map((r) => r.p);
  let auc = 0.5;
  if (pos.length && neg.length) {
    let better = 0;
    for (const p of pos) for (const n of neg) {
      if (p > n) better += 1;
      else if (p === n) better += 0.5;
    }
    auc = better / (pos.length * neg.length);
  }

  // Calibration buckets
  const buckets = [0.1, 0.3, 0.5, 0.7, 0.9].map((center) => {
    const lo = center - 0.1;
    const hi = center + 0.1;
    const group = pairs.filter((r) => r.p >= lo && r.p < hi);
    const meanPred =
      group.length === 0 ? 0 : group.reduce((s, r) => s + r.p, 0) / group.length;
    const meanActual =
      group.length === 0 ? 0 : group.reduce((s, r) => s + r.y, 0) / group.length;
    return { predicted_center: center, n: group.length, mean_predicted: meanPred, mean_actual: meanActual };
  });

  return {
    brier: brier / n,
    accuracy,
    precision,
    recall,
    roc_auc: auc,
    positive_rate: pairs.reduce((s, r) => s + r.y, 0) / n,
    calibration: buckets,
    data_label: DATA_LABEL,
    note: "Metrics are on synthetic holdout only — not production-grade.",
  };
}

function main() {
  const rng = mulberry32(SEED);
  const synthetic = synthesize(8000, rng);
  const narrative = narrativeRows();
  const all = [...synthetic, ...narrative];

  // Shuffle deterministically
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  const split = Math.floor(all.length * 0.8);
  const rawTrain = all.slice(0, split);
  const rawTest = all.slice(split);
  const { mean, std, train, test } = standardize(rawTrain, rawTest);

  const { bias, weights } = fitLogistic(train, { lr: 0.5, epochs: 250, l2: 0.05 });
  const metrics = evaluate(bias, weights, test);

  const weightMap: Record<string, number> = { bias };
  FEATURE_NAMES.forEach((n, i) => {
    weightMap[n] = weights[i];
  });

  const artifact = {
    model_name: MODEL_NAME,
    model_version: MODEL_VERSION,
    data_label: DATA_LABEL,
    trained_at: new Date().toISOString(),
    training_seed: SEED,
    feature_names: [...FEATURE_NAMES],
    feature_mean: mean,
    feature_std: std,
    weights: weightMap,
    clamp: { min: 0.02, max: 0.95 },
    metrics,
    n_train: train.length,
    n_test: test.length,
    notes:
      "Logistic regression fit on DEMO/SYNTHETIC recovery trajectories with z-scored features. Not Razorpay production data. Do not claim production-grade accuracy.",
  };

  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const outPaths = [
    join(root, "ml", "models", "recovery_probability_v0.1-demo.json"),
    join(root, "src", "lib", "ai", "artifacts", "recovery_probability_v0.1-demo.json"),
    join(root, "ml", "models", "training_summary.json"),
  ];

  mkdirSync(join(root, "ml", "models"), { recursive: true });
  mkdirSync(join(root, "src", "lib", "ai", "artifacts"), { recursive: true });

  const artifactJson = JSON.stringify(artifact, null, 2);
  writeFileSync(outPaths[0], artifactJson);
  writeFileSync(outPaths[1], artifactJson);
  writeFileSync(
    outPaths[2],
    JSON.stringify(
      {
        model_name: MODEL_NAME,
        model_version: MODEL_VERSION,
        data_label: DATA_LABEL,
        n_train: train.length,
        n_test: test.length,
        metrics,
        artifact_sha256: createHash("sha256").update(artifactJson).digest("hex"),
        run_id: randomUUID(),
      },
      null,
      2
    )
  );

  // Hero sanity print
  const heroFeatures: Record<string, number> = {
    log_amount: Math.log1p(48000),
    attempt_count: 1,
    customer_success_rate: 7 / 8,
    customer_failure_count_norm: 0.1,
    lifetime_paid_log: Math.log1p(312000),
    avg_payment_log: Math.log1p(312000 / 7),
    hours_since_failure_norm: 2 / 72,
    previous_recovery_rate: 7 / 8,
    source_failed_payment: 1,
    source_abandonment: 0,
    source_recurring: 0,
    insufficient_funds: 1,
    bank_decline: 0,
    network_error: 0,
    auth_failed: 0,
    expired_card: 0,
    gateway_timeout: 0,
    customer_cancelled: 0,
    method_upi: 1,
    method_card: 0,
    method_netbanking: 0,
    returning_customer: 1,
    intervention_do_nothing: 0,
    intervention_retry_now: 0,
    intervention_retry_later: 1,
    intervention_payment_link: 0,
    intervention_reminder: 0,
    intervention_human: 0,
  };
  const hxRaw = FEATURE_NAMES.map((n) => heroFeatures[n] ?? 0);
  const hx = hxRaw.map((v, j) => (v - mean[j]) / std[j]);
  const heroP = predictProba(bias, weights, hx);

  console.log(
    JSON.stringify(
      {
        wrote: outPaths,
        metrics: {
          brier: metrics.brier,
          accuracy: metrics.accuracy,
          precision: metrics.precision,
          recall: metrics.recall,
          roc_auc: metrics.roc_auc,
        },
        hero_retry_later_probability: heroP,
        data_label: DATA_LABEL,
      },
      null,
      2
    )
  );
}

main();
