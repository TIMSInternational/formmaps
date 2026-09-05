# CareerFit — rule set, derivation and gate

This directory holds the thing the engine loads — the **versioned rule set** — and the tooling
that derives, validates and gates it. The engine itself (P1–P3: schema, config cache, formulas,
adapters, resolver, orchestrator) lives under `services/api` and is described in
[Engine (P1–P3)](#engine-p1p3) below. Ledger: [`careerfit.manifest.json`](careerfit.manifest.json)
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

## Engine (P1–P3)

The rule set above is consumed, unchanged, by the .NET bounded context under `services/api`
(manifest slices FM-CF-002/003/004/005/009 completed, FM-CF-010's orchestrator half shipped on
branch `careerfit/p1-p3`). Nothing is mapped as an HTTP endpoint yet — that is FM-CF-012, behind
`FORMMAPS_ROUTE_CAREERFIT_TO_DOTNET`.

| namespace / path | what |
|---|---|
| `FormMaps.Application.CareerFit` | `CareerFitFormulas` (F01–F23, one static function per reference function), the input/result records, `CareerFitRules` + `CareerFitRulesJson` (the JSON above, embedded from `CareerFit/Data`), `ICareerFitRulesProvider`, `CareerFitEvaluator` / `ICareerFitEvaluator` (the orchestrator), `CareerFitRun`, `CareerFitRunJson` (the three jsonb shapes) |
| `FormMaps.Application.CareerFit.Resolver` | `CareerFitRulesResolver` — `mc_gate.py check_resolved()` ported one for one; `CareerFitRulesInvalidException` lists every problem with family and field |
| `FormMaps.Application.CareerFit.Adapters` | `DiscAdapter`, `CompetencyAdapter`, `MilAdapter`, `PersonalityAdapter`, `IV360Adapter` / `NoDataV360Adapter`, composed by `CareerFitInputAdapters`; `InputQuality` is the audit record |
| `FormMaps.Infrastructure.CareerFit` | `CareerFitRulesProvider` (the ConfigCache: `CareerFit:RulesVersion`, loaded + resolved once per process, boot-gated in `AddFormMapsInfrastructure`), `CareerFitInputReader` (one read-only RLS session), `CareerFitRunWriter` (run + family rows in one transaction) |
| `infra/aws/sql/careerfit-schema.sql` | `careerfit_runs` / `careerfit_family_results`, tenant-scoped, RLS ENABLE+FORCE; grants in `dotnet-service-role.sql` §4.7 (SELECT + INSERT only — a run is immutable, a re-evaluation is a new run) |

The pipeline is `CareerFitEvaluator.EvaluateAsync(context, userId, graph?)`: read the student's
`pca_results` / newest completed `lia_assessment_sessions` / newest completed
`personality_assessment_sessions` rows under the caller's RLS session → adapt → `EvaluateOwner` per
scorable family (14) → `AssignRelativeFit` → persist → return the run with families in rank order.
`EvaluateCore(assessment, ruleSet)` is the pure centre (validate once, score, rank) and is held to
`formmaps_engine_reference.py` at 1e-9 through the same parity fixture FM-CF-004 uses — measured
bit-exact. A missing instrument is a typed `CareerFitInputException` naming it (PCA / MIL /
PERSONALITY) and nothing is written; the caller reports "not ready".

### Running the tests

```
dotnet test services/api/tests/FormMaps.UnitTests        --filter "FullyQualifiedName~CareerFit"   # formulas parity, resolver, provider, adapters, evaluator, run JSON
dotnet test services/api/tests/FormMaps.IntegrationTests --filter "FullyQualifiedName~CareerFit"   # Testcontainers: RLS on the real DDL, the evaluator end to end as the restricted login, DI
python3 tools/careerfit/build_rules.py --check && python3 tools/careerfit/mc_gate.py               # the rule set is still reproducible and still passes the gate
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

### 360 is NoData until FM-CF-006/007

No variable-level 360 aggregation exists before the 40 items are seeded (FM-CF-006, blocked on
TIMS) and aggregated (FM-CF-007). The registered `IV360Adapter` is `NoDataV360Adapter`: every family
scores `careerfit360 = 0.0` with confidence `NOT_DETERMINABLE`, which is exactly what the reference
engine produces for a student with no 360 evidence. Consequences, all on the run's `inputQuality`
(`v360_source: NO_DATA`, warning `V360_NO_DATA`, `evidence.360: false`): the 360 weight multiplies
zero for every family, so every `CareerFitAbsolute` is uniformly lower and the **ranking is
untouched**; the 360 instrument reads DIVERGENT in convergence, so convergence counts at most three
STRONG instruments — **SOLID is the ceiling, VERY_HIGH is unreachable**. Turning 360 on is one DI
registration (`IV360Adapter`) once FM-CF-007 lands.
