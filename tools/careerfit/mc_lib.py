"""Shared Monte Carlo machinery for the CareerFit rule set.

Loads a rule-set JSON (services/api/src/FormMaps.Application/CareerFit/Data/*.json), turns it into
numpy matrices, generates
archetypal student profiles from it, and scores them with a vectorised copy of the reference
engine's formulas. `check_reference_fidelity` proves the vectorised scorer agrees with
docs/careerfit/sources/formmaps_engine_reference.py -- through `evaluate_owner`, fed the rule
set's own family bundles as `resolved_rules` -- so the gate measures the spec's engine and not
a re-implementation of it.

The generator is the "regression" generator: it builds a student to BE a family's archetype as
the RULES describe it (central 360 variables high, critical subtests strong, DISC inside one of
the family's own routes). That is circular by design -- it answers "does this rule set still
recover the archetypes it encodes?", which is what a CI gate is for -- and says nothing about
whether the matrix is right about real careers. `coherence` scales how cleanly the student fits.
"""
from __future__ import annotations

import importlib.util
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
REFERENCE_ENGINE = os.path.join(ROOT, "docs", "careerfit", "sources", "formmaps_engine_reference.py")
DEFAULT_RULES = os.path.join(
    ROOT, "services", "api", "src", "FormMaps.Application", "CareerFit", "Data",
    "careerfit-rules.v1.0.0-draft.1.json")

FACTORS = ["D", "I", "S", "C"]
SUBTESTS = ["DC", "RZ", "VN", "MT", "OR"]
POLES = ["E", "I", "S", "N", "T", "F", "J", "P"]
POLE_INDEX = {p: i for i, p in enumerate(POLES)}
DIM_POLES = {"EI": ("E", "I"), "SN": ("S", "N"), "TF": ("T", "F"), "JP": ("J", "P")}
DIRECTION_CODE = {"ACTIVE": 0, "PASSIVE": 1, "NEUTRAL": 2}


def load_rules(path=DEFAULT_RULES):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def resolved_bundle(rules, fam):
    """The family's rules in exactly the shape formmaps_engine_reference.evaluate_owner wants."""
    arch = rules["pca"]["archetypes"]
    return {
        "owner_type": "FAMILY",
        "owner_id": fam["family_id"],
        "pca_routes": [dict({"route_id": rid}, **{f: {"direction": arch[rid]["factors"][f]["direction"],
                                                       "weight": arch[rid]["factors"][f]["weight"]}
                                                   for f in FACTORS}) for rid in fam["pca_routes"]],
        "competency_rules": fam["competency_rules"],
        "mil_rules": fam["mil_rules"],
        "personality_routes": fam["personality_routes"],
        "v360_rules": fam["v360_rules"],
    }


class Model:
    """Rule set as matrices. Family order = scorable families in rules order."""

    def __init__(self, rules):
        self.rules = rules
        self.families = [f for f in rules["families"] if f["scorable"]]
        self.nf = len(self.families)
        self.names = [f["family_name"] for f in self.families]
        self.ids = [f["family_id"] for f in self.families]
        self.v40 = [v["code"] for v in rules["v360_variables"]]
        self.base = {v["code"]: v["base_weight"] for v in rules["v360_variables"]}
        vi = {c: i for i, c in enumerate(self.v40)}
        arch = rules["pca"]["archetypes"]
        w = rules["weights"]
        self.w_fit = w["career_fit"]
        self.w_disc = w["pca_internal"]["DISC"]
        self.w_comp = w["pca_internal"]["COMPETENCIES"]
        mil_w = w["mil_role"]
        comp_w = w["competency_role"]

        self.pca_routes = []  # (family index, direction codes[4], weights[4])
        for i, f in enumerate(self.families):
            for rid in f["pca_routes"]:
                fac = arch[rid]["factors"]
                self.pca_routes.append((i, np.array([DIRECTION_CODE[fac[x]["direction"]] for x in FACTORS]),
                                        np.array([float(fac[x]["weight"]) for x in FACTORS])))
        self.per_routes = []  # (family index, pole indices, weights)
        for i, f in enumerate(self.families):
            for r in f["personality_routes"]:
                idx, ww = [], []
                for dim, rule in r["dimensions"].items():
                    if rule.get("rule_type", "POLE") == "OPEN":
                        continue
                    idx.append(POLE_INDEX[rule["preferred_pole"]])
                    ww.append(float(rule["weight"]))
                self.per_routes.append((i, np.array(idx), np.array(ww)))

        self.Wc = np.zeros((self.nf, 24)); self.Wi = np.zeros((self.nf, 24)); self.CritC = np.zeros((self.nf, 24), bool)
        self.comp_role = np.zeros((self.nf, 24), np.int8)  # 2 critical, 1 important, 0 else (generator)
        for i, f in enumerate(self.families):
            for r in f["competency_rules"]:
                c = r["competency_id"] - 1
                if r["role"] == "CRITICAL":
                    self.Wc[i, c] = comp_w["CRITICAL"]; self.CritC[i, c] = True; self.comp_role[i, c] = 2
                elif r["role"] == "IMPORTANT":
                    self.Wi[i, c] = comp_w["IMPORTANT"]; self.comp_role[i, c] = 1
        self.CompDen = (self.Wc + self.Wi).sum(1); self.CompDen[self.CompDen == 0] = 1

        self.Wm = np.zeros((self.nf, 5)); self.CritM = np.zeros((self.nf, 5), bool)
        self.mil_role = np.zeros((self.nf, 5), np.int8)
        for i, f in enumerate(self.families):
            for j, s in enumerate(SUBTESTS):
                role = f["mil_rules"][s]["role"]
                self.Wm[i, j] = float(f["mil_rules"][s].get("weight") or mil_w.get(role, 0.0))
                self.CritM[i, j] = role == "CRITICAL"
                self.mil_role[i, j] = {"CRITICAL": 2, "IMPORTANT": 1}.get(role, 0)
        self.MilDen = self.Wm.sum(1); self.MilDen[self.MilDen == 0] = 1

        self.Wv = np.zeros((self.nf, len(self.v40))); self.rel = np.zeros((self.nf, len(self.v40)), np.int8)
        for i, f in enumerate(self.families):
            for code, r in f["v360_rules"].items():
                if r.get("use_mode") == "BASE" and r.get("relevance", 0) > 0:
                    self.Wv[i, vi[code]] = r["base_weight"] * r["relevance"]; self.rel[i, vi[code]] = r["relevance"]
        self.VDen = self.Wv.sum(1); self.VDen[self.VDen == 0] = 1

    # -- scoring ----------------------------------------------------------------------------
    def score(self, disc, mil, lvl, poles, v360):
        """Returns dict of (n, nf) arrays: absolute, pca_index, pca_route, comp, mil, per, v360, gate."""
        n = disc.shape[0]
        T = np.empty((n, 4, 3))
        T[:, :, 0] = disc; T[:, :, 1] = 100.0 - disc; T[:, :, 2] = np.maximum(0.0, 100.0 - 2.0 * np.abs(disc - 50.0))
        ar = np.arange(4)
        pca = np.full((n, self.nf), -1.0)
        for fi, dc, w in self.pca_routes:
            np.maximum(pca[:, fi], (T[:, ar, dc] * w).sum(1) / w.sum(), out=pca[:, fi])
        per = np.full((n, self.nf), -1.0)
        for fi, idx, w in self.per_routes:
            np.maximum(per[:, fi], (poles[:, idx] * w).sum(1) / w.sum(), out=per[:, fi])
        ac = np.minimum(100.0, lvl / 2.0 * 100.0); ai = np.minimum(100.0, lvl * 100.0)
        comp = (ac @ self.Wc.T + ai @ self.Wi.T) / self.CompDen
        milf = (mil @ self.Wm.T) / self.MilDen
        v = (v360 @ self.Wv.T) / self.VDen
        big = np.where(self.CritM[None, :, :], mil[:, None, :], 999.0)
        cmin = big.min(2); cmin[:, ~self.CritM.any(1)] = 999.0
        mgate = np.where(cmin <= 17, 2, np.where(cmin <= 37, 1, 0))
        bigc = np.where(self.CritC[None, :, :], lvl[:, None, :], 999.0)
        lmin = bigc.min(2); lmin[:, ~self.CritC.any(1)] = 999.0
        cgate = np.where(lmin == 0, 2, np.where(lmin == 1, 1, 0))
        pidx = self.w_disc * pca + self.w_comp * comp
        absolute = (self.w_fit["PCA"] * pidx + self.w_fit["MIL"] * milf
                    + self.w_fit["PERSONALITY"] * per + self.w_fit["VOCATIONAL_360"] * v)
        return {"absolute": absolute, "pca_index": pidx, "pca_route": pca, "comp": comp,
                "mil": milf, "per": per, "v360": v, "gate": np.maximum(mgate, cgate)}

    # -- generator --------------------------------------------------------------------------
    def generate(self, rng, fi, n, coherence):
        """n students built to be family fi's archetype, as the rules describe it."""
        f = self.families[fi]; k = coherence
        mu = 45 + k * np.where(self.rel[fi] == 3, 40, np.where(self.rel[fi] == 2, 25, 0))
        v360 = np.clip(rng.normal(mu, 9, (n, len(self.v40))), 0, 100)
        mm = 50 + k * np.where(self.mil_role[fi] == 2, 28, np.where(self.mil_role[fi] == 1, 12, 0))
        mil = np.clip(np.round(rng.normal(mm, 11, (n, 5))), 1, 99)
        P = {2: [.05, .25, .45, .25], 1: [.15, .45, .30, .10], 0: [.30, .40, .25, .05]}
        lvl = np.empty((n, 24))
        for c in range(24):
            lvl[:, c] = rng.choice([1, 2, 3, 4], size=n, p=P[int(self.comp_role[fi, c])])
        routes = [r for r in self.pca_routes if r[0] == fi]
        ri = rng.integers(0, len(routes), n)
        disc = np.empty((n, 4))
        for j in range(4):
            for r_, (_, dc, _) in enumerate(routes):
                m_ = ri == r_; c_ = int(m_.sum())
                if not c_:
                    continue
                d = dc[j]
                disc[m_, j] = (rng.uniform(50 + 30 * k, 60 + 35 * k, c_) if d == 0 else
                               rng.uniform(40 - 35 * k, 50 - 30 * k, c_) if d == 1 else rng.uniform(42, 58, c_))
        disc = np.clip(disc, 0, 100)
        proutes = f["personality_routes"]
        pi_ = rng.integers(0, len(proutes), n); poles = np.empty((n, 8))
        for dim, (a, b) in DIM_POLES.items():
            hi = np.empty(n); win = np.empty(n, np.int8)
            for r_, route in enumerate(proutes):
                m_ = pi_ == r_; c_ = int(m_.sum())
                if not c_:
                    continue
                rule = route["dimensions"].get(dim)
                if rule and rule.get("rule_type", "POLE") != "OPEN":
                    hi[m_] = np.clip(rng.normal(50 + 30 * k, 8, c_), 0, 100); win[m_] = POLE_INDEX[rule["preferred_pole"]]
                else:
                    hi[m_] = rng.uniform(45, 55, c_); win[m_] = POLE_INDEX[a]
            poles[np.arange(n), win] = hi
            other = np.where(win == POLE_INDEX[a], POLE_INDEX[b], POLE_INDEX[a])
            poles[np.arange(n), other] = 100 - hi
        return disc, mil, lvl, poles, v360


def load_reference_engine():
    spec = importlib.util.spec_from_file_location("formmaps_engine_reference", REFERENCE_ENGINE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def check_reference_fidelity(model, rng, samples=200):
    """Max |vectorised - reference| over `samples` random students x every family, through the
    reference engine's evaluate_owner with the rule set's own bundles."""
    ref = load_reference_engine()
    w = model.w_fit
    weights = ref.EngineWeights(pca=w["PCA"], mil=w["MIL"], personality=w["PERSONALITY"], vocational360=w["VOCATIONAL_360"],
                                disc_in_pca=model.w_disc, competencies_in_pca=model.w_comp)
    thr = ref.Thresholds()
    bundles = [resolved_bundle(model.rules, f) for f in model.families]
    worst = 0.0
    for _ in range(samples):
        fi = int(rng.integers(0, model.nf))
        d, m, l, p, v = model.generate(rng, fi, 1, float(rng.random()))
        assessment = {
            "pca": ref.PCAInput(*[float(x) for x in d[0]]),
            "competencies": {i + 1: int(l[0, i]) for i in range(24)},
            "mil": ref.MILInput(*[int(x) for x in m[0]]),
            "personality": ref.PersonalityInput(**{P: float(p[0, i]) for i, P in enumerate(POLES)}),
            "v360_aggregates": {c: {"score": float(v[0, i])} for i, c in enumerate(model.v40)},
        }
        ours = model.score(d, m, l, p, v)
        for j, b in enumerate(bundles):
            r = ref.evaluate_owner(assessment, b, weights, thr)
            worst = max(worst, abs(r["careerfit_absolute"] - ours["absolute"][0, j]),
                        abs(r["mil_fit"] - ours["mil"][0, j]), abs(r["personality_fit"] - ours["per"][0, j]),
                        abs(r["careerfit360"] - ours["v360"][0, j]), abs(r["pca_index"] - ours["pca_index"][0, j]))
    return worst
