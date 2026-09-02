"""Measure what the convergence thresholds actually do on this rule set, and propose a recut.

Sheet 14_GATES_CONVERG B defines evidence support per instrument as strong >= 70, partial
55-70, divergent < 70 -- written as if every instrument fit used the whole 0-100 scale. They do
not: competency attainment saturates at 100 for anyone at level >= 2, MIL is a weighted mean of
percentiles, and the 360 is a weighted mean of 0-100 ratings, so each instrument lives in its
own band. A threshold is only meaningful relative to the band, so this script measures, per
instrument, the fit a student gets on their OWN family (matched) versus on the other 13
(unmatched), and reports:

  * the share of matched / unmatched pairs each spec threshold calls STRONG and PARTIAL;
  * a data-driven recut: partial_min at the unmatched median (better than a random other
    family = some evidence), strong_min at the Youden cut (max TPR-FPR for matched vs unmatched).

Run:  python3 tools/careerfit/recut_thresholds.py [--n 5000] [--coherence 0.75]
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import mc_lib  # noqa: E402

INSTRUMENTS = [("pca_index", "PCA index (0.5 route + 0.5 competencies)"), ("pca_route", "PCA route fit alone"),
               ("comp", "competency attainment alone"), ("mil", "MIL fit"), ("per", "Personality fit"),
               ("v360", "360 fit"), ("absolute", "CareerFitAbsolute")]


def youden(matched, unmatched):
    grid = np.linspace(0, 100, 1001)
    tpr = np.array([(matched >= t).mean() for t in grid])
    fpr = np.array([(unmatched >= t).mean() for t in grid])
    i = int(np.argmax(tpr - fpr))
    return grid[i], tpr[i], fpr[i]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=5000, help="profiles per family")
    ap.add_argument("--coherence", type=float, default=0.75)
    ap.add_argument("--seed", type=int, default=20260902)
    ap.add_argument("--rules", default=mc_lib.DEFAULT_RULES)
    args = ap.parse_args()
    rng = np.random.default_rng(args.seed)
    model = mc_lib.Model(mc_lib.load_rules(args.rules))
    thr = model.rules["thresholds"]["convergence"]

    matched = {k: [] for k, _ in INSTRUMENTS}
    unmatched = {k: [] for k, _ in INSTRUMENTS}
    for fi in range(model.nf):
        d, m, l, p, v = model.generate(rng, fi, args.n, args.coherence)
        s = model.score(d, m, l, p, v)
        mask = np.zeros(model.nf, bool); mask[fi] = True
        for k, _ in INSTRUMENTS:
            matched[k].append(s[k][:, mask].ravel()); unmatched[k].append(s[k][:, ~mask].ravel())
    matched = {k: np.concatenate(v) for k, v in matched.items()}
    unmatched = {k: np.concatenate(v) for k, v in unmatched.items()}

    print(f"rule set {os.path.basename(args.rules)} -- {args.n:,} profiles x {model.nf} families, coherence {args.coherence}")
    print(f"spec thresholds: strong >= {thr['strong_min']}, partial >= {thr['partial_min']}\n")
    print(f"{'instrument':44}{'matched':>16}{'unmatched':>16}{'STRONG m/u':>14}{'PARTIAL+ m/u':>14}")
    for k, label in INSTRUMENTS:
        mm, uu = matched[k], unmatched[k]
        print(f"  {label:42}{mm.mean():7.1f} ±{mm.std():4.1f}{uu.mean():8.1f} ±{uu.std():4.1f}"
              f"   {100*(mm>=thr['strong_min']).mean():4.0f}% /{100*(uu>=thr['strong_min']).mean():4.0f}%"
              f"   {100*(mm>=thr['partial_min']).mean():4.0f}% /{100*(uu>=thr['partial_min']).mean():4.0f}%")

    print("\nrecut (partial_min = unmatched median; strong_min = Youden cut, matched vs unmatched):")
    print(f"{'instrument':44}{'partial_min':>12}{'strong_min':>12}{'TPR':>7}{'FPR':>7}")
    recut = {}
    for k, label in INSTRUMENTS:
        mm, uu = matched[k], unmatched[k]
        pm = float(np.median(uu)); sm, tpr, fpr = youden(mm, uu)
        sm = max(sm, pm + 1.0)
        recut[k] = (round(pm), round(sm))
        print(f"  {label:42}{pm:12.1f}{sm:12.1f}{100*tpr:6.0f}%{100*fpr:6.0f}%")

    # MIL is the exception: matched and unmatched sit within a point of each other (capacity is not
    # family-specific), so a data-driven cut is a 1-point band. Use the sheet's own official MIL
    # bands on the weighted percentile mean instead: EXCEEDS (>=57) = strong, ADEQUATE (>=38) = partial.
    recut["mil"] = (38, 57)
    inst = {"pca_index": "PCA", "mil": "MIL", "per": "PERSONALITY", "v360": "360"}
    print("\nper-instrument block for build_rules.THRESHOLDS['convergence']['per_instrument']:")
    for k, name in inst.items():
        note = "official MIL bands (04_MIL_LOGICA B)" if k == "mil" else f"simulated: Youden / unmatched median, coherence {args.coherence}"
        print(f'        "{name}": {{"strong_min": {recut[k][1]}, "partial_min": {recut[k][0]}}},   # {note}')
    print("\nshare called STRONG / PARTIAL+ under the recut (matched / unmatched):")
    for k, name in inst.items():
        mm, uu = matched[k], unmatched[k]; pm, sm = recut[k]
        print(f"  {name:12} strong {100*(mm>=sm).mean():4.0f}% /{100*(uu>=sm).mean():4.0f}%    partial+ {100*(mm>=pm).mean():4.0f}% /{100*(uu>=pm).mean():4.0f}%")
    a = matched["absolute"]; u = unmatched["absolute"]; allabs = np.concatenate([a, u])
    q = np.percentile(allabs, [1, 5, 25, 50, 75, 95, 99])
    print(f"\nCareerFitAbsolute over all family scores: mean {allabs.mean():.2f} sd {allabs.std():.2f}  "
          "p1 %.1f p5 %.1f p25 %.1f p50 %.1f p75 %.1f p95 %.1f p99 %.1f" % tuple(q))
    ya, ta, fa = youden(a, u)
    print(f"  matched mean {a.mean():.2f} sd {a.std():.2f}; unmatched mean {u.mean():.2f} sd {u.std():.2f}; "
          f"Youden cut {ya:.1f} (TPR {100*ta:.0f}%, FPR {100*fa:.0f}%)")
    print("\nabsolute_reference block for build_rules.THRESHOLDS:")
    print(f'    "absolute_reference": {{"mean": {allabs.mean():.2f}, "sd": {allabs.std():.2f}, "p1": {q[0]:.1f}, "p5": {q[1]:.1f}, '
          f'"p25": {q[2]:.1f}, "p50": {q[3]:.1f}, "p75": {q[4]:.1f}, "p95": {q[5]:.1f}, "p99": {q[6]:.1f}, '
          f'"matched_mean": {a.mean():.2f}, "unmatched_mean": {u.mean():.2f}, "youden_cut": {ya:.1f}}},')


if __name__ == "__main__":
    main()
