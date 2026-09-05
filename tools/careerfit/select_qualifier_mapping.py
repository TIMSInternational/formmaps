"""Pick ONE deterministic qualifier -> (direction, weight) mapping for sheet 02_PCA_LOGICA.

The 12 DISC archetypes are written as qualitative phrases per factor ("Pasivo", "Activo/medio",
"Neutral/activo", ...). The engine needs (direction, weight) per factor. Any encoding is a
reading of those phrases, so this script measures the readings instead of arguing about them:

  1. Each phrase is given a SEMANTIC interval on the 0-100 DISC scale, read straight from the
     workbook's own rule (">50 Activo; <50 Pasivo; =50 Neutral; la distancia a 50 determina
     intensidad"). Profiles are sampled from these intervals -- never from a candidate
     encoding -- so no candidate is graded on its own homework.
  2. Each candidate mapping is a function of the PHRASE (the same phrase always encodes the
     same way -- the property profiles.py lacked, where "Neutral/activo" became NEUTRAL for
     one archetype and ACTIVE for another).
  3. Every candidate scores every profile against all 12 archetypes with the reference
     RouteFit formula; the score is 12-way archetype recovery (top-1), per coherence level.

Run:  python3 tools/careerfit/select_qualifier_mapping.py [--n 20000]
The winning mapping is copied by hand into build_rules.py (QUALIFIER_MAP) with this script's
output recorded in the rule set's decisions[] -- the choice is a reviewed decision, not a
build-time side effect.
"""
from __future__ import annotations

import argparse
import itertools
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from xlsx_reader import load  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
WORKBOOK = os.path.join(HERE, "..", "..", "docs", "careerfit", "sources",
                        "FORMMAPS_Matriz_Maestra_Logica_Implementacion_V1.xlsx")

FACTORS = ["D", "I", "S", "C"]

# Semantic reading of each phrase as an interval on the DISC scale. "fuerte" is further from
# 50 than bare; "/medio" is nearer; "Neutral / cercano a 50" is the tightest band around 50;
# "Neutral/activo" straddles 50 leaning active. These are the ONLY judgement calls in the
# experiment, and they are about what the words mean, not about how to encode them.
SEMANTIC_INTERVAL = {
    "Activo": (65, 95),
    "Pasivo": (5, 35),
    "Pasivo fuerte": (0, 25),
    "Activo/medio": (55, 75),
    "Pasivo/medio": (25, 45),
    "Neutral / cercano a 50": (42, 58),
    "Neutral/medio": (40, 60),
    "Neutral/activo": (48, 65),
}


def candidate_mappings():
    """Enumerate mappings as (phrase -> (direction, weight)) built from two choices:
    what "Neutral/activo" means, and how the weight ladder runs."""
    ladders = {
        # name: (bare, fuerte, medio, neutral_tight, neutral_medio)
        "3-3-2-2-2": (3, 3, 2, 2, 2),
        "3-3-2-3-2": (3, 3, 2, 3, 2),
        "3-3-2-1-1": (3, 3, 2, 1, 1),
        "2-3-1-1-1": (2, 3, 1, 1, 1),
        # every phrase distinct within the spec's 1-3 weight range: fuerte > bare > medio on
        # the active/passive side, "cercano a 50" > "/medio" > "/activo" on the neutral side
        "2-3-1-3-2": (2, 3, 1, 3, 2),
    }
    na_options = {"NEUTRAL": ("NEUTRAL", None), "ACTIVE": ("ACTIVE", None)}
    out = {}
    for (lname, (bare, fuerte, medio, ntight, nmedio)), (na_name, (na_dir, _)) in itertools.product(
            ladders.items(), na_options.items()):
        for na_w in sorted({medio, 1}):
            m = {
                "Activo": ("ACTIVE", bare),
                "Pasivo": ("PASSIVE", bare),
                "Pasivo fuerte": ("PASSIVE", fuerte),
                "Activo/medio": ("ACTIVE", medio),
                "Pasivo/medio": ("PASSIVE", medio),
                "Neutral / cercano a 50": ("NEUTRAL", ntight),
                "Neutral/medio": ("NEUTRAL", nmedio),
                "Neutral/activo": (na_dir, na_w),
            }
            out[f"ladder {lname} | Neutral/activo={na_dir} w{na_w}"] = m
    return out


def read_archetypes():
    rows = load(WORKBOOK)["02_PCA_LOGICA"]
    start = next(i for i, r in enumerate(rows) if r and r[0] == "RouteID") + 1
    arch = {}
    for r in rows[start:]:
        if not r or not r[0]:
            continue
        arch[r[0]] = {f: r[1 + j] for j, f in enumerate(FACTORS)}
    return arch


def sample(rng, arch, n, coherence):
    """Profiles from the semantic intervals. coherence 1 = inside the interval; lower values
    widen the interval toward the full scale and add noise, the way real students do."""
    names = list(arch)
    disc = np.empty((len(names) * n, 4))
    label = np.repeat(np.arange(len(names)), n)
    for i, name in enumerate(names):
        for j, f in enumerate(FACTORS):
            lo, hi = SEMANTIC_INTERVAL[arch[name][f]]
            mid = (lo + hi) / 2
            lo_k = mid - (mid - lo) * coherence - (mid - 0) * (1 - coherence)
            hi_k = mid + (hi - mid) * coherence + (100 - mid) * (1 - coherence)
            block = slice(i * n, (i + 1) * n)
            disc[block, j] = rng.uniform(lo_k, hi_k, n)
    return np.clip(disc, 0, 100), label, names


def route_fit(disc, mapping, arch, names):
    """Reference RouteFit for every profile against every archetype under one mapping."""
    T = np.empty((disc.shape[0], 4, 3))
    T[:, :, 0] = disc
    T[:, :, 1] = 100.0 - disc
    T[:, :, 2] = np.maximum(0.0, 100.0 - 2.0 * np.abs(disc - 50.0))
    dcode = {"ACTIVE": 0, "PASSIVE": 1, "NEUTRAL": 2}
    fits = np.empty((disc.shape[0], len(names)))
    for k, name in enumerate(names):
        dirs = np.array([dcode[mapping[arch[name][f]][0]] for f in FACTORS])
        w = np.array([float(mapping[arch[name][f]][1]) for f in FACTORS])
        fits[:, k] = (T[:, np.arange(4), dirs] * w).sum(1) / w.sum()
    return fits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=20000, help="profiles per archetype per coherence level")
    ap.add_argument("--seed", type=int, default=20260902)
    args = ap.parse_args()
    rng = np.random.default_rng(args.seed)
    arch = read_archetypes()
    assert len(arch) == 12, f"expected 12 archetypes, got {len(arch)}"
    phrases = sorted({v for a in arch.values() for v in a.values()})
    missing = [p for p in phrases if p not in SEMANTIC_INTERVAL]
    assert not missing, f"phrases without a semantic interval: {missing}"

    coherences = [1.0, 0.75, 0.5, 0.25]
    cands = candidate_mappings()
    results = {name: {} for name in cands}
    per_arch = {name: None for name in cands}
    for k in coherences:
        disc, label, names = sample(rng, arch, args.n, k)
        for cname, mapping in cands.items():
            fits = route_fit(disc, mapping, arch, names)
            top1 = fits.argmax(1) == label
            results[cname][k] = top1.mean()
            if k == 0.75:
                per_arch[cname] = np.array([top1[label == i].mean() for i in range(len(names))])

    def identical_pairs(mapping):
        enc = {name: tuple(mapping[arch[name][f]] for f in FACTORS) for name in arch}
        names = list(enc)
        return [(a, b) for i, a in enumerate(names) for b in names[i + 1:] if enc[a] == enc[b]]

    print(f"12-way archetype recovery (top-1), {args.n:,} profiles/archetype/level, seed {args.seed}")
    print(f"{'mapping':52}" + "".join(f"{k:>8.2f}" for k in coherences) + "    mean   worst@0.75  dead")
    ranked = sorted(cands, key=lambda c: -np.mean(list(results[c].values())))
    for cname in ranked:
        row = results[cname]
        dead = int((per_arch[cname] == 0).sum())
        print(f"  {cname:50}" + "".join(f"{100*row[k]:7.1f}%" for k in coherences)
              + f"{100*np.mean(list(row.values())):8.1f}%   {100*per_arch[cname].min():5.1f}%  {dead:>4}")
    print("\narchetype pairs that ENCODE IDENTICALLY (the tie always goes to the first row):")
    for cname in ranked:
        pairs = identical_pairs(cands[cname])
        print(f"  {cname:50} {pairs if pairs else 'none'}")
    # Selection rule. Mean recovery separates the candidates by well under a point -- noise --
    # while the tie structure is a property of the mapping itself. So: (1) injective on the
    # sheet's phrases (every distinct phrase gets a distinct encoding, so no archetype pair
    # collapses into a tie that the first row always wins); (2) among those, highest mean.
    def injective(mapping):
        used = [mapping[p] for p in phrases]
        return len(set(used)) == len(used)

    eligible = [c for c in ranked if injective(cands[c]) and not identical_pairs(cands[c])]
    best = eligible[0] if eligible else ranked[0]
    print(f"\nSELECTED: {best}")
    print(f"  rule: injective on the {len(phrases)} phrases and no identical archetype pairs, then highest mean")
    print(f"  eligible under that rule: {eligible}")
    print("per-archetype top-1 at coherence 0.75 under the selected mapping:")
    disc, label, names = sample(rng, arch, args.n, 0.75)
    for i, name in enumerate(names):
        print(f"  {name:20} {100*per_arch[best][i]:5.1f}%")
    print("\nmapping table for build_rules.QUALIFIER_MAP:")
    for phrase, (d, w) in cands[best].items():
        print(f'  "{phrase}": ("{d}", {w}),')


if __name__ == "__main__":
    main()
