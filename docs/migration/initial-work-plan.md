# Initial Work Plan

## Phase 1: Move The Current Frontend

1. Inventory current FormMaps frontend routes and environment variables.
2. Move `formmaps-platform/frontend` into `apps/web`.
3. Preserve current production behavior.
4. Add CI for lint, typecheck, tests, and build.
5. Centralize backend calls in `packages/api-client`.

## Phase 2: Build The .NET Foundation

1. Add configuration and secret loading.
2. Add authentication validation.
3. Add tenant context.
4. Add audit logging.
5. Add PostgreSQL persistence.
6. Add integration test database setup.

## Phase 3: First Cutover Slice

1. Pick one read-only reporting endpoint.
2. Implement the endpoint in .NET.
3. Add parity tests against legacy behavior.
4. Route one frontend screen through a feature flag.
5. Canary in staging before production.

## Phase 4: Domain Migration

Migrate one domain at a time:

1. reporting/read models
2. assessments and readiness profiles
3. schools, rosters, and organizations
4. counselor/student/parent workflows
5. notifications and messages
6. billing and integrations
7. auth/session final cutover
