# Migration Plan

## Strategy

Run the .NET backend beside the legacy Node backend. Migrate one domain at a
time and switch frontend clients behind feature flags.

## Cutover Criteria

A domain is migrated only when:

- .NET endpoint behavior matches the legacy endpoint or has an approved change.
- role and tenant tests pass.
- contract tests pass.
- staging smoke tests pass.
- production canary has a rollback path.
- the legacy route is disabled or marked read-only.

## First Candidate

Start with a read-only reporting endpoint. It has enough product value to test
permissions and tenant filtering without starting with high-risk auth/session
logic.
