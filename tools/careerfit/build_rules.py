"""Build the versioned CareerFit rule set (FM-CF-001) from the TIMS sources.

    python3 tools/careerfit/build_rules.py            # writes docs/careerfit/rules/<version>.json
    python3 tools/careerfit/build_rules.py --check    # exit 1 if the committed file differs

Everything in the output is derived from the two vendored TIMS files under docs/careerfit/sources
plus the REVIEWED DECISIONS in this module (QUALIFIER_MAP, MIL resolution rules, the personality
route drafts, the threshold recut). The build is deterministic: same sources + same decisions ==
byte-identical JSON, and CI re-runs it with --check so the committed rule set can never drift
from its derivation.

What the reference engine (formmaps_engine_reference.evaluate_owner) needs per family is a
fully RESOLVED rule bundle -- "No VARIABLE or INHERIT markers should reach this function" --
and the workbook does not supply one: sheet 04_MIL_LOGICA writes VAR / I_MIN / X/Y / INHERIT
markers for 12 of the 15 families, and sheet 02_PCA_LOGICA writes DISC archetypes as phrases.
This builder is where those become numbers, with the rule that produced each number written
next to it, so TIMS can ratify or overrule cell by cell.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from xlsx_reader import load  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
SOURCES = os.path.join(ROOT, "docs", "careerfit", "sources")
WORKBOOK = os.path.join(SOURCES, "FORMMAPS_Matriz_Maestra_Logica_Implementacion_V1.xlsx")
MODEL_CONFIG = os.path.join(SOURCES, "formmaps_model_config_v1.json")
RULES_DIR = os.path.join(ROOT, "docs", "careerfit", "rules")

RULES_VERSION = "1.0.0-draft.1"
FACTORS = ["D", "I", "S", "C"]
SUBTESTS = ["DC", "RZ", "VN", "MT", "OR"]

# ---------------------------------------------------------------------------------------------
# DECISION 1 -- DISC archetype phrases -> (direction, weight).
# Selected by tools/careerfit/select_qualifier_mapping.py (12-way archetype recovery on profiles
# sampled from the phrase semantics, never from an encoding). The only mapping that is injective
# on the sheet's 8 phrases -- every distinct phrase encodes distinctly, so no two archetypes
# collapse into a tie -- and within noise (0.3 pt) of the highest mean recovery. Under the
# "everything neutral is w2" reading that profiles.py used, DIRECTOR==COMERCIAL_TECNICO and
# ASESOR==SERVICIO_CLIENTE encode identically and the second of each pair can never win.
# ---------------------------------------------------------------------------------------------
QUALIFIER_MAP = {
    "Activo": ("ACTIVE", 2),
    "Pasivo": ("PASSIVE", 2),
    "Pasivo fuerte": ("PASSIVE", 3),
    "Activo/medio": ("ACTIVE", 1),
    "Pasivo/medio": ("PASSIVE", 1),
    "Neutral / cercano a 50": ("NEUTRAL", 3),
    "Neutral/medio": ("NEUTRAL", 2),
    "Neutral/activo": ("NEUTRAL", 1),
}

# Sheet 09 names its PCA routes in prose; the archetype catalogue (sheet 02) uses RouteIDs.
ROUTE_NAME_TO_ID = {
    "Técnico": "TECNICO",
    "Jefe Técnico": "JEFE_TECNICO",
    "Investigador": "INVESTIGADOR",
    "Creativo-Lógico": "CREATIVO_LOGICO",
    "Gerencial": "GERENCIAL",
    "Director": "DIRECTOR",
    "Administrativo": "ADMINISTRATIVO",
    "Comercial Técnico": "COMERCIAL_TECNICO",
    "Asesor": "ASESOR",
    "Servicio al Cliente": "SERVICIO_CLIENTE",
}

# ---------------------------------------------------------------------------------------------
# DECISION 2 -- MIL marker resolution (sheet 04 section D -> one role per subtest per family).
# Ordinal scale for the median rule: NOT_USED 0 < COMPLEMENTARY 1 < IMPORTANT 2 < CRITICAL 3.
# ---------------------------------------------------------------------------------------------
ROLE_OF = {"C": "CRITICAL", "I": "IMPORTANT", "CO": "COMPLEMENTARY"}
ROLE_RANK = {"NOT_USED": 0, "COMPLEMENTARY": 1, "IMPORTANT": 2, "CRITICAL": 3}
RANK_ROLE = {v: k for k, v in ROLE_RANK.items()}
VAR_DEFAULT_ROLE = "IMPORTANT"

# ---------------------------------------------------------------------------------------------
# DECISION 3 -- Personality routes. Sheet 09 gives only prose per family ("T suele sumar; S/N y
# J/P según especialidad; E/I abierto"). No deterministic parse exists, so these are a READING,
# carried over unchanged from the 2026-09-01/02 analysis session (the configuration behind the
# measured 95% top-1) and flagged for ratification. Each route: dimension -> (pole, weight).
# ---------------------------------------------------------------------------------------------
PERSONALITY_ROUTES = {
    1: [{"TF": ("T", 3), "SN": ("S", 2), "JP": ("J", 2)}, {"TF": ("T", 3), "SN": ("N", 2), "JP": ("P", 2)}],
    2: [{"SN": ("N", 3), "TF": ("T", 3), "JP": ("J", 2)}, {"SN": ("N", 3), "TF": ("T", 3), "JP": ("P", 2)}],
    3: [{"TF": ("T", 3), "SN": ("S", 2), "JP": ("J", 3)}, {"TF": ("T", 3), "SN": ("N", 2)}],
    4: [{"SN": ("S", 2), "JP": ("J", 3), "TF": ("T", 2)}, {"SN": ("N", 2), "JP": ("J", 3), "TF": ("F", 2)}],
    5: [{"SN": ("N", 3), "JP": ("P", 3)}, {"SN": ("N", 3), "JP": ("J", 2)}],
    6: [{"SN": ("N", 3), "TF": ("F", 3), "EI": ("E", 2)}, {"SN": ("N", 3), "TF": ("T", 3)}],
    7: [{"TF": ("F", 3)}, {"TF": ("T", 3), "SN": ("N", 2)}],
    8: [{"SN": ("S", 3), "JP": ("J", 3), "TF": ("F", 2)}, {"SN": ("S", 3), "JP": ("J", 3), "TF": ("T", 2)}],
    9: [{"TF": ("T", 3), "SN": ("N", 2), "JP": ("J", 2)}, {"TF": ("F", 3), "SN": ("S", 2), "JP": ("J", 2)}],
    10: [{"SN": ("N", 2), "TF": ("T", 2), "JP": ("P", 3)}, {"SN": ("S", 2), "TF": ("T", 2), "JP": ("J", 3)}],
    11: [{"SN": ("N", 3), "JP": ("P", 3), "TF": ("F", 2)}, {"SN": ("N", 3), "JP": ("P", 3), "TF": ("T", 2)}],
    12: [{"TF": ("F", 3), "EI": ("E", 2), "JP": ("J", 2)}, {"TF": ("F", 3), "EI": ("I", 2), "JP": ("J", 2)}],
    13: [{"SN": ("N", 3), "TF": ("F", 2)}, {"SN": ("N", 3), "TF": ("T", 2)}],
    14: [{"SN": ("S", 3), "TF": ("T", 3), "JP": ("J", 3)}],
}

# ---------------------------------------------------------------------------------------------
# DECISION 4 -- Convergence thresholds. The spec's strong>=70 / partial>=55 assume the instrument
# fits use the 0-100 scale; measured, they do not. recut_thresholds.py measures the per-instrument
# fit distributions on this rule set and prints the block that replaces this constant.
# ---------------------------------------------------------------------------------------------
THRESHOLDS = {
    "mil_bands": [
        {"name": "INSUFFICIENT", "min": 1, "max": 17},
        {"name": "LOW", "min": 18, "max": 37},
        {"name": "ADEQUATE", "min": 38, "max": 56},
        {"name": "EXCEEDS", "min": 57, "max": 81},
        {"name": "EXCEPTIONAL", "min": 82, "max": 99},
    ],
    "convergence": {
        # Reference-engine parity: formmaps_engine_reference.Thresholds takes ONE pair for all four
        # instruments. Kept at the spec's values so a reference run reproduces TIMS's numbers.
        "strong_min": 70,
        "partial_min": 55,
        # What the FormMaps engine should read (P2). Measured by recut_thresholds.py on this rule
        # set, 5,000 profiles x 14 families at coherence 0.75: partial_min = median fit on an
        # UNMATCHED family, strong_min = Youden cut matched-vs-unmatched. MIL is the exception --
        # matched 63.1 vs unmatched 62.0, capacity is not family-specific -- so it uses the
        # sheet's own bands on the weighted percentile mean: EXCEEDS = strong, ADEQUATE = partial.
        "per_instrument": {
            "PCA": {"strong_min": 88, "partial_min": 85, "provenance": "SIMULATED"},
            "MIL": {"strong_min": 57, "partial_min": 38, "provenance": "04_MIL_LOGICA section B bands"},
            "PERSONALITY": {"strong_min": 65, "partial_min": 60, "provenance": "SIMULATED"},
            "360": {"strong_min": 63, "partial_min": 57, "provenance": "SIMULATED"},
        },
    },
    "v360_consensus": {"high_min": 70, "medium_min": 40},
    "v360_confidence": {"consensus_weight": 0.7, "coverage_weight": 0.3, "high_min": 75, "medium_min": 55},
    # The simulated CareerFitAbsolute distribution this rule set produces (same run). The CI gate
    # holds a rebuilt rule set to it; the product must never present the raw number as a
    # percentage -- p1..p99 spans 20 points, and 74 (matched) vs 67 (unmatched) is the whole signal.
    "absolute_reference": {
        "mean": 67.15, "sd": 4.49, "p1": 56.9, "p5": 59.5, "p25": 64.1, "p50": 67.3, "p75": 70.3,
        "p95": 74.5, "p99": 76.9, "matched_mean": 74.14, "unmatched_mean": 66.61, "youden_cut": 70.9,
        "provenance": "SIMULATED coherence 0.75, seed 20260902",
    },
    "derivation": (
        "Spec pair (14_GATES_CONVERG B) retained for reference-engine parity; under it PCA reads STRONG for "
        "100% of matched and 95% of unmatched families (competency attainment saturates at ~98/93), MIL "
        "reads STRONG for 12%/9% (no family signal), 360 for 35%/2%. per_instrument recut with "
        "tools/careerfit/recut_thresholds.py; SIMULATED values are calibrated to the regression generator "
        "and must be re-cut on a real cohort (FM-CF-014)."
    ),
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def section(rows, header_first_cell):
    """Rows after the header row whose first cell == header_first_cell, until a blank/next section."""
    start = next(i for i, r in enumerate(rows) if r and r[0] == header_first_cell)
    header = rows[start]
    out = []
    for r in rows[start + 1:]:
        if not r or r[0] == "" or (isinstance(r[0], str) and len(r) == 1):
            break
        out.append(r)
    return header, out


def read_archetypes(sheets):
    header, rows = section(sheets["02_PCA_LOGICA"], "RouteID")
    arch = {}
    for r in rows:
        rid = r[0]
        factors = {}
        for j, f in enumerate(FACTORS):
            phrase = r[1 + j]
            direction, weight = QUALIFIER_MAP[phrase]
            factors[f] = {"direction": direction, "weight": weight, "source_text": phrase}
        arch[rid] = {"factors": factors, "vocational_use": r[5], "source": r[6]}
    assert len(arch) == 12, f"sheet 02 should carry 12 archetypes, got {len(arch)}"
    return arch


def read_master(sheets):
    header, rows = section(sheets["09_MATRIZ_MAESTRA"], "FamilyID")
    cols = {name: i for i, name in enumerate(header)}
    out = {}
    for r in rows:
        fid = int(r[cols["FamilyID"]])
        get = lambda c: r[cols[c]] if cols[c] < len(r) else ""
        out[fid] = {
            "name": get("FamilyName"),
            "pca_routes_text": get("PCA_Routes"),
            "comp_critical": get("Comp_Critical"),
            "comp_important": get("Comp_Important"),
            "comp_differentiators": get("Comp_Differentiators"),
            "mil": {s: str(get(f"MIL_{s}")) for s in SUBTESTS},
            "mil_note": get("MIL_Note"),
            "personality_rule": get("Personality_Rule"),
            "v360_central_text": get("360_Central"),
            "v360_important_text": get("360_Important"),
            "v360_modulators_text": get("360_Route_Modulators"),
            "inherit_occupation": str(get("Inherit_Occupation")).upper() == "TRUE",
            "notes": get("Family_Notes"),
        }
    assert len(out) == 15
    return out


def read_mil_markers(sheets):
    rows = sheets["04_MIL_LOGICA"]
    start = next(i for i, r in enumerate(rows) if r and r[0] == "ID" and "Familia" in r) + 1
    out = {}
    for r in rows[start:]:
        if not r or r[0] == "":
            break
        fid = int(r[0])
        out[fid] = {"markers": {s: str(r[2 + j]) for j, s in enumerate(SUBTESTS)}, "note": r[7]}
    assert len(out) == 15
    return out


def read_eng_subfamilies(sheets):
    header, rows = section(sheets["12_ING_SUBFAM"], "Subfamilia")
    out = []
    for r in rows:
        crit = [x.strip() for x in str(r[1]).split(";") if x.strip()]
        # "OR complementaria" appears inside the Importantes cell for Industrial
        imp_raw = [x.strip() for x in str(r[2]).split(";") if x.strip()]
        imp, comp = [], []
        for x in imp_raw:
            if "complementaria" in x.lower():
                comp.append(x.split()[0])
            elif "según" in x.lower():
                imp.append(x.split()[0])  # "OR según área" -> counted as IMPORTANT (present, unspecified)
            else:
                imp.append(x)
        roles = {}
        for s in SUBTESTS:
            roles[s] = ("CRITICAL" if s in crit else "IMPORTANT" if s in imp
                        else "COMPLEMENTARY" if s in comp else "NOT_USED")
        out.append({"name": r[0], "mil_roles": roles, "mil_critical_text": r[1],
                    "mil_important_text": r[2], "personality_text": r[3], "pca_routes_text": r[4]})
    assert len(out) == 12, f"expected 12 engineering subfamilies, got {len(out)}"
    return out


def read_v360_numeric(sheets):
    header, rows = section(sheets["10_360_RELEVANCIA"], "FamilyID")
    codes = header[2:]
    out = {}
    for r in rows:
        fid = int(r[0])
        out[fid] = {c: int(r[2 + j]) for j, c in enumerate(codes)}
    return out, codes


def read_comp_numeric(sheets):
    header, rows = section(sheets["11_COMP_FAMILIAS"], "FamilyID")
    cids = [int(h.split()[0][1:]) for h in header[2:]]
    names = {int(h.split()[0][1:]): h.split(" ", 1)[1] for h in header[2:]}
    out = {}
    for r in rows:
        fid = int(r[0])
        out[fid] = {cid: (r[2 + j] if 2 + j < len(r) else "") for j, cid in enumerate(cids)}
    return out, names


def parse_id_list(text):
    return [int(x) for x in str(text).replace(";", ",").split(",") if str(x).strip()]


def median_role(roles):
    ranks = sorted(ROLE_RANK[r] for r in roles)
    n = len(ranks)
    med = ranks[n // 2] if n % 2 else (ranks[n // 2 - 1] + ranks[n // 2]) / 2
    return RANK_ROLE[int(med + 0.5)]  # ties between two ranks round UP


def build():
    sheets = load(WORKBOOK)
    cfg = json.load(open(MODEL_CONFIG, encoding="utf-8"))
    arch = read_archetypes(sheets)
    master = read_master(sheets)
    markers = read_mil_markers(sheets)
    eng_sub = read_eng_subfamilies(sheets)
    v360_num, v360_codes = read_v360_numeric(sheets)
    comp_num, comp_names = read_comp_numeric(sheets)
    base_weight = {v["code"]: v["base_weight_360"] for v in cfg["vocational_360"]["variables"]}
    cfg_fam = {f["family_id"]: f for f in cfg["families"]}

    discrepancies = []
    families = []
    referenced_routes = {}

    for fid in sorted(master):
        m = master[fid]
        cf = cfg_fam[fid]
        scorable = not m["inherit_occupation"]

        # -- PCA routes (sheet 09 prose -> archetype ids) --
        route_ids = []
        if scorable:
            for name in [x.strip() for x in m["pca_routes_text"].split(";") if x.strip()]:
                rid = ROUTE_NAME_TO_ID[name]
                route_ids.append(rid)
                referenced_routes.setdefault(rid, []).append(fid)
            if route_ids != [ROUTE_NAME_TO_ID[x] for x in cf["pca_routes"]]:
                discrepancies.append({"family_id": fid, "field": "pca_routes",
                                      "sheet_09": route_ids, "model_config": cf["pca_routes"]})

        # -- competencies: sheet 09 lists vs sheet 11 grid; the grid is numeric truth --
        comp_rules = []
        if scorable:
            crit = parse_id_list(m["comp_critical"])
            imp = parse_id_list(m["comp_important"])
            dif = parse_id_list(m["comp_differentiators"])
            grid = comp_num[fid]
            grid_crit = sorted(c for c, v in grid.items() if v == "C")
            grid_imp = sorted(c for c, v in grid.items() if v == "I")
            grid_dif = sorted(c for c, v in grid.items() if v == "DIF")
            for label, a, b in (("critical", crit, grid_crit), ("important", imp, grid_imp),
                                ("differentiators", dif, grid_dif)):
                if sorted(a) != b:
                    discrepancies.append({"family_id": fid, "field": f"competencies.{label}",
                                          "sheet_09": sorted(a), "sheet_11": b})
            for c in grid_crit:
                comp_rules.append({"competency_id": c, "role": "CRITICAL", "minimum_level": 2})
            for c in grid_imp:
                comp_rules.append({"competency_id": c, "role": "IMPORTANT", "minimum_level": 1})
            for c in grid_dif:
                comp_rules.append({"competency_id": c, "role": "DIFFERENTIATOR"})

        # -- MIL: sheet 04 D markers (cross-checked against sheet 09) -> resolved roles --
        mil_rules = {}
        mk = markers[fid]["markers"]
        if mk != m["mil"]:
            discrepancies.append({"family_id": fid, "field": "mil_markers", "sheet_04": mk, "sheet_09": m["mil"]})
        if mk != {s: cf["mil"][s] for s in SUBTESTS}:
            discrepancies.append({"family_id": fid, "field": "mil_markers", "sheet_04": mk,
                                  "model_config": {s: cf["mil"][s] for s in SUBTESTS}})
        if scorable:
            for s in SUBTESTS:
                sub_roles = [sf["mil_roles"][s] for sf in eng_sub] if fid == 1 else None
                r = resolve_mil_with_sub(fid, mk[s], sub_roles)
                r["weight"] = cfg["weights"]["mil_role"][r["role"]]
                if sub_roles is not None:
                    r["subfamily_roles"] = {sf["name"]: sf["mil_roles"][s] for sf in eng_sub}
                mil_rules[s] = r

        # -- 360: sheet 10 numeric grid is the implementation source; sheet 09 prose checked --
        v360_rules = {}
        if scorable:
            grid = v360_num[fid]
            central_txt = [x.strip() for x in str(m["v360_central_text"]).split(",")]
            important_txt = [x.strip() for x in str(m["v360_important_text"]).split(",")]
            grid_central = sorted(c for c, v in grid.items() if v == 3)
            grid_important = sorted(c for c, v in grid.items() if v == 2)
            if sorted(central_txt) != grid_central or sorted(important_txt) != grid_important:
                discrepancies.append({"family_id": fid, "field": "v360_relevance",
                                      "sheet_09": {"central": central_txt, "important": important_txt},
                                      "sheet_10": {"central": grid_central, "important": grid_important}})
            for code in v360_codes:
                rel = grid[code]
                if rel > 0:
                    v360_rules[code] = {"use_mode": "BASE", "relevance": rel, "base_weight": base_weight[code]}

        # -- personality routes (reading; flagged) --
        p_routes = []
        if scorable:
            for i, dims in enumerate(PERSONALITY_ROUTES[fid], start=1):
                p_routes.append({
                    "route_id": f"F{fid:02d}_P{i}",
                    "dimensions": {d: {"rule_type": "POLE", "preferred_pole": pole, "weight": w}
                                   for d, (pole, w) in dims.items()},
                })

        fam = {
            "family_id": fid,
            "family_name": m["name"],
            "scorable": scorable,
            "inherit_occupation": m["inherit_occupation"],
            "pca_routes": route_ids,
            "competency_rules": comp_rules,
            "mil_rules": mil_rules,
            "mil_note": markers[fid]["note"],
            "personality_routes": p_routes,
            "personality_rule_text": m["personality_rule"],
            "v360_rules": v360_rules,
            "v360_route_modulators_text": m["v360_modulators_text"],
            "notes": m["notes"],
        }
        if fid == 1:
            fam["subfamilies"] = [{"name": sf["name"], "mil_roles": sf["mil_roles"],
                                   "pca_routes_text": sf["pca_routes_text"],
                                   "personality_text": sf["personality_text"]} for sf in eng_sub]
        families.append(fam)

    archetypes = {}
    for rid, a in arch.items():
        archetypes[rid] = {
            "factors": a["factors"],
            "vocational_use": a["vocational_use"],
            "source": a["source"],
            "referenced_by_families": referenced_routes.get(rid, []),
        }

    out = {
        "format_version": 1,
        "rules_version": RULES_VERSION,
        "status": "DRAFT_PENDING_TIMS_RATIFICATION",
        "model_version_basis": cfg["metadata"]["model_version"],
        "derived_from": {
            "workbook": {"file": os.path.basename(WORKBOOK), "sha256": sha256(WORKBOOK)},
            "model_config": {"file": os.path.basename(MODEL_CONFIG), "sha256": sha256(MODEL_CONFIG)},
            "builder": "tools/careerfit/build_rules.py",
            "reproduce": "python3 tools/careerfit/build_rules.py --check",
        },
        "weights": {
            "career_fit": cfg["weights"]["career_fit"],
            "pca_internal": {k: v for k, v in cfg["weights"]["pca_internal"].items() if k != "status"},
            "v360_sources": cfg["weights"]["v360_sources"],
            "relevance": cfg["weights"]["relevance"],
            "mil_role": cfg["weights"]["mil_role"],
            "competency_role": {k: v for k, v in cfg["weights"]["competency_role"].items() if k != "DIFFERENTIATOR"},
        },
        "thresholds": THRESHOLDS,
        "pca": {
            "qualifier_mapping": {p: {"direction": d, "weight": w} for p, (d, w) in QUALIFIER_MAP.items()},
            "match_formulas": cfg["pca"]["match_formulas"],
            "family_fit": cfg["pca"]["family_fit"],
            "archetypes": archetypes,
        },
        "competencies": [{"competency_id": c, "name": comp_names[c]} for c in sorted(comp_names)],
        "v360_variables": [{"code": v["code"], "base_weight": v["base_weight_360"]}
                           for v in cfg["vocational_360"]["variables"]],
        "families": families,
        "decisions": DECISIONS,
        "source_discrepancies": discrepancies,
        "open_questions": OPEN_QUESTIONS,
    }
    return out


def resolve_mil_with_sub(fid, marker, sub_roles):
    """resolve_mil with the subfamily roles threaded through (kept separate so resolve_mil's
    rule table reads top-down)."""
    m = marker.strip()
    if m in ROLE_OF:
        return {"role": ROLE_OF[m], "source_marker": m, "resolution": "LITERAL"}

    def var_role():
        if sub_roles:
            return median_role(sub_roles), "SUBFAMILY_MEDIAN"
        return VAR_DEFAULT_ROLE, "VAR_DEFAULT"

    tokens = [t.strip() for t in m.split("/")]
    if m == "I_MIN":
        base, how = var_role()
        role = RANK_ROLE[max(ROLE_RANK[base], ROLE_RANK["IMPORTANT"])]
        return {"role": role, "source_marker": m, "resolution": f"{how}+FLOOR_IMPORTANT"}
    if m == "VAR":
        role, how = var_role()
        return {"role": role, "source_marker": m, "resolution": how}
    if len(tokens) == 2:
        first, second = tokens
        if first == "VAR":
            role, how = var_role()
            return {"role": role, "source_marker": m, "resolution": f"FIRST_TOKEN({how})",
                    "subfamily_candidate": ROLE_OF[second]}
        return {"role": ROLE_OF[first], "source_marker": m, "resolution": "FIRST_TOKEN",
                "subfamily_candidate": ("VAR" if second == "VAR" else ROLE_OF[second])}
    raise ValueError(f"family {fid}: unknown MIL marker {m!r}")


DECISIONS = [
    {
        "id": "D1",
        "topic": "DISC archetype phrase -> (direction, weight)",
        "decision": "One mapping, a pure function of the phrase (pca.qualifier_mapping). Selected by "
                    "tools/careerfit/select_qualifier_mapping.py: the only candidate injective on the "
                    "sheet's 8 phrases, so no two archetypes encode identically; mean 12-way recovery "
                    "40.8% vs 41.1% best (noise), best at coherence 1.0 (72.4%), zero dead archetypes.",
        "consequence": "Under the previous draft (all Neutral phrases w2) DIRECTOR and COMERCIAL_TECNICO, and "
                       "ASESOR and SERVICIO_CLIENTE, were identical rules; the second of each pair could never "
                       "be a winning route. Bare Activo/Pasivo now weigh 2 and 'fuerte' 3, so route_factor_weight "
                       "expresses the sheet's intensity qualifier -- the engine has no other knob for it.",
        "requires_ratification": True,
        "source": "02_PCA_LOGICA rows 15-26; rule 'La distancia a 50 determina intensidad'",
    },
    {
        "id": "D2",
        "topic": "MIL markers -> roles (sheet 04 section D)",
        "decision": "Literal C/I/CO as written. 'X/Y' -> X at family level, Y recorded as subfamily_candidate "
                    "(the note in the same row says Y applies in named branches). 'VAR' -> the MEDIAN role "
                    "across the family's subfamilies when a subfamily sheet exists (only Ingeniería, sheet 12; "
                    "absent = NOT_USED, ties round up), else IMPORTANT. 'I_MIN' -> the same, floored at "
                    "IMPORTANT. 'INHERIT' -> family is not scorable (15).",
        "consequence": "Ingeniería resolves DC=C RZ=C VN=C MT=I OR=CO from its 12 subfamilies (DC critical in 7/12, "
                       "VN 8/12, RZ 12/12, MT important 12/12, OR critical 3 / important 2 / complementary 1 / "
                       "absent 6). Every family now has a non-null MIL fit; before, 12 of 15 carried an "
                       "unresolved marker and Ingeniería scored 0.0 on every profile.",
        "requires_ratification": True,
        "source": "04_MIL_LOGICA section D; 12_ING_SUBFAM",
    },
    {
        "id": "D3",
        "topic": "Personality routes",
        "decision": "Two POLE routes per family (one for Formación Técnica) read off sheet 09 Personality_Rule "
                    "prose; carried from the analysis session unchanged. Personality never gates (sheet 05).",
        "consequence": "This is a reading, not a derivation; it is the block the ablation found least "
                       "decisive (6.8% of #1 changes).",
        "requires_ratification": True,
        "source": "09_MATRIZ_MAESTRA Personality_Rule; 05_PERSONALITY",
    },
    {
        "id": "D4",
        "topic": "Numeric sheets win over prose",
        "decision": "360 relevance from sheet 10 and competency roles from sheet 11 (both numeric); sheet 09 "
                    "prose is cross-checked and every disagreement is listed in source_discrepancies.",
        "requires_ratification": False,
        "source": "10_360_RELEVANCIA header: 'La implementación debe usar ... las matrices numéricas'",
    },
    {
        "id": "D5",
        "topic": "Convergence thresholds",
        "decision": "Per-instrument thresholds (thresholds.convergence.per_instrument) replace the spec's single "
                    "70/55 pair, which never binds for PCA and cannot bind for MIL; MIL uses the official MIL bands. "
                    "The single pair is kept for reference-engine parity. See thresholds.derivation.",
        "consequence": "Convergence counts become meaningful: under the recut PCA is STRONG for 85% matched / 29% "
                       "unmatched, Personality 93%/36%, 360 90%/19%, MIL 85%/81% (capacity, not family). Values "
                       "marked SIMULATED are calibrated to the generator, not to students.",
        "requires_ratification": True,
        "source": "14_GATES_CONVERG section B; tools/careerfit/recut_thresholds.py",
    },
    {
        "id": "D6",
        "topic": "Family 15 (Ruta Alternativa) and unreferenced archetypes",
        "decision": "Family 15 is carried with scorable=false: every rule is INHERIT and sheet 09 says "
                    "\"No calcular 'No estudiar' como carrera\". CALL_CENTER and VENDEDOR_TECNICO are in the "
                    "archetype catalogue but referenced by no family's PCA_Routes; kept for occupation-level "
                    "inheritance, unused by V1 family scoring.",
        "requires_ratification": False,
        "source": "09_MATRIZ_MAESTRA row 15; 02_PCA_LOGICA",
    },
]

OPEN_QUESTIONS = [
    "Norming population of the MIL percentiles and DISC scales (adult HR vs adolescent) -- highest consequence; "
    "no mention of norma/baremo/muestra/población/edad across the 7 documents.",
    "Ratify D1-D3 and D5 cell by cell.",
    "Exact CmpNom strings for the 24 competencies, and the rule when fewer than 24 return (spec says 422).",
    "Which DISC graph feeds the engine (AssessmentProfile.cs: graph 2; useTimsQueries.ts: graph 1).",
    "Does P35 (student's own ranking) enter the score at 0.10?",
    "Rounding and persistence precision for §25 byte-equivalent determinism.",
    "Which confidence gates the 360 'strong' test -- global, or the relevance-weighted index.",
    "Family 14's 360 central set (sheet 09 prose vs sheet 10 numeric, see source_discrepancies) and family 15's inheritance source.",
    "Unequal MIL ceilings: a perfect raw score reaches P100 on DC/VN/OR but P99 on RZ and P95 on MT.",
]


def render(rules):
    return json.dumps(rules, ensure_ascii=False, indent=2) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="fail if the committed file differs from a fresh build")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    rules = build()
    text = render(rules)
    path = args.out or os.path.join(RULES_DIR, f"careerfit-rules.v{RULES_VERSION}.json")
    if args.check:
        committed = open(path, encoding="utf-8").read() if os.path.exists(path) else None
        if committed != text:
            print(f"DRIFT: {os.path.relpath(path, ROOT)} does not match a fresh build; run the builder and commit")
            sys.exit(1)
        print(f"OK: {os.path.relpath(path, ROOT)} is reproducible from its sources")
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"wrote {os.path.relpath(path, ROOT)} ({len(text):,} bytes, {len(rules['families'])} families, "
          f"{len(rules['source_discrepancies'])} source discrepancies)")


if __name__ == "__main__":
    main()
