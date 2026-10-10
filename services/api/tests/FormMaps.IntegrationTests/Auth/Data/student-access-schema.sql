-- Schema-only DDL for the StudentAccessReader RLS harness (TIMSInternational/formmaps#240).
-- Touched-column subsets of the live Prisma tables, same names/types as prisma/schema.prisma:
-- users, schools (status is the SchoolStatus PG enum, as in production), subscription_plans,
-- user_subscriptions. RlsEnabledDatabaseFixture applies EVERY vendored production policy whose
-- target table exists here, so whichever of these production policies is policied below too.

CREATE TYPE "SchoolStatus" AS ENUM ('invited', 'active', 'inactive', 'suspended');

CREATE TABLE "schools" (
    "id"                TEXT NOT NULL,
    "name"              TEXT NOT NULL DEFAULT '',
    "isActive"          BOOLEAN NOT NULL DEFAULT true,
    "status"            "SchoolStatus" NOT NULL DEFAULT 'invited',
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate"   TIMESTAMP(3),
    "timezone"          TEXT,
    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
    "id"       TEXT NOT NULL,
    "email"    TEXT,
    "roleName" TEXT,
    "schoolId" TEXT,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription_plans" (
    "id"       TEXT NOT NULL,
    "name"     TEXT NOT NULL DEFAULT '',
    "interval" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_subscriptions" (
    "id"              TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "planId"          TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'active',
    "isActive"        BOOLEAN NOT NULL DEFAULT true,
    "nextBillingDate" TIMESTAMP(3),
    CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id")
);
