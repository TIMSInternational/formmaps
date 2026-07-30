-- Schema-only harness DDL for video sessions (FM-091..097). Includes the counselor_sessions table
-- filtered to video-call rows (topic='Video Call'), schools for videoCallsEnabled, and users for joins.

CREATE TABLE "users" (
    "id"       text PRIMARY KEY,
    "name"     text,
    "email"    text,
    "isActive" boolean NOT NULL DEFAULT true
);

CREATE TABLE "schools" (
    "id"                   text PRIMARY KEY,
    "name"                 text NOT NULL,
    "videoCallsEnabled"    boolean NOT NULL DEFAULT false
);

CREATE TABLE "counselor_sessions" (
    "id"                 text PRIMARY KEY,
    "counselorId"        text NOT NULL,
    "studentId"          text NOT NULL,
    "startTime"          timestamp NOT NULL,
    "endTime"            timestamp NOT NULL,
    "status"             text NOT NULL DEFAULT 'video_active',
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
