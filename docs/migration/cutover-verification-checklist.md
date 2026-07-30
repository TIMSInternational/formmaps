# Per-Batch Cutover Verification Checklist

Copy this file's checklist section per batch, filling in the batch name and routes.
Grounded in Wave 2 Batch 1 (the first execution) — see
docs/superpowers/plans/2026-07-27-wave2-batch1-cutover.md in formmaps-platform for the
worked example this was extracted from.

## Checklist (per batch)

- [ ] Batch's routes + flags identified (grep the manifest for `FM-DOTNET-*` ids covering the batch; confirm ALL are `status: completed`).
- [ ] Confirm prod `.NET` image already contains the batch's code (`git merge-base --is-ancestor <deployed-sha> main`) — if not, a prod `.NET` redeploy is itself a prerequisite task.
- [ ] Fixture account verified/seeded with whatever data the batch's reads/writes need to render real content (not just pass a 200).
- [ ] Rewrite block ported into `formmaps-platform/frontend/next.config.ts` (additive only — diff-verify zero lines of prior batches' blocks touched).
- [ ] Batch canary config written (`services/api/scripts/batch-configs/<batch>.json`).
- [ ] **Real-auth gate**: canary run authenticated DIRECTLY against `formmaps-api-prod`, bypassing Vercel entirely, using a real fixture bearer token — must pass before Vercel is touched.
- [ ] `[FEDERICO]` flips the batch's flags on Vercel production + redeploys.
- [ ] **Verify env var values have no trailing whitespace/newline** (`vercel env pull` + inspect raw bytes) — piping via `echo "1" | vercel env add` embeds a trailing `\n` that silently fails `isEnabled()`'s strict `=== "1"` check. Use `printf '1' | vercel env add` instead. (Real bug hit during Batch 1 — all 5 routes silently stayed on Node until caught by the post-flip anon canary and fixed.)
- [ ] Anon canary re-run through `app.formmaps.com` — proves live routing.
- [ ] Playwright spec passes as the fixture student, asserting real rendered content + `x-formmaps-service` header. **Trace the actual page/hook that calls each route before writing assertions** — don't guess page paths or response shapes; verify the route handler's actual `{success, data}` envelope and the real consuming component.
- [ ] 48h soak clean (CloudWatch 5xx + latency) — record the deploy timestamp and do a spot-check within the session, but the full 48h window will outlast any single session; a follow-up check is required before declaring this closed.
- [ ] (First batch only) rollback drill executed + timed.
- [ ] Legacy Node route(s) marked frozen in `completion-roadmap.md`.

## LIA session WRITES (FM-DOTNET-029) — cutover note

The 10 LIA session write/read routes (`/start`, `/answer`, `/timeout`, `/subtest/start`,
`/practice/answer`, `/violations`, `/complete`, `GET /session/:id`, `GET /access`,
`GET /practice-questions`) have one flag-flip consideration beyond the generic checklist above.

**Flip with zero in-progress LIA sessions.** Verify first:

```sql
SELECT count(*) FROM lia_assessment_sessions
WHERE is_active = true AND status IN ('practice', 'in_progress');
```

This is now a defense-in-depth practice rather than a hard requirement. It used to be strictly
mandatory in both directions: the .NET backend synthesized `lia_responses.question_id` as
`"{subtest}:{itemNumber}:{practice|assessment}"`, which (a) could never satisfy production's real
`lia_responses_question_id_fkey -> lia_questions(id)` constraint, and (b) was mutually unintelligible
with the ids legacy Node serves. Both backends now resolve the SAME real `lia_questions.id` through
the `(subtest, item_number, is_practice)` natural key (see `ILiaQuestionIdResolver`), so ids written
by either are readable and resolvable by the other, and a mid-session flip in either direction no
longer corrupts a session's response rows.

What still argues for a quiet window: a session's progress lives in `subtest_times` / `current_item`
/ `status`, and while both implementations agree on that shape, only one of them is exercised by any
given request. A flip mid-subtest hands a running clock to a code path that has not been observed
serving that exact session. Cheap to avoid; not worth the residual risk.

Related operational note: `lia_questions` is read once per process and cached in-process
(`LiaQuestionCatalogCache`). If that catalog is ever reseeded with fresh uuids, **restart the .NET
API** — a long-lived process would otherwise keep serving the previous seed's ids, and every
subsequent `/answer` would fail the foreign key.

## Wave 2 Batch 1 — worked example (2026-07-27)

Routes: `GET /api/v1/lia/session/:id/results`, `GET /api/v1/lia/user/:id/results`,
`GET /api/v1/mil/results/:id`, `GET /api/pcaexam/exams/:id/instructions`,
`GET /api/pcaexam/exam-config/:id`. Manifest ids: FM-DOTNET-015, FM-DOTNET-016,
FM-DOTNET-018. Fixture: `test.student@formmaps.dev` (schoolId `test-school-1`,
auto-passes `SubscriptionGuard` via school affiliation — no separate subscription
seed needed), password rotated, one completed `LiaAssessmentSession` seeded
(id `fixture0-0000-4000-8000-000000000001`).

Deploy (flags live): 2026-07-27 13:16:02 CDT (dpl_8apSqZib1BEkf9PWyCyQnmXgWRSK).
Spot-check at T+~25min: CloudWatch clean, real Playwright-driven requests to both
routes returned 200 in 12-180ms, no 5xx, no new errors.

**Status as of 2026-07-27: soak clock started, spot-check clean. Full 48h window
(closes 2026-07-29 13:16 CDT), the rollback drill, and marking the legacy Node
routes frozen are still open — pending a follow-up session at/after that time.**
