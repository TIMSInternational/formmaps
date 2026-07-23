-- Schema-only harness for the derived-pathways slice (FM-DOTNET-058). Hand-authored from prisma/schema.prisma. The
-- read touches ONE table — school_courses — projecting id/code/name/department/prerequisites/isHonors under
-- WHERE schoolId AND isActive=true AND status='active' ORDER BY code ASC. prerequisites TEXT[]; the derivation is
-- pure Postgres-independent past the ORDER BY. NO RLS policies (schema-only). Distinct basename ("pathways-schema.sql")
-- so there is no EmbeddedResource EndsWith collision with the other slice schemas.

CREATE TABLE "school_courses" (
    "id"                text PRIMARY KEY,
    "schoolId"          text NOT NULL,
    "code"              text NOT NULL,
    "name"              text NOT NULL,
    "department"        text NOT NULL DEFAULT '',
    "prerequisites"     text[] DEFAULT ARRAY[]::text[],
    "isHonors"          boolean NOT NULL DEFAULT false,
    "status"            text NOT NULL DEFAULT 'active',
    "isActive"          boolean NOT NULL DEFAULT true,
    CONSTRAINT "pathways_school_courses_schoolId_code_key" UNIQUE ("schoolId", "code")
);

CREATE INDEX "pathways_courses_schoolId_idx" ON "school_courses"("schoolId");
