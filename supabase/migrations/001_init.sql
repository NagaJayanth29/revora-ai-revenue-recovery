-- REVORA schema for Supabase PostgreSQL
-- Tables, constraints, indexes, RLS. Demo Mode can still use in-memory store.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Core tenancy
-- ---------------------------------------------------------------------------

create table merchants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  razorpay_key_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null check (role in ('owner', 'ops', 'viewer')),
  auth_user_id uuid,
  created_at timestamptz not null default now(),
  unique (merchant_id, email)
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  external_id text,
  name text not null,
  email text not null,
  phone text,
  success_count int not null default 0 check (success_count >= 0),
  failure_count int not null default 0 check (failure_count >= 0),
  total_paid bigint not null default 0 check (total_paid >= 0),
  last_payment_at timestamptz,
  created_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete restrict,
  razorpay_order_id text,
  amount bigint not null check (amount >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null check (status in ('created', 'attempted', 'paid')),
  receipt text,
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete restrict,
  order_id uuid not null references orders(id) on delete restrict,
  razorpay_payment_id text,
  amount bigint not null check (amount >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null check (
    status in ('created', 'authorized', 'captured', 'failed', 'refunded', 'pending')
  ),
  method text,
  failure_reason text,
  failure_category text check (
    failure_category is null or failure_category in (
      'INSUFFICIENT_FUNDS',
      'BANK_DECLINE',
      'NETWORK_ERROR',
      'AUTHENTICATION_FAILED',
      'EXPIRED_CARD',
      'GATEWAY_TIMEOUT',
      'CUSTOMER_CANCELLED',
      'UNKNOWN'
    )
  ),
  error_code text,
  attempt_count int not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete restrict,
  order_id uuid not null references orders(id) on delete restrict,
  payment_id uuid references payments(id) on delete set null,
  amount bigint not null check (amount >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null,
  source text not null check (
    source in (
      'FAILED_PAYMENT',
      'CHECKOUT_ABANDONMENT',
      'RECURRING_FAILURE',
      'PAYMENT_LINK',
      'OVERDUE_RECEIVABLE'
    )
  ),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Recovery lifecycle
-- ---------------------------------------------------------------------------

create table recovery_opportunities (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete restrict,
  transaction_id uuid not null references transactions(id) on delete restrict,
  order_id uuid not null references orders(id) on delete restrict,
  payment_id uuid references payments(id) on delete set null,
  amount bigint not null check (amount >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  source text not null check (
    source in (
      'FAILED_PAYMENT',
      'CHECKOUT_ABANDONMENT',
      'RECURRING_FAILURE',
      'PAYMENT_LINK',
      'OVERDUE_RECEIVABLE'
    )
  ),
  event_type text not null,
  failure_reason text,
  failure_category text check (
    failure_category is null or failure_category in (
      'INSUFFICIENT_FUNDS',
      'BANK_DECLINE',
      'NETWORK_ERROR',
      'AUTHENTICATION_FAILED',
      'EXPIRED_CARD',
      'GATEWAY_TIMEOUT',
      'CUSTOMER_CANCELLED',
      'UNKNOWN'
    )
  ),
  status text not null check (
    status in (
      'DETECTED',
      'ANALYZING',
      'READY',
      'AWAITING_APPROVAL',
      'EXECUTING',
      'WAITING_FOR_OUTCOME',
      'RECOVERED',
      'FAILED',
      'EXPIRED',
      'ESCALATED',
      'BLOCKED',
      'CANCELLED'
    )
  ),
  risk_level text not null check (risk_level in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  recovery_probability numeric check (
    recovery_probability is null
    or (recovery_probability >= 0 and recovery_probability <= 1)
  ),
  confidence text check (confidence is null or confidence in ('HIGH', 'MEDIUM', 'LOW')),
  expected_recovery_value bigint check (
    expected_recovery_value is null or expected_recovery_value >= 0
  ),
  recommended_action text check (
    recommended_action is null or recommended_action in (
      'DO_NOTHING',
      'RETRY_NOW',
      'RETRY_LATER',
      'PAYMENT_LINK',
      'REMINDER',
      'HUMAN_ESCALATION'
    )
  ),
  policy_status text check (
    policy_status is null
    or policy_status in ('SAFE_TO_EXECUTE', 'REQUIRES_APPROVAL', 'BLOCKED')
  ),
  policy_reason text,
  autonomy_mode text check (
    autonomy_mode is null or autonomy_mode in ('AUTO', 'REVIEW_REQUIRED', 'BLOCKED')
  ),
  attempt_count int not null default 0 check (attempt_count >= 0),
  last_action_at timestamptz,
  next_action_at timestamptz,
  actual_recovered_amount bigint not null default 0 check (actual_recovered_amount >= 0),
  incremental_recovered_amount bigint not null default 0,
  baseline_probability numeric check (
    baseline_probability is null
    or (baseline_probability >= 0 and baseline_probability <= 1)
  ),
  experiment_arm text check (experiment_arm is null or experiment_arm in ('control', 'treatment')),
  resolved_at timestamptz,
  created_by text not null check (
    created_by in ('AI', 'SYSTEM', 'MERCHANT', 'RAZORPAY', 'CUSTOMER', 'WEBHOOK')
  ),
  correlation_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table interventions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (
    code in (
      'DO_NOTHING',
      'RETRY_NOW',
      'RETRY_LATER',
      'PAYMENT_LINK',
      'REMINDER',
      'HUMAN_ESCALATION'
    )
  ),
  label text not null,
  description text
);

create table ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  opportunity_id uuid not null references recovery_opportunities(id) on delete cascade,
  recommended_action text not null check (
    recommended_action in (
      'DO_NOTHING',
      'RETRY_NOW',
      'RETRY_LATER',
      'PAYMENT_LINK',
      'REMINDER',
      'HUMAN_ESCALATION'
    )
  ),
  recovery_probability numeric not null check (
    recovery_probability >= 0 and recovery_probability <= 1
  ),
  expected_recovery_value bigint not null check (expected_recovery_value >= 0),
  confidence text not null check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  key_factors jsonb not null default '[]'::jsonb,
  alternatives jsonb not null default '[]'::jsonb,
  explanation text not null,
  model_version text not null,
  used_fallback boolean not null default false,
  created_at timestamptz not null default now()
);

create table policy_rules (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null unique references merchants(id) on delete cascade,
  max_retry_attempts int not null default 3 check (max_retry_attempts >= 0),
  min_retry_interval_minutes int not null default 30 check (min_retry_interval_minutes >= 0),
  max_auto_action_amount bigint not null default 5000000 check (max_auto_action_amount >= 0),
  min_ai_confidence text not null default 'MEDIUM' check (
    min_ai_confidence in ('HIGH', 'MEDIUM', 'LOW')
  ),
  max_reminders_per_24h int not null default 2 check (max_reminders_per_24h >= 0),
  high_risk_requires_approval boolean not null default true,
  block_already_paid boolean not null default true,
  allow_auto_retry boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table policy_decisions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  opportunity_id uuid not null references recovery_opportunities(id) on delete cascade,
  action text not null check (
    action in (
      'DO_NOTHING',
      'RETRY_NOW',
      'RETRY_LATER',
      'PAYMENT_LINK',
      'REMINDER',
      'HUMAN_ESCALATION'
    )
  ),
  decision text not null check (
    decision in ('SAFE_TO_EXECUTE', 'REQUIRES_APPROVAL', 'BLOCKED')
  ),
  reasons jsonb not null default '[]'::jsonb,
  checks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table recovery_actions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  opportunity_id uuid not null references recovery_opportunities(id) on delete cascade,
  action_type text not null check (
    action_type in (
      'DO_NOTHING',
      'RETRY_NOW',
      'RETRY_LATER',
      'PAYMENT_LINK',
      'REMINDER',
      'HUMAN_ESCALATION'
    )
  ),
  status text not null check (
    status in ('pending', 'executing', 'succeeded', 'failed', 'timeout', 'cancelled')
  ),
  executor text not null check (executor in ('demo', 'razorpay')),
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  idempotency_key text not null unique,
  correlation_id text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid references merchants(id) on delete set null,
  razorpay_event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  signature_valid boolean not null,
  processed boolean not null default false,
  processing_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  opportunity_id uuid references recovery_opportunities(id) on delete set null,
  actor text not null,
  actor_type text not null check (
    actor_type in ('AI', 'SYSTEM', 'MERCHANT', 'RAZORPAY', 'CUSTOMER', 'WEBHOOK')
  ),
  event text not null,
  previous_state text,
  new_state text,
  reason text,
  ai_recommendation text,
  policy_decision text,
  execution_result text,
  request_id text,
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table recovery_outcomes (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  opportunity_id uuid not null references recovery_opportunities(id) on delete restrict,
  action_id uuid references recovery_actions(id) on delete set null,
  actual_recovered_amount bigint not null check (actual_recovered_amount >= 0),
  incremental_recovered_amount bigint not null,
  baseline_expected bigint not null check (baseline_expected >= 0),
  verified_via text not null check (verified_via in ('webhook', 'api_reconcile', 'demo')),
  payment_status text not null check (
    payment_status in ('created', 'authorized', 'captured', 'failed', 'refunded', 'pending')
  ),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Experiments, reliability, copilot
-- ---------------------------------------------------------------------------

create table experiments (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  name text not null,
  description text not null,
  status text not null check (status in ('draft', 'running', 'completed')),
  control_size int not null default 0 check (control_size >= 0),
  treatment_size int not null default 0 check (treatment_size >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table experiment_assignments (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments(id) on delete cascade,
  opportunity_id uuid not null references recovery_opportunities(id) on delete cascade,
  arm text not null check (arm in ('control', 'treatment')),
  created_at timestamptz not null default now(),
  unique (experiment_id, opportunity_id)
);

create table experiment_results (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments(id) on delete cascade,
  control_recovered bigint not null,
  treatment_recovered bigint not null,
  control_recovery_rate numeric not null check (
    control_recovery_rate >= 0 and control_recovery_rate <= 1
  ),
  treatment_recovery_rate numeric not null check (
    treatment_recovery_rate >= 0 and treatment_recovery_rate <= 1
  ),
  incremental_recovery bigint not null,
  control_intervention_rate numeric not null check (
    control_intervention_rate >= 0 and control_intervention_rate <= 1
  ),
  treatment_intervention_rate numeric not null check (
    treatment_intervention_rate >= 0 and treatment_intervention_rate <= 1
  ),
  computed_at timestamptz not null default now(),
  data_label text not null
);

create table system_incidents (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid references merchants(id) on delete set null,
  type text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  title text not null,
  description text not null,
  what_broke text not null,
  recovery_action text not null,
  final_state text not null,
  resolved boolean not null default false,
  opportunity_id uuid references recovery_opportunities(id) on delete set null,
  correlation_id text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table copilot_sessions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  opportunity_id uuid references recovery_opportunities(id) on delete set null,
  created_at timestamptz not null default now()
);

create table copilot_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references copilot_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  tool_name text,
  tool_result jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index idx_users_merchant on users(merchant_id);
create index idx_users_auth_user on users(auth_user_id);
create index idx_customers_merchant on customers(merchant_id);
create index idx_customers_merchant_email on customers(merchant_id, email);
create index idx_orders_merchant_customer on orders(merchant_id, customer_id);
create index idx_orders_rzp on orders(razorpay_order_id);
create index idx_payments_merchant_status on payments(merchant_id, status);
create index idx_payments_order on payments(order_id);
create index idx_payments_rzp on payments(razorpay_payment_id);
create index idx_transactions_merchant on transactions(merchant_id);
create index idx_transactions_payment on transactions(payment_id);
create index idx_opportunities_merchant_status on recovery_opportunities(merchant_id, status);
create index idx_opportunities_expected on recovery_opportunities(merchant_id, expected_recovery_value desc nulls last);
create index idx_opportunities_customer on recovery_opportunities(customer_id);
create index idx_opportunities_correlation on recovery_opportunities(correlation_id);
create index idx_recommendations_opportunity on ai_recommendations(opportunity_id);
create index idx_policy_decisions_opportunity on policy_decisions(opportunity_id);
create index idx_actions_opportunity on recovery_actions(opportunity_id);
create index idx_actions_idempotency on recovery_actions(idempotency_key);
create index idx_webhook_event_id on webhook_events(razorpay_event_id);
create index idx_webhook_merchant_processed on webhook_events(merchant_id, processed);
create index idx_audit_opportunity on audit_events(opportunity_id, created_at);
create index idx_audit_merchant_created on audit_events(merchant_id, created_at desc);
create index idx_outcomes_opportunity on recovery_outcomes(opportunity_id);
create index idx_experiments_merchant on experiments(merchant_id);
create index idx_experiment_assignments_exp on experiment_assignments(experiment_id);
create index idx_experiment_results_exp on experiment_results(experiment_id);
create index idx_incidents_merchant on system_incidents(merchant_id);
create index idx_copilot_sessions_merchant on copilot_sessions(merchant_id);
create index idx_copilot_messages_session on copilot_messages(session_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS helper + policies (merchant isolation via JWT app_metadata.merchant_id)
-- Secret/service keys bypass RLS. Publishable/anon keys enforce these policies.
-- ---------------------------------------------------------------------------

create or replace function public.current_merchant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'merchant_id', '')::uuid;
$$;

revoke all on function public.current_merchant_id() from public;
grant execute on function public.current_merchant_id() to anon, authenticated, service_role;

alter table merchants enable row level security;
alter table users enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table payments enable row level security;
alter table transactions enable row level security;
alter table recovery_opportunities enable row level security;
alter table interventions enable row level security;
alter table ai_recommendations enable row level security;
alter table policy_rules enable row level security;
alter table policy_decisions enable row level security;
alter table recovery_actions enable row level security;
alter table webhook_events enable row level security;
alter table audit_events enable row level security;
alter table recovery_outcomes enable row level security;
alter table experiments enable row level security;
alter table experiment_assignments enable row level security;
alter table experiment_results enable row level security;
alter table system_incidents enable row level security;
alter table copilot_sessions enable row level security;
alter table copilot_messages enable row level security;

create policy merchants_isolation on merchants
  for all using (id = public.current_merchant_id())
  with check (id = public.current_merchant_id());

create policy users_isolation on users
  for all using (merchant_id = public.current_merchant_id())
  with check (merchant_id = public.current_merchant_id());

create policy customers_isolation on customers
  for all using (merchant_id = public.current_merchant_id())
  with check (merchant_id = public.current_merchant_id());

create policy orders_isolation on orders
  for all using (merchant_id = public.current_merchant_id())
  with check (merchant_id = public.current_merchant_id());

create policy payments_isolation on payments
  for all using (merchant_id = public.current_merchant_id())
  with check (merchant_id = public.current_merchant_id());

create policy transactions_isolation on transactions
  for all using (merchant_id = public.current_merchant_id())
  with check (merchant_id = public.current_merchant_id());

create policy opportunities_isolation on recovery_opportunities
  for all using (merchant_id = public.current_merchant_id())
  with check (merchant_id = public.current_merchant_id());

create policy interventions_read on interventions
  for select using (true);

create policy recommendations_isolation on ai_recommendations
  for all using (merchant_id = public.current_merchant_id())
  with check (merchant_id = public.current_merchant_id());

create policy policy_rules_isolation on policy_rules
  for all using (merchant_id = public.current_merchant_id())
  with check (merchant_id = public.current_merchant_id());

create policy policy_decisions_isolation on policy_decisions
  for all using (merchant_id = public.current_merchant_id())
  with check (merchant_id = public.current_merchant_id());

create policy actions_isolation on recovery_actions
  for all using (merchant_id = public.current_merchant_id())
  with check (merchant_id = public.current_merchant_id());

create policy webhooks_isolation on webhook_events
  for all using (
    merchant_id is null or merchant_id = public.current_merchant_id()
  )
  with check (
    merchant_id is null or merchant_id = public.current_merchant_id()
  );

create policy audit_isolation on audit_events
  for all using (merchant_id = public.current_merchant_id())
  with check (merchant_id = public.current_merchant_id());

create policy outcomes_isolation on recovery_outcomes
  for all using (merchant_id = public.current_merchant_id())
  with check (merchant_id = public.current_merchant_id());

create policy experiments_isolation on experiments
  for all using (merchant_id = public.current_merchant_id())
  with check (merchant_id = public.current_merchant_id());

create policy experiment_assignments_isolation on experiment_assignments
  for all using (
    experiment_id in (
      select id from experiments where merchant_id = public.current_merchant_id()
    )
  )
  with check (
    experiment_id in (
      select id from experiments where merchant_id = public.current_merchant_id()
    )
  );

create policy experiment_results_isolation on experiment_results
  for all using (
    experiment_id in (
      select id from experiments where merchant_id = public.current_merchant_id()
    )
  )
  with check (
    experiment_id in (
      select id from experiments where merchant_id = public.current_merchant_id()
    )
  );

create policy incidents_isolation on system_incidents
  for all using (
    merchant_id is null or merchant_id = public.current_merchant_id()
  )
  with check (
    merchant_id is null or merchant_id = public.current_merchant_id()
  );

create policy copilot_sessions_isolation on copilot_sessions
  for all using (merchant_id = public.current_merchant_id())
  with check (merchant_id = public.current_merchant_id());

create policy copilot_messages_isolation on copilot_messages
  for all using (
    session_id in (
      select id from copilot_sessions where merchant_id = public.current_merchant_id()
    )
  )
  with check (
    session_id in (
      select id from copilot_sessions where merchant_id = public.current_merchant_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Privileges for PostgREST roles (Supabase)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
