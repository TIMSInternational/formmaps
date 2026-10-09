-- Local seed for e2e/audit-batch-b.spec.ts (formmaps_dev only; idempotent).
--   psql -d formmaps_dev -f apps/web/e2e/fixtures/audit-batch-b.sql
-- A catalog student plan, one payment per status the Transactions tabs group, an invited school,
-- and a completed paid booking for test.coach.
INSERT INTO subscription_plans (id, name, price, interval, features, "updatedAt")
VALUES ('e2e-plan-pro', 'Pro', 29.99, 'month', ARRAY['Everything in Starter'], now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO payments (id, "userId", "paymentIntentId", amount, currency, status, description, "updatedAt", "createdDate")
SELECT v.id, u.id, v.pi, v.amount, v.cur, v.status, v.descr, now(), now() - v.age
FROM users u, (VALUES
  ('e2e-pay-paid',    'cs_e2e_paid',    2999, 'usd', 'succeeded',          'E2E paid Pro',          interval '1 day'),
  ('e2e-pay-trial',   'cs_e2e_trial',   0,    'usd', 'trialing',           'E2E free trial',        interval '2 days'),
  ('e2e-pay-partial', 'pi_e2e_partial', 1500, 'usd', 'partially_refunded', 'E2E partial refund',    interval '3 days'),
  ('e2e-pay-pending', 'cs_e2e_pending', 999,  'usd', 'pending',            'E2E pending checkout',  interval '4 days'),
  ('e2e-pay-eur',     'pi_e2e_eur',     5000, 'eur', 'succeeded',          'E2E euro charge',       interval '5 days')
) AS v(id, pi, amount, cur, status, descr, age)
WHERE u.email = 'test.student@formmaps.dev'
ON CONFLICT (id) DO NOTHING;

INSERT INTO schools (id, name, "adminEmail", "maxStudents", status, "invitationToken", "invitationTokenExpiresAt", "invitedAt", "updatedAt")
VALUES ('e2e-school-invited', 'E2E Invited School', 'e2e.invited.head@example.test', 50, 'invited', 'e2e-old-token', now() + interval '1 day', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO bookings (id, "coachId", "studentId", "startTime", "endTime", status, amount, currency, "isPaymentDone", "updatedAt")
SELECT 'e2e-booking-done', c.id, s.id, now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 'completed', 5000, 'USD', true, now()
FROM coaches c JOIN users cu ON cu.id = c."userId", users s
WHERE cu.email = 'test.coach@formmaps.dev' AND s.email = 'test.student@formmaps.dev'
ON CONFLICT (id) DO NOTHING;
