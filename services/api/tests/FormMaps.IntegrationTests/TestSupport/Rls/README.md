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

`pilot.sql` is deliberately NOT vendored — it is a scratch file, not part of the applied set.

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
