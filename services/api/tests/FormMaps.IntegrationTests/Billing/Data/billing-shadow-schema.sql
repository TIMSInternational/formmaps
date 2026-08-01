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

-- Appended to billing-shadow-schema.sql: minimal live tables for integration tests only
-- (production already has these via the legacy Node/Prisma migrations — this fixture just
-- mirrors them so Testcontainers tests can seed/read realistic live-side data).
CREATE TABLE IF NOT EXISTS "subscription_plans" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "price" NUMERIC NOT NULL,
    "interval" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);
-- Domain 9a Task 8: read by IPlanReader to resolve the Stripe Price id for POST /checkout-session.
ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "stripePriceId" TEXT;

CREATE TABLE IF NOT EXISTS "user_subscriptions" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "nextBillingDate" TIMESTAMPTZ,
    "stripeSubscriptionId" TEXT UNIQUE,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- Domain 9a final-review fix wave (Important 7): POST /portal now reads the LIVE
-- users."stripeCustomerId" through ILiveCustomerReader instead of creating a Stripe customer, so the
-- fixture needs the two columns LiveCustomerReader selects on.
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT PRIMARY KEY,
    "stripeCustomerId" TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS "stripe_events" (
    "id" TEXT PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
