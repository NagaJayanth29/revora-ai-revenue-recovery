# REVORA

**AI Revenue Recovery Platform** for Razorpay AI Buildathon 2026 — Track 03.

> Find the money slipping away. Decide what is worth recovering. Recover it safely.

REVORA is an AI **decision and execution layer** that identifies revenue at risk, compares recovery interventions counterfactually, enforces deterministic safety policies, executes only bounded workflows, and measures **actual** incremental revenue recovered.

It is **not** a generic chatbot, generic dashboard, or blind failed-payment retry bot.

---

## Problem

Merchants lose revenue across the payment lifecycle — failed payments, abandonment, recurring failures, payment-link expiry, overdue receivables.

The real problem is not “a payment failed.” It is:

> What revenue is worth pursuing, why is it at risk, which intervention has the highest expected value, is it safe to execute, when should we stop, and did we actually recover incremental revenue?

---

## Solution

REVORA continuously:

1. Detects revenue at risk  
2. Analyzes root cause + context  
3. Estimates recovery probability (interpretable model)  
4. Compares interventions counterfactually  
5. Applies deterministic merchant policies  
6. Auto-executes only safe actions / escalates the rest  
7. Verifies outcomes via trusted state + webhooks  
8. Measures actual and incremental recovery  
9. Leaves a complete audit trail  

---

## Architecture (30 seconds)

```
Razorpay Test Mode / Demo events
        → Event processor (idempotent)
        → Revenue detector
        → AI analysis (probability + counterfactuals)
        → Deterministic policy engine
        → Execute OR approve OR block
        → Customer payment workflow (payment link / reminder / escalate)
        → Webhook / reconcile
        → Outcome engine (actual + incremental)
        → Command Center + Copilot
```

**Core principle:** AI does not control money directly. Deterministic policy + trusted payment state do.

### Why AI

- Rank opportunities by expected value, not raw amount  
- Compare interventions under uncertainty  
- Explain recommendations to operators  
- Power a merchant Copilot with controlled tools  

### Where AI is NOT used

- Retry limits, cooldowns, duplicate prevention  
- Declaring payment success  
- Bypassing merchant policies  
- Unrestricted Razorpay calls from Copilot/frontend  

---

## Stack

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS 4  
- **Backend:** Next.js Route Handlers  
- **Data:** In-memory Demo Store (default) + Supabase PostgreSQL schema/RLS migrations  
- **Payments:** Razorpay Test Mode abstraction (`lib/razorpay`)  
- **ML:** Interpretable logistic regression in TypeScript (`revora-lr-v1-synthetic`)  
- **Charts:** Recharts  

---

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Demo Mode works without Razorpay or Supabase credentials.**  
Seeded merchant: Aurora Commerce · `ops@aurora.demo`

```bash
npm test
npm run typecheck
```

---

## Environment variables

See `.env.example`.

| Variable | Required for Demo | Purpose |
|---|---|---|
| `NEXT_PUBLIC_DEMO_MODE` | recommended `true` | Force demo executor |
| `RAZORPAY_KEY_ID` / `SECRET` | no | Razorpay Test Mode |
| `RAZORPAY_WEBHOOK_SECRET` | no | Webhook HMAC verify |
| `NEXT_PUBLIC_SUPABASE_URL` / keys | no | Optional Supabase |
| `OPENAI_API_KEY` | no | Optional LLM; deterministic fallback always available |

Never expose secrets to the browser. Frontend talks only to `/api/*`.

---

## Demo Mode vs Razorpay Test Mode

| | Demo Mode | Razorpay Test Mode |
|---|---|---|
| Credentials | Not required | Required |
| Executor | `DemoRecoveryExecutor` | Payment Link / Orders APIs |
| Money | Simulated | Test mode only — no real money |
| Label | Clearly shown in UI | Clearly shown in UI |

Supported recovery workflows (honest):

- **Retry / Payment link** → create Payment Link for customer completion (does **not** silently charge)  
- **Reminder** → outreach record  
- **Human escalation** → ops queue  
- **Do nothing** → baseline  

Fetching a payment ≠ collecting a new payment.

---

## Key product surfaces

- **Command Center** — risk, recoverable, actual, incremental  
- **Opportunity Detail** — counterfactuals, policy checks, audit timeline  
- **Recovery Queue** — ranked by expected value  
- **Failure Lab** — timeouts, duplicate webhooks, already-paid, AI outage…  
- **Reliability Center** — health + incidents  
- **Experiments** — baseline vs REVORA (computed from dataset)  
- **Copilot** — tool-constrained financial ops interface  
- **Policies** — merchant-controlled safety rails  
- **Cmd/Ctrl+K** — command palette  

Primary demo story: **₹48,000 failed UPI payment** → RETRY_LATER → policy SAFE → execute → outcome → incremental recovery.

---

## Evaluation honesty

Probability model and experiment metrics are labeled:

**Demo evaluation — synthetic data**

Never presented as Razorpay production statistics.

---

## Testing

```bash
npm test
```

Coverage includes: state machine, probability + fallback, counterfactuals, policy blocks, webhook idempotency, end-to-end recovery, failure lab, experiment computation.

---

## Documentation

- [Architecture](docs/architecture.md)  
- [Demo script (5 min)](docs/demo-script.md)  

---

## Limitations (honest)

- Default runtime uses an in-memory store (resets on server restart) for frictionless demos  
- Supabase schema/RLS are provided; full hosted wiring is optional  
- LLM provider is optional — Copilot uses deterministic tool routing with fallback copy  
- Secondary leakage types (abandonment, links, recurring) share the opportunity model but are lighter than failed-payment depth  
- Not production-ready for live money movement  

---

## Future work

- Persist Demo Store to Supabase with realtime subscriptions  
- Online model calibration from verified outcomes  
- Deeper subscription/mandate recovery via official Razorpay APIs  
- Multi-merchant SSO via Supabase Auth  

---

Built for **Razorpay AI Buildathon 2026**.
