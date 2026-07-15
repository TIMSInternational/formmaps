# FormMaps API Architecture

## Purpose

`formmaps-api` is the .NET 10 backend for FormMaps. It should replace the
legacy Node API domain by domain while preserving production behavior.

## Layer Rules

- Domain contains business concepts and rules.
- Application contains use cases and interfaces.
- Infrastructure implements persistence and external adapters.
- API owns HTTP concerns, authentication middleware, and endpoint registration.
- Workers run background jobs and scheduled processes.

Domain must not depend on Application, Infrastructure, API, or Workers.

## Initial Domains

Planned migration order:

1. platform health/configuration
2. audit/events
3. reporting/read models
4. assessment results and readiness profiles
5. schools, rosters, and organizations
6. counselor/student/parent workflows
7. notifications and messages
8. billing and external integrations
9. authentication/session final cutover

## Database Ownership

During migration, each table must have one write owner:

- legacy Prisma/Node, or
- EF Core/.NET

Dual writes require an explicit design review and rollback plan.
