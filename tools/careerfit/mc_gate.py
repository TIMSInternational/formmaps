"""CI gate for the CareerFit rule set. Exit 1 on any failure.

    python3 tools/careerfit/mc_gate.py                 # gate the committed rule set
    python3 tools/careerfit/mc_gate.py --self-test     # prove the gate can fail (poisoned configs)

Four checks, in order:

  1. RESOLVED -- every scorable family carries fully resolved rules: no VAR / INHERIT / X/Y
     markers, every PCA route id exists in the archetype catalogue, every direction, role, pole,
     competency id and 360 code is one the reference engine accepts, and every scoring block has
     at least one weighted item (a family with an empty MIL row scores 0.0 on every profile --
     that is how Ingeniería read 0.0% before FM-CF-001). This is the fail-closed property the
     spec's assert_no_unresolved_markers() promises and the reference engine never implements.
  2. FIDELITY -- the vectorised scorer agrees with docs/careerfit/sources/formmaps_engine_reference.py
     through evaluate_owner to 1e-9, so the numbers below are the spec engine's numbers.
  3. RECOVERY -- Monte Carlo over archetypal profiles at coherence 0.75: top-1 >= 93%, top-3 >= 99%,
     and NO family below 60% top-3. A config edit that silently drops a subtest or a 360 row
     passes every unit test and fails here.
  4. DISTRIBUTION -- CareerFitAbsolute mean/sd within tolerance of thresholds.absolute_reference,
     so a rebuilt rule set cannot quietly move the band the product interprets.

The thresholds are the ones in docs/careerfit/careerfit.manifest.json (FM-CF-001 acceptance).
"""
from __future__ import annotations

import argparse
import copy
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import mc_lib  # noqa: E402

TOP1_MIN = 0.93
TOP3_MIN = 0.99
FAMILY_TOP3_MIN = 0.60
ABS_MEAN_TOL = 1.5   # points
ABS_SD_TOL = 1.0     # points
FIDELITY_MAX = 1e-9
COHERENCE = 0.75

VALID_DIRECTIONS = {"ACTIVE", "PASSIVE", "NEUTRAL", "OPEN"}
VALID_MIL_ROLES = {"CRITICAL", "IMPORTANT", "COMPLEMENTARY", "NOT_USED"}
VALID_COMP_ROLES = {"CRITICAL", "IMPORTANT", "COMPLEMENTARY", "DIFFERENTIATOR"}
VALID_POLES = set(mc_lib.POLES)


class GateFailure(Exception):
    pass


def check_resolved(rules):
    problems = []
    arch = rules["pca"]["archetypes"]
    codes = {v["code"] for v in rules["v360_variables"]}
    for rid, a in arch.items():
        for f in mc_lib.FACTORS:
            fac = a["factors"].get(f)
            if not fac or fac.get("direction") not in VALID_DIRECTIONS or not (0 <= float(fac.get("weight", -1)) <= 3):
                problems.append(f"archetype {rid}.{f}: bad direction/weight {fac}")
    for fam in rules["families"]:
        fid = fam["family_id"]
        if not fam["scorable"]:
            continue
        if not fam["pca_routes"]:
            problems.append(f"family {fid}: no PCA routes")
        for rid in fam["pca_routes"]:
            if rid not in arch:
                problems.append(f"family {fid}: PCA route {rid!r} is not in the archetype catalogue")
        weighted_comp = 0
        for r in fam["competency_rules"]:
            if r.get("role") not in VALID_COMP_ROLES or not (1 <= int(r.get("competency_id", 0)) <= 24):
                problems.append(f"family {fid}: bad competency rule {r}")
            if r.get("role") in ("CRITICAL", "IMPORTANT"):
                weighted_comp += 1
        if weighted_comp == 0:
            problems.append(f"family {fid}: no CRITICAL/IMPORTANT competency -- competency fit would be 0.0")
        mil_weight = 0.0
        for s in mc_lib.SUBTESTS:
            r = fam["mil_rules"].get(s)
            if not r or r.get("role") not in VALID_MIL_ROLES:
                problems.append(f"family {fid}: MIL {s} unresolved: {r}")
                continue
            mil_weight += float(r.get("weight") or rules["weights"]["mil_role"].get(r["role"], 0))
        if mil_weight == 0:
            problems.append(f"family {fid}: MIL row has zero weight -- MIL fit would be 0.0")
        if not fam["personality_routes"]:
            problems.append(f"family {fid}: no personality routes")
        for route in fam["personality_routes"]:
            for dim, rule in route["dimensions"].items():
                if dim not in mc_lib.DIM_POLES or rule.get("rule_type", "POLE") not in ("POLE", "OPEN"):
                    problems.append(f"family {fid}: bad personality rule {dim}={rule}")
                elif rule.get("rule_type", "POLE") == "POLE" and rule.get("preferred_pole") not in mc_lib.DIM_POLES[dim]:
                    problems.append(f"family {fid}: pole {rule.get('preferred_pole')!r} is not one of {dim}")
        v_weight = 0.0
        for code, r in fam["v360_rules"].items():
            if code not in codes:
                problems.append(f"family {fid}: unknown 360 code {code!r}")
            if r.get("use_mode") == "BASE" and r.get("relevance", 0) > 0:
                v_weight += float(r["base_weight"]) * float(r["relevance"])
        if v_weight == 0:
            problems.append(f"family {fid}: 360 row has zero weight -- 360 fit would be 0.0")
    if problems:
        raise GateFailure("RESOLVED: " + "; ".join(problems[:12]) + (" ..." if len(problems) > 12 else ""))


def run_gate(rules, n_per_family, seed, quiet=False):
    t0 = time.time()
    check_resolved(rules)
    model = mc_lib.Model(rules)
    rng = np.random.default_rng(seed)
    worst = mc_lib.check_reference_fidelity(model, rng, samples=100)
    if worst > FIDELITY_MAX:
        raise GateFailure(f"FIDELITY: vectorised scorer diverges from the reference engine by {worst:.3e}")

    top1 = np.zeros(model.nf); top3 = np.zeros(model.nf); allabs = []
    for fi in range(model.nf):
        d, m, l, p, v = model.generate(rng, fi, n_per_family, COHERENCE)
        s = model.score(d, m, l, p, v)
        order = np.argsort(-s["absolute"], axis=1)
        pos = (order == fi).argmax(1)
        top1[fi] = (pos == 0).mean(); top3[fi] = (pos < 3).mean()
        allabs.append(s["absolute"].ravel())
    allabs = np.concatenate(allabs)
    ref = rules["thresholds"]["absolute_reference"]
    mean, sd = float(allabs.mean()), float(allabs.std())

    if not quiet:
        print(f"{'family':36}{'top-1':>8}{'top-3':>8}")
        for fi in range(model.nf):
            flag = "  <-- below floor" if top3[fi] < FAMILY_TOP3_MIN else ""
            print(f"  {model.names[fi][:34]:34}{100*top1[fi]:7.1f}%{100*top3[fi]:7.1f}%{flag}")
        print(f"  {'ALL':34}{100*top1.mean():7.1f}%{100*top3.mean():7.1f}%")
        print(f"CareerFitAbsolute mean {mean:.2f} sd {sd:.2f} (reference {ref['mean']} / {ref['sd']})")
        print(f"reference fidelity {worst:.1e}; {n_per_family * model.nf:,} profiles in {time.time() - t0:.1f}s")

    failures = []
    if top1.mean() < TOP1_MIN:
        failures.append(f"top-1 {100*top1.mean():.1f}% < {100*TOP1_MIN:.0f}%")
    if top3.mean() < TOP3_MIN:
        failures.append(f"top-3 {100*top3.mean():.1f}% < {100*TOP3_MIN:.0f}%")
    low = [f"{model.names[i]} {100*top3[i]:.1f}%" for i in range(model.nf) if top3[i] < FAMILY_TOP3_MIN]
    if low:
        failures.append(f"families below {100*FAMILY_TOP3_MIN:.0f}% top-3: {', '.join(low)}")
    if abs(mean - ref["mean"]) > ABS_MEAN_TOL:
        failures.append(f"absolute mean {mean:.2f} outside {ref['mean']} ± {ABS_MEAN_TOL}")
    if abs(sd - ref["sd"]) > ABS_SD_TOL:
        failures.append(f"absolute sd {sd:.2f} outside {ref['sd']} ± {ABS_SD_TOL}")
    if failures:
        raise GateFailure("RECOVERY/DISTRIBUTION: " + "; ".join(failures))
    return {"top1": top1, "top3": top3, "mean": mean, "sd": sd}


def self_test(rules, n_per_family, seed):
    """Every poisoned config must make the gate fail, and the clean one must pass."""
    cases = []
    p = copy.deepcopy(rules); p["families"][0]["mil_rules"]["RZ"]["role"] = "VARIABLE"
    cases.append(("MIL role VARIABLE (unresolved marker)", p))
    p = copy.deepcopy(rules); p["families"][1]["v360_rules"] = {}
    cases.append(("family with no 360 rules", p))
    p = copy.deepcopy(rules)
    for s in mc_lib.SUBTESTS:
        p["families"][0]["mil_rules"][s] = {"role": "NOT_USED", "weight": 0}
    cases.append(("MIL row all NOT_USED (as-shipped Ingeniería)", p))
    p = copy.deepcopy(rules)
    # same 360 row for every family: the ranking collapses, recovery must fall through the floor
    row = p["families"][0]["v360_rules"]
    for f in p["families"]:
        if f["scorable"]:
            f["v360_rules"] = copy.deepcopy(row)
    cases.append(("every family given Ingeniería's 360 row", p))
    p = copy.deepcopy(rules); p["families"][2]["pca_routes"] = ["NO_SUCH_ROUTE"]
    cases.append(("PCA route id not in the catalogue", p))

    ok = True
    for label, poisoned in cases:
        try:
            run_gate(poisoned, n_per_family, seed, quiet=True)
            print(f"  SELF-TEST FAILED: gate PASSED a poisoned config -- {label}")
            ok = False
        except GateFailure as e:
            print(f"  ok  gate rejects: {label}\n        -> {str(e)[:140]}")
    try:
        run_gate(rules, n_per_family, seed, quiet=True)
        print("  ok  gate accepts the clean rule set")
    except GateFailure as e:
        print(f"  SELF-TEST FAILED: clean rule set rejected: {e}")
        ok = False
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rules", default=mc_lib.DEFAULT_RULES)
    ap.add_argument("--n", type=int, default=5000, help="profiles per family")
    ap.add_argument("--seed", type=int, default=20260902)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    rules = mc_lib.load_rules(args.rules)
    print(f"careerfit gate -- {os.path.relpath(args.rules)} ({rules['rules_version']}, {rules['status']})")
    if args.self_test:
        sys.exit(0 if self_test(rules, max(500, args.n // 10), args.seed) else 1)
    try:
        run_gate(rules, args.n, args.seed)
    except GateFailure as e:
        print(f"\nGATE FAILED -- {e}")
        sys.exit(1)
    print(f"\nGATE PASSED -- top-1 >= {100*TOP1_MIN:.0f}%, top-3 >= {100*TOP3_MIN:.0f}%, "
          f"every family >= {100*FAMILY_TOP3_MIN:.0f}% top-3, distribution within tolerance")


if __name__ == "__main__":
    main()
