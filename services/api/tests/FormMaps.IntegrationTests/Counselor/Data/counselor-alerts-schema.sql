-- Schema-only harness DDL for the counselor alerts GET/PUT (FM-DOTNET-070). severity is the native AlertSeverity enum
-- (read back ::text). Includes counselor_student_assignments for the caseload scoping + the IDOR-fold test.

CREATE TABLE "counselor_student_assignments" (
    "id"          text PRIMARY KEY,
    "counselorId" text NOT NULL,
    "studentId"   text NOT NULL,
    "isActive"    boolean NOT NULL DEFAULT true
);

CREATE TYPE "AlertSeverity" AS ENUM ('info', 'warning', 'high', 'critical');

CREATE TABLE "student_alerts" (
    "id"              text PRIMARY KEY,
    "schoolId"        text,
    "studentId"       text NOT NULL,
    "counselorId"     text,
    "type"            text NOT NULL,
    "severity"        "AlertSeverity" NOT NULL DEFAULT 'info',
    "title"           text,
    "message"         text NOT NULL DEFAULT '',
    "details"         text,
    "isRead"          boolean NOT NULL DEFAULT false,
    "isDismissed"     boolean NOT NULL DEFAULT false,
    "readBy"          text,
    "readAt"          timestamp,
    "relatedEntityId" text,
    "isActive"        boolean NOT NULL DEFAULT true,
    "createdBy"       text,
    "createdDate"     timestamp NOT NULL DEFAULT now(),
    "updatedBy"       text,
    "updatedAt"       timestamp NOT NULL DEFAULT now()
);
