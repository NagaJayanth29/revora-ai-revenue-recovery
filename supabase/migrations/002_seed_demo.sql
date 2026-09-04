-- REVORA deterministic demo seed
-- Fixed UUIDs + fixed clock so re-runs are idempotent (ON CONFLICT / delete-by-merchant).
-- Amounts are paise (Razorpay convention). Mirrors src/lib/store/seed.ts narrative.

-- Fixed demo clock: 2026-09-01 12:00:00 UTC
-- hours/days offsets computed from that instant.

create extension if not exists "pgcrypto";

do $$
declare
  v_merchant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_user uuid := 'a0000000-0000-4000-8000-000000000002';
  v_policy uuid := 'a0000000-0000-4000-8000-000000000003';
  v_exp uuid := 'a0000000-0000-4000-8000-000000000004';
  v_exp_result uuid := 'a0000000-0000-4000-8000-000000000005';

  v_cust_arjun uuid := 'a0000000-0000-4000-8000-000000000011';
  v_cust_neha uuid := 'a0000000-0000-4000-8000-000000000012';
  v_cust_vikram uuid := 'a0000000-0000-4000-8000-000000000013';
  v_cust_ananya uuid := 'a0000000-0000-4000-8000-000000000014';
  v_cust_rahul uuid := 'a0000000-0000-4000-8000-000000000015';

  v_ord_48000 uuid := 'a0000000-0000-4000-8000-000000000021';
  v_ord_retry uuid := 'a0000000-0000-4000-8000-000000000022';
  v_ord_approval uuid := 'a0000000-0000-4000-8000-000000000023';
  v_ord_abandon uuid := 'a0000000-0000-4000-8000-000000000024';
  v_ord_recovered uuid := 'a0000000-0000-4000-8000-000000000025';
  v_ord_link uuid := 'a0000000-0000-4000-8000-000000000026';
  v_ord_recurring uuid := 'a0000000-0000-4000-8000-000000000027';

  v_pay_48000 uuid := 'a0000000-0000-4000-8000-000000000031';
  v_pay_retry uuid := 'a0000000-0000-4000-8000-000000000032';
  v_pay_approval uuid := 'a0000000-0000-4000-8000-000000000033';
  v_pay_abandon uuid := 'a0000000-0000-4000-8000-000000000034';
  v_pay_recovered uuid := 'a0000000-0000-4000-8000-000000000035';
  v_pay_link uuid := 'a0000000-0000-4000-8000-000000000036';
  v_pay_recurring uuid := 'a0000000-0000-4000-8000-000000000037';

  v_txn_48000 uuid := 'a0000000-0000-4000-8000-000000000041';
  v_txn_retry uuid := 'a0000000-0000-4000-8000-000000000042';
  v_txn_approval uuid := 'a0000000-0000-4000-8000-000000000043';
  v_txn_abandon uuid := 'a0000000-0000-4000-8000-000000000044';
  v_txn_recovered uuid := 'a0000000-0000-4000-8000-000000000045';
  v_txn_link uuid := 'a0000000-0000-4000-8000-000000000046';
  v_txn_recurring uuid := 'a0000000-0000-4000-8000-000000000047';

  v_opp_48000 uuid := 'a0000000-0000-4000-8000-000000000051';
  v_opp_retry uuid := 'a0000000-0000-4000-8000-000000000052';
  v_opp_approval uuid := 'a0000000-0000-4000-8000-000000000053';
  v_opp_abandon uuid := 'a0000000-0000-4000-8000-000000000054';
  v_opp_recovered uuid := 'a0000000-0000-4000-8000-000000000055';
  v_opp_link uuid := 'a0000000-0000-4000-8000-000000000056';
  v_opp_recurring uuid := 'a0000000-0000-4000-8000-000000000057';

  v_rec_48000 uuid := 'a0000000-0000-4000-8000-000000000061';
  v_rec_retry uuid := 'a0000000-0000-4000-8000-000000000062';
  v_rec_approval uuid := 'a0000000-0000-4000-8000-000000000063';
  v_rec_abandon uuid := 'a0000000-0000-4000-8000-000000000064';
  v_rec_recovered uuid := 'a0000000-0000-4000-8000-000000000065';
  v_rec_link uuid := 'a0000000-0000-4000-8000-000000000066';
  v_rec_recurring uuid := 'a0000000-0000-4000-8000-000000000067';

  v_pol_48000 uuid := 'a0000000-0000-4000-8000-000000000071';
  v_pol_retry uuid := 'a0000000-0000-4000-8000-000000000072';
  v_pol_approval uuid := 'a0000000-0000-4000-8000-000000000073';
  v_pol_abandon uuid := 'a0000000-0000-4000-8000-000000000074';
  v_pol_recovered uuid := 'a0000000-0000-4000-8000-000000000075';
  v_pol_link uuid := 'a0000000-0000-4000-8000-000000000076';
  v_pol_recurring uuid := 'a0000000-0000-4000-8000-000000000077';

  v_outcome_recovered uuid := 'a0000000-0000-4000-8000-000000000081';
  v_action_recovered uuid := 'a0000000-0000-4000-8000-000000000082';
  v_inc_dup uuid := 'a0000000-0000-4000-8000-000000000091';
  v_inc_timeout uuid := 'a0000000-0000-4000-8000-000000000092';

  v_asg_1 uuid := 'a0000000-0000-4000-8000-0000000000a1';
  v_asg_2 uuid := 'a0000000-0000-4000-8000-0000000000a2';
  v_asg_3 uuid := 'a0000000-0000-4000-8000-0000000000a3';
  v_asg_4 uuid := 'a0000000-0000-4000-8000-0000000000a4';
  v_asg_5 uuid := 'a0000000-0000-4000-8000-0000000000a5';
  v_asg_6 uuid := 'a0000000-0000-4000-8000-0000000000a6';
  v_asg_7 uuid := 'a0000000-0000-4000-8000-0000000000a7';

  v_now timestamptz := timestamptz '2026-09-01 12:00:00+00';
begin
  -- Idempotent re-seed for demo merchant (tables with ON DELETE SET NULL need explicit cleanup)
  delete from webhook_events where merchant_id = v_merchant;
  delete from system_incidents where merchant_id = v_merchant;
  delete from merchants where id = v_merchant;

  insert into interventions (id, code, label, description) values
    ('a0000000-0000-4000-8000-0000000000b1', 'DO_NOTHING', 'Do nothing', 'Baseline — no recovery action'),
    ('a0000000-0000-4000-8000-0000000000b2', 'RETRY_NOW', 'Retry now', 'Immediate payment retry'),
    ('a0000000-0000-4000-8000-0000000000b3', 'RETRY_LATER', 'Retry later', 'Scheduled retry after cooldown'),
    ('a0000000-0000-4000-8000-0000000000b4', 'PAYMENT_LINK', 'Payment link', 'Send customer a fresh payment link'),
    ('a0000000-0000-4000-8000-0000000000b5', 'REMINDER', 'Reminder', 'Send payment reminder'),
    ('a0000000-0000-4000-8000-0000000000b6', 'HUMAN_ESCALATION', 'Human escalation', 'Route to merchant ops')
  on conflict (code) do update set
    label = excluded.label,
    description = excluded.description;

  insert into merchants (id, name, slug, razorpay_key_id, created_at, updated_at)
  values (
    v_merchant,
    'Aurora Commerce',
    'aurora-commerce',
    null,
    v_now - interval '90 days',
    v_now
  );

  insert into users (id, merchant_id, email, name, role, auth_user_id, created_at)
  values (
    v_user,
    v_merchant,
    'ops@aurora.demo',
    'Priya Sharma',
    'owner',
    null,
    v_now - interval '90 days'
  );

  insert into customers (
    id, merchant_id, external_id, name, email, phone,
    success_count, failure_count, total_paid, last_payment_at, created_at
  ) values
    (v_cust_arjun, v_merchant, 'cus_arjun', 'Arjun Mehta', 'arjun.mehta@example.com', '+919876543210',
      7, 1, 31200000, v_now - interval '12 days', v_now - interval '180 days'),
    (v_cust_neha, v_merchant, 'cus_neha', 'Neha Kapoor', 'neha.kapoor@example.com', '+919811122233',
      2, 3, 2450000, v_now - interval '40 days', v_now - interval '120 days'),
    (v_cust_vikram, v_merchant, 'cus_vikram', 'Vikram Singh', 'vikram.singh@example.com', null,
      15, 2, 89000000, v_now - interval '3 days', v_now - interval '400 days'),
    (v_cust_ananya, v_merchant, 'cus_ananya', 'Ananya Rao', 'ananya.rao@example.com', '+919700011122',
      0, 2, 0, null, v_now - interval '5 days'),
    (v_cust_rahul, v_merchant, 'cus_rahul', 'Rahul Desai', 'rahul.desai@example.com', '+919812345678',
      4, 1, 5600000, v_now - interval '20 days', v_now - interval '200 days');

  insert into policy_rules (
    id, merchant_id, max_retry_attempts, min_retry_interval_minutes,
    max_auto_action_amount, min_ai_confidence, max_reminders_per_24h,
    high_risk_requires_approval, block_already_paid, allow_auto_retry,
    updated_at, updated_by
  ) values (
    v_policy, v_merchant, 3, 30, 5000000, 'MEDIUM', 2,
    true, true, true, v_now, 'demo_seed'
  );

  -- Orders / payments / transactions
  insert into orders (id, merchant_id, customer_id, razorpay_order_id, amount, currency, status, receipt, created_at) values
    (v_ord_48000, v_merchant, v_cust_arjun, 'order_demo_48000', 4800000, 'INR', 'attempted', 'rcpt_48000', v_now - interval '1 hour'),
    (v_ord_retry, v_merchant, v_cust_neha, 'order_demo_retry_limit', 1250000, 'INR', 'attempted', 'rcpt_retry_limit', v_now - interval '6 hours'),
    (v_ord_approval, v_merchant, v_cust_vikram, 'order_demo_approval', 9500000, 'INR', 'attempted', 'rcpt_approval', v_now - interval '3 hours'),
    (v_ord_abandon, v_merchant, v_cust_ananya, 'order_demo_abandon', 899900, 'INR', 'attempted', 'rcpt_abandon', v_now - interval '8 hours'),
    (v_ord_recovered, v_merchant, v_cust_rahul, 'order_demo_recovered', 1500000, 'INR', 'paid', 'rcpt_recovered', v_now - interval '28 hours'),
    (v_ord_link, v_merchant, v_cust_neha, 'order_demo_link', 620000, 'INR', 'attempted', 'rcpt_link', v_now - interval '20 hours'),
    (v_ord_recurring, v_merchant, v_cust_vikram, 'order_demo_recurring', 249900, 'INR', 'attempted', 'rcpt_recurring', v_now - interval '14 hours');

  insert into payments (
    id, merchant_id, customer_id, order_id, razorpay_payment_id, amount, currency, status,
    method, failure_reason, failure_category, error_code, attempt_count, created_at, updated_at
  ) values
    (v_pay_48000, v_merchant, v_cust_arjun, v_ord_48000, 'pay_rzp_48000', 4800000, 'INR', 'failed',
      'upi', 'Insufficient funds in customer account', 'INSUFFICIENT_FUNDS', 'BAD_REQUEST_ERROR', 1,
      v_now - interval '1 hour', v_now - interval '1 hour'),
    (v_pay_retry, v_merchant, v_cust_neha, v_ord_retry, 'pay_rzp_retry_limit', 1250000, 'INR', 'failed',
      'card', 'Bank declined transaction', 'BANK_DECLINE', null, 3,
      v_now - interval '6 hours', v_now - interval '6 hours'),
    (v_pay_approval, v_merchant, v_cust_vikram, v_ord_approval, 'pay_rzp_approval', 9500000, 'INR', 'failed',
      'netbanking', 'Payment gateway timed out', 'GATEWAY_TIMEOUT', null, 0,
      v_now - interval '3 hours', v_now - interval '3 hours'),
    (v_pay_abandon, v_merchant, v_cust_ananya, v_ord_abandon, 'pay_rzp_abandon', 899900, 'INR', 'failed',
      'upi', 'Checkout abandoned', 'CUSTOMER_CANCELLED', null, 0,
      v_now - interval '8 hours', v_now - interval '8 hours'),
    (v_pay_recovered, v_merchant, v_cust_rahul, v_ord_recovered, 'pay_rzp_recovered', 1500000, 'INR', 'captured',
      'upi', null, null, null, 1,
      v_now - interval '28 hours', v_now - interval '28 hours'),
    (v_pay_link, v_merchant, v_cust_neha, v_ord_link, 'pay_rzp_link', 620000, 'INR', 'failed',
      'card', 'Payment link expired', 'EXPIRED_CARD', null, 1,
      v_now - interval '20 hours', v_now - interval '20 hours'),
    (v_pay_recurring, v_merchant, v_cust_vikram, v_ord_recurring, 'pay_rzp_recurring', 249900, 'INR', 'failed',
      'upi', 'Mandate execution failed', 'INSUFFICIENT_FUNDS', 'BAD_REQUEST_ERROR', 1,
      v_now - interval '14 hours', v_now - interval '14 hours');

  insert into transactions (
    id, merchant_id, customer_id, order_id, payment_id, amount, currency, status, source, created_at
  ) values
    (v_txn_48000, v_merchant, v_cust_arjun, v_ord_48000, v_pay_48000, 4800000, 'INR', 'failed', 'FAILED_PAYMENT', v_now - interval '1 hour'),
    (v_txn_retry, v_merchant, v_cust_neha, v_ord_retry, v_pay_retry, 1250000, 'INR', 'failed', 'FAILED_PAYMENT', v_now - interval '6 hours'),
    (v_txn_approval, v_merchant, v_cust_vikram, v_ord_approval, v_pay_approval, 9500000, 'INR', 'failed', 'FAILED_PAYMENT', v_now - interval '3 hours'),
    (v_txn_abandon, v_merchant, v_cust_ananya, v_ord_abandon, v_pay_abandon, 899900, 'INR', 'failed', 'CHECKOUT_ABANDONMENT', v_now - interval '8 hours'),
    (v_txn_recovered, v_merchant, v_cust_rahul, v_ord_recovered, v_pay_recovered, 1500000, 'INR', 'captured', 'FAILED_PAYMENT', v_now - interval '28 hours'),
    (v_txn_link, v_merchant, v_cust_neha, v_ord_link, v_pay_link, 620000, 'INR', 'failed', 'PAYMENT_LINK', v_now - interval '20 hours'),
    (v_txn_recurring, v_merchant, v_cust_vikram, v_ord_recurring, v_pay_recurring, 249900, 'INR', 'failed', 'RECURRING_FAILURE', v_now - interval '14 hours');

  -- Opportunities (deterministic demo narrative)
  insert into recovery_opportunities (
    id, merchant_id, customer_id, transaction_id, order_id, payment_id,
    amount, currency, source, event_type, failure_reason, failure_category,
    status, risk_level, recovery_probability, confidence, expected_recovery_value,
    recommended_action, policy_status, policy_reason, autonomy_mode,
    attempt_count, last_action_at, next_action_at,
    actual_recovered_amount, incremental_recovered_amount, baseline_probability,
    experiment_arm, resolved_at, created_by, correlation_id, metadata, created_at, updated_at
  ) values
    -- Hero: ₹48,000 READY / RETRY_LATER / SAFE_TO_EXECUTE
    (v_opp_48000, v_merchant, v_cust_arjun, v_txn_48000, v_ord_48000, v_pay_48000,
      4800000, 'INR', 'FAILED_PAYMENT', 'payment.failed',
      'Insufficient funds in customer account', 'INSUFFICIENT_FUNDS',
      'READY', 'HIGH', 0.72, 'HIGH', 3456000,
      'RETRY_LATER', 'SAFE_TO_EXECUTE', 'Within auto-action limits; confidence HIGH', 'AUTO',
      1, v_now - interval '2 hours', v_now + interval '4 hours',
      0, 0, 0.18, 'treatment', null, 'SYSTEM', 'corr_demo_48000',
      '{"payment_method":"upi","demo_seed":true}'::jsonb,
      v_now - interval '1 hour', v_now - interval '1 hour'),
    -- Retry limit exceeded → BLOCKED / HUMAN_ESCALATION
    (v_opp_retry, v_merchant, v_cust_neha, v_txn_retry, v_ord_retry, v_pay_retry,
      1250000, 'INR', 'FAILED_PAYMENT', 'payment.failed',
      'Bank declined transaction', 'BANK_DECLINE',
      'BLOCKED', 'MEDIUM', 0.41, 'MEDIUM', 512500,
      'HUMAN_ESCALATION', 'BLOCKED', 'Retry limit exceeded (3)', 'BLOCKED',
      3, v_now - interval '7 hours', null,
      0, 0, 0.15, 'treatment', null, 'SYSTEM', 'corr_demo_retry_limit',
      '{"payment_method":"card","demo_seed":true}'::jsonb,
      v_now - interval '6 hours', v_now - interval '6 hours'),
    -- High amount → AWAITING_APPROVAL
    (v_opp_approval, v_merchant, v_cust_vikram, v_txn_approval, v_ord_approval, v_pay_approval,
      9500000, 'INR', 'FAILED_PAYMENT', 'payment.failed',
      'Payment gateway timed out', 'GATEWAY_TIMEOUT',
      'AWAITING_APPROVAL', 'CRITICAL', 0.58, 'MEDIUM', 5510000,
      'PAYMENT_LINK', 'REQUIRES_APPROVAL', 'Amount exceeds max auto-action; high risk requires approval', 'REVIEW_REQUIRED',
      0, null, null,
      0, 0, 0.22, 'treatment', null, 'SYSTEM', 'corr_demo_approval',
      '{"payment_method":"netbanking","demo_seed":true}'::jsonb,
      v_now - interval '3 hours', v_now - interval '3 hours'),
    -- Checkout abandonment (control arm)
    (v_opp_abandon, v_merchant, v_cust_ananya, v_txn_abandon, v_ord_abandon, v_pay_abandon,
      899900, 'INR', 'CHECKOUT_ABANDONMENT', 'payment.failed',
      'Checkout abandoned', 'CUSTOMER_CANCELLED',
      'READY', 'LOW', 0.35, 'MEDIUM', 314965,
      'REMINDER', 'SAFE_TO_EXECUTE', 'Safe reminder within frequency limits', 'AUTO',
      0, null, null,
      0, 0, 0.12, 'control', null, 'SYSTEM', 'corr_demo_abandon',
      '{"payment_method":"upi","demo_seed":true}'::jsonb,
      v_now - interval '8 hours', v_now - interval '8 hours'),
    -- Already recovered
    (v_opp_recovered, v_merchant, v_cust_rahul, v_txn_recovered, v_ord_recovered, v_pay_recovered,
      1500000, 'INR', 'FAILED_PAYMENT', 'payment.captured',
      null, null,
      'RECOVERED', 'MEDIUM', 0.66, 'HIGH', 990000,
      'RETRY_NOW', 'SAFE_TO_EXECUTE', 'Recovered via demo intervention', 'AUTO',
      1, v_now - interval '29 hours', null,
      1500000, 1200000, 0.20, 'treatment', v_now - interval '28 hours', 'SYSTEM', 'corr_demo_recovered',
      '{"payment_method":"upi","demo_seed":true}'::jsonb,
      v_now - interval '28 hours', v_now - interval '28 hours'),
    -- Payment link expired (control)
    (v_opp_link, v_merchant, v_cust_neha, v_txn_link, v_ord_link, v_pay_link,
      620000, 'INR', 'PAYMENT_LINK', 'payment.failed',
      'Payment link expired', 'EXPIRED_CARD',
      'READY', 'LOW', 0.48, 'MEDIUM', 297600,
      'PAYMENT_LINK', 'SAFE_TO_EXECUTE', 'Fresh payment link recommended', 'AUTO',
      1, v_now - interval '21 hours', null,
      0, 0, 0.14, 'control', null, 'SYSTEM', 'corr_demo_link',
      '{"payment_method":"card","demo_seed":true}'::jsonb,
      v_now - interval '20 hours', v_now - interval '20 hours'),
    -- Recurring failure
    (v_opp_recurring, v_merchant, v_cust_vikram, v_txn_recurring, v_ord_recurring, v_pay_recurring,
      249900, 'INR', 'RECURRING_FAILURE', 'payment.failed',
      'Mandate execution failed', 'INSUFFICIENT_FUNDS',
      'READY', 'LOW', 0.61, 'HIGH', 152439,
      'RETRY_LATER', 'SAFE_TO_EXECUTE', 'Within auto-action limits', 'AUTO',
      1, v_now - interval '15 hours', v_now + interval '2 hours',
      0, 0, 0.25, 'treatment', null, 'SYSTEM', 'corr_demo_recurring',
      '{"payment_method":"upi","demo_seed":true}'::jsonb,
      v_now - interval '14 hours', v_now - interval '14 hours');

  insert into ai_recommendations (
    id, merchant_id, opportunity_id, recommended_action, recovery_probability,
    expected_recovery_value, confidence, key_factors, alternatives, explanation,
    model_version, used_fallback, created_at
  ) values
    (v_rec_48000, v_merchant, v_opp_48000, 'RETRY_LATER', 0.72, 3456000, 'HIGH',
      '["Strong payment history","Temporary insufficient funds","High expected value"]'::jsonb,
      '[{"action":"RETRY_NOW","probability":0.55,"expected_value":2640000,"cost":0,"risk_penalty":0.1,"utility":2376000},{"action":"DO_NOTHING","probability":0.18,"expected_value":864000,"cost":0,"risk_penalty":0,"utility":864000}]'::jsonb,
      'Customer has strong history; insufficient funds usually clear after a short delay. RETRY_LATER maximizes expected recovery.',
      'revora-lr-v1-synthetic', false, v_now - interval '1 hour'),
    (v_rec_retry, v_merchant, v_opp_retry, 'HUMAN_ESCALATION', 0.41, 512500, 'MEDIUM',
      '["Retry limit reached","Repeated bank declines"]'::jsonb,
      '[{"action":"DO_NOTHING","probability":0.15,"expected_value":187500,"cost":0,"risk_penalty":0,"utility":187500}]'::jsonb,
      'Three declines already; further automatic retries are blocked by policy. Escalate to ops.',
      'revora-lr-v1-synthetic', false, v_now - interval '6 hours'),
    (v_rec_approval, v_merchant, v_opp_approval, 'PAYMENT_LINK', 0.58, 5510000, 'MEDIUM',
      '["High ticket amount","Gateway timeout","Loyal customer"]'::jsonb,
      '[{"action":"RETRY_LATER","probability":0.45,"expected_value":4275000,"cost":0,"risk_penalty":0.15,"utility":3633750}]'::jsonb,
      'Large amount with gateway timeout — payment link gives customer a clean retry path; policy requires approval.',
      'revora-lr-v1-synthetic', false, v_now - interval '3 hours'),
    (v_rec_abandon, v_merchant, v_opp_abandon, 'REMINDER', 0.35, 314965, 'MEDIUM',
      '["New customer","Checkout abandonment"]'::jsonb,
      '[{"action":"DO_NOTHING","probability":0.12,"expected_value":107988,"cost":0,"risk_penalty":0,"utility":107988}]'::jsonb,
      'Abandonment on a new customer — a single reminder is the highest-utility bounded action.',
      'revora-lr-v1-synthetic', false, v_now - interval '8 hours'),
    (v_rec_recovered, v_merchant, v_opp_recovered, 'RETRY_NOW', 0.66, 990000, 'HIGH',
      '["Prior success","Recovered after intervention"]'::jsonb,
      '[{"action":"DO_NOTHING","probability":0.20,"expected_value":300000,"cost":0,"risk_penalty":0,"utility":300000}]'::jsonb,
      'Intervention succeeded; payment captured and incremental recovery recorded.',
      'revora-lr-v1-synthetic', false, v_now - interval '28 hours'),
    (v_rec_link, v_merchant, v_opp_link, 'PAYMENT_LINK', 0.48, 297600, 'MEDIUM',
      '["Expired link","Recoverable intent"]'::jsonb,
      '[{"action":"REMINDER","probability":0.30,"expected_value":186000,"cost":0,"risk_penalty":0,"utility":186000}]'::jsonb,
      'Expired payment link — issue a fresh link rather than retrying a dead instrument.',
      'revora-lr-v1-synthetic', false, v_now - interval '20 hours'),
    (v_rec_recurring, v_merchant, v_opp_recurring, 'RETRY_LATER', 0.61, 152439, 'HIGH',
      '["Recurring mandate","Temporary funds issue"]'::jsonb,
      '[{"action":"RETRY_NOW","probability":0.40,"expected_value":99960,"cost":0,"risk_penalty":0.05,"utility":94962}]'::jsonb,
      'Mandate failure looks temporary; delayed retry is preferred over immediate hammering.',
      'revora-lr-v1-synthetic', false, v_now - interval '14 hours');

  insert into policy_decisions (
    id, merchant_id, opportunity_id, action, decision, reasons, checks, created_at
  ) values
    (v_pol_48000, v_merchant, v_opp_48000, 'RETRY_LATER', 'SAFE_TO_EXECUTE',
      '["Within auto-action limits","confidence HIGH"]'::jsonb,
      '[{"rule":"duplicate_payment_prevention","passed":true,"detail":"No duplicate payment detected"},{"rule":"max_retry_attempts","passed":true,"detail":"1/3 attempts used"}]'::jsonb,
      v_now - interval '1 hour'),
    (v_pol_retry, v_merchant, v_opp_retry, 'RETRY_NOW', 'BLOCKED',
      '["Retry limit exceeded (3)"]'::jsonb,
      '[{"rule":"max_retry_attempts","passed":false,"detail":"3/3 attempts used"}]'::jsonb,
      v_now - interval '6 hours'),
    (v_pol_approval, v_merchant, v_opp_approval, 'PAYMENT_LINK', 'REQUIRES_APPROVAL',
      '["Amount exceeds max auto-action","high risk requires approval"]'::jsonb,
      '[{"rule":"max_auto_action_amount","passed":false,"detail":"9500000 > 5000000"}]'::jsonb,
      v_now - interval '3 hours'),
    (v_pol_abandon, v_merchant, v_opp_abandon, 'REMINDER', 'SAFE_TO_EXECUTE',
      '["Safe reminder within frequency limits"]'::jsonb,
      '[{"rule":"max_reminders_per_24h","passed":true,"detail":"0/2 reminders"}]'::jsonb,
      v_now - interval '8 hours'),
    (v_pol_recovered, v_merchant, v_opp_recovered, 'RETRY_NOW', 'SAFE_TO_EXECUTE',
      '["Recovered via demo intervention"]'::jsonb,
      '[{"rule":"duplicate_payment_prevention","passed":true,"detail":"No duplicate at decision time"}]'::jsonb,
      v_now - interval '28 hours'),
    (v_pol_link, v_merchant, v_opp_link, 'PAYMENT_LINK', 'SAFE_TO_EXECUTE',
      '["Fresh payment link recommended"]'::jsonb,
      '[{"rule":"duplicate_payment_prevention","passed":true,"detail":"No duplicate payment detected"}]'::jsonb,
      v_now - interval '20 hours'),
    (v_pol_recurring, v_merchant, v_opp_recurring, 'RETRY_LATER', 'SAFE_TO_EXECUTE',
      '["Within auto-action limits"]'::jsonb,
      '[{"rule":"max_retry_attempts","passed":true,"detail":"1/3 attempts used"}]'::jsonb,
      v_now - interval '14 hours');

  insert into recovery_actions (
    id, merchant_id, opportunity_id, action_type, status, executor,
    request_payload, response_payload, error_message, idempotency_key, correlation_id,
    created_at, completed_at
  ) values (
    v_action_recovered, v_merchant, v_opp_recovered, 'RETRY_NOW', 'succeeded', 'demo',
    '{"demo":true,"action":"RETRY_NOW"}'::jsonb,
    '{"status":"captured","payment_id":"pay_rzp_recovered"}'::jsonb,
    null,
    'idem_demo_recovered_retry_now',
    'corr_demo_recovered',
    v_now - interval '29 hours',
    v_now - interval '28 hours'
  );

  insert into recovery_outcomes (
    id, merchant_id, opportunity_id, action_id,
    actual_recovered_amount, incremental_recovered_amount, baseline_expected,
    verified_via, payment_status, created_at
  ) values (
    v_outcome_recovered, v_merchant, v_opp_recovered, v_action_recovered,
    1500000, 1200000, 300000,
    'demo', 'captured', v_now - interval '28 hours'
  );

  insert into experiments (
    id, merchant_id, name, description, status,
    control_size, treatment_size, started_at, completed_at, created_at
  ) values (
    v_exp, v_merchant,
    'AI Recovery Lift',
    'Baseline do-nothing / simple retry vs REVORA counterfactual recovery',
    'running', 2, 5,
    v_now - interval '14 days', null, v_now - interval '14 days'
  );

  insert into experiment_assignments (id, experiment_id, opportunity_id, arm, created_at) values
    (v_asg_1, v_exp, v_opp_48000, 'treatment', v_now - interval '1 hour'),
    (v_asg_2, v_exp, v_opp_retry, 'treatment', v_now - interval '6 hours'),
    (v_asg_3, v_exp, v_opp_approval, 'treatment', v_now - interval '3 hours'),
    (v_asg_4, v_exp, v_opp_abandon, 'control', v_now - interval '8 hours'),
    (v_asg_5, v_exp, v_opp_recovered, 'treatment', v_now - interval '28 hours'),
    (v_asg_6, v_exp, v_opp_link, 'control', v_now - interval '20 hours'),
    (v_asg_7, v_exp, v_opp_recurring, 'treatment', v_now - interval '14 hours');

  insert into experiment_results (
    id, experiment_id, control_recovered, treatment_recovered,
    control_recovery_rate, treatment_recovery_rate, incremental_recovery,
    control_intervention_rate, treatment_intervention_rate, computed_at, data_label
  ) values (
    v_exp_result, v_exp, 0, 1500000,
    0.0, 0.2, 1500000,
    1.0, 1.0, v_now,
    'Demo evaluation — synthetic data'
  );

  insert into system_incidents (
    id, merchant_id, type, severity, title, description,
    what_broke, recovery_action, final_state, resolved,
    opportunity_id, correlation_id, created_at, resolved_at
  ) values
    (v_inc_dup, v_merchant, 'DUPLICATE_WEBHOOK', 'info',
      'Duplicate webhook ignored',
      'Razorpay resent payment.failed event; idempotency key prevented double processing.',
      'Duplicate webhook delivery',
      'Idempotent event store skipped reprocessing',
      'Recovered safely — single opportunity retained',
      true, v_opp_48000, 'corr_demo_48000',
      v_now - interval '5 hours', v_now - interval '5 hours'),
    (v_inc_timeout, v_merchant, 'API_TIMEOUT', 'warning',
      'Razorpay API timeout during recovery',
      'Payment link create timed out; action marked RETRY_PENDING and reconciled.',
      'Upstream API timeout',
      'Safe retry with idempotency key + state reconciliation',
      'Retried successfully',
      true, null, null,
      v_now - interval '30 hours', v_now - interval '29 hours');

  -- Audit trail for hero + recovered opportunities (subset; full narrative in demo store)
  insert into audit_events (
    id, merchant_id, opportunity_id, actor, actor_type, event,
    previous_state, new_state, reason, ai_recommendation, policy_decision,
    execution_result, request_id, correlation_id, metadata, created_at
  ) values
    ('a0000000-0000-4000-8000-0000000000c1', v_merchant, v_opp_48000, 'razorpay.webhook', 'WEBHOOK', 'PAYMENT_FAILED',
      null, 'DETECTED', 'Insufficient funds in customer account', null, null, null,
      'req_demo_48000', 'corr_demo_48000', '{}'::jsonb, v_now - interval '1 hour'),
    ('a0000000-0000-4000-8000-0000000000c2', v_merchant, v_opp_48000, 'revora.detector', 'SYSTEM', 'OPPORTUNITY_CREATED',
      null, 'DETECTED', 'FAILED PAYMENT — ₹48,000 at risk', null, null, null,
      null, 'corr_demo_48000', '{}'::jsonb, v_now - interval '1 hour' + interval '1 second'),
    ('a0000000-0000-4000-8000-0000000000c3', v_merchant, v_opp_48000, 'revora.decision_engine', 'AI', 'AI_ANALYSIS_COMPLETE',
      'ANALYZING', 'READY',
      'Customer has strong history; insufficient funds usually clear after a short delay. RETRY_LATER maximizes expected recovery.',
      'RETRY_LATER', 'SAFE_TO_EXECUTE', null,
      null, 'corr_demo_48000', '{"probability":0.72}'::jsonb, v_now - interval '1 hour' + interval '3 seconds'),
    ('a0000000-0000-4000-8000-0000000000c4', v_merchant, v_opp_recovered, 'revora.outcome', 'SYSTEM', 'RECOVERY_CONFIRMED',
      'WAITING_FOR_OUTCOME', 'RECOVERED', '₹15,000 recovered', null, null, 'success',
      null, 'corr_demo_recovered', '{"actual_recovered_amount":1500000}'::jsonb,
      v_now - interval '28 hours' + interval '1 minute');

  insert into webhook_events (
    id, merchant_id, razorpay_event_id, event_type, payload,
    signature_valid, processed, processing_error, received_at, processed_at
  ) values (
    'a0000000-0000-4000-8000-0000000000d1',
    v_merchant,
    'evt_demo_payment_failed_48000',
    'payment.failed',
    '{"event":"payment.failed","payload":{"payment":{"entity":{"id":"pay_rzp_48000","amount":4800000,"status":"failed"}}}}'::jsonb,
    true, true, null,
    v_now - interval '1 hour', v_now - interval '1 hour' + interval '2 seconds'
  );
end $$;
