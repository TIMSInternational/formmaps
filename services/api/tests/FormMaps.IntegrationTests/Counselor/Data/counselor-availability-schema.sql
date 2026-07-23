-- Schema-only harness DDL for the counselor availability GET/PUT (FM-DOTNET-069). weeklySchedule is jsonb (verbatim
-- passthrough); userId is unique (the upsert conflict target). gen_random_uuid() is built-in on Postgres 16.

CREATE TABLE "counselor_availabilities" (
    "id"             text PRIMARY KEY,
    "userId"         text NOT NULL UNIQUE,
    "timezone"       text NOT NULL DEFAULT 'UTC',
    "weeklySchedule" jsonb NOT NULL DEFAULT '[]',
    "isActive"       boolean NOT NULL DEFAULT true,
    "createdBy"      text,
    "createdDate"    timestamp NOT NULL DEFAULT now(),
    "updatedBy"      text,
    "updatedAt"      timestamp NOT NULL DEFAULT now()
);
