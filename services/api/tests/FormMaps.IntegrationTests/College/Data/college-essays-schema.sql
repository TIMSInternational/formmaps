-- Schema-only harness DDL for college essays + comments (FM-DOTNET-083), hand-written from schema.prisma.
-- No RLS policies. college_essays carries every scalar the essay routes read/write; status is the EssayStatus enum
-- (default draft), wordCount Int (default 0). essay_comments backs the add/list comment routes; users supplies the
-- {id,name,roleName} author join. studentApplicationId is a plain nullable text column (no FK — the FK is not the
-- parity point under test). Non-UTC tz is set on the container (America/New_York) as the timestamp regression pin.

CREATE TYPE "EssayStatus" AS ENUM ('draft', 'in_review', 'revised', 'final_version');

CREATE TABLE "users" (
    "id"       text PRIMARY KEY,
    "name"     text NOT NULL,
    "roleName" text NOT NULL
);

CREATE TABLE "college_essays" (
    "id"                   text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "studentId"            text NOT NULL,
    "studentApplicationId" text,
    "title"                text NOT NULL,
    "prompt"               text,
    "content"              text,
    "status"               "EssayStatus" NOT NULL DEFAULT 'draft',
    "wordCount"            integer NOT NULL DEFAULT 0,
    "essayType"            text,
    "isActive"             boolean NOT NULL DEFAULT true,
    "createdBy"            text,
    "createdDate"          timestamp NOT NULL DEFAULT now(),
    "updatedBy"            text,
    "updatedAt"            timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "essay_comments" (
    "id"          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "essayId"     text NOT NULL,
    "authorId"    text NOT NULL,
    "content"     text NOT NULL,
    "isActive"    boolean NOT NULL DEFAULT true,
    "createdDate" timestamp NOT NULL DEFAULT now(),
    "updatedAt"   timestamp NOT NULL DEFAULT now()
);
