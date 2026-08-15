# Domain 10 — Auth (Login/Session Issuance) migration to .NET

**Status:** approved, not yet planned/implemented
**Part of:** FormMaps Node→.NET migration epic (TIMSInternational/formmaps#4)
**Date:** 2026-07-31

## Scope

Migrate **session issuance** — the ~11 routes under `api/src/routes/auth.ts` plus the
issuance-shaped subset of `api/src/routes/auth-admin.ts`:

- `POST /authapi/login`
- `POST /authapi/refresh` and `POST /authapi/refresh-token` (aliases, one handler)
- `DELETE /authapi/refresh` (logout — revoke all refresh tokens)
- `GET /authapi/profile`
- `PUT /authapi/change-password`
- `PUT /authapi/change-email`
- `PUT /authapi/change-role`
- `POST /authapi/school-admin/complete-registration`
- `POST /authapi/forgot-password`
- `POST /authapi/reset-password`
- `POST /signup` (self-serve, COPPA 13+ gate, issues session)
- `GET /unsubscribe` (CAN-SPAM one-click, signed long-lived JWT, no session issued but shares
  the same JWT signing primitive so it belongs with this domain, not Coaching)
- `PUT /admin/set-password` (Super-Admin-scoped-to-own-school onboarding bypass)

Legacy source: `api/src/routes/auth.ts` (223 lines), `api/src/routes/auth-admin.ts` (224 lines,
issuance subset only), `api/src/services/authService.ts` (426 lines),
`api/src/services/authAdminService.ts` (327 lines, issuance subset only), `api/src/lib/auth.ts`,
`api/src/lib/authCookies.ts`, `api/src/lib/normalizeEmail.ts`.

**Explicitly out of scope (deferred to a future Coaching domain, not part of this plan):**
`POST /signup-coach`, `POST /signup-coach-bulk`, `GET /coaches`, `GET /coach/:id`,
`PUT /coaches/:id`, `POST /coaches/:id/deactivate`, `POST /invite-coach`. These live under the
`auth-admin` route prefix but have zero session-issuance character — they are coach-management
CRUD. `deactivateCoach` specifically cascades into cancelling paid future bookings and issuing
best-effort Stripe refunds, i.e. it carries a Bookings/Stripe dependency Domain 10 has no reason
to take on. Same split rationale as Domain 9a excluding booking payments from
billing-subscriptions: bundling adjacent-but-different business logic into a security-critical
migration risks scope creep and muddies the blast radius of this change. There is no Coach domain
in .NET yet (confirmed via `grep -i coach` under `services/api/src`, only hit is an unrelated
`CoachingReportReader`) — the coach-CRUD routes stay on Node until that domain exists.

## Why this needs its own design (not just another dark-flag port)

Every other domain in this migration follows the standard pattern: build in .NET behind a dark
flag, verify parity against the live Node response, flip when confident. That pattern assumes the
two implementations are peers reading/writing the same state. Auth issuance is different in kind:
**every other live .NET domain's entire security model is downstream of whichever backend issues
the JWT.** `LegacyJwtRequestContextFactory`, `TenantGucPlanResolver`, and every
`ProtectedRequestGuard.RequireIdentity` check in the .NET service today only work because Node is
still minting the tokens they verify. This migration doesn't swap a read path and diff two
responses — it swaps the root of trust that every other domain, live or dark, already depends on.
A subtle bug here (wrong claim shape, wrong cookie flags, a refresh-rotation race) doesn't fail
loud in one place; it fails quietly everywhere downstream, for every user, at once.

The mitigations below (single all-or-nothing flag, identical secret/issuer/audience across both
issuers throughout, exhaustive interop tests) exist specifically because of that blast radius —
not because the individual routes are unusually hard to port.

## Key existing-codebase facts this plan depends on

- **Verification already exists and is correct.** `LegacyJwtRequestContextFactory` validates
  HS256/issuer/audience/lifetime exactly as Node does; `RequestContext`/`RequestActor`/
  `TenantScope`/`TenantGucPlanResolver` mirror `resolveGucPlan` precisely;
  `ProtectedRequestGuard.RequireIdentity`/`RequireTenantContext` mirror `authenticate`/
  `tenantContext` middleware. This plan only has to make issuance produce tokens that satisfy
  verification that's already correct — it does not touch verification.
- **`FormMapsRoles.Normalize`** (`FormMaps.Domain.Auth`) already ports every role alias verbatim.
  **`FormMapsPermissions`** is only a partial port — it has the permission constants used by
  domains built so far, not the full `ROLE_PERMISSIONS` map from `lib/auth.ts`. Login's response
  payload requires the complete map; this plan ports it in full.
- **`RealtimeTicketFactory`** (`FormMaps.Api/Auth/`) is the template for JWT *signing* in this
  codebase — same secret env var (`JWT_SECRET`), same `LegacyJwtOptions` (issuer
  `formmaps-api`, audience `formmaps-frontend`), `JwtSecurityTokenHandler` +
  `SymmetricSecurityKey` + `SigningCredentials(HmacSha256)`. It signs a narrow-scope 30s hub
  ticket; this plan's `AccessTokenFactory` signs the full session token (adds `name`, `email`,
  `schoolId`, `permissions[]` claims, configurable TTL via `JWT_EXPIRES_IN_MINUTES`, default 60).
  No cookie-writing code exists anywhere in `services/api/src` today — confirmed via
  `grep -rn "Cookies.Append"` returning nothing.
- **`FormMapsRateLimitPolicies.Auth`/`.Sensitive`** already exist and are wired into
  `ApiSecurityExtensions.ConfigureRateLimiter` with defaults matching legacy (`Auth`: per-IP fixed
  window; `Sensitive`: per-user-or-IP fixed window) — just unused by any endpoint yet. Values
  default from `ApiSecurityOptions.RateLimits`, not hardcoded, so they can be set to match
  legacy's `10/15min` and `10/hr` via configuration.
- **Email is functionally ready.** `IEmailSender`/`SesEmailSender` is a tested, faithful port of
  `lib/email.ts::sendEmail` (never throws). `EmailTemplates.cs` has the `Wrap`/`Button`/
  `EscapeHtml` primitives byte-ported from `sanitize.ts`, but none of the three templates this
  domain needs (`PasswordReset`, `AccountLocked`, `PasswordChanged`) exist yet.
- **Startup validation already requires `JWT_SECRET` (≥32 chars) in Production** — the same
  secret issuance signs with. No new secret, no rotation coordination.
- **No password hashing exists anywhere** — no BCrypt package in any `.csproj`. This plan adds
  `BCrypt.Net-Next`, pinned to work factor **12** (matches legacy `bcryptjs` exactly; `$2a$`/`$2b$`
  hashes are cross-compatible between the two libraries).
- **No repository/DB access layer exists for `users`/`roles`/`refresh_tokens`/`login_attempts`/
  `password_reset_tokens`/`user_settings`/`schools`.** These tables are Node/Prisma-owned today
  (all `@@map`-ed to snake_case names, camelCase quoted columns) and .NET issuance reads and
  **writes** them directly through the shared Postgres — there is no shadow-table indirection here
  (unlike Domain 9a's billing shadow tables), because unlike Stripe webhooks, a session issued by
  one backend must be immediately refreshable/revocable by whichever backend is live, so the two
  issuers cannot be writing to different tables even transiently.
- **The frontend rewrite for `/authapi/*` is one undifferentiated catch-all block**
  (`apps/web/next.config.ts:1280`, `{ source: "/authapi/:path*", destination: ...}`) with **zero
  per-route flags today** — unlike every other domain, which has per-route or per-domain
  `FORMMAPS_ROUTE_*_TO_DOTNET` conditionals inserted before the generic `/api/:path*` catch-all.
  Cutover must add flag-gated rewrites the same way Messaging did (Domain 7b: one flag gating 6
  specific paths, inserted before the block they'd otherwise fall through to).
- **`docs/migration/auth-tenant-context-contract.md`** already documents the cookie contract, JWT
  contract, and role aliases in full, and already lists "login, refresh, signup/onboarding token
  flows, password reset..." as flows needing system context — this design extends that document,
  it doesn't duplicate it.
- **`domain-status.manifest.json` has no "auth" entry at all**, unlike every other product area.
  This plan adds one.

## Architecture

.NET builds the full session-issuance surface — login, refresh (with single-use rotation), logout
(revoke-all), profile, change-password/email/role, school-admin registration completion,
forgot/reset-password, signup, unsubscribe, admin set-password — reading and writing the live,
shared Postgres tables Node already owns. There is **no shadow-write phase** for this domain (see
above): the tables are the same tables Node uses today, because a session must remain valid
regardless of which backend minted it.

Both `.NET`'s `AccessTokenFactory` and Node's `generateAccessToken` sign with the identical
`JWT_SECRET`, issuer (`formmaps-api`), audience (`formmaps-frontend`), and claim shape
(`sub, name, email, role, schoolId, permissions[]`) for the entire life of this change — there is
no window where the two issuers are interoperability-incompatible, by construction, not by luck.
`LegacyJwtRequestContextFactory` (already live) does not care which backend signed a token, only
that it validates — so tokens are interchangeable the instant issuance flips, and remain
interchangeable if it's ever flipped back.

### Rollout shape: one all-or-nothing flag, not per-route

Unlike Messaging (one flag over 6 *independent* routes) or Video (five separate flags for
independently-cuttable slices), Auth's routes are **not independently cuttable**: a refresh token
minted by whichever backend is live for `/login` must be rotatable by whichever backend is live
for `/refresh`, and a logout must revoke tokens regardless of which backend originally issued
them. Splitting `/authapi/login` and `/authapi/refresh` onto different backends would work
correctly today (both write/read the same tables) but offers no benefit and adds a second thing
that can be wrong for zero gain — there's no partial-cutover story here worth the complexity.

This plan therefore adds a **single flag**, `FORMMAPS_ROUTE_AUTH_TO_DOTNET`, gating the entire
`/authapi/*` prefix as one unit, inserted before the existing undifferentiated
`{ source: "/authapi/:path*", ... }` rewrite (which becomes the OFF-state fallback to Node,
exactly mirroring how Messaging's flag precedes the generic `/api/:path*` catch-all).

## Components & data flow

- **Login** (`POST /authapi/login`): lockout check (`login_attempts`, 5 failures → 15 min lock,
  best-effort "account locked" email past the trip point) → bcrypt verify → clear attempts on
  success → issue access JWT + refresh token → set `access_token`/`refresh_token`/`logged_in`
  cookies → return user + full `ROLE_PERMISSIONS[role]` + `user_settings.language`.
- **Refresh** (`POST /authapi/refresh`, `/authapi/refresh-token`): read refresh token from cookie
  first, body fallback → single-use rotation (revoke-old, create-new, in that order) → re-check
  `isActive` immediately before minting (closes the TOCTOU window legacy explicitly guards) →
  re-issue access token + rotated refresh token + reset cookies.
- **Logout** (`DELETE /authapi/refresh`): authenticated; revoke **all** refresh tokens for the
  caller; clear all three cookies.
- **Profile** (`GET /authapi/profile`): authenticated; profile fields + latest active
  subscription status (read-only join, no write).
- **Change password/email/role**: self-service (old-password verification) or admin-on-behalf
  (Super Admin unrestricted, `school_admin` scoped to their own school); change-email role-checks
  *before* target lookup (uniform 403, never leaks target existence to an unprivileged caller);
  cross-school admin actions collapse to 404 not 403; email uniqueness check spans inactive users
  (the DB unique constraint isn't `isActive`-scoped) and a `P2002`-equivalent unique-violation race
  maps to 409, not 500; change-password revokes all sessions on success + best-effort notification
  email; change-role requires `admin:users` permission.
- **School-admin registration completion**: token-driven (`schools.invitationToken`), creates or
  updates the admin user, activates the school, issues a session — pre-auth, system context.
- **Forgot/reset password**: forgot-password responds `200` immediately (timing-safe — no
  enumeration signal) then processes async; skips inactive accounts (logged, not emailed,
  never auto-reactivates); reset tokens are SHA-256-hashed at rest, 1hr expiry, invalidate prior
  unused tokens on new request; reset-password is one atomic transaction — update password,
  consume token, revoke all refresh tokens — so a partial failure can never leave the account
  changed but still reachable via an old session.
- **Signup**: public self-serve, COPPA 13+ age gate on `dateOfBirth`, issues a session on success.
- **Unsubscribe**: signed long-lived (365d) JWT with a `purpose:"unsubscribe"` claim — CAN-SPAM
  one-click, no session issued, reuses the same signing primitive as everything else here.
- **Admin set-password**: Super-Admin-scoped-to-own-school onboarding bypass, no session issued
  for the target (the admin stays logged in as themselves).

All pre-auth flows (login, refresh, forgot/reset-password, school-admin registration completion,
signup, unsubscribe) run under `RequestContext.System()` + RLS bypass — mirroring Node's
`systemContext` middleware and the existing `SubscriptionAccess.cs` pattern for unauthenticated
system writes.

## Security properties to preserve exactly (non-negotiable, not "close enough")

- JWT: HS256, `JWT_SECRET`, issuer `formmaps-api`, audience `formmaps-frontend`,
  `JWT_EXPIRES_IN_MINUTES || 60`. Claims: `sub, name, email, role, schoolId, permissions[]`.
- Cookies: `access_token` (httpOnly, `sameSite=lax`, `path=/`, access-token TTL);
  `refresh_token` (httpOnly, `sameSite=lax`, `path=/authapi`, 14 days);
  `logged_in=true` (JS-readable, `path=/`, **must outlive** the access token — it drives the
  frontend's refresh-on-401 interceptor, so its maxAge tracks the refresh TTL when a refresh
  token is present, the access TTL otherwise).
- Password hashing: bcrypt work factor **12**. Any hash not prefixed `$2a$`/`$2b$`/`$2y$` is
  treated as invalid and forces a reset (the legacy SHA-256-migration branch is effectively dead
  code in Node today — see Open Items for the decision on whether to port the dormant branch).
- Password strength: ≥8 chars, upper+lower+digit+special — identical regex-equivalent checks.
- Refresh tokens: single-use, DB-stored random 64-byte base64url string (not a JWT),
  revoke-old-then-create-new ordering, TOCTOU-safe `isActive` re-check immediately before minting.
- Rate limits: `Auth` policy (per-IP) on login/signup/refresh/forgot/reset/complete-registration;
  `Sensitive` policy (per-user-or-IP) additionally stacked on change-password/email/role — see
  Open Items for the in-process-vs-Postgres-backed statefulness gap.
- Existence-hiding: forgot-password always 200s; change-email/change-password admin-on-behalf
  role-checks precede target lookup; cross-school admin actions 404 not 403.

## Error isolation

Unlike Domain 9a's shadow-table isolation (a bug there costs reconciliation confidence, never a
live billing failure), Auth issuance has **no isolation layer to fall back on** — it writes the
live tables from day one behind the flag. The isolation this domain gets is instead: (1) the flag
stays OFF until the full test suite below passes, including live-secret interop tests proving a
.NET-issued token verifies via the *already-live* `LegacyJwtRequestContextFactory` and a
Node-issued token verifies via .NET's own verification path; (2) the all-or-nothing flag means a
bad deploy is a single flip to revert, not N independent flags to hunt down; (3) both issuers
write to the same tables, so a caller who logs in on one backend and refreshes on the other (flag
flipped mid-session) still works correctly — there is no split-brain state to reconcile.

## Testing

Same per-slice convention as the rest of the migration (build inline → fresh-reviewer gate → full
suite, per `docs/migration/completion-roadmap.md`). Additionally, because this is the root of
trust for every other domain:

- **Interop tests, not just parity tests**: a token minted by .NET's `AccessTokenFactory` must
  pass through `LegacyJwtRequestContextFactory` (already live in prod) unchanged from how a
  Node-minted token passes through it today — same claim extraction, same `RequestContext`,
  same `TenantGucPlanResolver` output, for every role.
- Lockout, rotation-reuse-detection (a revoked/used refresh token must be rejected, not silently
  re-accepted), and TOCTOU (`isActive` flips mid-refresh) get dedicated integration tests, not just
  happy-path coverage.
- Cookie contract tests assert exact flag combinations (httpOnly/sameSite/path/maxAge) per cookie,
  not just presence.
- Password-hash cross-compatibility: a bcrypt hash produced by legacy `bcryptjs` (fixture, not
  regenerated) must verify successfully against .NET's `BCrypt.Net-Next` — proves the two
  libraries are truly interoperable, not just "the same algorithm name."

## Rollout / cutover criteria

1. Build behind `FORMMAPS_ROUTE_AUTH_TO_DOTNET`, OFF in every environment including staging by
   default.
2. All interop, lockout, rotation, and cookie-contract tests above pass, plus the existing full
   .NET suite.
3. Manual staging soak: flip ON in staging only, exercise login → refresh → logout → password
   reset end to end, confirm cookies and downstream authenticated calls (a request that hits an
   already-live .NET domain, e.g. reports) behave identically to Node-issued sessions.
4. Flip ON in prod as a single flag change (not bundled with any other deploy — see the standing
   push/deploy-caution convention: push/deploy/flag-flip stay separate confirmed decisions).
5. Post-flip: keep Node's issuance code live and unremoved for at least one full session-refresh
   cycle (14 days, the refresh-token lifetime) in case of rollback, then it's dead code, not yet
   deleted by this plan.

## Open items for the planning phase (not blocking this spec's approval)

- **Rate limiter statefulness**: `FormMapsRateLimitPolicies.Auth`/`.Sensitive` are in-process
  (`PartitionedRateLimiter`), not multi-instance-safe like Node's Postgres-backed `sharedStore`.
  If the .NET App Runner service runs more than one instance, effective limits multiply per
  instance. Needs an explicit answer (accept the gap, or add a shared-store implementation) before
  claiming rate-limit parity — not resolved by this spec.
- **Legacy SHA-256 migration dead-code path**: Node's `needsMigration` branch is currently
  unreachable (`verifyPassword` never returns `needsMigration: true` in practice). Decide at
  planning time whether to port the dormant branch faithfully (for byte-parity) or omit it as
  intentionally-dead — do not silently drop it without a decision recorded.
- **Full `ROLE_PERMISSIONS` port correctness**: the planning phase must diff the ported C# map
  against `lib/auth.ts`'s `ROLE_PERMISSIONS` permission-string-by-permission-string per role, not
  just spot-check — a missing permission string silently breaks a frontend feature gate.
- **`domain-status.manifest.json` entry**: add `"auth"` with `risk: "high"` and an explicit note
  that every `liveInProd: true` domain depends on this one — the highest-risk single entry in the
  file once added.
- **SOC2 audit-log gap** (per the completed gap-assessment, TIMSInternational/formmaps#9): admin
  password/email/role changes are exactly the kind of action auditors look for. `audit-events` is
  still `status: planned` domain-wide — decide whether Auth's admin-on-behalf actions get
  interim audit logging now or wait for that domain, rather than leaving it unaddressed twice.
