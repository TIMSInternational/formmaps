# Trusting `schoolId` from the JWT claim

**Status:** accepted, documented 2026-08-10
**Issue:** [formmaps#69](https://github.com/TIMSInternational/formmaps/issues/69)
**Scope:** platform-wide — both the .NET service and the legacy Node API
**Verdict:** the current design is acceptable. Do not spend a sprint "fixing" it. There is one
env-only lever if the exposure window ever needs to be smaller, and one cosmetic inconsistency
worth closing. Neither is urgent.

This document exists because #69 asked for a written decision, and because the issue's own
severity reasoning contains two factual errors that would mislead whoever picks it up next.
Both are corrected below, with the evidence.

---

## 1. What is actually trusted today

A caller's `schoolId` comes from the signed JWT and is **never** re-read from the database on a
normal request, in either stack.

**.NET.** `LegacyJwtRequestContextFactory.BuildContext` reads the `schoolId` claim off the
validated principal and hands it to `RequestContext.Authenticated`, which builds the
`TenantScope`:

- `services/api/src/FormMaps.Api/Auth/LegacyJwtRequestContextFactory.cs:96` —
  `EmptyToNull(ReadClaim(principal, "schoolId"))`
- `services/api/src/FormMaps.Application/Auth/RequestContext.cs:46` —
  `new TenantScope(actor.UserId, schoolId, actor.IsSuperAdmin)`

**Legacy Node does exactly the same thing.** This is the first correction to #69:

- `api/src/middleware/authenticate.ts:36` — `req.schoolId = payload.schoolId || undefined;`
- `api/src/middleware/authenticate.ts:44` — that same value is what establishes the RLS tenant
  context for every authenticated route.

#69's "Behaviour difference" section claims legacy "re-derives `sameSchool` against the new
school on the next request and fails closed". That is **false as a general statement**. Legacy's
request-level `schoolId` and its RLS GUC both come from the token. What legacy *does* have is a
scattering of individual handlers that additionally re-read the caller's own row
(`auth-admin.ts:214`, `report.ts:306`, `video.ts:20/97`, `messages.ts:85/208/551`,
`counselor.ts:146/408`, `school-courses.ts:15`, `school-gradebook.ts:17`, …) — a habit, applied
inconsistently, not a platform guarantee. Fifteen legacy route files use the trusted
`req.schoolId` directly.

### Where the trusted value is consumed in .NET

Re-derive the current set rather than trusting a count written into a doc — an earlier revision of
this line said "Eleven sites" while the table below it already listed twelve, because one row
carries three call sites:

```bash
grep -rn "Tenant\.SchoolId" services/api/src --include="*.cs"
```

Grouped by what the value actually does. The grouping is the durable part; the count is not:

| # | Site | Role of `schoolId` |
|---|---|---|
| 1 | `FormMaps.Application/Auth/TenantGucPlanResolver.cs:19` | **Sets the RLS GUC** `app.current_school_id` for the whole request. This is the important one. |
| 2 | `FormMaps.Application/Auth/ProtectedRequestGuard.cs:21` | Fail-closed presence check: school-scoped roles with no school context get 403. |
| 3 | `FormMaps.Infrastructure/Auth/UserAccessGuard.cs:75` | `school_admin` cross-user access — caller's school compared against the target's. |
| 4 | `FormMaps.Api/Endpoints/AuthEndpoints.cs:298` | `school_admin` change-password on another user; cross-school target collapses to 404. |
| 5 | `FormMaps.Api/Endpoints/AuthEndpoints.cs:390` | Same, change-email. |
| 6 | `FormMaps.Api/Endpoints/ReportEndpoints.cs:441` | Benchmark report scope. |
| 7–9 | `FormMaps.Api/Endpoints/VideoEndpoints.cs:43,94,132` | Video enablement + session scope. |
| 10–11 | `FormMaps.Api/Endpoints/MessagesEndpoints.cs:53,95,187` | Contact list, conversation, broadcast audience. |
| — | `FormMaps.Api/Endpoints/RequestContextEndpoints.cs:97` | Not an authorization decision — echoes the caller's own context back to its owner. See that file's class summary and #109. |

Sites 6–11 are the ones where .NET *diverged* from a legacy handler that re-read live
(`report.ts:306`, `video.ts:20/97`, `messages.ts:85/208/551`). Sites 1–5 match legacy's
claim-trusting behaviour.

One .NET path deliberately does **not** trust the claim, because legacy re-reads there and the
port was told to match exactly: `AuthAdminEndpoints.cs` PUT `/admin/set-password` calls
`IAuthAdminRepository.GetUserSchoolIdAsync` (`IAuthAdminRepository.cs:89-98`). So the codebase
already contains the pattern for a live re-read; it is not a capability we lack.

### The second correction: RLS is not an independent backstop

#69 says "RLS still confines the caller to their school's rows", implying RLS mitigates a stale
claim. It does not. RLS is **parameterised by the same claim**:

- `RlsSessionCommandBuilder.cs:27` — `set_config('app.current_school_id', @schoolId, true)`
- policies then match `"schoolId" = current_setting('app.current_school_id', true)`

A token that says School A pins RLS to School A. RLS and the endpoint checks fail together, not
independently. Any severity argument that leans on RLS as a second layer here is wrong.

---

## 2. The concrete attack

Be specific, because the realistic version is much narrower than "stale JWT" sounds.

**Setup.** A user is an active, authenticated member of School A and holds a live access token.
An administrator moves them to School B (or removes them from A).

**The only path that changes an existing user's school** is legacy Node:
`POST /api/v1/admin/users/:userId/link-school/:schoolId` — `api/src/routes/admin.ts:261-274`
(the `user.update` is at :267), gated by `requirePermission("admin:users")`, i.e. Super Admin.
There is **no .NET equivalent**;
`grep -rn "link-school\|LinkSchool"` over `services/api` returns nothing. Other writes to
`user.schoolId` are at account creation / invite acceptance, where no prior token exists.

**The exploit.** The transferred user simply keeps using the token they already hold. Until it
expires, every request — .NET or Node — is evaluated against School A: the RLS GUC is School A,
`UserAccessGuard` compares against School A, the message contact list is School A's.

**What the attacker needs:** nothing they do not already have. No forgery (the claim is signed
HS256 and validated with issuer, audience, lifetime, and an explicit algorithm allowlist —
`LegacyJwtRequestContextFactory.BuildValidationParameters`), no second account, no network
position. Just an admin-initiated transfer and a clock.

**What they gain: nothing new.** This is the crux of the risk assessment. The stale claim only
preserves access the user legitimately held moments earlier. It cannot reach School B — the
claim still reads School A, so RLS pins them out of B. There is no privilege escalation and no
cross-tenant read of a school they were never in. The exposure is **delayed revocation of
already-held access**, not a boundary break.

**The window.** Bounded hard by the access token lifetime:

- `JWT_EXPIRES_IN_MINUTES`, defaulting to **60 minutes** — Node `lib/auth.ts:192`, .NET
  `AccessTokenFactory.ExpiresInSeconds` (`AccessTokenFactory.cs:34-43`). Both stacks read the
  same env var, so the two services cannot drift.
- plus `ClockSkew`, **30 seconds** (`LegacyJwtOptions.cs:13`).

So: **≤ 60m30s by default, and self-healing.**

---

## 3. What mitigates it now

**The TTL, and essentially only the TTL.** Worth stating plainly, because it is easy to get
wrong in the other direction:

1. **Token expiry (the real mitigation).** After ≤60 minutes the token is rejected outright.
2. **Refresh re-mints from the live database.** Both refresh paths reload the user row and build
   a fresh claim set from it — Node `services/authService.ts:135-141`, .NET
   `AuthEndpoints.RefreshAsync` (`AuthEndpoints.cs:150-160`). The staleness therefore cannot
   persist past one refresh cycle; it is not an indefinite condition.
3. **Signature + lifetime validation.** The claim cannot be edited. `ValidateLifetime`,
   `RequireExpirationTime`, `RequireSignedTokens` and an `AlgorithmValidator` restricted to
   HS256 are all on, so `alg: none` and RS/HS confusion are closed.

**Refresh-token revocation does NOT shorten this window**, and #69's checklist should not treat
it as if it does. `revokeAllUserTokens` / `RevokeAllRefreshTokensAsync` invalidate *refresh*
tokens; an already-issued access token stays valid until its `exp` regardless. Revocation ends
the session at the next refresh — it does not truncate the current one.

The .NET revoke sites are `SchoolUsersWriter.cs:193` (role change, formmaps#120, the parity of
Node `routes/school.ts:126`), `AuthEndpoints.cs:326` (password change) and `AuthEndpoints.cs:185`
(logout). Note that `AuthEndpoints.ChangeRoleAsync` itself does **not** revoke — the revocation
on role change lives in the school-users writer. Role and `permissions` are claims too, and
inherit exactly the same ≤60-minute stale-claim window as `schoolId`: same analysis, same
conclusion.

**Gap, minor:** `link-school` does not revoke refresh tokens, while role change does. That is a
consistency wart, not a security control — per the paragraph above, adding revocation there
would not shrink the exposure window by a single second. Worth doing for tidiness and for the
audit trail; worth nothing for risk.

---

## 4. What a fix would cost

| Option | Effect on the window | Cost |
|---|---|---|
| **A. Lower `JWT_EXPIRES_IN_MINUTES`** | Directly proportional. 15m → ≤15m30s. | Env var only, both services, zero code. Costs 4× the refresh traffic and 4× the token-mint DB reads. |
| **B. Re-read `schoolId` per request** in `RequestContextMiddleware` / `TenantGucPlanResolver` | Reduces to ~0. | One extra DB round trip on **every authenticated request**, before RLS is even established — and every query here is already 2 round trips through the RLS wrapper, so this is a measurable latency floor on the whole API. Also a chicken-and-egg problem: the lookup must run before the tenant GUC exists, i.e. as a system-context read, which is a new RLS-bypassing code path on the hottest line in the stack. Needs the identical change in Node or the two services disagree about who is in which school. |
| **C. Re-read only in high-privilege handlers** (sites 3–5: cross-user admin actions) | ~0 for the paths that matter; unchanged elsewhere. | ~5 call sites, one repository method that **already exists** (`GetUserSchoolIdAsync`). A day, plus tests that exercise the gate where RLS cannot do the gate's job for it. |
| **D. `tokenVersion` claim checked per request** | ~0, and covers role/permissions too. | Schema change, mint/validate changes in both stacks, a cache or a per-request read. Weeks, and it re-introduces B's per-request lookup unless cached. |
| **E. Revoke refresh tokens on `link-school`** | **Zero.** See §3. | 1 line. Do it for consistency, not for risk. |

---

## 5. Recommendation

**Accept the current design. Close #69 as documented-and-accepted, not as work.**

The reasoning, in order of weight:

1. The exposure grants **no capability the user did not already have**. It delays the removal of
   access; it never adds any. Cross-tenant reach into the new school is impossible because the
   stale claim names the old one.
2. The window is hard-bounded at ~60 minutes, self-healing, and requires a rare Super
   Admin-initiated transfer to open at all.
3. The expensive fixes (B, D) buy down a risk whose worst case is "a transferred user can read
   their former school's data for up to an hour" — while imposing a permanent latency cost on
   every authenticated request in the product.
4. Both stacks behave identically here, so this is not a .NET port regression and does not block
   any cutover. Fixing it in one service only would make them disagree, which is worse.

**If it is ever revisited, do these in order:**

- **E** now, as a one-line consistency fix with an audit entry. It is not a mitigation; label it
  honestly in the commit message so the next audit does not mistake it for one.
- **A** if a compliance requirement ever names a maximum revocation latency. It is the only
  lever with a real effect and no code.
- **C** if a specific high-privilege path is ever found to grant something the caller did not
  already hold. That would be a new finding and should be filed as its own issue with the
  concrete path — not folded into #69.
- **B / D** only if the product gains genuinely adversarial multi-tenant users. It does not have
  them today: tenants are schools, and the actor in this scenario is a student or staff member
  who was in the school an hour ago.

**What must not happen:** citing "RLS confines the caller anyway" as the reason this is safe.
RLS is driven by the same claim (§1). The reason it is safe is §2 — no new capability is
granted — and that is the argument to reuse.
