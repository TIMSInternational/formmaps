# Vendored production RLS policies

These eight files are **byte-for-byte copies** of the production policy files in the legacy Node
repo, which is still the single source of truth for what is applied to the Aurora database:

    formmaps-platform/api/prisma/rls/{002-direct-schoolid,003-fk-users,004-fk-parent,005-sensitive,
                                      006-graduation-plans,007-self-scoped,008-form-drafts,
                                      009-parent-links}.sql

## Why copies and not a hand-written transcription

formmaps#125 exists because three parent surfaces shipped to production with an RLS bug while every
.NET test was green. A transcription of the policies into C# string literals would have re-created
exactly that failure mode one level up: the tests would then assert against *someone's idea* of the
policy rather than the policy. Copies cannot say something the production file does not say.

`pilot.sql` is NOT vendored — but **not** because it is unused. It policies `school_courses` and
`student_course_plans`, and it **is** applied to production. Do not restore the old wording here
("a scratch file, not part of the applied set"); that claim was false and it propagated into four
fixtures before anyone checked it (formmaps#135).

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

So the honest statement is: **production policies these two tables; this harness does not yet
reproduce that.** Any fixture creating either table is therefore testing an app-layer predicate
with no RLS backstop *in the fixture*, while production has one — the test understates production
rather than overstating it.

Vendoring it is the fix, and it is not a one-line change. `ApplyAsync` applies a policy to any
table present in `pg_class`, so vendoring immediately policies these tables in **every** fixture
whose DDL creates them — currently 10 schema files for `school_courses` and 5 for
`student_course_plans`. Two hazards to clear first:

* `ParentChildReads/Data/parent-child-reads-schema.sql` creates `student_course_plans` with **no
  `schoolId` column**, and that fixture is converted — so vendoring as-is fails its init with
  `42703` and takes the whole class down. It needs the column, and its seeds need a matching value.
* Every seeded row in an affected converted fixture needs a `schoolId` matching the session GUC, or
  the row becomes invisible and the failure looks like a broken query rather than a seeding gap.

## Refreshing

    cp ~/formmaps-platform/api/prisma/rls/00{2,3,4,5,6,7,8,9}-*.sql \
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
