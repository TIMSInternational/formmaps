"""Export a deterministic 360 parity fixture for FM-CF-007 / FM-CF-008.

    python3 tools/careerfit/export_v360_fixture.py --out <path.json>

The 40 360 items are NOT seeded (FM-CF-006 is blocked on TIMS), so there is no real 360 response
data anywhere. The SHAPE of the engine is fixed by the spec even where its numbers are not, so this
exporter drives the NORMATIVE docs/careerfit/sources/formmaps_engine_reference.py with SYNTHETIC
per-source scores and SYNTHETIC variable aggregates and records exactly what it returns:

  * `source_cases`  -> integrate_sources (F02 score / F03 consensus / F04 coverage + valid_sources),
                       classify_consensus and confidence360 (F05), over the rule set's own
                       weights.v360_sources and thresholds.v360_consensus / .v360_confidence.
                       Includes the SELF-ONLY case V1 actually ships (one rater -> consensus None,
                       confidence NOT_DETERMINABLE) and the empty case (no rater answered).
  * `family_cases`  -> calculate_careerfit360 (F06) per scorable family over the family's own
                       v360_rules, with per-variable combined_weight evidence, for aggregate sets
                       that exercise: every variable present, a missing variable, a null score, a
                       variable with no consensus/confidence, and the IND-excluded set V1 ships.

Nothing here is a claim about a real student. It is a pin: if the C# port and this fixture disagree,
the C# is wrong. Deliberately NOT exported: anything that needs a real item text or a real response
(no item texts exist), and any per-family projection of the VECTOR variables (IND / RANK / ACT) --
see the exclusions block below.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import mc_lib  # noqa: E402

# The four rater sources the rule set weights (weights.v360_sources). V1 ships SELF only
# (careerfit.manifest.json decision 1); the other three are here because the SHAPE is spec'd and
# FM-CF-007's arithmetic must already be right when V1.1 turns multi-rater on.
SOURCES = ["SELF", "PARENT", "TEACHER", "PEER"]

# Codes excluded from V1 scoring by FM-CF-008. IND (P36) is a 20-industry SELECTION vector, not a
# Likert item: projecting it onto a family needs an industry -> family map TIMS has not delivered.
EXCLUDED_IN_V1 = ["IND"]


def source_cases(rules, ref, thr):
    weights = {s: float(rules["weights"]["v360_sources"][s]) for s in SOURCES}
    cases = [
        ("all_four_raters", {"SELF": 80.0, "PARENT": 60.0, "TEACHER": 75.0, "PEER": 45.0}),
        ("self_only_v1", {"SELF": 75.0, "PARENT": None, "TEACHER": None, "PEER": None}),
        ("self_only_floor", {"SELF": 0.0, "PARENT": None, "TEACHER": None, "PEER": None}),
        ("two_raters_tight", {"SELF": 70.0, "PARENT": 72.5, "TEACHER": None, "PEER": None}),
        ("two_raters_wide", {"SELF": 100.0, "PARENT": 0.0, "TEACHER": None, "PEER": None}),
        ("three_raters", {"SELF": 62.5, "PARENT": None, "TEACHER": 55.0, "PEER": 90.0}),
        ("low_weight_pair", {"SELF": None, "PARENT": None, "TEACHER": 25.0, "PEER": 100.0}),
        ("nobody_answered", {"SELF": None, "PARENT": None, "TEACHER": None, "PEER": None}),
        ("likert_grid", {"SELF": 0.0, "PARENT": 25.0, "TEACHER": 50.0, "PEER": 100.0}),
    ]
    out = []
    for name, scores in cases:
        integrated = ref.integrate_sources(scores, weights)
        confidence = ref.confidence360(
            integrated["consensus"], integrated["coverage"], integrated["valid_sources"], thr)
        out.append({
            "name": name,
            "source_scores": scores,
            "score": integrated["score"],
            "consensus": integrated["consensus"],
            "coverage": integrated["coverage"],
            "valid_sources": integrated["valid_sources"],
            "consensus_label": ref.classify_consensus(integrated["consensus"], thr),
            "confidence_index": confidence["index"],
            "confidence_label": confidence["label"],
        })
    return out


def likert_cases(ref):
    """F01 normalize_likert over its whole domain, plus the None passthrough."""
    return [{"response": r, "normalized": ref.normalize_likert(r)} for r in [None, 1, 2, 3, 4, 5]]


def aggregate_sets(codes):
    """Synthetic aggregate maps, keyed by 360 variable code. Deterministic, no RNG: the values are
    chosen to be exactly representable and to hit every branch of calculate_careerfit360."""
    full, partial, sparse, excluded, degenerate = {}, {}, {}, {}, {}
    for i, code in enumerate(codes):
        score = 5.0 * ((i * 7) % 21)                       # 0 .. 100, exact in binary
        consensus = 100.0 - 2.5 * (i % 9)                  # 80 .. 100
        confidence = 50.0 + 2.0 * (i % 13)                 # 50 .. 74
        full[code] = {"score": score, "consensus": consensus, "confidence_index": confidence}
        # partial: every third variable was never answered (absent from the map entirely)
        if i % 3 != 0:
            partial[code] = dict(full[code])
        # sparse: present but with a null score (the reference skips it), and no consensus at all on
        # the odd ones -- the SELF-ONLY shape, where consensus is undefined with a single rater
        sparse[code] = {"score": None} if i % 4 == 0 else {"score": score}
        # excluded: the V1 map -- IND never produced by the adapter
        if code not in EXCLUDED_IN_V1:
            excluded[code] = {"score": score, "consensus": None, "confidence_index": None}
        # degenerate: exactly one variable carries anything
        if i == 0:
            degenerate[code] = {"score": score, "consensus": consensus, "confidence_index": confidence}
    return {
        "all_variables": full,
        "partial_coverage": partial,
        "null_scores_and_no_consensus": sparse,
        "self_only_v1_ind_excluded": excluded,
        "single_variable": degenerate,
        "empty": {},
    }


def family_cases(rules, ref):
    codes = [v["code"] for v in rules["v360_variables"]]
    sets = aggregate_sets(codes)
    families = [f for f in rules["families"] if f.get("scorable")]
    out = []
    for name, aggregates in sets.items():
        per_family = {}
        for fam in families:
            result = ref.calculate_careerfit360(aggregates, fam["v360_rules"])
            per_family[str(fam["family_id"])] = {
                "careerfit360": result.score,
                "consensus": result.evidence["consensus"],
                "confidence_index": result.evidence["confidence_index"],
                "variables": {c: {"score": e["score"], "combined_weight": e["combined_weight"]}
                              for c, e in result.evidence["variables"].items()},
            }
        out.append({"name": name, "aggregates": aggregates, "expected_by_family": per_family})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rules", default=mc_lib.DEFAULT_RULES)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    rules = mc_lib.load_rules(args.rules)
    ref = mc_lib.load_reference_engine()
    # The reference's Thresholds defaults ARE the rule set's v360 numbers; assert it rather than
    # assume it, so a rule-set edit cannot silently make this fixture describe a different engine.
    thr = ref.Thresholds()
    consensus = rules["thresholds"]["v360_consensus"]
    confidence = rules["thresholds"]["v360_confidence"]
    assert thr.consensus_high_min == consensus["high_min"], "v360_consensus.high_min drifted"
    assert thr.consensus_medium_min == consensus["medium_min"], "v360_consensus.medium_min drifted"
    assert thr.confidence_high_min == confidence["high_min"], "v360_confidence.high_min drifted"
    assert thr.confidence_medium_min == confidence["medium_min"], "v360_confidence.medium_min drifted"
    assert thr.confidence_consensus_weight == confidence["consensus_weight"], "consensus_weight drifted"
    assert thr.confidence_coverage_weight == confidence["coverage_weight"], "coverage_weight drifted"

    out = {
        "rules_version": rules["rules_version"],
        "reference_engine": "docs/careerfit/sources/formmaps_engine_reference.py",
        "tolerance": 1e-9,
        "source_weights": {s: float(rules["weights"]["v360_sources"][s]) for s in SOURCES},
        "consensus_thresholds": consensus,
        "confidence_thresholds": confidence,
        "excluded_in_v1": EXCLUDED_IN_V1,
        "likert_cases": likert_cases(ref),
        "source_cases": source_cases(rules, ref, thr),
        "family_cases": family_cases(rules, ref),
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"wrote {args.out}: {len(out['source_cases'])} source cases, "
          f"{len(out['family_cases'])} aggregate sets x 14 families")


if __name__ == "__main__":
    main()
