"""Export a deterministic parity fixture: N archetypal profiles and the REFERENCE engine's
outputs for every scorable family, so a port of F01-F23 (FM-CF-004) can be held to
docs/careerfit/sources/formmaps_engine_reference.py at 1e-9 without re-implementing anything.

    python3 tools/careerfit/export_parity_fixture.py --n 40 --out <path.json>

Each case carries the raw engine inputs (PCAInput, competencies 1..24, MILInput, PersonalityInput,
v360 aggregates keyed by variable code) and, per family, the fields evaluate_owner returns:
pca_route_fit, pca_winning_route, competency_fit, competency_gate, pca_index, mil_fit, mil_gate,
personality_fit, personality_winning_route, careerfit360, final_gate, convergence_level,
careerfit_absolute. Inputs are sampled across all families and coherence levels so gates and
convergence take every value at least once.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import mc_lib  # noqa: E402

FIELDS = ["pca_route_fit", "pca_winning_route", "competency_fit", "competency_gate", "pca_index",
          "mil_fit", "mil_gate", "personality_fit", "personality_winning_route", "careerfit360",
          "final_gate", "convergence_level", "careerfit_absolute"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=40, help="cases (spread over families and coherence levels)")
    ap.add_argument("--seed", type=int, default=20260903)
    ap.add_argument("--rules", default=mc_lib.DEFAULT_RULES)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    rules = mc_lib.load_rules(args.rules)
    model = mc_lib.Model(rules)
    ref = mc_lib.load_reference_engine()
    w = model.w_fit
    weights = ref.EngineWeights(pca=w["PCA"], mil=w["MIL"], personality=w["PERSONALITY"], vocational360=w["VOCATIONAL_360"],
                                disc_in_pca=model.w_disc, competencies_in_pca=model.w_comp)
    thr = ref.Thresholds()
    bundles = {f["family_id"]: mc_lib.resolved_bundle(rules, f) for f in model.families}
    rng = np.random.default_rng(args.seed)

    cases = []
    coherences = [0.0, 0.25, 0.5, 0.75, 1.0]
    for i in range(args.n):
        fi = i % model.nf
        k = coherences[(i // model.nf) % len(coherences)]
        d, m, l, p, v = model.generate(rng, fi, 1, k)
        assessment = {
            "pca": ref.PCAInput(*[float(x) for x in d[0]]),
            "competencies": {c + 1: int(l[0, c]) for c in range(24)},
            "mil": ref.MILInput(*[int(x) for x in m[0]]),
            "personality": ref.PersonalityInput(**{P: float(p[0, j]) for j, P in enumerate(mc_lib.POLES)}),
            "v360_aggregates": {c: {"score": float(v[0, j])} for j, c in enumerate(model.v40)},
        }
        # a slice of cases carries a LOW 360 confidence so the convergence downgrade path is exercised
        conf = "LOW" if i % 7 == 3 else "HIGH"
        assessment["careerfit360_confidence"] = conf
        expected = {}
        for fid, b in bundles.items():
            r = ref.evaluate_owner(assessment, b, weights, thr)
            expected[str(fid)] = {f: r[f] for f in FIELDS}
        cases.append({
            "case_id": i,
            "archetype_family_id": model.ids[fi],
            "coherence": k,
            "inputs": {
                "pca": {x: float(d[0, j]) for j, x in enumerate(mc_lib.FACTORS)},
                "competencies": {str(c + 1): int(l[0, c]) for c in range(24)},
                "mil": {s: int(m[0, j]) for j, s in enumerate(mc_lib.SUBTESTS)},
                "personality": {P: float(p[0, j]) for j, P in enumerate(mc_lib.POLES)},
                "v360": {c: float(v[0, j]) for j, c in enumerate(model.v40)},
                "careerfit360_confidence": conf,
            },
            "expected_by_family": expected,
        })

    out = {
        "rules_version": rules["rules_version"],
        "reference_engine": "docs/careerfit/sources/formmaps_engine_reference.py",
        "weights": {"career_fit": w, "pca_internal": {"DISC": model.w_disc, "COMPETENCIES": model.w_comp}},
        "thresholds": {"strong_support_min": thr.strong_support_min, "partial_support_min": thr.partial_support_min},
        "tolerance": 1e-9,
        "seed": args.seed,
        "cases": cases,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    gates = {}
    for c in cases:
        for e in c["expected_by_family"].values():
            gates[e["final_gate"]] = gates.get(e["final_gate"], 0) + 1
    print(f"wrote {args.out}: {len(cases)} cases x {model.nf} families; final_gate distribution {gates}")


if __name__ == "__main__":
    main()
