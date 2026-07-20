# FM-DOTNET capstone — token-gated external write rail (fork-ready spec)

Distilled from the live-TS scoping (2026-07-20). Dispatch as a FOCUSED solo fork (worktree),
heavy gating. Live TS = `~/formmaps-platform/api`. HIGHEST-risk assessments slice.

## THE NEW RAIL (build this first)
A NEW explicit **non-tenant, fail-closed** DB rail (like the TIMS external-vendor inbound-write).
No auth principal, no JWT, no tenant GUC identity. The token→group resolution + per-write guards
ARE the authorization. Default = DENY (mirror `resolveGucPlan`: absent context ⇒ deny, never open).
- Legacy uses `systemContext` → `resolveGucPlan` returns `{mode:"bypass"}` → SQL `set_config('app.bypass_rls','on',true)`.
- READS on this surface use the RLS-extended client (auto bypass GUC under system).
- `$transaction` WRITES (vocational, violations) deliberately use `basePrisma` (un-extended, NO GUC) —
  gated solely by the token-validated `group.id`. submitFeedback's create+update use the EXTENDED client (bypass GUC).
- .NET: a request scope explicitly marked non-tenant/bypass-RLS; writes target a specific PK gated by the resolved group.

## MOUNTS (NO authenticate; order matters)
`/evaluation/vocational` (vocationalTakeRoutes) mounted BEFORE `/evaluation` (evaluationRoutes).
Only external routes are in scope (systemContext); the authed CRUD on evaluation.ts is OUT of scope.
Token = `crypto.randomBytes(32).base64url`, `invitationToken` NOT unique (@@index only) → **findFirst**,
`WHERE invitation_token=@t` parameterized, **case-sensitive**, never findUnique/throw-on-dup, never lowercase.

## ENDPOINTS (6 external)
B1 **GET /evaluation/validate-token?token=** (read) — no token→400; else 200 `{valid, reason?}` (checks token+expiry+used; a resolvable-but-invalid token → 200 {valid:false,reason}, NEVER 4xx).
B2 **POST /evaluation/submit-feedback** (sensitiveLimiter) — the legacy 360 WRITE. zod `feedbackSchema` {evaluationGroupId≥1, token≥1, evaluatorEmail(email), answers[{questionNumber,questionText,rating 1..5,comment?,questionId?≤100,category?≤100}].min(1)}. Guard: findFirst{id=evaluationGroupId, invitationToken=token, isActive} → !group→400 "Invalid token or group"; instrument==="vocational"→400; `group.evaluatorEmail !== normalizeEmail(incoming)`→400 "Email mismatch"; `isEvaluationCompleted`→409 "already_submitted". Then validate each category against question360 catalog. Then **create** ONE EvaluationFeedback (feedbackItems jsonb, averageRating **Decimal** = sum(ratings)/count, totalQuestions/answeredQuestions) — **P2002 on @@unique([evaluationGroupId,evaluatorEmail]) → 409 "already_submitted"** (race guard) — then a SEPARATE `update` flipping group.isEvaluationCompleted+date (NOT one tx). Route: already_submitted→409 "This evaluation has already been submitted"; other error→400 raw; else 200.
B3 **GET /evaluation/360evolutor/:token** (read) — get360EvaluatorForm; vocational group→null; null→404. Returns evaluatedUserName/email to the evaluator (intentional, do NOT widen).
A1 **POST /evaluation/vocational/:token/violations** — boundViolations(cap 200/req; type≤50/timestamp≤40/details≤300); findFirst{token, isActive, tokenExpiryDate>now} → null→404 "Not found"; else merge (cap 500, flagForReview=count>=3) → 200 {saved, violation_count}. basePrisma.
A2 **GET /evaluation/vocational/:token** (read) — getVocationalForm; invalid-group→400, expired→**410**, not-found→404.
A3 **POST /evaluation/vocational/submit** (sensitiveLimiter) — zod submitSchema {token(1..200), answers[1..80] discriminatedUnion(type): likert{ratingValue 1..5}/ranking{rankingOrder[{value≤80,rank≥1}](1..30)}/multi_select{selectedValues str≤80 [](1..20)}/single_select{textValue≤120}/open{textValue≤4000}}. zod fail→400 "Invalid submission". Guard: findFirst{token,isActive} → !group||instrument!=="vocational"→**404**; `tokenExpiryDate<now`→**404** (⚠️ submit=404, GET=410 — verb-dependent, pin both); isEvaluationCompleted→409; normalizeGroupType(groupType)==="other"→400 "invalid-group". Per-answer semantic validation vs questionnaire (type match; ranking values⊆options+distinct; multi/single∈options)→bad→400; **require-all** (distinct questionNumber count !== questions.length → "incomplete"→400). Then **ONE basePrisma.$transaction**: N vocationalResponse.upsert (@@unique([evaluationGroupId,questionNumber]); non-applicable jsonb cols set **undefined**=skip, NOT null) + group completion flip (isTokenUsed,tokenUsedDate,isEvaluationCompleted,evaluationCompletedDate). Post-tx best-effort recompute (try/catch non-fatal — polyglot/optional). 200 {ok,count}.

## MODELS
EvaluationGroup(evaluation_groups): invitationToken(non-unique @@index), evaluatorEmail(stored normalized), tokenExpiryDate(non-null DateTime, UTC), isTokenUsed/tokenUsedDate, isEvaluationCompleted/evaluationCompletedDate, isActive, instrument(nullable; "vocational"|null routes path), violations jsonb, violationCount, flagForReview. @@unique([evaluatedUserId,evaluatorEmail,groupType]).
EvaluationFeedback(evaluation_feedbacks): feedbackItems jsonb, averageRating **Decimal?**, isCompleted, totalQuestions/answeredQuestions, @@unique([evaluationGroupId,evaluatorEmail]) (backs P2002→409).
VocationalResponse(vocational_responses): questionNumber, type, ratingValue?, rankingOrder jsonb?, selectedValues jsonb?, textValue?, @@unique([evaluationGroupId,questionNumber]) (upsert key).

## LANDMINES (pin red-if-regressed)
1. **normalizeEmail** (emailNormalize.ts): trim→strip leading `mailto:`→strip `<`/`>`→trim→**lowercase**. Apply to incoming email before compare (submit-feedback ONLY; vocational+violations have NO email check — don't add one).
2. **Bidirectional instrument gate**: 360 rejects vocational groups; vocational requires instrument==="vocational". Port exactly.
3. **Expiry asymmetries**: (a) ⚠️ legacy submitFeedback does NOT check tokenExpiryDate/isTokenUsed (validate-token does) → **DECISION for Federico: replicate the gap OR CLOSE it (add expiry check). Lean = CLOSE (security tightening, compliance) + flag in-code + corpus.** (b) verb-dependent expired status: vocational GET→410, submit→404. Comparison `tokenExpiryDate < now` (UTC, strict <, ==still valid).
4. **P2002 mapping is 360-only** (create+unique-catch); vocational is upsert (no P2002; double-submit stopped by isEvaluationCompleted pre-check→409). Reproduce BOTH distinctly; don't unify. Preserve tx boundary: vocational = one $transaction (atomic); 360 = create-then-flip (unique-race guard).
5. **Decimal averageRating** (not float); jsonb stable key order; vocational upsert-update sets non-applicable cols **undefined(skip) vs null(write)** — replicate.
6. **Exact fail-closed codes** (pin all): vocational GET 400/410/404; vocational submit 400(zod/invalid-group/bad-answer/incomplete)/409/404(not-found+expired); 360 submit 400(zod/email/instrument/"Invalid token or group")/409/500; violations 404/200; validate-token 400-no-token / 200{valid:false}.
7. **No PII/token leak to untrusted caller**: never echo invitationToken; GET forms return only evaluatedUserName/email (intentional, don't widen); generic errors, never err.message.
8. Sanitizer SKIP_SANITIZE includes token/invitationToken (don't corrupt the credential).

## Build order: (1) the non-tenant fail-closed rail + token-resolve helper; (2) vocational GET+submit+violations (basePrisma $transaction); (3) 360 validate-token+submit-feedback+360evolutor (extended client, Decimal, P2002→409). New Testcontainers harness (evaluation_groups + evaluation_feedbacks + vocational_responses; hand-write DDL, no prod migration; non-UTC tz pin for expiry). Web flags + rewrites (paths under /evaluation/* — NO :path* catch-all collision; these are NOT /api/*). Corpus: the token-gated fail-closed set + P2002→409 + require-all→400 + expired 410/404 + instrument gate.
