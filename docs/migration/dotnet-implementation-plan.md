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

- JWT validation configuration
- cookie/bearer extraction compatible with existing frontend behavior
- tenant resolver
- role/permission model
- fail-closed tenant guard for protected routes
- integration tests for anonymous, student, counselor, school admin, parent

Exit criteria:

- `/me` can return current identity safely.
- protected test endpoint denies missing tenant context.
- behavior matches current Node auth assumptions.

### Slice 3: Database Connectivity

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

### Slice 4: First Product Endpoint

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
