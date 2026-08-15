# Phase F: Documents / Resume / Report — Completion Design

**Status:** approved by Federico 2026-07-29, ready for planning.
**Scope:** close out the remaining Phase F (domain 8) surface: wire the 3 already-built-but-dark slices
that never got a frontend rewrite, and build the last 5 legacy endpoints (`resume.ts` cross-user
CRUD + `report.ts` send-report-email) that have no `.NET` code yet.

## Correction to the roadmap's characterization

`production-readiness-roadmap.md` describes the remainder as "cross-user resume reads/writes and
`report.ts` (PDF + SES attachment)." Verified directly against both repos on 2026-07-29 — two things
were wrong:

1. **FM-088/089/090 backend code is merged and staging-canary-verified, but `formmaps-platform/frontend/next.config.ts`
   has zero rewrites or flag functions for any of the three** (grep for `RESUME`, `UPLOAD`, `Resume` in
   that file returns nothing beyond CSP comments). Same "backend done, frontend dark" gap this project
   already hit once with FM-043 — confirmed the same way, by diffing merged `.NET` commits against
   actual frontend rewrite state rather than trusting the completion doc.
2. **`report.ts`'s `sendReportEmail` has no PDF and no attachment** — it calls the plain
   `sendEmail(to, subject, html)` rail with a canned paragraph, nothing else. There is no PDF-generation
   code anywhere in `report.ts` today. "PDF + SES attachment" does not describe anything that currently
   exists to port.

## Track A — Frontend wiring (mechanical, no new code)

Add flag-gated rewrites to `frontend/next.config.ts`, identical pattern to the FM-043 commit
(`b88f5655`): a `shouldRouteXToDotnet()` function + rewrite entries placed ahead of the existing
`/api/:path*` and `/evaluation/:path*` catch-alls, all flags default OFF.

| Slice | Routes | Flag |
|---|---|---|
| FM-088 uploads | 6 exact-literal `/api/v1/upload/*` POSTs | `FORMMAPS_ROUTE_UPLOAD_TO_DOTNET` |
| FM-089 resume sections/template | `PUT /:id/sections/order`, `POST /:id/sections`, `DELETE /:id/sections/:sectionId`, `PUT /:id/template` (mounted `/api/resume`) | `FORMMAPS_ROUTE_RESUME_SECTIONS_TO_DOTNET` |
| FM-090 resume CRUD | `GET /default`, `GET /`, `POST /` (mounted `/api/resume`) | `FORMMAPS_ROUTE_RESUME_CRUD_TO_DOTNET` |

Flag names are taken verbatim from the `.NET` endpoint doc-comments (`EvaluationExternalEndpoints.cs`-style
headers already name the exact flag each slice is dark behind) — no guessing required. No design
decision here; this is pure transcription, done directly, not through a fork.

## Track B — Fork 1: `resume.ts` completion

**Files:** extends `FormMaps.Api/Endpoints/ResumeCrudEndpoints.cs` (or a sibling endpoints file),
`IResumeRepository`/`ResumeRepository`, and `IObjectStorage`/`S3ObjectStorage`.

### Routes and exact legacy semantics

| Route | Access check | Behavior |
|---|---|---|
| `GET /:id` | `canAccessUser` (self / assigned counselor / same-school admin / super-admin) | **Dual-mode**, ported exactly as legacy behaves. (1) Try `:id` as a resume ID: `findFirst{id, isActive}`. If found, `canAccessUser` against the owner — 404 if denied, else return the row. (2) If no resume matched, fall back to `resolveSecureUserId`'s exact semantics: **non-privileged callers are always forced to their own userId regardless of what `:id` was** (a real legacy quirk — `:id` is silently ignored for students); privileged callers get `:id` resolved as a target userId (or `"me"` → self) through `canAccessUser`. Then `findMany{userId, isActive} ORDER BY updatedAt DESC`, return `[0]` or 404 "No resume found". |
| `PUT /:resumeId` | **Strictly owner-only** — `existing.userId !== req.userId`, plain equality, **no `canAccessUser`, no privileged-role override**. `findUnique({id})` with **no `isActive` filter** (a soft-deleted resume stays editable via direct PUT). | Partial update: only body keys present among `name, template, careerField, personalInfo, experience, education, skills, sections, fieldVisibility, customFields` get written; `documentEdits` (if present) runs through the existing bounded `sanitizeDocumentEdits` port (cap 1000 entries, clamp `orig`/`text` to 1000 chars, drop non-integer/negative `page`/`runIndex`). |
| `DELETE /:resumeId` | Same strictly-owner-only check as PUT. | Soft delete: `isActive = false`. |
| `GET /:id/original` | Same cross-user `canAccessUser` semantics as `GET /:id` (not the owner-only check). | 404 if resume missing or `originalPdfKey` is null. 404 (not 403) if access denied — never confirm existence to an unauthorized caller. Else a 300-second, inline-disposition, `application/pdf` presigned URL via the new `IObjectStorage` method below. |

**Important asymmetry, preserved intentionally:** `GET` routes are cross-user-viewable by privileged
roles; `PUT`/`DELETE` are strictly self-only with no privileged override. This is legacy's actual
behavior, not an inconsistency to fix.

**New logic (no Node counterpart exists yet in `.NET`):** a private helper replicating
`resolveSecureUserId`'s self-fallback semantics for the `GET /:id` miss-path. Scoped locally to this
endpoint file for now (YAGNI) — promote to a shared `IUserAccessGuard` method only if a later slice
needs the identical "privileged-target-or-forced-self" shape.

**New capability — `IObjectStorage`:**
```csharp
Task<string> GetPresignedReadUrlAsync(
    string key, int ttlSeconds, bool inline, string contentType, CancellationToken ct = default);
```
Today's `IObjectStorage` only presigns at upload time (`UploadAndGetUrlAsync`, fixed 24h,
attachment-disposition). This is a second, independent presign path for an *existing* stored key with
caller-supplied TTL and disposition — needed because `GET /:id/original` presigns a file that was
stored at a completely different time (during `upload-and-parse`, which stays in Node).

### Routing

`GET/PUT/DELETE` on the single segment all resolve fine inside `.NET` (different HTTP verbs, no
collision). The Next.js rewrite is the actual collision point: **one rewrite rule**, one dynamic
segment, with a negative lookahead excluding **all 5** reserved single-segment literals on this router
— `default`, `ask`, `upload-and-parse`, `tailor`, `extract-job-posting` — not the 3 a stale doc note
implied. Co-flips GET/PUT/DELETE under one flag (path-not-method, same convention as FM-044/FM-090).

`GET /:id/original` is a distinct 2-segment literal (`/api/resume/:id/original`), no collision risk,
but ships behind its **own second flag** rather than sharing the CRUD flag — it's a genuinely separate
risk surface (a new presigned-URL capability) from plain CRUD ownership checks, and independent
flagging gives independent rollback.

**Flags:** `FORMMAPS_ROUTE_RESUME_CROSSUSER_TO_DOTNET` (GET/PUT/DELETE), `FORMMAPS_ROUTE_RESUME_ORIGINAL_TO_DOTNET` (GET/:id/original).

## Track C — Fork 2: `report.ts` send-report-email

Fully independent of Fork 1 — different file, no shared state, low risk, reuses two already-hardened
interfaces with no new infra.

**Route:** `POST /send-report-email/:userId`
1. `IUserAccessGuard.CanAccessUserAsync` against `:userId` → 404 "Not found" if denied (matches every
   other cross-user report route already ported in this domain — never 403).
2. Fetch `{id, email, name}` for the target user → 404 "User not found" if missing.
3. `IEmailSender.SendAsync(student.email, "FormMaps — Student Report for {name}", html)` — the exact
   same canned HTML legacy sends today (fixed paragraph + dashboard link; no report data embedded, no
   PDF, no attachment — this is a byte-for-byte port of existing behavior, not new functionality).
4. `200 {emailSent, recipient}` — `emailSent` is whatever `SendAsync` returns (`true`/`false`, never
   throws, per the existing "mailer outage can't fail the caller" contract).

**Flag:** `FORMMAPS_ROUTE_SEND_REPORT_EMAIL_TO_DOTNET`.

## Error handling (both forks)

Matches this migration's established conventions throughout: ownership/access failures → 404, never
403 (avoids confirming a resource exists to an unauthorized caller); body validation happens after the
auth/ownership check (the accepted "express.json-first" 401/404-before-500 class); unhandled exceptions
→ generic 500, never `err.message` leaked to the client.

## Testing

- Unit tests: the `sanitizeDocumentEdits` port, the `GET /:id` dual-mode resolution logic (including
  the non-privileged forced-self branch), the presigned-URL wrapper.
- Testcontainers integration tests against a real Postgres, reusing FM-090's `resume-crud-schema.sql`
  harness (full 22-column `resumes` table).
- Endpoint tests (faked repository) covering each route's status-code matrix — 200/404/401 paths,
  including the owner-only vs. cross-user access asymmetry between PUT/DELETE and GET.
- **Fresh-reviewer adversarial gate on Fork 1** (cross-user access control is a real IDOR surface if the
  dual-mode resolution or the owner-only check has an off-by-one) — full rigor, matching every other
  slice in this migration.
- Fork 2 gets unit + endpoint tests; no separate adversarial-review agent (pure reuse of two
  already-hardened, already-reviewed interfaces — `IUserAccessGuard` and `IEmailSender` carry no new
  risk surface).

## Rollout

All three tracks (A, B, C) land as **local commits only** — no push, no PR, no staging deploy, no flag
flip. Every new flag defaults OFF. Push/deploy/flag-flip remain separate, explicitly-confirmed decisions
per this project's standing convention, made later and one at a time, not bundled with this build.

## Build order

1. Track A (3 mechanical wiring commits) — done directly, immediately, no fork.
2. Fork 1 (`resume.ts` completion) and Fork 2 (`report.ts` send-report-email) run **in parallel**, each
   in its own isolated git worktree — no shared files, no merge risk between them.
3. Fork 1 gets the adversarial-review pass before its final commit; Fork 2 does not.

## Self-review

- **Placeholders:** none — every route has a named legacy counterpart, an exact access-check
  distinction, and a concrete new-capability shape where one is needed.
- **Consistency:** the GET-cross-user-vs-PUT/DELETE-owner-only asymmetry is stated once and referenced
  consistently in the routing and testing sections rather than re-derived.
- **Scope:** three independently-sized units (one mechanical, two forks) — appropriately bounded for one
  implementation plan per fork; Track A needs no plan, just execution.
- **Ambiguity:** resolved the one open design question (whether `GET /:id/original` shares the CRUD flag)
  explicitly — it does not, for independent-rollback reasons stated above.
