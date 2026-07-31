-- infra/aws/sql/billing-shadow-tables.sql
-- Domain 9a shadow tables. Written to ONLY by the .NET webhook handler during shadow mode —
-- never by Node, never read by any user-facing code path. Retired at cutover (see spec).
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS "shadow_user_subscriptions" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "planId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "nextBillingDate" TIMESTAMPTZ,
    "stripeSubscriptionId" TEXT UNIQUE,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "shadow_user_subscriptions_userId_key" ON "shadow_user_subscriptions" ("userId");

CREATE TABLE IF NOT EXISTS "shadow_payments" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL UNIQUE,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "shadow_stripe_events" (
    "id" TEXT PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "shadow_stripe_events_processedAt_idx" ON "shadow_stripe_events" ("processedAt");
