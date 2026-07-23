-- Schema-only harness DDL for the counselor sessions GET/complete (FM-DOTNET-071). calendarEventIds is jsonb
-- (verbatim passthrough); status is a plain string column. Includes users for the studentName join.

CREATE TABLE "users" (
    "id"   text PRIMARY KEY,
    "name" text
);

CREATE TABLE "counselor_sessions" (
    "id"                 text PRIMARY KEY,
    "counselorId"        text NOT NULL,
    "studentId"          text NOT NULL,
    "startTime"          timestamp NOT NULL,
    "endTime"            timestamp NOT NULL,
    "status"             text NOT NULL DEFAULT 'confirmed',
    "topic"              text NOT NULL DEFAULT '',
    "notes"              text NOT NULL DEFAULT '',
    "counselorNotes"     text NOT NULL DEFAULT '',
    "meetingLink"        text NOT NULL DEFAULT '',
    "calendarEventIds"   jsonb NOT NULL DEFAULT '{}',
    "cancellationReason" text NOT NULL DEFAULT '',
    "cancelledAt"        timestamp,
    "cancelledBy"        text,
    "completedAt"        timestamp,
    "isActive"           boolean NOT NULL DEFAULT true,
    "createdBy"          text,
    "createdDate"        timestamp NOT NULL DEFAULT now(),
    "updatedBy"          text,
    "updatedAt"          timestamp NOT NULL DEFAULT now()
);
