# REVORA Architecture

## System overview

```mermaid
flowchart TB
  RZ[Razorpay Test Mode / Demo Events]
  WH[Webhook Processor + Idempotency]
  DET[Revenue Detector]
  AI[AI Analysis Layer]
  CF[Counterfactual Decision Engine]
  POL[Deterministic Policy Engine]
  EXE[Recovery Executor]
  OUT[Outcome Engine]
  UI[Command Center + Copilot]

  RZ --> WH --> DET --> AI --> CF --> POL
  POL -->|SAFE| EXE
  POL -->|APPROVAL| UI
  POL -->|BLOCKED| UI
  EXE --> RZ
  RZ --> WH
  WH --> OUT --> UI
```

## Webhook flow

```mermaid
sequenceDiagram
  participant R as Razorpay
  participant API as POST /api/webhooks/razorpay
  participant Store as Event Store
  participant Dom as Domain State
  participant AI as Analysis

  R->>API: webhook + signature
  API->>API: verify HMAC
  API->>Store: lookup event_id
  alt duplicate
    Store-->>API: already processed
    API-->>R: 200 duplicate ignored
  else new
    API->>Store: persist event
    API->>Dom: normalize + update
    API->>Dom: create RecoveryOpportunity
    API->>AI: analyze
    API-->>R: 200 accepted
  end
```

## AI decision flow

```mermaid
flowchart LR
  O[Opportunity + Customer Context]
  M[RecoveryProbabilityModel]
  C[Counterfactual compare]
  R[Recommendation + factors]

  O --> M --> C --> R
  M -.->|unavailable| F[Deterministic fallback]
  F --> C
```

AI may recommend. AI may not approve unsafe money movement.

## Policy flow

```mermaid
flowchart TB
  A[Proposed action]
  P[Policy Engine]
  A --> P
  P --> S[SAFE_TO_EXECUTE]
  P --> R[REQUIRES_APPROVAL]
  P --> B[BLOCKED]
```

Checks include: already-paid, retry limits, cooldown, auto-amount, confidence, high-risk approval, reminder frequency.

## Execution flow

```mermaid
sequenceDiagram
  participant UI as Frontend
  participant API as /execute
  participant Pol as Policy Engine
  participant Ex as Demo/Razorpay Executor
  participant WH as Webhook/Outcome

  UI->>API: execute(opportunity)
  API->>API: auth + load state + duplicate guard
  API->>Pol: evaluate
  alt blocked
    Pol-->>UI: BLOCKED
  else approval needed
    Pol-->>UI: AWAITING_APPROVAL
  else safe
    API->>Ex: payment link / reminder / escalate
    Ex-->>API: accepted
    WH->>API: payment.captured
    API-->>UI: RECOVERED + actual/incremental
  end
```

## Failure recovery

```mermaid
flowchart TB
  F[Failure Lab / Real fault]
  F --> T[API timeout]
  F --> D[Duplicate webhook]
  F --> P[Already paid]
  F --> L[AI outage]
  T --> I[Idempotent retry + reconcile]
  D --> S[Skip via event_id]
  P --> B[Policy block]
  L --> FB[Deterministic fallback]
```

## Data model (core)

```mermaid
erDiagram
  MERCHANTS ||--o{ CUSTOMERS : has
  MERCHANTS ||--o{ RECOVERY_OPPORTUNITIES : owns
  CUSTOMERS ||--o{ PAYMENTS : makes
  RECOVERY_OPPORTUNITIES ||--o{ AI_RECOMMENDATIONS : has
  RECOVERY_OPPORTUNITIES ||--o{ POLICY_DECISIONS : has
  RECOVERY_OPPORTUNITIES ||--o{ RECOVERY_ACTIONS : has
  RECOVERY_OPPORTUNITIES ||--o{ AUDIT_EVENTS : trails
  RECOVERY_OPPORTUNITIES ||--o{ RECOVERY_OUTCOMES : results
  EXPERIMENTS ||--o{ EXPERIMENT_ASSIGNMENTS : assigns
```

Amounts are stored in **paise** (Razorpay convention).

## Copilot architecture

```mermaid
flowchart LR
  U[Merchant question]
  R[Router]
  T[Controlled tools]
  P[Policy Engine]
  S[Merchant-scoped store]

  U --> R --> T --> S
  T -->|execute_approved_action| P --> S
```

Tools validate input, scope to merchant, audit calls, and never bypass policy for execution.

## Module map

| Path | Responsibility |
|---|---|
| `src/lib/recovery/` | Probability, counterfactual, executor, webhooks |
| `src/lib/policy/` | Deterministic safety |
| `src/lib/razorpay/` | Official API client wrappers |
| `src/lib/copilot/` | Tool-constrained ops interface |
| `src/lib/reliability/` | Failure Lab simulations |
| `src/lib/analytics/` | Metrics, lift, health |
| `src/lib/store/` | Demo seed + memory store |
| `supabase/migrations/` | Postgres + RLS |
