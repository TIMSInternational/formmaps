-- Schema-only harness for the resume section + template writes (FM-DOTNET-089 — routes/resume.ts). Only the
-- columns the repository touches, hand-authored from prisma/schema.prisma (model Resume). NO RLS (the resumes
-- table has none — ownership is enforced in code), NO foreign keys. sections is real jsonb so the ::jsonb
-- round-trip is exercised.

CREATE TABLE "resumes" (
    "id"          text PRIMARY KEY,
    "userId"      text NOT NULL,
    "template"    text NOT NULL DEFAULT '',
    "sections"    jsonb NOT NULL DEFAULT '[]',
    "isActive"    boolean NOT NULL DEFAULT true,
    "createdDate" timestamp(3) NOT NULL DEFAULT now(),
    "updatedAt"   timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX "resumes_userId_idx" ON "resumes"("userId");
