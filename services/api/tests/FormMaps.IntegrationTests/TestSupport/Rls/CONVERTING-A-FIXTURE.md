# Converting a fixture to real RLS (formmaps#125)

Seven fixtures are converted — the seven types deriving from `RlsEnabledDatabaseFixture`, which is the
only caller of `ProductionRlsPolicies.ApplyAsync`: `TestScoreDatabaseFixture`,
`CounselorCaseloadDatabaseFixture`, `SchoolStudentsDatabaseFixture`, and the nested `Fixture` of
`ParentChildReaderTests`, `ParentPortalRepositoryTests`, `CoursePlanComputeReaderTests` and
`StudentParentRepositoryTests`. (`AuditDatabaseFixture` enforces policies too but is deliberately NOT
derived from that base — `audit_events` is .NET-owned and its policy ships in `infra/aws/sql/`, so it
appears in none of the vendored files; see that fixture's own comment.) This is the route for the rest,
plus the inventory that says which ones are worth converting and in what order.

## The state of the world before #125

54 schema fixtures in this project create 323 tables between them. **227 of those table definitions
correspond to a table production policies.** Exactly one fixture applied any RLS at all
(`Messaging/messaging-schema.sql`, and only for `conversations` + `messages`) — and even that one is
**inert by design**: `MessagesAdversarialAccessTests` connects as the container superuser and opens with
a test named `Rls_is_genuinely_inert_in_this_suite_so_these_tests_measure_app_layer_only`. That is an
honest position for an app-layer suite, but it means that before this change **no .NET test anywhere
could tell an Identity-session read from a System-session read.** `SchoolUsers/SchoolUserRoleRlsHarness.cs`
(2026-08-10) was the first fixture to actually enforce policies; this is the generalisation of it.

That gap is not theoretical. Three of the four .NET parent surfaces shipped to production with the
formmaps#121 RLS bug and every test was green.

## The five steps

1. **Derive the fixture from `RlsEnabledDatabaseFixture`** instead of building a `PostgreSqlContainer` by
   hand. Give it `SchemaResourceFileName` and `PoliciedTables`.
2. **Name every table in the fixture that production policies, and no others.** Getting this wrong is a
   fixture failure, not a silent hole: naming an unpolicied table throws, and omitting a policied one
   leaves it unprotected (the applier reports what it applied via `AppliedPolicyTables`, which the
   harness-proof test asserts).
3. **Split the data sources.** `AppConnectionString` (NOSUPERUSER NOBYPASSRLS) for the code under test;
   `AdminConnectionString` (superuser) for seeding, `TRUNCATE`, and assertions. Assertions must be on the
   admin side — a policy-filtered assertion cannot distinguish "row absent" from "row invisible", and the
   whole test then passes for the wrong reason.
4. **Add the harness-proof test** (`BypassesRlsAsync` is false + the expected `AppliedPolicyTables`). Note
   its data source is the APP one; during this conversion a blanket rename put it on the admin connection
   and it immediately failed, which is exactly its job.
5. **Negative-control every case.** Assert the legitimate reader CAN see the row AND the illegitimate one
   CANNOT, over the same seeded data.

## The trap that makes most of this worth doing

The interesting cases are the ones where **RLS cannot do the gate's job for it.** Most of these policies
have a school branch: any caller sharing the row-owner's `schoolId` is admitted. So:

* a **school-less** caller (a parent) tests almost nothing at the app layer — the policy hides the victim
  row anyway, and a repository with *no* ownership check would still return nothing;
* a **school-scoped** caller (staff, a student's classmate) is the useful adversary — the policy admits
  the row and only the repository's `WHERE` denies it.

Convert with a caller of each kind, or the app-layer half of the suite stays vacuous. Several tests here
(`Notifications_do_not_leak_a_same_school_row_that_RLS_would_admit`,
`Counselor_assignment_gate_denies_an_unassigned_same_school_counselor`,
`List_does_not_leak_a_classmates_links_that_RLS_admits`) exist only for that reason.

## What conversion will break, and why that is the finding

Expect three failure modes on first run. All three are the fixture being wrong, not the harness:

* **`42703 column "x" does not exist`.** The hand-written DDL models only the columns its queries touch;
  the policy names one it left out. `schoolId` on the direct-tenant tables is the usual culprit — it was
  missing from `student_grades`, `graduation_plans`, and `graduation_plan_items`. Add the column.
* **A policy body sub-selects a table the fixture does not create** (`users`, `coaches`, `conversations`
  are the only three). Add the table. `testscores-schema.sql` and `student-parents-schema.sql` both had
  to gain a `users` table for this reason; neither reads it.
* **A test asserted with an unrealistic caller.** `TestScoreReaderTests` built a *counselor* context with
  `schoolId: null`, which the policies deny — production mints school staff *with* a school. The old
  fixture let that pass. Fix the context, not the policy.

## Priority for the remaining ~47

Ranked by policied tables the fixture already models (the count is what a conversion would cover).
Counts include `pilot.sql`'s two tables since #135 vendored it; the rows that moved say by how much.
This table is UNCONVERTED fixtures only — the three that used to head it (`SchoolStudents` 14,
`Counselor` 11, `StudentCoursePlan` 10, each having gained one or two tables from `pilot.sql`) are
converted and are listed at the top of this file.

| Fixture | tables | policied | note |
|---|---|---|---|
| `Assessments/assessmentprofile-schema.sql` | 10 | 8 | |
| `SchoolAdmin/schooladmin-schema.sql` | 11 | 8 | |
| `SchoolReads/schoolreads-schema.sql` | 8 | 8 | was 7 (+`school_courses`) |
| `AcademicGaps` | 6–7 | 7 | was 6 (+`school_courses`) |
| `SchoolAnalytics` | 6–7 | 6 | |
| `Auth/auth-schema.sql` | 8 | 5 | `refresh_tokens` is owner-only (007); `SchoolUserRoleRlsHarness` already covers that shape |
| `Messaging/messaging-schema.sql` | 7 | 5 | deliberately inert today; converting means *adding* an RLS-on twin suite, not flipping this one |
| `DbRole/dotnet-service-role-stub-schema.sql` | 87 | 57 | do NOT convert — it is a GRANT-verification stub, one row per table, no queries under test |

**Any fixture in that table whose schema creates `school_courses` or `student_course_plans` needs a
`schoolId` column, NOT NULL and seeded with the session's school, before it can be converted** —
`pilot.sql`'s predicate names that column, and without it `ApplyAsync` fails the fixture's init with
`42703`, which is exactly what `parent-child-reads-schema.sql` did when #135 vendored the file. Ten of
these schemas create `school_courses` (AcademicGaps, Counselor, CourseImport, DbRole, Pathways,
Prerequisites, SchoolCourses, SchoolReads, SchoolStudents, StudentCoursePlan) and five create
`student_course_plans` (DbRole, ParentChildReads, SchoolCourses, SchoolStudents, StudentCoursePlan);
only the converted ones call `ApplyAsync`, so the rest are not broken today — they are pre-loaded with
this blocker. A NULLABLE `schoolId` is the quieter version of the same trap: `"schoolId" = current_setting(…)`
is NULL for such a row, so it is invisible to every non-bypass session and the failure reads as a broken
query rather than a schema gap. `SchoolCourses/Data/school-courses-schema.sql` declares it plain `text` where
production is non-null (`formmaps-platform/api/prisma/schema.prisma`, `StudentCoursePlan.schoolId`) and
where the three converted schemas that model the table all say `text NOT NULL`; tighten it when
converting that one.

`DbRole` is the sharpest case: its `school_courses` / `student_course_plans` rows are
`id text PRIMARY KEY` stubs with no `schoolId` at all, so converting that last one would need columns it
has no use for — one more reason not to.

Everything below ~5 policied tables is mostly self-scoped CRUD where the app predicate and the policy say
the same thing; convert those opportunistically when touching them.

## The gap that was not a gap (formmaps#135)

This section used to read "`student_course_plans` appears in **none** of `prisma/rls/*.sql` … and is
unpolicied in production." Both halves were wrong, and the error propagated into four fixtures before
anyone checked it.

`student_course_plans` **is** in `prisma/rls/*.sql` — in `pilot.sql`, together with `school_courses`.
And `pilot.sql` **is** applied to production: `apply-rls.ts` and `check-rls-coverage.mjs` both glob the
whole directory, and the production measurement in `docs/ops/rls-prod-apply-14.md` matches the
pilot-inclusive policy count exactly at two independent snapshots. `pilot.sql` is now vendored, so
both tables are policied in the fixtures too; `README.md` records the evidence and what vendoring
took. `CoursePlanComputeReaderTests` and `CounselorCaseloadReaderTests` each traded a "the reader's
own predicate is the entire boundary" assertion for a cross-school row that RLS now genuinely hides.

The lesson generalises past these two tables, so keep it: **"unpolicied here" must never be written
down as "unpolicied in production."** That substitution is the whole of #135. Before you record a
table as a production gap in a fixture doc, grep the WHOLE of `prisma/rls/` for it and check
`check-rls-coverage.mjs`'s `EXEMPT`/`PENDING`/`ESCALATED` lists — a tenant-scoped table on none of
them and in no policy file would fail legacy CI, so if CI is green your reading is wrong.

Also keep in mind what a policy does NOT do. `pilot.sql` scopes purely on `schoolId`, with no owner
branch, so it separates schools and nothing finer. A same-school adversary is still the app layer's
problem — see the trap section above, and
`SchoolStudentsCoursePlanWriterTests.Delete_cannot_be_levered_across_students`.
