# REVORA — 5-minute demo script

Audience: Razorpay AI Buildathon judges  
Goal: One coherent story — problem taste, AI judgment, safe execution, failure recovery, measurable lift.

---

### 0:00 — Problem

> Merchants don’t just have failed payments. They have a decision problem: what is worth recovering, which action wins, is it safe, and did we actually recover incremental revenue?

Open REVORA Command Center.

---

### 0:30 — Command Center

Point to:

- **Revenue at risk**
- **Estimated recoverable** (expected value)
- **Actually recovered**
- **Incremental recovery**

Call out **DEMO MODE** + synthetic data label.  
Show system operational + leakage breakdown.

---

### 1:00 — ₹48,000 appears

In AI Recovery Queue, open the **₹48,000** failed payment (Arjun Mehta, insufficient funds, returning customer).

> Ranked by expected recovery — not just amount.

---

### 1:30 — Opportunity detail

Walk header metrics:

- Revenue at risk: ₹48,000  
- Probability vs Expected vs Actual (keep concepts separate)

Customer context: 7 successful payments, UPI, insufficient funds.

---

### 2:00 — Counterfactual decision

Show intervention comparison:

- Do nothing  
- Retry now  
- **Retry later** (winner)  
- Payment link  
- Reminder / escalation  

Explain 2–3 factors (history, insufficient-funds delay, utility after cost/risk).

---

### 2:30 — Policy engine

Show checks:

- amount within limit  
- retry count  
- no duplicate payment  
- confidence  
- merchant policy  

Result: **SAFE TO EXECUTE** / AUTO.

> AI recommended. Policy allowed. AI cannot override policy.

---

### 3:00 — Execute recovery

Click **Execute**.  
Narrate: creates bounded recovery workflow (payment link / demo executor) — does **not** silently charge the card.

---

### 3:30 — Failure Lab interlude (optional mid-flow)

Switch to **Failure Lab** → **Simulate API timeout**.

Show: timeout → retry pending → reconcile → no duplicate charge.

Or **Duplicate webhook** → idempotent skip.

> “What broke, and what did you do about it?”

---

### 4:00 — Outcome

Back on opportunity / command center:

- Status **RECOVERED**  
- **₹48,000 actually recovered**  
- Incremental vs baseline expectation  
- Audit timeline: FAILED → CREATED → ANALYSIS → POLICY → EXECUTED → CAPTURED → CONFIRMED  

---

### 4:20 — Reliability Center

Glance health + prior incidents (duplicate webhook, timeout).

---

### 4:40 — Copilot

Open Copilot on the opportunity:

> “Why this action?” / “View policy”

Show tool-constrained answer + chips.  
Emphasize execution tools still pass Policy Engine.

---

### 5:00 — Baseline vs AI

Open **Experiments**:

- Control vs REVORA treatment  
- Incremental recovery **computed from dataset**  
- Label: Demo evaluation — synthetic data  

Close:

> REVORA finds leakage, judges interventions, executes only what policy allows, survives failure, and proves incremental recovery.

---

## Backup paths (if asked)

| Question | Go to |
|---|---|
| Unsafe action? | Queue → blocked retry-limit opportunity |
| Approval flow? | ₹95k awaiting approval |
| Already paid? | Failure Lab → Already paid |
| AI down? | Failure Lab → AI outage |
