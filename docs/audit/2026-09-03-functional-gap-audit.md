# FormMaps — functional gap audit, 2026-09-03

What is missing for the application to be fully functional, verified against source on this date
(monorepo `origin/main` = `1cc35b5b` + PRs #165/#166 open; legacy `tafurfede/formmaps-platform`
`origin/main` = `808a94c`). Every row below was read from code by a verifier agent, not recalled
from an issue or a memory; file:line references are to the checkout at that moment.

Inputs: the 8/13 endgame plan (waves, D1–D15), the 8/14–8/19 execution record, the 59 open issues
on the monorepo and 3 on legacy, `domain-status.manifest.json` (last updated 08-10), the four
verifier reports, and today's student-surface audit (#165).

## 1. Where the product stands

- **Production** runs on the legacy Node API for everything user-facing that matters: auth,
  billing, messaging and every M4 surface. The .NET API (`formmaps-api-prod`, image
  `prod-20260810-f2ecccfe`) serves the read-heavy domains that have been flipped. Six flags are
  confirmed OFF in production: AUTH, BILLING, MESSAGES, MESSAGES_REALTIME, GRADEBOOK_READ,
  LIA_SESSION. The prod deploy workflow (#160) has **never been dispatched**; the `production`
  environment it needs still collides with Vercel's (`fix/prod-api-env-name-collision`).
- **Migration board:** 121 legacy routes in the M4 issues; **0 have a .NET twin, 0 have a
  rewrite, 13 are retired (410)** — 108 remain. Waves 0–2 of the endgame plan shipped
  (#143/#146/#147/#148/#149/#150, legacy #340–#342). **Wave 3 did not.**
- **CareerFit** — the TIMS-specified engine — exists only as FM-CF-001 (rule set + gate, #166).
  0 of 23 formulas are in code; the legacy `/careers/score` is the shipped recommendation.
- **Live product defects on both stacks:** personality completion never triggers insights
  (since 07-30, every student who finishes Personality last never gets their insights — #144);
  the student dashboard bugs fixed today in #165.

## 2. Gaps by class

### 2a. Breaks at flip — Wave 3, none landed (verified)

| item | state | where |
|---|---|---|
| A1 change-password 403s every non-admin who sends their own email | NOT DONE; an existing test pins the wrong behaviour | `AuthEndpoints.cs:287-302`; test `AuthEndpointsTests.cs:371-392` |
| A2 admin self-change needs no old password; no audit line | NOT DONE | `AuthEndpoints.cs:312-319`; no `IAuditEventWriter` in file |
| A3 signup accepts any string as email; change-email/forgot use an `@`-only stub | signup NOT DONE, others PARTIAL | `AuthAdminEndpoints.cs:46-48`; `AuthEndpoints.cs:682` |
| M1 no messaging timestamp carries a UTC marker | NOT DONE (seven other domains use `ToIsoZ`) | `MessagingTypes.cs:7,11`; `MessagesRepository.cs:151,157-158,320,419,492` |
| M2 broadcast = one serial transaction over ≤500 recipients | NOT DONE (`chunkSize=20` is cosmetic) | `MessagesRepository.cs:612-676` vs legacy `messages.ts:596-611` |
| B billing reader has no `isActive`/status predicate before `LIMIT 1`; no school-student short-circuit; payload renamed | PARTIAL | `LiveSubscriptionReader.cs:55-61`; `BillingEndpoints.cs:103-131` |
| RLS fixtures: billing has no policies by construction, messaging's are inert (superuser) | NOT DONE | `BillingDatabaseFixture.cs:9-18`; `MessagesAdversarialAccessTests.cs:32-36` |

### 2b. Open bug issues still in code (agent-doable)

| issue | verdict | remaining |
|---|---|---|
| #101 | STILL PRESENT | `FieldEncryptionKeyArn` param + secret + IAM in prod/staging templates and the deploy workflow |
| #102 | PARTIAL | two live inline IAM policies (S3 uploads, SES send) undeclared; no drift guard |
| #109 | STILL PRESENT | path-specific flag-gated rewrites for `/me/timeline`, `/me/timeline/stats`, `/api/v1/context/*` (or delete) |
| #114 / #120 | FIXED but UNREACHABLE | no rewrite for `/users/:userId/role` in `next.config.ts:984-1002`; hook has no UI caller |
| #122 | PARTIAL | `SchoolStudentsCoursePlanReader.cs:85-89,153-154,197` still stamps current grade |
| #130 | STILL PRESENT | legacy `schoolCoursesService.ts:52-60,296-341` DTO has no gradeLevel either way |
| #129 | STILL PRESENT | `vocationalTakeService.ts:93` raw `$transaction` on a policied table, no static check |
| #139 | STILL PRESENT | `SchoolAdminEmailWriter.cs:151` no `schoolId` predicate; fixture not RLS |
| #144 | PARTIAL | .NET seam done; **Node personality trigger + aiLimiter exemption missing**; backfill not done |
| #151 | STILL PRESENT | `VideoSessionsRepository.cs:105` filters the user not the assignment; Video fixture not RLS |
| #135 | PARTIAL | `pilot.sql` not vendored; `ParentChildReads` schema lacks `schoolId` |
| #128 | STILL PRESENT | **8 of 143** mutating .NET handlers write an audit event (~6%); no .NET ratchet |
| #127 | PARTIAL | checkout-session is single-mode (`planId` only); belongs with #50 |
| #79 | FIXED (code) | `schoolService.ts:361-362` still coerces unknown roles; prod census owed |
| #108 | FIXED (code) | reader comment cites a migration directory that does not exist; DB index unverified |
| #131 | STILL PRESENT | needs a quiet-box baseline before any fix — not code |
| #77 | PARTIAL | 3 of 8 tables still unpolicied; DDL is a human apply |
| JWT permissions (from #165) | .NET fixed | Node `authenticate.ts` has no fail-closed shape normalisation |

### 2c. Not built yet (planned, specified)

- **CareerFit FM-CF-002…016.** Seams located: DISC comes from `pca_results.discResult` and the
  server's canonical graph (2, `PcaNormalization.cs:26,34`) differs from what the legacy scorer
  receives (graph 1, `useTimsQueries.ts:107-110`); competencies have no name→id table anywhere
  but the rule set; LIA percentiles are clamped to 0/100 (`LiaPercentileMapper.cs:36-44`) where
  the engine requires 1–99; personality persists one intensity per dimension where the engine
  wants eight pole values. No EF Core — schema is hand SQL under `infra/aws/sql`, grants in
  `dotnet-service-role.sql`, RLS fixtures via `TestSupport/Rls`.
- **M4 ports (108 routes).** No-decision lanes per the plan: #65 telemetry (1 — and the
  "nothing calls it" hypothesis is false: `telemetryService.ts:59` posts to it), #62 teacher
  onboarding (4), #63 moderation (4; messaging already honours blocks, grants already staged),
  #59 recommendation letters (10; D9 says port unchanged — the student download at
  `recommendations.ts:217` is the confidentiality question), #55 graduation/transcripts (25; the
  two AI `generate` routes stay on Node per D1). Decision-gated: #54, #56 (AI), #57 (D6/D7),
  #58 (D5), #60 (D12), #61 (D4), #72 (folds into #50).
- **#50 booking payments, #51 Stripe Connect payouts, #52 deploy** — Wave 5; #51 is greenfield
  and gated on D13.
- **Legacy product asks:** #326 individual purchase flows, #331 DTC pricing, #329 golden suite.

### 2d. Human gates — nothing an agent can close

Deploy (the prod .NET image is 08-10; nothing since is live), the `production` environments,
every flag flip (Stages 1–4), #44's billing soak, DB applies (#33/#34 role password, the #77
policies, `REVOKE UPDATE, DELETE ON audit_logs FROM formmaps_app`), the prod censuses
(#79 invites, #151 `roleName`, #38 flag values), #131's quiet-box baseline, product decisions
D1–D15, the TIMS norming-population answer, and the #43/#45/#46 flips.

## 3. What is being built from this audit

Four workflows, in `docs/audit/workflows/` alongside this file once run:

- **A — correctness wave** (parallel with B): every row of §2a and the agent-doable rows of §2b,
  one verify-then-fix agent per item in a worktree on `wave3/<slug>`, two-lens adversarial
  review, a fix pass, suites re-run. Ends at branches; push and PR are a separate decision.
- **B — CareerFit P1–P3** (parallel with A): FM-CF-004 formulas with bit-parity against the
  vendored reference on `tools/careerfit/export_parity_fixture.py`'s cases, FM-CF-002 schema
  + grants + RLS fixture, FM-CF-003 rules provider with the fail-closed resolver (FM-CF-009),
  FM-CF-005 adapters with a red test per seam defect, then the evaluator wiring.
- **C — CareerFit P4–P6** (after B): 007/008 variable-level 360, 010 orchestrator + audit,
  011 explainability, 012 endpoints behind `FORMMAPS_ROUTE_CAREERFIT_TO_DOTNET`, 013 shadow.
- **D — M4 ports, no-decision lanes** (after A): #65, #62, #63, #59, #55 (non-AI), each behind a
  new OFF flag with the parity-contract, grant and RLS-fixture conventions the repo already has.

Standing rules: agents commit to wave branches and never push; every claim in a brief is
re-verified against source before acting; a claimed defect found "not real" is a first-class
outcome; push/deploy/flip are three separate human decisions.
