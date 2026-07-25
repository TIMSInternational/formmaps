-- Schema-only harness for the resume CRUD list + create (FM-DOTNET-090 — routes/resume.ts). The FULL resumes
-- table (all 22 columns in schema-declaration order), hand-authored from prisma/schema.prisma (model Resume) so
-- the full-row RETURNING/SELECT passthrough (jsonb ::text round-trip, DB defaults for documentEdits/hasOriginal/
-- isActive, nullable createdBy/updatedBy/original* strings) is exercised end-to-end. NO RLS (resumes has none —
-- ownership is enforced in code), NO foreign keys. Every jsonb column is real jsonb. createdDate/updatedAt carry a
-- now() default so the INSERT — which sets them explicitly — is faithful and any omitted write still succeeds.

CREATE TABLE "resumes" (
    "id"               text PRIMARY KEY,
    "userId"           text NOT NULL,
    "name"             text NOT NULL DEFAULT '',
    "template"         text NOT NULL DEFAULT '',
    "careerField"      text NOT NULL DEFAULT '',
    "personalInfo"     jsonb NOT NULL DEFAULT '{}',
    "experience"       jsonb NOT NULL DEFAULT '[]',
    "education"        jsonb NOT NULL DEFAULT '[]',
    "skills"           jsonb NOT NULL DEFAULT '[]',
    "sections"         jsonb NOT NULL DEFAULT '[]',
    "fieldVisibility"  jsonb NOT NULL DEFAULT '{}',
    "customFields"     jsonb NOT NULL DEFAULT '[]',
    "documentEdits"    jsonb NOT NULL DEFAULT '[]',
    "originalFileKey"  text,
    "originalFileType" text,
    "originalPdfKey"   text,
    "hasOriginal"      boolean NOT NULL DEFAULT false,
    "isActive"         boolean NOT NULL DEFAULT true,
    "createdBy"        text,
    "createdDate"      timestamp(3) NOT NULL DEFAULT now(),
    "updatedBy"        text,
    "updatedAt"        timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX "resumes_userId_idx" ON "resumes"("userId");
