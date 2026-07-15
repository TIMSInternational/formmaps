# FormMaps .NET 10 Implementation Plan

Date: 2026-07-15

## Decision

Migrate FormMaps to a product monorepo with:

```text
apps/web          # existing React/Next.js frontend
services/api      # new .NET 10 backend
packages/ui       # frontend package extraction target
packages/api-client
docs
```

The frontend is migrated/adapted from the existing product. The backend is
rebuilt in C#/.NET 10 using the current Node/Express/Prisma backend as the
behavioral specification.

## Non-Negotiables

- No big-bang cutover.
- Keep the existing production platform running during migration.
- Preserve current RLS and tenant-isolation guarantees.
- Preserve cookie-first auth behavior and refresh semantics.
- Do not share databases or internals with TIMS ATS.
- All FormMaps/TIMS ATS exchange goes through `tims-interop`.
- A migrated domain is not complete until the legacy route can be disabled or
  marked read-only.

## Migration Architecture

```text
apps/web
  -> legacy Node API for unmigrated domains
  -> services/api .NET endpoints for migrated domains
  -> tims-interop contracts for product-to-product handoff
```

## First C# Foundation Slices

### Slice 1: Platform Shell

Build:

- health/version endpoints
- request context abstraction
- role and tenant primitives
- audit abstraction
- migration roadmap endpoint
- CI restore/build/test

Exit criteria:

- `dotnet build` and `dotnet test` pass.
- No production secrets are required.
- Endpoint surface is safe to deploy to staging.

### Slice 2: Auth And Tenant Context

Build:

- cookie/bearer extraction compatible with existing frontend behavior
- tenant resolver
- role/permission model
- fail-closed tenant guard for protected routes
- integration tests for anonymous, student, counselor, school admin, parent

Development-only headers may be used for local smoke testing and must be
ignored outside Development. This slice is now paired with Slice 2.5, so
bearer/cookie tokens are only accepted after cryptographic JWT validation.

Exit criteria:

- `/me` can return current identity safely.
- protected test endpoint denies missing tenant context.
- behavior matches current Node auth assumptions.

### Slice 2.5: JWT Validation

Build:

- HS256 validation with `JWT_SECRET`
- issuer default `formmaps-api`
- audience default `formmaps-frontend`
- cookie-first `access_token` lookup
- bearer fallback only when no access cookie exists
- claim mapping for `sub`, `name`, `email`, `role`, `schoolId`, `permissions`
- RLS GUC plan resolver matching the legacy Node `resolveGucPlan`

Exit criteria:

- missing token returns `401`.
- invalid or expired token returns `401`.
- bad cookie does not fall back to a good bearer token.
- valid cookie and valid bearer establish the same request context.
- system/super-admin/identity/deny RLS decisions are unit tested.

Status: implemented locally in the .NET API and covered by unit/integration
tests.

### Slice 3: API Security Middleware Parity

Build:

- startup environment validation
- credentialed CORS allowlist
- HSTS/referrer/no-store/security headers
- mutation content-type enforcement
- JSON size limit and sanitization policy
- redacted request logging
- API/auth/sensitive/AI rate limits
- request timeout and graceful shutdown policy

Exit criteria:

- security middleware behavior has integration tests.
- production configuration cannot boot with missing required secrets.
- local development remains usable without spoofing production settings.

Status: implemented locally in the .NET API and covered by integration tests.

### Slice 4: Database Connectivity

Build:

- PostgreSQL connection configuration
- EF Core or Dapper baseline
- migration-owner policy
- read-only access path for legacy-owned tables
- RLS session context strategy

Exit criteria:

- app role can connect without DDL privileges.
- tenant context is applied before data access.
- tests prove missing context fails closed.

Status: read-only Npgsql session factory, connection-string resolution, and
RLS GUC command generation are implemented and tested. A live database
integration smoke should be added once staging credentials exist.

### Slice 5: First Product Endpoint

Start with a read-only reporting/dashboard endpoint.

Reason:

- low write risk
- validates tenant filtering
- useful to the frontend
- avoids starting with auth/session final cutover

Exit criteria:

- parity test against legacy endpoint behavior
- frontend feature flag can switch one screen to .NET
- production rollback is route-level, not deploy-level

Status: `/api/v1/reports/benchmark` is implemented as the first read-only
product endpoint. The API contract and auth/tenant behavior are integration
tested with a fake reader; a live staging database smoke is still required
before routing frontend traffic to the .NET endpoint.

## Domain Migration Order

1. platform health, context, audit
2. read-only reports and dashboards
3. assessments and readiness profiles
4. schools, rosters, organizations
5. counselor/student/parent workflows
6. recommendations, academic gaps, course planning
7. messaging, notifications, video
8. documents/uploads/resume/PDF flows
9. billing and subscriptions
10. auth/session final cutover
11. retire Node API

## Coding Standard For C#

- API endpoints stay thin.
- Application layer owns use cases.
- Domain layer owns business rules and value objects.
- Infrastructure owns database, external APIs, storage, email, and vendors.
- No database calls from API endpoints.
- No product-to-product database access.
- Tests accompany every migrated domain.

## Cutover Pattern

```text
inventory legacy route
  -> write contract
  -> implement .NET endpoint
  -> add parity tests
  -> add tenant/role tests
  -> route frontend through feature flag
  -> staging smoke
  -> production canary
  -> disable or freeze legacy route
```
