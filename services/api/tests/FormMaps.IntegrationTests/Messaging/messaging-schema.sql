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

ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "conversations"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("participantAId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR ("participantBId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("participantAId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR ("participantBId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
  );

ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "messages"
  USING (current_setting('app.bypass_rls', true) = 'on' OR EXISTS (SELECT 1 FROM conversations c WHERE c.id = "messages"."conversationId"))
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR EXISTS (SELECT 1 FROM conversations c WHERE c.id = "messages"."conversationId"));
