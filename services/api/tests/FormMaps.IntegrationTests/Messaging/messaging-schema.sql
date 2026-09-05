-- services/api/tests/FormMaps.IntegrationTests/Messaging/messaging-schema.sql
CREATE TABLE "users" (
  "id" text PRIMARY KEY, "name" text NOT NULL, "email" text NOT NULL,
  "roleId" text NOT NULL DEFAULT '', "roleName" text NOT NULL, "schoolId" text, "isActive" boolean NOT NULL DEFAULT true
);

-- "updatedAt" is NOT NULL with NO database default in production (verified against formmaps_dev:
-- \d conversations / \d messages). Prisma's @updatedAt is application-managed, not a DB default —
-- unlike "createdDate" @default(now()), which IS a real DB default (DEFAULT CURRENT_TIMESTAMP).
-- Do not add DEFAULT now() back to "updatedAt": every writer must bind it explicitly, matching prod.
CREATE TABLE "conversations" (
  "id" text PRIMARY KEY, "participantAId" text NOT NULL, "participantBId" text NOT NULL,
  "lastMessageAt" timestamp, "lastMessagePreview" text, "isActive" boolean NOT NULL DEFAULT true,
  "createdDate" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL,
  UNIQUE ("participantAId", "participantBId")
);

CREATE TABLE "messages" (
  "id" text PRIMARY KEY, "conversationId" text NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "senderId" text NOT NULL, "content" text NOT NULL, "readAt" timestamp, "isActive" boolean NOT NULL DEFAULT true,
  "createdDate" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL
);

CREATE TABLE "user_blocks" (
  "id" text PRIMARY KEY, "blockerId" text NOT NULL, "blockedId" text NOT NULL, "isActive" boolean NOT NULL DEFAULT true
);

CREATE TABLE "counselor_student_assignments" (
  "id" text PRIMARY KEY, "counselorId" text NOT NULL, "studentId" text NOT NULL, "isActive" boolean NOT NULL DEFAULT true
);

CREATE TABLE "student_parent_links" (
  "id" text PRIMARY KEY, "studentId" text NOT NULL, "parentUserId" text, "isActive" boolean NOT NULL DEFAULT false,
  "isAccepted" boolean NOT NULL DEFAULT false
);

CREATE TABLE "notification_outbox" (
  "id" text PRIMARY KEY, "type" text NOT NULL, "payload" jsonb NOT NULL, "due_at" timestamp NOT NULL,
  "processed_at" timestamp, "attempts" int NOT NULL DEFAULT 0, "createdDate" timestamp NOT NULL DEFAULT now()
);

-- formmaps#125: the hand-written conversations/messages policies that used to end this file are GONE.
-- The fixture derives from RlsEnabledDatabaseFixture, which applies the VENDORED production files
-- (TestSupport/Rls/*.sql) to every table above that production policies -- users, conversations,
-- messages, counselor_student_assignments, student_parent_links -- and runs the repository as a
-- NOSUPERUSER NOBYPASSRLS login. The old copies were both redundant (the applier issues DROP POLICY IF
-- EXISTS tenant_isolation before CREATE) and misleading: they were only ever exercised by the container
-- superuser, which bypasses RLS outright, so they enforced nothing.
