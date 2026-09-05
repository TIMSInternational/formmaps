-- services/api/tests/FormMaps.IntegrationTests/Billing/Data/live-subscription-duplicate-row-schema.sql
--
-- formmaps#108, the CONSTRAINT-ABSENT contract schema for LiveSubscriptionDuplicateRowTests. Read the
-- class summary on LiveSubscriptionDuplicateRowFixture before trusting the DDL below: production is
-- believed to carry "user_subscriptions_userId_key"; this file omits it ON PURPOSE so the reader's
-- ORDER BY/LIMIT and the writer's row scope stay exercised on a database without the index. Columns
-- and types are copied from api/prisma/migrations/20260505140750_init/migration.sql (TIMESTAMP(3), not
-- TIMESTAMPTZ) so the nextBillingDate/updatedAt round-trips exercise the same Npgsql type mapping
-- production does.
--
-- stripeSubscriptionId and cancelAtPeriodEnd are declared from schema.prisma, not from a migration: no
-- migration in api/prisma/migrations mentions either COLUMN. That drift is real and tracked as
-- formmaps#126. stripeSubscriptionId is left NON-unique here too; only the absent userId unique is
-- under test, and the seeds give every row a distinct id anyway.
--
-- Was a C# const in LiveSubscriptionDuplicateRowTests.cs until formmaps#125 (to avoid a csproj edit
-- while other lanes were in flight); it is an embedded resource now because RlsEnabledDatabaseFixture
-- loads its schema that way. Nothing else about it changed.
CREATE TABLE "user_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "nextBillingDate" TIMESTAMP(3),
    "stripeSubscriptionId" TEXT,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id")
);

-- NON-unique, exactly as the init migration creates it. "user_subscriptions_userId_key" is
-- deliberately OMITTED so the defence-in-depth ordering/row-scope stays exercised. Production
-- DOES have that index (see the class summary) -- this omission is the point of the fixture, not
-- a claim about prod.
CREATE INDEX "user_subscriptions_userId_idx" ON "user_subscriptions"("userId");

-- formmaps#125: the production user_subscriptions policy (003-fk-users.sql) sub-selects users for its
-- school branch, so the table has to exist for the policy to apply at all. Only the two columns the
-- policies name. The duplicate-row tests never read it -- the caller under test reaches its own rows
-- on the owner branch -- but the cross-school negative control seeds it.
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
