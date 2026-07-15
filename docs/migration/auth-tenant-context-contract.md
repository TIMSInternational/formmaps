# Auth And Tenant Context Contract

This document captures the legacy FormMaps auth/tenant behavior that the .NET
API must preserve.

## Cookie Contract

- `access_token`
  - primary access JWT
  - `httpOnly`
  - `sameSite=lax`
  - `path=/`
- `refresh_token`
  - refresh token
  - `httpOnly`
  - `sameSite=lax`
  - `path=/authapi`
  - 14-day lifetime
- `logged_in=true`
  - JS-readable session sentinel
  - `path=/`
  - used by the frontend to decide whether refresh should be attempted

## Access Token Lookup Order

Protected requests use:

1. `access_token` cookie
2. `Authorization: Bearer <token>` only if the cookie is absent

Important: a bad cookie does not fall back to a good bearer token.

## Frontend Behavior

- Axios sends cookies with `withCredentials: true`.
- The bearer token is an in-memory fallback from Zustand.
- The bearer fallback is not persisted across reloads.
- On `401`, the frontend attempts refresh only when `logged_in=true`.
- Refresh calls `POST /authapi/refresh` with credentials.

## JWT Contract

- algorithm: `HS256`
- secret: `JWT_SECRET`
- issuer default: `formmaps-api`
- audience default: `formmaps-frontend`
- expiry default: `JWT_EXPIRES_IN_MINUTES || 60`

Claims used by the backend:

```text
sub          user id
name         display name
email        email
role         canonical/legacy role string
schoolId     school id, empty string for no-school users
permissions  exact permission strings
```

.NET implementation status:

- `LegacyJwtRequestContextFactory` validates HS256 JWTs with issuer, audience,
  lifetime, signing-key, and algorithm checks.
- `access_token` cookie remains authoritative over `Authorization: Bearer`.
- Development header auth is allowed only in `Development` and only when no
  real cookie/bearer token is present.
- Tokens missing `sub` or `role` fail closed.

## Roles

Canonical values:

```text
Super Admin
school_admin
counselor
teacher
student
coach
parent
```

Aliases:

```text
admin/super_admin/superadmin -> Super Admin
schooladmin/school admin     -> school_admin
user                         -> student
staff                        -> parent
blank/unknown                -> student
```

## Tenant Context

Every authenticated request establishes:

```text
schoolId
userId
isSuperAdmin
```

RLS behavior:

- Super Admin bypasses RLS.
- System flows explicitly bypass RLS.
- Normal users set both `app.current_school_id` and `app.current_user_id`.
- No context fails closed unless `RLS_STRICT=0`.
- No-school users use `schoolId=""` and rely on own-user filtering.

.NET implementation status:

- `TenantGucPlanResolver` mirrors the legacy `resolveGucPlan` decision rules.
- `RlsSessionCommandBuilder` translates the resolver output into:
  - bypass: `set_config('app.bypass_rls', 'on', true)`
  - deny: `set_config('app.bypass_rls', 'off', true)`
  - identity: `set_config('app.current_school_id', schoolId, true)` and
    `set_config('app.current_user_id', userId, true)`
- `NpgsqlFormMapsDatabaseSessionFactory` opens transaction-bound read-only
  sessions and applies the RLS GUC plan before callers can run queries.
- Future write sessions must add `WITH CHECK`-equivalent tests before shipping.

## API Security Middleware Parity

The current Node API has production hardening that must be ported before the
.NET API owns real product traffic:

- startup environment validation
- Sentry/error capture equivalent
- trusted proxy handling for client IPs
- cookie parsing and credentialed CORS allowlist
- HSTS and referrer policy headers
- mutation content-type enforcement
- raw-body exception path for Stripe webhooks
- JSON body size limit
- request body sanitization that skips password/token/secret fields
- no-store/no-cache API response headers
- access-log redaction for token query params
- global API/auth/sensitive/AI rate limits
- request timeout
- graceful shutdown and cleanup/background job policy

.NET implementation status:

- Production startup validation now fails fast when `JWT_SECRET` is missing or
  too short.
- Forwarded headers trust one upstream proxy, matching the current App
  Runner/ALB posture.
- Credentialed CORS uses the baked-in FormMaps origins plus configured
  `ApiSecurity:AllowedOrigins`, `CORS_ORIGINS`, and `CORS_ALLOWED_ORIGINS`.
- Security/no-store headers are applied globally.
- Mutation requests reject unsupported content types before endpoint handling.
- JSON body size is enforced by config and middleware.
- JSON request-body sanitization strips HTML from strings while preserving
  password/token/secret fields.
- Sensitive query values are redacted before request logging.
- Global and named `auth`, `sensitive`, and `ai` rate-limit policies are
  registered.
- Request timeout middleware returns `504` when downstream code observes
  cancellation.
- Sentry-specific capture and Stripe raw-body handling remain deferred until
  those domains are migrated.

## Public/System Context Flows

These legacy flows may need system context because they run before normal auth:

- login
- refresh
- signup/onboarding token flows
- password reset
- evaluator token flows
- Stripe webhook
- public subscription catalog

## .NET Fail-Closed Rules

Protected .NET endpoints must fail closed on:

- no token
- invalid/expired token
- missing `sub`/user identity
- missing tenant context
- missing permission
- school-scoped access with no caller school
- client-supplied cross-school ids
- counselor access without assignment
- non-super-admin cross-tenant reads/writes

For writes, enforce the equivalent of RLS `WITH CHECK`: a caller cannot create
or update rows into another school even if they pass that `schoolId`.
