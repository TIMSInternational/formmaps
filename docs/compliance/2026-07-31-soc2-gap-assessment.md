<!--
  RECOVERED 2026-08-02 (formmaps#35).

  This report was generated 2026-07-31 as research output and was never written to
  disk -- it existed only inside a workflow journal, which is ephemeral. Recovered
  verbatim from that journal and committed here so it stops being one  away
  from gone.

  READ THIS FIRST -- the report is a snapshot and is ALREADY PARTLY SUPERSEDED:

  * Its headline finding, ".NET has no session/auth ownership", was CLOSED by
    Domain 10 (Auth), completed 2026-08-01. .NET now owns the full session-issuance
    surface behind FORMMAPS_ROUTE_AUTH_TO_DOTNET (still dark).
  * "No audit-log persistence" remains OPEN and is the largest surviving gap --
    tracked as formmaps#52.
  * Section 6's claim that GDPR erasure spans "every tenant-scoped table for this
    user" was WRONG -- erasure deleted nothing and returned 500 (formmaps#78).
    Corrected in place 2026-08-05. The fix is committed to the legacy Node repo's
    `develop` but is NOT deployed, so the gap is still live in production.
  * "CI silently non-functional since ~2026-07-29 (billing block)" is RESOLVED; the
    2026-07-31 17:02 run on main succeeded.
  * The shared Node/.NET JWT secret it flags is a DELIBERATE migration measure --
    a session minted by either backend must stay valid on the other during cutover.
    It becomes a real finding only after Node retires (formmaps#66).

  Re-verify every claim against current code before acting on it. Do not treat
  this document as current state.
-->

# FormMaps SOC2/ISO 27001 Gap Assessment
**Scope:** TIMSInternational/formmaps (.NET monorepo, `main`) + tafurfede/formmaps-platform (legacy Node, `develop`/`main`, still live for Billing/Auth) — GitHub issue TIMSInternational/formmaps#9, Part of #4.
**Method:** Direct code/config inspection of both repos + CI workflows + GitHub API (branch protection, repo visibility) + prior ISMS package at `~/tims-audit/docs/compliance/` and `~/tims-suite/docs/compliance/` used as structural template only (per issue's instruction), not as evidence about FormMaps itself.
**Date:** 2026-07-31.

---

## Executive Summary

FormMaps is **mid-migration**, and that fact dominates the compliance picture: the .NET service is a security-conscious rewrite with genuinely good bones (RLS-enforced Postgres access, algorithm-pinned JWT validation, security headers, redacted logging, a byte-compatible AES-256-GCM field cipher), but it currently has **no session/auth ownership, no audit-log persistence, and thinner CI security scanning** than the Node service it's replacing. The legacy Node backend, which still owns Auth and Billing, has the more mature security posture (bcrypt, revocable refresh tokens, GDPR export/delete endpoints — though erasure was subsequently found non-functional, see §6 and formmaps#78 — gitleaks + RLS-isolation-as-CI-gate, a documented and largely-closed remediation register) but is a private repo that **cannot enable branch protection at all under its current GitHub plan**, and its CI has been silently non-functional since ~2026-07-29 due to a billing block — meaning the "green checkmarks" on recent PRs are not real signal.

The single highest-priority gap for certification readiness is **organizational, not technical**: there is no ISMS, no risk register, no incident-response runbook, and no vendor/subprocessor register for FormMaps (all of which exist for a sibling codebase, TimsSuite, but have not been replicated here). The single highest-priority *technical* gap is that **Auth/session (Domain 10) has not started migrating** — the .NET service only verifies tokens minted by Node using a secret shared across two independently-deployed runtimes, so a leak or bug in either service compromises both.

None of this blocks starting a gap-closure program now, in parallel with domain migration, which is exactly what issue #9 already proposes.

---

## Findings by Control Area

### 1. Access Control & Least Privilege
**Status: mostly covered; one item explicitly in-progress (don't re-litigate).**

- RLS is enforced on both stacks. Node CI (`~/formmaps-platform/.github/workflows/ci.yml`) runs a dedicated `rls` job against a **real, non-superuser Postgres role** (`rls_app`) — a genuinely strong, auditor-legible control (superusers bypass RLS even with FORCE RLS, and the workflow explicitly accounts for that). The .NET service has its own RLS session-context plumbing (`services/api/src/FormMaps.Infrastructure/Data/RlsSessionContextApplier.cs`, `RlsSessionCommandBuilder.cs`).
- Issue #10 (dedicated least-privilege DB role for the .NET service, replacing reuse of Node's credential) is tracked and in progress — referenced here per instructions, not re-assessed.
- No CODEOWNERS file in either repo, so PR review isn't tied to code ownership.
- **Priority:** Low for this item specifically (superseded by #10's own tracking).

### 2. Authentication & Session Management
**Status: reasonable-for-now on Node; major architectural gap on .NET (Domain 10 not started). Flag as noted in the task.**

Evidence, Node (current owner of the full session lifecycle):
- bcrypt password hashing (`api/src/lib/auth.ts`), HS256 JWTs, refresh tokens are a **persisted, revocable `RefreshToken` model** (`api/prisma/schema.prisma`), not purely stateless — logout actually revokes (`api/src/routes/auth.ts:81-83`).
- Cookies: `access_token`/`refresh_token` are `httpOnly`, `secure` in prod, `sameSite=lax`, correct path-scoping (`api/src/lib/authCookies.ts`).
- Dedicated `authLimiter` on `/authapi/login`, `/signup*`, `/forgot-password`, `/reset-password`, `/refresh`, `/change-password` (chained with `sensitiveLimiter`) — brute-force mitigated (`api/src/index.ts:237-247`).
- **Gaps found:** no MFA/TOTP/2FA anywhere in the codebase (`grep` for mfa/totp/2fa returns nothing), and no explicit account-lockout counter beyond rate-limiting (rate-limit resets on window expiry rather than requiring admin unlock).

Evidence, .NET (`services/api/src/FormMaps.Api/Auth/LegacyJwtRequestContextFactory.cs`):
- The .NET service does **not issue, refresh, or revoke sessions at all** — it only validates tokens minted by Node, using the same `JWT_SECRET`, with genuinely careful validation (algorithm pinned to HMAC-SHA256 via `AlgorithmValidator`, issuer/audience/lifetime all checked, hub-scoped realtime tickets explicitly rejected outside `/hubs/messages` to prevent replay). This is good defensive coding, but it doesn't change the underlying architecture: **one shared long-lived symmetric secret between two independently-deployable services** is a materially larger blast radius than a single-owner auth service, and the .NET side has zero password-reset/lockout/session-revocation logic of its own to fall back on if Node auth is unavailable or compromised.
- `docs/migration/auth-tenant-context-contract.md` documents this contract clearly and is honest that "Auth/session" is Domain 10, "the keystone, strictly last."

**Priority: HIGH.** This is the single largest gap an auditor will flag, and per the issue's own framing it lands right where SOC2/ISO controls bite hardest (Domains 9/Billing and 10/Auth haven't been reached yet). Recommend: MFA for privileged roles as a near-term compensating control *before* Domain 10 starts, independent of the full migration timeline.

### 3. Encryption at Rest / In Transit
**Status: reasonably covered, with one narrow-scope caveat.**

- In transit: HSTS (`max-age=31536000; includeSubDomains`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, cache-control hardening — all applied globally via `SecurityHeadersMiddleware.cs`.
- At rest, DB: `docs/security/REMAINING-WORK.md` (Node repo) records a live-inventory check that Aurora (`nexa-aurora-enc`) has `StorageEncrypted=true` — this is a point-in-time note from 2026-07-15, not something I re-verified against live AWS (I don't have console/API access).
- At rest, field-level: `AesGcmFieldCipher.cs` is a careful byte-compatible AES-256-GCM port of Node's `lib/fieldEncrypt.ts` (documented IV/tag/format matching so ciphertext round-trips between runtimes) — but its **only current consumer is iSAMS integration API credentials** (`api/src/services/schoolService.ts:380-412`), not broader PII (assessment results, resumes, SSNs/DOB if collected). Encryption at rest for those relies entirely on the storage-layer (Aurora) setting, not field-level defense-in-depth.
- `FIELD_ENCRYPTION_KEY` is `optional()` in the Zod env schema but the cipher itself throws at first use if unset (`fieldEncrypt.ts:8-9`) — so it's fail-closed in practice, just not fail-closed at process startup, meaning a misconfiguration surfaces as a runtime 500 on first encrypted write rather than a boot-time error.
- **Could not determine:** actual current S3 bucket encryption/public-access-block settings, actual RDS/Aurora config today (only a 2026-07-15 point-in-time note), Vercel edge TLS config beyond defaults.

**Priority: Medium.** Recommend widening field-level encryption to other sensitive PII fields, and re-verifying the Aurora/S3 settings live rather than trusting a 2-week-old note.

### 4. Audit Logging
**Status: solid on Node; a real gap on .NET.**

- Node has an actual audit trail: `auditLog(...)` calls throughout `api/src/services/adminService.ts` and `api/src/routes/admin.ts`, including GDPR deletions (`adminService.ts:289`: `auditLog(adminId, adminEmail, "USER_GDPR_DELETE", "User", userId, {...})`) and moderation actions (`api/src/routes/moderation.ts`).
- `RequestLogRedactor.cs` (.NET) and Node's CI-enforced "no err.message in JSON responses" rule both show log-hygiene discipline.
- **Gap:** the .NET service has **no equivalent audit-log persistence at all** — an exhaustive grep across `services/api/src` for `AuditLog`/`AuditEvent`/`admin_action`/`role_changed`/`feature_flag_changed` returns nothing except unrelated string matches. As domains migrate off Node, admin/security-relevant actions on the .NET side (role changes, flag flips, exports) currently go unlogged unless this is built before Domain 9/10 land.

**Priority: HIGH** (compounds with the Auth gap above — an auditor will ask "who did what" on the .NET side and there's currently no answer).

### 5. Secrets Management
**Status: reasonably strong process, with one live-but-partially-fixed incident to disclose.**

- Both `.env.template` files (Node and .NET/`apps/web`) contain only placeholders, no real secrets. `.gitignore` excludes `api/.env`, `frontend/.env*`.
- Node's env loader (`api/src/lib/env.ts`) is a Zod schema that fails closed in production (`process.exit(1)` on invalid/missing required vars) and enforces `JWT_SECRET` ≥ 32 chars. `.NET`'s `StartupEnvironmentValidator.cs` does the same for its own env (`JWT_SECRET`, DB connection string), production-only.
- Node CI runs **gitleaks** as a dedicated job on every push/PR (`.github/workflows/ci.yml` → `gitleaks` job) plus a coding-standard check that greps for `sk_live|sk_test_|AKIA[A-Z0-9]` patterns. **The .NET CI (`formmaps-api-ci.yml`) has no equivalent secret-scanning or dependency-audit step at all** — build/test/docker-build only.
- **CoKey pattern (as flagged in the task):** the TIMS/PCA vendor secret (`PCA_COKEY`) was leaking through response bodies (`GetPcaResult`/`GetCompetencesResult` bake the raw coKey into returned image URLs). This was found and fixed this session: `stripPcaResultSecrets()` (`api/src/lib/pca.ts:220-246`) recursively redacts the raw and URL-encoded coKey from any outbound response. Verified via `git log`: the fix (`cd0e7323`/`f73e5aa5`→merged as `91bb1132`) is on **both `develop` and `main`, and pushed to `origin`** — this is closed for the app-layer leak. **Residual exposure, not an action item for this team — tracked as [formmaps#70](https://github.com/TIMSInternational/formmaps/issues/70):** the leak vector is closed, but the potentially-exposed key *value* is a TIMS-held vendor credential. Rotating it requires a counterpart at TIMS; there is no change we can make in either repo that closes it, and rotation status is not independently verifiable from here (no vendor portal access). #70 also carries the forward-looking half: the scrub does not exist in .NET because `get-competences`/`get-pca-vs-jca` have not been ported, so it is a trap for whoever ports them rather than a current .NET vulnerability. Recorded here for disclosure completeness only.
- **Could not determine:** whether the git-history purge referenced in `REMAINING-WORK.md` ("secret/coKey exposure + git-history purge") is reflected in the currently-checked-out history — no filter-repo/BFG commit markers found in `git log --all`, which is expected if history was rewritten via `git filter-repo` externally, but I couldn't confirm this from inside the repo alone.

**Priority: Medium-High** — the one actionable item here is the .NET CI secret-scanning gap (cheap, high-leverage). The coKey rotation is *not* an action item for this team; it is a vendor-side dependency on TIMS, carried as an open disclosure under formmaps#70.

### 6. Data Retention / Deletion Policies
**Status: partially covered — reactive, not policy-driven.**

- Node exposes GDPR endpoints: `POST /api/v1/admin/users/:userId/export` and `DELETE /api/v1/admin/users/:userId/gdpr-delete` (`api/src/routes/admin.ts:246,260`), backed by `exportUserData`/`gdprDeleteUser` in `adminService.ts`, and the delete path is itself audit-logged.
- **CORRECTION 2026-08-05 — see [formmaps#78](https://github.com/TIMSInternational/formmaps/issues/78).** This bullet originally asserted that `gdprDeleteUser` "spans every tenant-scoped table for this user". **That was false, and the control it described did not exist.** Erasure hand-maintained a delete list that the schema had outgrown: of 55 `User` relations, 22 are `RESTRICT` and **13 of those 22 were missing** from the list. `StudentCoursePlan.student` is decisive — it is the RLS pilot table, so in practice every student has a row — so the final `user.delete` raised `student_course_plans_studentId_fkey`, the transaction rolled back, and the route's generic `catch` returned a 500. **A right-to-erasure request believed fulfilled had in fact deleted nothing.** Separately, six tables carry a `userId` column with *no* FK relation, so they never raised — they orphaned silently. `Coach` (name + email) survived "permanent deletion" along with the `payout_settings`/`bank_accounts` rows that cascade off `Coach` rather than `User`. The export side was materially incomplete as well: 10 relations out of ~55, omitting LIA/personality/PCA sessions, essays, counselor notes and telemetry — a substantive shortfall for an Art.15/20 subject access request. **Any erasure request actioned through this endpoint before the fix ships must be re-run.**
- **Fix status: committed, NOT shipped — the gap is still live in production.** Two commits on `origin/develop` of the legacy Node repo (`tafurfede/formmaps-platform`) close it: `6b6fc75a` adds the missing RESTRICT relations in dependency order, the orphaning `userId` tables and explicit coach teardown; pre-checks the four relations that document an interaction with *another* data subject behind a `NOT NULL` FK and returns **409 with counts** rather than FK-failing into a 500 (nullable FKs + anonymise is the permanent answer, but that is a production migration and a separate decision); widens export from 10 to ~40 relations under `runAsSystem`; and adds both a static drift-guard that fails the build when a new `User` relation gains no erasure decision and an integration test that reproduces the pre-fix FK violation. `32a7341e` then fixes `runAsSystem` being a silent no-op in these same paths — measured against real Postgres as the non-superuser role, `exportUserData` returned NULL for every subject and the new over-delete guard counted **0** blockers, i.e. erasure proceeded in exactly the case the guard was added to refuse. **Neither commit is deployed:** the most recent `nexa-api` App Runner deployment is 2026-07-30, and both commits date from 2026-08-03. Until they ship, production erasure behaves as described in the correction above.
- **Gap:** even once shipped, this is admin-triggered, on-demand erasure — I found **no automated retention schedule** (e.g., a scheduled job purging stale sessions, expired assessment attempts, old audit-log rows past a defined window) and **no written retention policy document** analogous to TimsSuite's `05-data-retention-and-erasure-policy.md`. There's nothing in FormMaps' `docs/` tree defining how long data types are kept.
- The .NET side has no equivalent GDPR export/delete surface yet (consistent with Domain 9/10 not being migrated).

**Priority: High until formmaps#78 is deployed, Medium thereafter.** The original text here read "GDPR mechanics exist" — the endpoints exist, but erasure did not work and export was incomplete (see the correction above). Once #78 ships, the residual gap is the original one: a written retention schedule and a scheduled-purge job do not exist.

### 7. Vendor / Third-Party Risk
**Status: no formal register; the integration surface itself is identifiable.**

Concrete vendor/subprocessor inventory, reconstructed from `api/src/lib/env.ts`:
- **AWS** — S3 (`S3_BUCKET`), SES (`SES_FROM_EMAIL`), Bedrock (`BEDROCK_MODEL_ID`, `us.anthropic.claude-haiku-4-5...`), Aurora Postgres, Secrets Manager (per `REMAINING-WORK.md`'s "App Runner secrets/IAM cutover" note — 5 secrets moved to `nexa/api/*`).
- **Stripe** — webhook signature verification is present and correct (`stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!)` at `api/src/routes/stripe.ts:351`), a real positive.
- **Vercel** — frontend hosting for both the legacy Node frontend and the .NET monorepo's `apps/web`.
- **TIMS/PCA** — third-party assessment API (`PCA_BASE_URL`, `PCA_COKEY`) — see coKey finding above.
- **Google Calendar OAuth, Outlook Calendar OAuth, Zoom** — optional integrations with their own client secrets.
- **Sentry** — error tracking (`SENTRY_DSN`, optional).
- **Gap:** no vendor/subprocessor register, no DPA tracking, no documented sub-processor list for a privacy notice/trust center — this exists for TimsSuite (`06-vendor-management-register.md`) but has no FormMaps counterpart.
- **Could not determine:** actual AWS IAM policy contents, Vercel team member/SSO permissions, GitHub org-level 2FA enforcement — none of these are accessible from a repo-level read.

**Priority: Medium.** The technical integration hygiene (Stripe signature check, scoped env vars) is fine; the paperwork (register + DPAs) doesn't exist.

### 8. Incident Response Readiness
**Status: gap.**

- No incident-response runbook, no breach-notification procedure, no classification/severity scheme found anywhere in either repo's `docs/` tree (searched for "incident" — no hits). TimsSuite has this as `04-incident-response-runbook.md`; FormMaps has no equivalent.
- The CoKey response (find → fix → merge → push same day) is evidence the *team* can execute incident response in practice, but there's no documented process, roles, or notification-clock commitments an auditor could inspect.

**Priority: High** for SOC2/ISO purposes specifically (CC7.3/7.4 and ISO A.5.24-A.5.26 are explicit requirements) — but low effort to close since it's a document, not code, and the operational muscle already exists.

### 9. Change Management
**Status: mixed — strong technical practice undermined by two structural gaps. This is a genuine positive signal overall, as instructed.**

**Positive evidence:**
- Feature-flag-gated rollout is real and disciplined: `NEXT_PUBLIC_FORMMAPS_ROUTE_MESSAGES_REALTIME_TO_DOTNET` defaults to `0`/dark in `.env.template`, with an explicit comment warning that `echo` (vs `printf`) silently breaks the flag via a trailing newline — a documented operational lesson, not a hypothetical.
- Node CI enforces real coding-standards gates on every PR: no `@ts-ignore`, no `any` in API code, no `...req.body` mass assignment, no unsafe raw SQL, no hardcoded secrets, no `console.log` in API code, no `dangerouslySetInnerHTML`, no error-message leakage — all as automated CI checks, not just code-review convention (`.github/workflows/ci.yml`).
- A dedicated 43-test `security-audit.test.ts` suite runs as its own CI job.
- Migration is documented with real design docs (`docs/migration/*.md`) including an explicit auth contract, cutover checklists, and a completion roadmap — this is unusually good change-management documentation for a project this size.

**Gaps:**
- **CI has been non-functional since ~2026-07-29** due to a GitHub Actions billing/spending-limit block (confirmed prior finding, not re-verified live) — meaning every green checkmark on a PR merged after that date is **not trustworthy signal**. This directly undercuts the "PR + CI gate" story for the most recent work.
- **No branch protection on either repo, for different reasons.** `TIMSInternational/formmaps` is public and branch protection is available but simply not enabled (`gh api .../branches/main/protection` → 404 "Branch not protected"). `tafurfede/formmaps-platform` is private and **cannot** enable it on the current plan (`gh api` → 403 "Upgrade to GitHub Pro"). Unlike TimsSuite, which has a documented compensating control (`.githooks/pre-push` local hook), **formmaps-platform has no local pre-push hook** — I checked `.git/hooks/pre-push` and it doesn't exist.
- No CODEOWNERS in either repo; no dependabot config in either repo.

**Priority: Medium overall** (the practice is good; the enforcement has two real holes — fix the CI billing block first since it's silently invalidating everything downstream of it, then either enable free branch protection on the public repo or add a compensating pre-push hook on the private one).

---

## Summary Table

| Area | Status | Priority |
|---|---|---|
| Access control / least privilege | Covered (RLS both stacks); #10 in progress | Low (tracked elsewhere) |
| Auth & session management | Node reasonable; .NET has no session ownership (Domain 10 not started, shared JWT secret) | **High** |
| Encryption at rest/in transit | Covered at transport + DB-storage layer; field-level encryption narrow-scope | Medium |
| Audit logging | Solid on Node; **absent on .NET** | **High** |
| Secrets management | Good process (Zod fail-closed, gitleaks on Node); CoKey leak fixed+pushed, key rotation unconfirmed; .NET CI has no secret scanning | Medium-High |
| Data retention/deletion | **GDPR erasure was broken in production and deleted nothing (formmaps#78)** — fix committed to Node `develop` but undeployed as of 2026-08-05; export also incomplete. No written policy, no automated purge | **High** until #78 ships, then Medium |
| Vendor/third-party risk | Integrations technically sound (Stripe sig check); no formal register/DPAs | Medium |
| Incident response readiness | No runbook at all | **High** (cheap fix) |
| Change management | Strong PR/CI/flag discipline undercut by broken CI (billing) + no branch protection either repo | Medium |

## Explicitly Could Not Determine (no access from this environment)
- Live AWS IAM policy documents/roles (only a 2026-07-15 point-in-time note in `REMAINING-WORK.md`).
- Current Aurora/RDS and S3 encryption-at-rest and public-access-block settings (not re-verified live).
- Vercel team membership, SSO/2FA enforcement, and project-level permissions.
- GitHub organization-level 2FA enforcement for TIMSInternational.
- Whether the CoKey git-history purge mentioned in `docs/security/REMAINING-WORK.md` was actually executed against the history now checked out (no filter-repo/BFG markers found in `git log --all`).
- Confirmation from TIMS that the PCA_COKEY value itself has been rotated (app-layer leak is fixed; key rotation status is vendor-side).

## Files/Evidence Referenced
- `services/api/src/FormMaps.Api/Auth/LegacyJwtRequestContextFactory.cs`, `services/api/src/FormMaps.Api/Security/{SecurityHeadersMiddleware,StartupEnvironmentValidator,RequestLogRedactor}.cs`, `services/api/src/FormMaps.Infrastructure/Security/AesGcmFieldCipher.cs`, `services/api/src/FormMaps.Infrastructure/Data/{RlsSessionContextApplier,RlsSessionCommandBuilder}.cs` (.NET repo, path `/Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps`)
- `docs/migration/auth-tenant-context-contract.md`, `docs/migration/production-readiness-roadmap.md` (.NET repo)
- `.github/workflows/{formmaps-api-ci.yml,formmaps-api-staging-deploy.yml}` (.NET repo) vs `.github/workflows/ci.yml` (Node repo)
- `api/src/lib/{env.ts,auth.ts,authCookies.ts,pca.ts,fieldEncrypt.ts}`, `api/src/middleware/rateLimiter.ts`, `api/src/routes/{admin.ts,auth.ts,stripe.ts}`, `api/src/services/{adminService.ts,schoolService.ts}`, `docs/security/REMAINING-WORK.md` (Node repo, `/Users/federicotafur/formmaps-platform`)
- Structural template only (not FormMaps evidence): `~/tims-audit/docs/compliance/{README.md,01-isms-scope-and-soa.md}`, memory note `tims-soc2-iso27001-compliance`.
