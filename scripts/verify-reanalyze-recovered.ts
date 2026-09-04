import { resetStore, getStore } from "../src/lib/store/memory";
import { buildSeedStore } from "../src/lib/store/seed";
import { analyzeOpportunity } from "../src/lib/recovery/executor";

resetStore();
buildSeedStore();
const store = getStore();
const hero = store.opportunities.find((o) => o.amount === 4_800_000)!;
hero.status = "RECOVERED";
hero.attempt_count = 2;
const payment = store.payments.find((p) => p.id === hero.payment_id);
if (payment) payment.status = "captured";

const r = analyzeOpportunity(hero.id);
console.log(
  JSON.stringify(
    {
      status: r.opportunity.status,
      attempts: r.opportunity.attempt_count,
      recommended: r.recommendation.recommended_action,
      p: r.recommendation.recovery_probability,
      expected: r.recommendation.expected_recovery_value,
      ver: r.recommendation.model_version,
      alts: r.decision.alternatives.map((a) => ({
        a: a.action,
        p: +a.probability.toFixed(4),
        src: a.probability_source,
      })),
      analysis_only: r.analysis_only,
      usually_clear: /usually clear/i.test(r.recommendation.explanation),
    },
    null,
    2
  )
);
