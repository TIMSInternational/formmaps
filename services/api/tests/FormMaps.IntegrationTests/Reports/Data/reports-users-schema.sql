-- Schema-only harness for the Reports domain's send-report-email recipient lookup (Phase F). Hand-authored from
-- prisma/schema.prisma with only the columns ReportEmailRecipientReader touches: users (id/email/name), matching
-- legacy's prisma.user.findUnique({select:{id,email,name}}) in routes/report.ts:76. NO RLS policies (schema-only),
-- consistent with the other report-domain readers' request context (RequestContext.System() bypasses tenant GUCs).
-- This is the FIRST Testcontainers Postgres fixture for the Reports domain -- the existing 7 report-reader test
-- files (Coaching/Evaluation/Lia/Pca/SchoolBenchmark/Timeline/User) are HTTP-level endpoint tests against fakes,
-- not real-DB reader tests, so there was no prior Reports fixture to reuse (confirmed via
-- `grep -rl "IClassFixture" Reports/*.cs` returning no matches).

CREATE TABLE "users" (
    "id"    text PRIMARY KEY,
    "email" text NOT NULL,
    "name"  text NOT NULL
);
