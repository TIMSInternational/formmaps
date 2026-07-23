-- Schema-only harness DDL for the student portfolio CRUD (FM-DOTNET-073), hand-written from schema.prisma (the
-- activityCategory enum + totalHours/weeksPerYear/achievements/role/endDate columns have no committed migration —
-- prod carries them via db push). hoursPerWeek/totalHours are Decimal(65,30) (trim_scale::text on read); attachments
-- is jsonb; activityCategory is the enum type (default 'other'); achievements/skills are text[].

CREATE TYPE "StudentActivityCategory" AS ENUM ('academic', 'athletic', 'arts', 'community_service', 'work', 'leadership', 'other');

CREATE TABLE "student_portfolio_items" (
    "id"               text PRIMARY KEY,
    "studentId"        text NOT NULL,
    "type"             text NOT NULL,
    "title"            text NOT NULL,
    "organization"     text,
    "startDate"        text,
    "endDate"          text,
    "isCurrent"        boolean NOT NULL DEFAULT false,
    "description"      text,
    "role"             text,
    "hoursPerWeek"     decimal(65,30),
    "totalHours"       decimal(65,30),
    "achievements"     text[] NOT NULL DEFAULT '{}',
    "skills"           text[] NOT NULL DEFAULT '{}',
    "attachments"      jsonb NOT NULL DEFAULT '[]',
    "activityCategory" "StudentActivityCategory" NOT NULL DEFAULT 'other',
    "weeksPerYear"     integer,
    "isActive"         boolean NOT NULL DEFAULT true,
    "createdBy"        text,
    "createdDate"      timestamp NOT NULL DEFAULT now(),
    "updatedBy"        text,
    "updatedAt"        timestamp NOT NULL DEFAULT now()
);
