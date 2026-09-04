# CareerFit — rule set, derivation and gate

This directory holds the thing the engine loads — the **versioned rule set** — and the tooling
that derives, validates and gates it. The engine itself (P1–P5: schema, config cache, formulas,
adapters, resolver, orchestrator, 360 aggregation, audit ledger and explainability payload) lives
under `services/api` and is described in
[Engine (P1–P5)](#engine-p1p5) below. Ledger: [`careerfit.manifest.json`](careerfit.manifest.json)
(slices FM-CF-001…016). Build plan and analysis: the two published artifacts linked from the
FormMaps memory chain.

```
docs/careerfit/
  sources/      TIMS deliverables, vendored byte-for-byte (workbook, model config, reference engine)
  rules/        careerfit-rules.v<version>.json — DERIVED, never hand-edited
  careerfit.manifest.json
tools/careerfit/
  xlsx_reader.py              namespace-aware reader for the workbook (x: prefixes, sharedStrings, absolute rels)
  build_rules.py              sources + reviewed decisions -> rules JSON; --check proves reproducibility
  select_qualifier_mapping.py the experiment behind decision D1 (DISC phrase -> direction/weight)
  recut_thresholds.py         the measurement behind decision D5 (per-instrument convergence thresholds)
  mc_lib.py                   rules JSON -> matrices, archetypal profile generator, reference-fidelity check
  mc_gate.py                  the CI gate (+ --self-test)
```

## What the rule set is

`rules/careerfit-rules.v1.0.0-draft.1.json` — status `DRAFT_PENDING_TIMS_RATIFICATION`. Every
number the reference engine's `evaluate_owner` needs per family, fully resolved:

| block | source | what the builder had to decide |
|---|---|---|
| 12 DISC archetypes | sheet `02_PCA_LOGICA` | phrases → `(direction, weight)` — **D1** |
| PCA routes per family | sheet `09` prose → archetype ids | none (10 of 12 archetypes referenced; `CALL_CENTER`, `VENDEDOR_TECNICO` unused by families) |
| competency roles | sheet `11` (numeric) | none; sheet `09` prose cross-checked |
| MIL roles | sheet `04` §D markers | `VAR` / `I_MIN` / `X/Y` / `INHERIT` → one role — **D2** |
| personality routes | sheet `09` prose | a reading, not a derivation — **D3** |
| 360 relevance | sheet `10` (numeric) | none; one prose/numeric disagreement recorded (family 14) |
| thresholds | sheet `14` + measurement | per-instrument recut — **D5** |

Each family's `mil_rules[subtest]` carries `source_marker`, `resolution` and, where relevant,
`subfamily_candidate` / `subfamily_roles`, so TIMS can overrule a cell without re-deriving the
rest. The `decisions[]` array states each decision, its consequence and its source; the
`source_discrepancies[]` array lists every place the workbook disagrees with itself.

The JSON is consumable **as-is** by `sources/formmaps_engine_reference.py`: `mc_lib.resolved_bundle`
maps a family to `evaluate_owner`'s `resolved_rules`, and the gate holds the vectorised scorer to
that engine at 1e-9 (measured 2.8e-14).

## The decisions, briefly

**D1 — one injective phrase mapping.** The archetype sheet writes eight distinct phrases. Under
the "every Neutral phrase is w2" reading of the earlier draft, `DIRECTOR ≡ COMERCIAL_TECNICO`
and `ASESOR ≡ SERVICIO_CLIENTE` encode identically and the second of each pair can never be a
winning route. `select_qualifier_mapping.py` samples DISC profiles from the *phrase semantics*
(never from a candidate encoding) and grades every candidate on 12-way archetype recovery: the
candidates differ by under a point (noise); the tie structure does not. The selected mapping is
the only one injective on all eight phrases — `fuerte 3 / bare 2 / medio 1`, `cercano a 50 3 /
Neutral-medio 2 / Neutral-activo 1` — and is best at coherence 1.0.

**D2 — MIL markers.** Literal `C/I/CO` as written. `X/Y` → `X` at family level, `Y` recorded as
the subfamily candidate. `VAR` → the **median** role across the family's subfamilies when a
subfamily sheet exists (only Ingeniería, sheet `12`; absent = NOT_USED; ties round up), else
IMPORTANT. `I_MIN` → the same, floored at IMPORTANT. `INHERIT` → family 15 is not scorable.
Ingeniería resolves `DC=C RZ=C VN=C MT=I OR=CO` and recovers at **97.1%** top-1 (0.0% before,
because every marker was unresolved and the caller coerced the null fit to 0).

**D5 — per-instrument thresholds.** Measured on this rule set (`recut_thresholds.py`), the
spec's single `strong ≥ 70 / partial ≥ 55` pair reads STRONG for 100% of matched *and 95% of
unmatched* PCA pairs (competency attainment saturates near 98/93), for 12%/9% of MIL pairs
(capacity is not family-specific: 63.1 vs 62.0), and 35%/2% of 360 pairs. The rule set keeps
the spec pair for reference-engine parity and adds `per_instrument` values: PCA and 360 and
Personality from a Youden cut / unmatched median (**SIMULATED** — calibrated to the generator,
to be re-cut on the shadow cohort in FM-CF-014), MIL from the sheet's own official bands
(EXCEEDS = strong, ADEQUATE = partial). `absolute_reference` records the simulated
CareerFitAbsolute distribution (mean 67.15, sd 4.49, p1 56.9 → p99 76.9); the product must
never present that number as a percentage.

## The gate

```
python3 tools/careerfit/build_rules.py --check     # committed JSON == fresh build
python3 tools/careerfit/mc_gate.py                 # RESOLVED, FIDELITY, RECOVERY, DISTRIBUTION
python3 tools/careerfit/mc_gate.py --self-test     # five poisoned rule sets rejected, clean accepted
```

Acceptance (in the manifest): top-1 ≥ 93%, top-3 ≥ 99%, no family below 60% top-3, absolute
mean/sd within 1.5 / 1.0 of `absolute_reference`, fidelity ≤ 1e-9. Current: **94.0% / 99.9%**,
worst family Tecnología 77.1% / 99.7%, 70,000 profiles in 0.3 s. The workflow
`formmaps-careerfit-gate.yml` runs all three on every PR.

The generator is deliberately circular: it builds a student to *be* the family's archetype as
the rules describe it. That answers "does this rule set still recover what it encodes?" — a
regression question — and nothing about whether the matrix is right about real careers. The
external references are FM-CF-013 (shadow against legacy) and FM-CF-016 (concurrent-validity
panel).

## Regenerating

Change a decision in `build_rules.py` (or a source file), then:

```
python3 tools/careerfit/build_rules.py && python3 tools/careerfit/mc_gate.py
```

Bump `RULES_VERSION` for anything TIMS has ratified or any change to a resolved number; the
file name carries the version. Never edit the JSON by hand — `--check` will fail.

## Open questions for TIMS

Listed in the rule set's `open_questions`. The first — **what population the MIL percentiles
and DISC scales are normed on** — is the highest-consequence unknown in the whole plan: if
these are adult HR norms and students sit ~20 points lower, more than half a cohort lands below
ADEQUATE and is told their cognitive profile is *Insuficiente / Bajo*.

## Engine (P1–P5)

The rule set above is consumed, unchanged, by the .NET bounded context under `services/api`.

**Status.** Manifest slices FM-CF-002/003/004/005/009 (P1–P3), FM-CF-007/008 (P4),
FM-CF-010/011 (P5) and FM-CF-012 (P6) are **completed**, integrated on branch `careerfit/p4-p6`
(FM-CF-012 on `careerfit/endpoints`). FM-CF-006 (seed the 40 360 items) is **blocked on TIMS** and
is the reason the 360 engine below is built but idle. The HTTP surface now exists —
`/api/v1/careerfit/*`, seven routes — and is dark from the frontend: the rewrite that would send a
browser to it is guarded by `FORMMAPS_ROUTE_CAREERFIT_TO_DOTNET`, which is set nowhere in this repo.

| slice | what shipped |
|---|---|
| FM-CF-007/008 | `VocationalV360Adapter` / `V360Aggregation` — real variable-level 360 aggregation (F01→F05) and per-family relevance weighting (F06). Registered in DI; idle until FM-CF-006 seeds the items, with `NoDataV360Adapter` as the named fallback |
| FM-CF-010 | `CareerFitAuditLedger` — the per-formula-step ledger, F06–F23 per family in `careerfit_family_results."audit" -> formula_steps` and F01–F05 once per student in `careerfit_runs."inputQuality" -> v360_formula_steps` |
| FM-CF-011 | `FormMaps.Api.Contracts.CareerFit.CareerFitExplanation` — the explainability payload: structured evidence, no family-level fit scalar |
| FM-CF-012 | `CareerFitEndpoints` — the seven routes at `/api/v1/careerfit`, plus `ICareerFitRunReader` / `CareerFitRunReader` (a persisted run read back on the caller's session, so a read never scores) and the rewrite block in `apps/web/next.config.ts`, per-path and default OFF |

### The seven endpoints (FM-CF-012)

```
POST /api/v1/careerfit/evaluate/{userId}                score now, persist the run, return the ranking
GET  /api/v1/careerfit/results/{userId}                 the newest run's ranking
GET  /api/v1/careerfit/results/{userId}/explanation     the newest run's FM-CF-011 payload
GET  /api/v1/careerfit/results/{userId}/runs            the run history, newest first
GET  /api/v1/careerfit/runs/{runId}                     one persisted run's ranking
GET  /api/v1/careerfit/runs/{runId}/explanation         one persisted run's FM-CF-011 payload
GET  /api/v1/careerfit/families                         the active rule set's families
```

They are **derived from the legacy surface, not invented**. Of the eleven method+path pairs apps/web
calls under `/api/v1/careers/*` (`services/careerService.ts`, `services/timsService.ts`), exactly one
is a CareerFit question — `POST /careers/score`, the manifest's `legacyBaseline`. The other ten are
the 370-role catalogue, its admin CRUD and its favourites; V1 CareerFit scores fourteen *families*
and has no catalogue, so those ten stay on Node and **no `/api/v1/careers` path is rewritten**.
`/careers/score` both scores and returns, and every caller uses it as a read on mount — but a run is
immutable, so scoring is the one POST and reading is separate and never writes. The explanatory half
of the legacy response (`profileSummary` / `breakdown`) is FM-CF-011's payload; `/careers/clusters`
becomes `/careerfit/families`; the history exists because immutability makes "which run produced the
advice this student was shown" a real question.

Guards are the surrounding endpoint files' convention: identity → subscription → `CanAccessUser`,
with denial as the uniform IDOR-safe 404 and the caller's RLS session underneath every read and
write. A run fetched **by id** re-runs the per-user gate on the *run's owner*: `careerfit_runs`' RLS
admits every caller in the row's tenant, so without that second gate a same-school stranger reads the
run by id — the hole `CareerFitRlsTests.Same_school_caller_is_admitted_by_the_policy_so_the_endpoint_gate_is_not_optional`
was written to name. **No fit scalar reaches a browser** on any of the seven: the ranking view carries
the ordinal rank and the categorical gate / convergence / confidence labels, and nothing else.

The flag is **new and off**. `FORMMAPS_ROUTE_CAREERFIT_TO_DOTNET` appears in no `.env`, no workflow
and no other file in this repo, so with nothing configured the rewrite block contributes zero entries
and there is no .NET CareerFit traffic at all. Its entries are **per path with `source === destination`**,
never a `/api/v1/careerfit/:path*` prefix: a prefix silently adopts every route a later commit adds
under it, live on the next deploy with no flip and no canary (#109/#114/#120).

| namespace / path | what |
|---|---|
| `FormMaps.Application.CareerFit` | `CareerFitFormulas` (F01–F23, one static function per reference function), the input/result records, `CareerFitRules` + `CareerFitRulesJson` (the JSON above, embedded from `CareerFit/Data`), `ICareerFitRulesProvider`, `CareerFitEvaluator` / `ICareerFitEvaluator` (the orchestrator), `CareerFitAuditLedger` (the per-formula-step audit trail), `CareerFitRun`, `CareerFitRunJson` (the three jsonb shapes) |
| `FormMaps.Application.CareerFit.Resolver` | `CareerFitRulesResolver` — `mc_gate.py check_resolved()` ported one for one; `CareerFitRulesInvalidException` lists every problem with family and field |
| `FormMaps.Application.CareerFit.Adapters` | `DiscAdapter`, `CompetencyAdapter`, `MilAdapter`, `PersonalityAdapter`, `IV360Adapter` (`V360Aggregation` / `VocationalV360Adapter`, with `NoDataV360Adapter` as the named fallback), composed by `CareerFitInputAdapters`; `InputQuality` is the audit record |
| `FormMaps.Infrastructure.CareerFit` | `CareerFitRulesProvider` (the ConfigCache: `CareerFit:RulesVersion`, loaded + resolved once per process, boot-gated in `AddFormMapsInfrastructure`), `CareerFitInputReader` (one read-only RLS session; the 360 rater groups come from `Assessments/VocationalResponseLoader`, shared with the vocational recompute), `CareerFitRunWriter` (run + family rows in one transaction) |
| `FormMaps.Api.Contracts.CareerFit` | `CareerFitExplanation` and its family / instrument shapes — the FM-CF-011 explainability payload, a pure projection over a persisted run, carrying structured evidence and no family-level fit scalar. No route, no flag (FM-CF-012) |
| `infra/aws/sql/careerfit-schema.sql` | `careerfit_runs` / `careerfit_family_results`, tenant-scoped, RLS ENABLE+FORCE; grants in `dotnet-service-role.sql` §4.7 (SELECT + INSERT only — a run is immutable, a re-evaluation is a new run). Both ledger arms ride in existing jsonb columns (`audit`, `inputQuality`), so they add no table, no policy and no grant |

The pipeline is `CareerFitEvaluator.EvaluateAsync(context, userId, graph?)`: read the student's
`pca_results` / newest completed `lia_assessment_sessions` / newest completed
`personality_assessment_sessions` rows under the caller's RLS session → adapt → `EvaluateOwner` per
scorable family (14) → `AssignRelativeFit` → persist → return the run with families in rank order.
`EvaluateCore(assessment, ruleSet)` is the pure centre (validate once, score, rank) and is held to
`formmaps_engine_reference.py` at 1e-9 through the same parity fixture FM-CF-004 uses — measured
bit-exact. A missing instrument is a typed `CareerFitInputException` naming it (PCA / MIL /
PERSONALITY) and nothing is written; the caller reports "not ready".

### The audit ledger (§21)

Every family row's `audit` jsonb carries two layers, both written by the same transaction as the
scores. `audit_inputs` / `convergence_detail` / `critical_gaps` / `mil_relative_strengths` are
`evaluate_owner`'s own blocks: what each instrument produced. `formula_steps` is FM-CF-010's **step
ledger**: one record per **application** of an F01–F23 formula that the evaluation actually
executed, in execution order, each naming the step (id, workbook name, block), what it consumed,
what it produced, and the rule or threshold that governed it — the archetype factor's direction and
weight, the competency's minimum level, the MIL role weight, the convergence cut and whether it came
from the spec pair or the D5 `per_instrument` recut (and that recut's `SIMULATED` provenance).

The count is derivable, not decorative: `F07/F08/F09` per contributing (route, factor), `F10` per
route, `F12/F13` per competency rule with a scored role, `F18` per personality route, `F17` per MIL
subtest, `F22` per convergence instrument, `F23` only where `F22` did not already answer STRONG
(`evidence_support` returns on the strong test), and one each of `F11 F14 F15 F16 F19 F06 F20 F21`.
That is 39–56 records per family and **709 for one run of the sample student** — the number
`CareerFitAuditLedgerTests` and the database test both re-derive from the rule set and assert against
`jsonb_array_length(audit -> 'formula_steps')`.

`F01–F05` are **not** in that count, and are not on the family row at all. They are the 360
*aggregation* pipeline, and it runs **once per student**: the aggregate map is global — built from
the student's responses before any family is scored — and `F06` is the first 360 formula a family
subscripts. So they are recorded on the run instead, in `careerfit_runs."inputQuality" ->
v360_formula_steps`, beside the per-variable trail (`v360_variables`, `v360_instrument`) they
explain. Each application is then recorded exactly once rather than fourteen identical times, the
family ledger's count stays derivable from the rule set alone, and the run ledger's count is
derivable from the trail beside it: Σ over scored variables of *(its answering rater sources + 4)*,
plus the instrument arm's 4. Under `NoDataV360Adapter` — every student until FM-CF-006 — nothing
executes and both arrays are empty, never a row of zeros.

Two granularity notes on that arm. `F01` (`normalize_likert`) applies per *item answer*, but the raw
answers live in `vocational_responses` under their own RLS and what actually reaches
`integrate_sources` is one score per (variable, rater source); it is recorded at that granularity,
with the aggregation named on the record's own rule block, rather than copying up to 40 items × 4
raters of Likert values into every run's audit. And `F03`/`F05` are recorded **with a null output**
when a single rater leaves consensus undefined: both formulas ran — `integrate_sources` evaluated
its `len(valid) >= 2` test and `confidence360` evaluated its guard and returned `NOT_DETERMINABLE` —
and dropping them would hide the most consequential fact about a V1 run, that its 360 confidence is
undefined by construction rather than by accident.

Two things carry no record on purpose: the gates (`COMP_GATE` / `MIL_GATE` / `FINAL_GATE` are sheet
14 and step 17, not F-numbered formulas, and are already typed columns) and the `mil_band` lookup
(carried inside `F16`'s rule block). Keeping the ledger to F01–F23 is what makes its row count
re-derivable from the rule set.

**Where the granularity comes from, stated plainly.** §21 of the TIMS implementation specification
is *not* among the vendored sources — `docs/careerfit/sources` holds the workbook, the model config
and the reference engine, and the manifest cites §21/§25/§26/§29 of a document FormMaps was never
given. So "a record per formula step" is read off the two normative artefacts we do have: sheet
`13_FORMULAS_ENGINE`, where each formula is subscripted by what it is applied to (`match_f`,
`att_j`, `rel_k`, `RouteFit_r`), and `evaluate_owner`'s order of operations. One record per
*application* follows from the subscripts; the execution order follows from the reference. If TIMS
delivers §21 and it says otherwise, the shape to change is `CareerFitAuditLedger` alone.

**Why the `audit` jsonb and not a `careerfit_audit_steps` table.** Every read of the ledger is "the
whole derivation for this (run, family)" — the row already being fetched; nothing filters, joins,
orders or aggregates on a step, so a table buys no query. The row count argues the same way: ~700
records per run, per student, forever (runs are immutable, a re-evaluation is a new run) would be
~700 tuples plus index entries per evaluation, against one TOASTed value per family row (~19 KB of
JSON text before compression). Staying in the existing column also means the ledger *cannot* be read
apart from the scores it derives, and it adds no policy, no `GRANT`, no fixture-schema change and no
apply-order dependency. Revisit only if a query appears that must scan across runs by step — a
reporting question (FM-CF-013/014), not this table's.

**It cannot move a number.** `CareerFitFormulas.EvaluateOwner` — the function the parity fixture
holds to the reference engine — is untouched and produces no ledger; `EvaluateCore` attaches one
afterwards by *reading* what `EvaluateOwner` already returned (route scores and components, MIL
components, personality routes, 360 evidence) plus re-invoking the same pure statics for the two leaf
values the engine does not retain (`CompetencyAttainment`, `EvidenceSupport`). Attaching it after
`AssignRelativeFit` is also what lets `F21` be a step at all. Measured after the change: the parity
fixture regenerates byte-identical and `EvaluateCore` reproduces the reference at **0.0** deviation
over 10,920 field comparisons.

### Running the tests

```
dotnet test services/api/tests/FormMaps.UnitTests        --filter "FullyQualifiedName~CareerFit"   # formulas + 360 parity, resolver, provider, adapters, evaluator, run JSON, audit ledger, explainability payload
dotnet test services/api/tests/FormMaps.IntegrationTests --filter "FullyQualifiedName~CareerFit"   # Testcontainers: RLS on the real DDL, the evaluator end to end as the restricted login, DI
python3 tools/careerfit/build_rules.py --check && python3 tools/careerfit/mc_gate.py               # the rule set is still reproducible and still passes the gate

# neither ledger moved a number — both fixtures must regenerate byte-identical
python3 tools/careerfit/export_parity_fixture.py --n 60 --seed 20260903 --out /tmp/p.json && cmp /tmp/p.json services/api/tests/FormMaps.UnitTests/CareerFit/Data/parity-fixture.json
python3 tools/careerfit/export_v360_fixture.py                          --out /tmp/v.json && cmp /tmp/v.json services/api/tests/FormMaps.UnitTests/CareerFit/Data/v360-parity-fixture.json
```

The integration suite needs Docker. It seeds a student exactly as the platform's writers persist
rows (TIMS `PcaD1..PcaC3` + `PcaCmps`, `LiaCompletionScorer` percentiles, `PersonalityScoring`
dimension scores), evaluates as the student, a same-school counselor and a super admin, and proves
the negative controls on the same seed: an other-school counselor can neither read the run nor
evaluate the student, and a missing LIA session writes nothing.

### The three seam decisions (FM-CF-005)

These are the places the platform's data and the engine's inputs disagree. Each is a deliberate
choice, recorded on every run's `inputQuality`, and open to revision by TIMS:

1. **Which DISC graph.** TIMS returns three graphs; the platform's canonical `DiscMatrix.Primary`
   is graph 2 (Under Pressure) while legacy `/careers/score` — the FM-CF-013 shadow target — is fed
   graph 1 (Work Adaptation). The engine takes an explicit `DiscGraphChoice`, **defaulting to
   graph 1** so the shadow compares like with like; the choice is stored on the run (`discGraph`).
   TIMS open question 4 decides the final value.
2. **Missing competencies → level 0.** The PCA result names competencies as TIMS spells them
   (upper-case, accented); the only name→id table is the rule set's 24 names. Names are joined
   normalised (NFD, marks stripped, case-folded, punctuation collapsed); a name that still matches
   nothing is recorded, an id no entry reached is **defaulted to level 0 with a warning** rather
   than rejecting the student (the spec's 422 on fewer than 24 would reject real students — TIMS
   open question 3). The defaulted ids are on the record.
3. **LIA tails clamp.** `LiaPercentileMapper` emits 0 below its norm table and 100 above it; the
   engine's domain is 1–99. **0 → 1 and 100 → 99, each with a warning.** A missing subtest is not
   repaired — it fails closed, because a MIL mean over four subtests would silently misweight.

### 360 (FM-CF-007/008): the engine is built, the items are not

The aggregation is real and wired. `VocationalV360Adapter` / `V360Aggregation` reads the student's
completed vocational rater groups — through `VocationalResponseLoader`, the chassis's own query,
lifted out of `VocationalWriter` so there is exactly one definition of "the student's 360
responses" — and turns them into one `V360Aggregate` per `rules.v360_variables` code:

```
item responses -> per source, per variable, the mean of F01-normalized answers
               -> F02/F03/F04 IntegrateSources over weights.v360_sources (SELF .35 / PARENT .25 / TEACHER .25 / PEER .15)
               -> F05 Confidence360 over thresholds.v360_confidence
               -> V360Aggregate(score, consensus, confidence_index), in the rule set's declared variable order
```

`CalculateCareerFit360` (F06) then weights each variable by `base_weight × relevance` **read off the
family's own rule**, so relevance really is per family. Held to the reference engine at 1e-9 by
`V360ParityTests` against `tools/careerfit/export_v360_fixture.py`'s fixture (F01, F04/F05 over nine
source cases, F06 over six aggregate sets × 14 families).

Three things are deliberately NOT decided here:

* **Consensus with one rater.** V1 is self-only 360 (decision 1). Consensus is `100 − (max − min)`
  *across raters*, so with one rater the reference returns `None` and F05 refuses a label. Every
  aggregate therefore carries a real score, a **null** consensus and a null confidence index, the run's
  global confidence is `NOT_DETERMINABLE`, and that downgrades a STRONG 360 to PARTIAL — **SOLID stays
  the ceiling**. Calling one rater unanimous would make the weakest evidence look like the strongest.
* **IND (P36).** Excluded in V1 by name (`V360Aggregation.ExcludedInV1`), recorded on every run
  (`V360_IND_EXCLUDED`). It is a 20-industry *selection vector* at the catalogue's largest base weight
  (0.1, in every family's rules); a per-family scalar needs an industry → family projection TIMS has
  not delivered. The rule set is untouched — when the projection arrives, deleting the exclusion is the
  whole change.
* **P35 / RANK.** Open question 5 ("does the student's own ranking enter at 0.10?") is unanswered and
  this code does not answer it: the ranking is recognised, recorded as not scored, and its weight is
  entirely the rule set's — `base_weight 0` and no family rule in 1.0.0-draft.1, so it contributes
  nothing today. A per-family scalar would need an area → family projection, and the aggregate map is
  global.

**Until FM-CF-006 seeds the 40 items, nothing changes at runtime.** The variable code is read from
`vocational_responses."dimensionKey"`; no response carries one today, so the adapter selects
`NoDataV360Adapter` — explicitly, by name, not because a query came back empty — and every family
scores `careerfit360 = 0.0` with `NOT_DETERMINABLE`, `v360_source: NO_DATA`, warning `V360_NO_DATA`,
`evidence.360: false`, exactly as before: the 360 weight multiplies zero for every family, so every
`CareerFitAbsolute` is uniformly lower and the **ranking is untouched**. If TIMS seeds the codes under
a different carrier, *nothing* matches and the run degrades to that same NO_DATA reading rather than
scoring something wrong.

### The explainability payload (FM-CF-011)

`FormMaps.Api.Contracts.CareerFit.CareerFitExplanation.From(run)` projects a persisted run into what
a counselor or a student is told about *why* a family sits where it sits: the three gates, the
convergence level and each instrument's support, the winning PCA and personality routes, the critical
competency gaps, the MIL band and relative strengths, the 360 evidence, and the modulators. It is a
projection — it computes nothing, so it cannot disagree with the scores it explains — and it carries
no HTTP surface (FM-CF-012 owns the routes and the flag).

**It carries no family-level fit scalar at all.** Not `careerfit_absolute`, not `careerfit_relative`,
not `pca_index`, not `mil_fit`, not a route score. Guardrail 3 says CareerFitAbsolute must never be
presented as a percentage, and the reason generalises: a 0–100 number beside a career family is read
as a likelihood whatever it is called. What the payload says about *how well* is the **ordinal rank**
and the categorical gate / convergence labels. The manifest's validation (no field named
`*percent*` / `*probability*`) is asserted by reflection over every public type in the namespace and
over the serialised JSON — and it ran red on its first execution, catching the raw LIA `Percentile`
on the MIL block. That field was removed rather than the assertion weakened: open question 1 (what
population the MIL percentiles are normed on) is unanswered, while the *band* is the workbook's own
presentation category and survives a re-norm.

**360 has its own shape, because "absent" must never render as "weak".** `V360Explanation.Determinable`
is read from the run's `v360_source`, never from the length of the family's variable list, and the
payload carries the reason in words: `NoEvidenceReason` when the student has no 360 at all (every
student until FM-CF-006), `SingleRaterReason` when the scores are real but one rater leaves the
confidence unmeasured — which is exactly what V1's self-only 360 produces. Both distinctions are
pinned by tests proven red against the obvious readings: a family that weights *none* of the
variables a student answered (`PB` is weighted by no family in 1.0.0-draft.1) is still a student who
completed a 360, and self-only is neither "no evidence" nor "confident evidence".

**Modulators are structured facts**, not prose: the MIL relative strengths and each 360 variable's
`base_weight × relevance`, heaviest first — the reason two families read the same 360 evidence
differently. The rule set's per-family `v360_route_modulators_text` is deliberately *not* surfaced:
it is free Spanish prose naming route flavours ("OC/EC→innovación") that the engine does not score,
and P1–P3 does not parse it into `CareerFitRules`. Putting it in the payload is a rule-set parsing
change first.
