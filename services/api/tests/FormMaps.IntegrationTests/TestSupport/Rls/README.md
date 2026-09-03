# Vendored production RLS policies

These nine files are **byte-for-byte copies** of the production policy files in the legacy Node
repo, which is still the single source of truth for what is applied to the Aurora database:

    formmaps-platform/api/prisma/rls/{002-direct-schoolid,003-fk-users,004-fk-parent,005-sensitive,
                                      006-graduation-plans,007-self-scoped,008-form-drafts,
                                      009-parent-links,pilot}.sql

That is the WHOLE directory. `api/scripts/apply-rls.ts` globs `prisma/rls/*.sql`, so anything less
than the whole directory is a fixture that understates production.

## Why copies and not a hand-written transcription

formmaps#125 exists because three parent surfaces shipped to production with an RLS bug while every
.NET test was green. A transcription of the policies into C# string literals would have re-created
exactly that failure mode one level up: the tests would then assert against *someone's idea* of the
policy rather than the policy. Copies cannot say something the production file does not say.

## `pilot.sql` (formmaps#135)

`pilot.sql` policies `school_courses` and `student_course_plans`, and it **is** applied to
production. It was excluded from the vendored set for a while on the claim that it was "a scratch
file, not part of the applied set". That claim was false and it propagated into four fixtures before
anyone checked it. Do not restore that wording, and do not drop the file from
`VendoredFileNames` — `The_pilot_tables_really_are_policied_in_the_vendored_copies` fails if you do.

Evidence, recorded so this is not re-litigated from the file names:

* `api/scripts/apply-rls.ts` globs `prisma/rls/*.sql`, so it applies `pilot.sql`; legacy CI runs it.
* `api/scripts/check-rls-coverage.mjs` globs the same directory, so its coverage gate counts
  `pilot.sql`'s policies. Neither table appears in that script's `EXEMPT`/`PENDING`/`ESCALATED`
  lists, and a tenant-scoped table that is neither policied nor listed fails the build. Legacy CI
  is green, so those two tables are clearing the gate *on pilot's policies*.
* `docs/ops/rls-prod-apply-14.md` records a real production measurement either side of the #117
  apply — `BEFORE 72/72/72`, `AFTER 86/86/86`. Counting the policy files at that commit gives 70
  and 84 **without** pilot, 72 and 86 **with** it. The offset is exactly pilot's two policies at
  both ends.

### What vendoring it took

`ApplyAsync` applies a policy to any table present in `pg_class`, so vendoring policies these tables
in **every** fixture whose DDL creates them — 10 schema files create `school_courses` and 5 create
`student_course_plans`. Only the CONVERTED fixtures call `ApplyAsync`, so four were affected:

| fixture | policied before | after | what changed |
|---|---|---|---|
| `SchoolStudents/school-students-schema.sql` | 12 | 14 | both tables; DDL and seeds already carried `schoolId` |
| `Counselor/counselor-caseload-schema.sql` | 10 | 11 | `school_courses` |
| `StudentCoursePlan/course-plan-compute-schema.sql` | 9 | 10 | `school_courses` |
| `ParentChildReads/parent-child-reads-schema.sql` | 11 | 12 | `student_course_plans`, **plus a new `schoolId` column** |

The two hazards this section used to list as work-to-do, both now cleared:

* `ParentChildReads/Data/parent-child-reads-schema.sql` created `student_course_plans` with **no
  `schoolId` column**, and that fixture is converted — so vendoring as-is failed its init with
  `42703` and took the whole class down. It has the column now, and its seed helper a matching value.
* Every seeded row in an affected converted fixture needs a `schoolId` matching the session GUC, or
  the row becomes invisible and the failure looks like a broken query rather than a seeding gap.

Three assertions flipped from "the app predicate is the only gate" to a real RLS negative control,
which is the payoff:

* `CounselorCaseloadReaderTests.Career_profiles_only_when_analysis_complete_and_courses_scoped_to_school`
  — the other school's `school_courses` row went from visible-and-filtered to invisible;
* `CoursePlanComputeReaderTests.Eligibility_catalog_excludes_a_cross_school_course_that_the_policy_also_hides`
  — same flip, and the test was renamed: it used to be called `..._because_school_courses_is_unpolicied`;
* `ParentChildReaderTests.Every_child_data_table_this_reader_touches_is_invisible_to_the_parents_own_session`
  — `student_course_plans` joined the table-by-table loop.

One thing vendoring did NOT change, and the writer tests say so in place: pilot's predicate is
`"schoolId" = app.current_school_id` with **no owner branch**, so it does not separate two students
of the same school. `SchoolStudentsCoursePlanWriter.DeleteCoursePlanCourseAsync`'s
`"studentId" = @sid` is still the entire defence for that adversary.

## Refreshing

    cp ~/formmaps-platform/api/prisma/rls/*.sql \
       services/api/tests/FormMaps.IntegrationTests/TestSupport/Rls/
    git diff -- services/api/tests/FormMaps.IntegrationTests/TestSupport/Rls/

A non-empty diff means production policy has moved under the .NET tests. Read the diff, then run the
converted fixtures — a policy change that breaks a repository shows up as a red test here rather
than as a blank page in the parent portal.

`ProductionRlsPolicies.VendoredFileNames` is asserted against the files on disk by
`ProductionRlsPoliciesTests`, so a file added to this directory without being registered as an
`EmbeddedResource` in the .csproj fails the build's test run instead of being silently ignored.

## How they get applied

`ProductionRlsPolicies.ApplyAsync` splits each file into statements and applies only the statements
whose **target table already exists** in the fixture database. That filter is data-driven from
`pg_class`, so a fixture that adds a table automatically picks up that table's production policy;
nothing has to be kept in sync by hand.

It is deliberately NOT silent about the two ways this can go wrong:

* a table you asked to policy has no statements in any file → `ArgumentException` (you named a table
  that production does not policy, or you misspelled it);
* a policy body sub-selects a table the fixture does not create (`users`, `coaches`,
  `conversations` are the only three) → `InvalidOperationException` naming the missing table.

Both are loud on purpose. A skipped policy is a vacuous test.
