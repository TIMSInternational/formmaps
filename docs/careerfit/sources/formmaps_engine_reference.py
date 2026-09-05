"""FORMMAPS CareerFit Rules Engine V1 - deterministic reference logic.

This file is a technology-neutral reference implementation in Python syntax.
It is NOT a production library. The production service must load every weight,
threshold and career rule from a versioned configuration store.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple, Any


class Gate(str, Enum):
    SATISFIED = "SATISFIED"
    CONDITIONED = "CONDITIONED"
    CRITICAL = "CRITICAL"


class Confidence(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    NOT_DETERMINABLE = "NOT_DETERMINABLE"


class Support(str, Enum):
    STRONG = "STRONG"
    PARTIAL = "PARTIAL"
    DIVERGENT = "DIVERGENT"


@dataclass(frozen=True)
class EngineWeights:
    mil: float = 0.25
    pca: float = 0.30
    personality: float = 0.15
    vocational360: float = 0.30
    disc_in_pca: float = 0.50       # PROVISIONAL
    competencies_in_pca: float = 0.50  # PROVISIONAL


@dataclass(frozen=True)
class Thresholds:
    strong_support_min: float = 70.0
    partial_support_min: float = 55.0
    consensus_high_min: float = 70.0
    consensus_medium_min: float = 40.0
    confidence_high_min: float = 75.0     # PROVISIONAL
    confidence_medium_min: float = 55.0   # PROVISIONAL
    confidence_consensus_weight: float = 0.70  # PROVISIONAL
    confidence_coverage_weight: float = 0.30   # PROVISIONAL


@dataclass
class PCAInput:
    D: float
    I: float
    S: float
    C: float


@dataclass
class MILInput:
    DC: int
    RZ: int
    VN: int
    MT: int
    OR: int


@dataclass
class PersonalityInput:
    E: float
    I: float
    S: float
    N: float
    T: float
    F: float
    J: float
    P: float
    type_code: Optional[str] = None


@dataclass
class RouteScore:
    route_id: str
    score: float
    components: Dict[str, float] = field(default_factory=dict)


@dataclass
class InstrumentResult:
    score: float
    gate: Optional[Gate] = None
    winning_route: Optional[str] = None
    evidence: Dict[str, Any] = field(default_factory=dict)


# ---------- Validation ----------

def require_range(name: str, value: float, lo: float, hi: float) -> None:
    if value is None or value < lo or value > hi:
        raise ValueError(f"{name} must be between {lo} and {hi}; got {value}")


def validate_inputs(pca: PCAInput, competencies: Dict[int, int], mil: MILInput,
                    personality: PersonalityInput) -> None:
    for name, value in pca.__dict__.items():
        require_range(f"PCA.{name}", value, 0, 100)
    if set(competencies.keys()) != set(range(1, 25)):
        raise ValueError("Competencies must contain IDs 1..24")
    for cid, level in competencies.items():
        require_range(f"competency[{cid}]", level, 0, 4)
    for name, value in mil.__dict__.items():
        require_range(f"MIL.{name}", value, 1, 99)
    for name in ["E","I","S","N","T","F","J","P"]:
        require_range(f"Personality.{name}", getattr(personality, name), 0, 100)


# ---------- PCA ----------

def pca_state(score: float) -> str:
    if score > 50:
        return "ACTIVE"
    if score < 50:
        return "PASSIVE"
    return "NEUTRAL"


def pca_intensity(score: float) -> float:
    return abs(score - 50.0) / 50.0 * 100.0


def pca_factor_match(score: float, direction: str) -> Optional[float]:
    if direction == "ACTIVE":
        return score
    if direction == "PASSIVE":
        return 100.0 - score
    if direction == "NEUTRAL":
        return max(0.0, 100.0 - 2.0 * abs(score - 50.0))
    if direction == "OPEN":
        return None
    raise ValueError(f"Unknown PCA direction: {direction}")


def weighted_mean(items: List[Tuple[float, float]]) -> Optional[float]:
    usable = [(v, w) for v, w in items if v is not None and w > 0]
    if not usable:
        return None
    denominator = sum(w for _, w in usable)
    return sum(v * w for v, w in usable) / denominator


def calculate_pca_route_fit(pca: PCAInput, route_rules: Dict[str, Dict[str, Any]]) -> RouteScore:
    components: Dict[str, float] = {}
    weighted: List[Tuple[float, float]] = []
    for factor in ["D", "I", "S", "C"]:
        rule = route_rules.get(factor, {"direction": "OPEN", "weight": 0})
        match = pca_factor_match(getattr(pca, factor), rule["direction"])
        if match is not None and rule.get("weight", 0) > 0:
            components[factor] = match
            weighted.append((match, float(rule["weight"])))
    score = weighted_mean(weighted)
    return RouteScore(route_id=route_rules["route_id"], score=score or 0.0, components=components)


def select_best_route(route_scores: List[RouteScore]) -> RouteScore:
    if not route_scores:
        raise ValueError("At least one route is required")
    return max(route_scores, key=lambda r: r.score)


# ---------- Competencies ----------

def competency_attainment(level: int, role: str, minimum_level: Optional[int] = None) -> float:
    if role == "CRITICAL":
        req = minimum_level if minimum_level is not None else 2
        return min(100.0, level / req * 100.0) if req > 0 else 100.0
    if role == "IMPORTANT":
        req = minimum_level if minimum_level is not None else 1
        return min(100.0, level / req * 100.0) if req > 0 else 100.0
    return 100.0


def calculate_competencies(levels: Dict[int, int], rules: List[Dict[str, Any]]) -> InstrumentResult:
    role_weight = {"CRITICAL": 3.0, "IMPORTANT": 2.0}
    weighted = []
    critical_gaps = []
    differentiators = []
    for rule in rules:
        cid = int(rule["competency_id"])
        role = rule["role"]
        level = levels[cid]
        if role in role_weight:
            att = competency_attainment(level, role, rule.get("minimum_level"))
            weighted.append((att, float(rule.get("weight") or role_weight[role])))
        if role == "CRITICAL" and level < int(rule.get("minimum_level") or 2):
            critical_gaps.append({"competency_id": cid, "level": level,
                                  "required": int(rule.get("minimum_level") or 2)})
        if role == "DIFFERENTIATOR" and level >= 3:
            differentiators.append({"competency_id": cid, "level": level})

    fit = weighted_mean(weighted) or 0.0
    critical_levels = [levels[int(r["competency_id"])] for r in rules if r["role"] == "CRITICAL"]
    if any(level == 0 for level in critical_levels):
        gate = Gate.CRITICAL
    elif any(level == 1 for level in critical_levels):
        gate = Gate.CONDITIONED
    else:
        gate = Gate.SATISFIED
    return InstrumentResult(score=fit, gate=gate,
                            evidence={"critical_gaps": critical_gaps,
                                      "differentiators": differentiators})


# ---------- MIL ----------

def mil_band(percentile: int) -> str:
    require_range("MIL percentile", percentile, 1, 99)
    if percentile <= 17:
        return "INSUFFICIENT"
    if percentile <= 37:
        return "LOW"
    if percentile <= 56:
        return "ADEQUATE"
    if percentile <= 81:
        return "EXCEEDS"
    return "EXCEPTIONAL"


def calculate_mil(mil: MILInput, rules: Dict[str, Dict[str, Any]]) -> InstrumentResult:
    default_weight = {"CRITICAL": 3.0, "IMPORTANT": 2.0, "COMPLEMENTARY": 1.0}
    weighted = []
    critical_scores = []
    components = {}
    for test in ["DC", "RZ", "VN", "MT", "OR"]:
        score = getattr(mil, test)
        role = rules[test]["role"]
        weight = float(rules[test].get("weight") or default_weight.get(role, 0.0))
        components[test] = {"percentile": score, "band": mil_band(score), "role": role, "weight": weight}
        if weight > 0:
            weighted.append((float(score), weight))
        if role == "CRITICAL":
            critical_scores.append(score)
    fit = weighted_mean(weighted) or 0.0
    if any(p <= 17 for p in critical_scores):
        gate = Gate.CRITICAL
    elif any(18 <= p <= 37 for p in critical_scores):
        gate = Gate.CONDITIONED
    else:
        gate = Gate.SATISFIED

    m = max(mil.DC, mil.RZ, mil.VN, mil.MT, mil.OR)
    relative = {t: getattr(mil, t) / m * 100.0 for t in ["DC", "RZ", "VN", "MT", "OR"]}
    return InstrumentResult(score=fit, gate=gate,
                            evidence={"components": components,
                                      "relative_strengths": relative,
                                      "learning_capacity_indicator": mil_band(mil.DC)})


# ---------- Personality ----------

def personality_dimension_match(p: PersonalityInput, dimension: str, preferred_pole: Optional[str]) -> Optional[float]:
    if preferred_pole in (None, "OPEN"):
        return None
    return float(getattr(p, preferred_pole))


def calculate_personality(personality: PersonalityInput, routes: List[Dict[str, Any]]) -> InstrumentResult:
    route_scores: List[RouteScore] = []
    for route in routes:
        weighted = []
        components = {}
        for dimension, rule in route["dimensions"].items():
            if rule.get("rule_type", "POLE") == "OPEN":
                continue
            match = personality_dimension_match(personality, dimension, rule.get("preferred_pole"))
            weight = float(rule.get("weight", 1.0))
            if match is not None and weight > 0:
                weighted.append((match, weight))
                components[dimension] = match
        route_scores.append(RouteScore(route["route_id"], weighted_mean(weighted) or 0.0, components))
    winner = select_best_route(route_scores)
    return InstrumentResult(score=winner.score, winning_route=winner.route_id,
                            evidence={"all_routes": [r.__dict__ for r in route_scores]})


# ---------- 360 ----------

def normalize_likert(response: Optional[int]) -> Optional[float]:
    if response is None:
        return None
    require_range("Likert response", response, 1, 5)
    return (response - 1) / 4.0 * 100.0


def integrate_sources(source_scores: Dict[str, Optional[float]], source_weights: Dict[str, float]) -> Dict[str, Any]:
    valid = {k: v for k, v in source_scores.items() if v is not None}
    if not valid:
        return {"score": None, "consensus": None, "coverage": 0.0, "valid_sources": 0}
    coverage = sum(source_weights[k] for k in valid)
    score = sum(valid[k] * source_weights[k] for k in valid) / coverage
    consensus = None
    if len(valid) >= 2:
        consensus = 100.0 - (max(valid.values()) - min(valid.values()))
    return {"score": score, "consensus": consensus, "coverage": coverage,
            "valid_sources": len(valid), "source_scores": valid}


def classify_consensus(consensus: Optional[float], thresholds: Thresholds) -> str:
    if consensus is None:
        return "NOT_DETERMINABLE"
    if consensus >= thresholds.consensus_high_min:
        return "HIGH"
    if consensus >= thresholds.consensus_medium_min:
        return "MEDIUM"
    return "LOW"


def confidence360(consensus: Optional[float], coverage: float, valid_sources: int,
                  thresholds: Thresholds) -> Dict[str, Any]:
    if valid_sources < 2 or consensus is None:
        return {"index": None, "label": Confidence.NOT_DETERMINABLE.value}
    idx = (thresholds.confidence_consensus_weight * consensus +
           thresholds.confidence_coverage_weight * coverage * 100.0)
    if idx >= thresholds.confidence_high_min:
        label = Confidence.HIGH.value
    elif idx >= thresholds.confidence_medium_min:
        label = Confidence.MEDIUM.value
    else:
        label = Confidence.LOW.value
    return {"index": idx, "label": label}


def calculate_careerfit360(aggregates: Dict[str, Dict[str, Any]], rules: Dict[str, Dict[str, Any]]) -> InstrumentResult:
    weighted = []
    evidence = {}
    relevant_consensus = []
    relevant_conf = []
    for code, rule in rules.items():
        if rule.get("use_mode") != "BASE" or rule.get("relevance", 0) <= 0:
            continue
        agg = aggregates.get(code)
        if not agg or agg.get("score") is None:
            continue
        base_weight = float(rule["base_weight"])
        relevance = float(rule["relevance"])
        combined_weight = base_weight * relevance
        weighted.append((float(agg["score"]), combined_weight))
        evidence[code] = {"score": agg["score"], "combined_weight": combined_weight}
        if agg.get("consensus") is not None:
            relevant_consensus.append((agg["consensus"], combined_weight))
        if agg.get("confidence_index") is not None:
            relevant_conf.append((agg["confidence_index"], combined_weight))
    fit = weighted_mean(weighted) or 0.0
    consensus = weighted_mean(relevant_consensus)
    confidence_index = weighted_mean(relevant_conf)
    return InstrumentResult(score=fit, evidence={"variables": evidence,
                                                  "consensus": consensus,
                                                  "confidence_index": confidence_index})


# ---------- Integration / Gates / Convergence ----------

def combine_pca(pca_route_fit: float, competency_fit: float, weights: EngineWeights) -> float:
    return weights.disc_in_pca * pca_route_fit + weights.competencies_in_pca * competency_fit


def combine_gates(*gates: Gate) -> Gate:
    severity = {Gate.SATISFIED: 0, Gate.CONDITIONED: 1, Gate.CRITICAL: 2}
    return max(gates, key=lambda g: severity[g])


def career_fit_absolute(pca_index: float, mil_fit: float, personality_fit: float,
                        career360_fit: float, weights: EngineWeights) -> float:
    return (weights.pca * pca_index + weights.mil * mil_fit +
            weights.personality * personality_fit + weights.vocational360 * career360_fit)


def evidence_support(score: float, thresholds: Thresholds) -> Support:
    if score >= thresholds.strong_support_min:
        return Support.STRONG
    if score >= thresholds.partial_support_min:
        return Support.PARTIAL
    return Support.DIVERGENT


def convergence_level(pca_fit: float, mil_fit: float, personality_fit: float,
                      fit360: float, fit360_confidence: str, thresholds: Thresholds) -> Dict[str, Any]:
    supports = {
        "PCA": evidence_support(pca_fit, thresholds),
        "MIL": evidence_support(mil_fit, thresholds),
        "PERSONALITY": evidence_support(personality_fit, thresholds),
        "360": evidence_support(fit360, thresholds),
    }
    if supports["360"] == Support.STRONG and fit360_confidence in (
        Confidence.LOW.value, Confidence.NOT_DETERMINABLE.value
    ):
        supports["360"] = Support.PARTIAL
    strong_count = sum(1 for s in supports.values() if s == Support.STRONG)
    level = {4: "VERY_HIGH", 3: "SOLID", 2: "PARTIAL"}.get(strong_count, "DIVERGENT")
    return {"level": level, "strong_count": strong_count,
            "supports": {k: v.value for k, v in supports.items()}}


def assign_relative_fit(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    ordered = sorted(results, key=lambda r: r["careerfit_absolute"], reverse=True)
    n = len(ordered)
    for idx, result in enumerate(ordered, start=1):
        result["rank_position"] = idx
        result["careerfit_relative"] = 100.0 if n == 1 else 100.0 * (n - idx) / (n - 1)
    return ordered


# ---------- Orchestrator contract ----------

def evaluate_owner(assessment: Dict[str, Any], resolved_rules: Dict[str, Any],
                   weights: EngineWeights, thresholds: Thresholds) -> Dict[str, Any]:
    """Evaluate one family/subfamily/career after inheritance+override resolution.

    resolved_rules must contain fully resolved PCA routes, competency rules,
    MIL rules, Personality routes, and 360 relevance rules. No VARIABLE or
    INHERIT markers should reach this function.
    """
    pca_routes = [calculate_pca_route_fit(assessment["pca"], r)
                  for r in resolved_rules["pca_routes"]]
    pca_winner = select_best_route(pca_routes)
    comp = calculate_competencies(assessment["competencies"], resolved_rules["competency_rules"])
    pca_index = combine_pca(pca_winner.score, comp.score, weights)

    mil = calculate_mil(assessment["mil"], resolved_rules["mil_rules"])
    personality = calculate_personality(assessment["personality"], resolved_rules["personality_routes"])
    v360 = calculate_careerfit360(assessment["v360_aggregates"], resolved_rules["v360_rules"])

    final_gate = combine_gates(comp.gate, mil.gate)
    absolute = career_fit_absolute(pca_index, mil.score, personality.score, v360.score, weights)

    conf_label = assessment.get("careerfit360_confidence", Confidence.NOT_DETERMINABLE.value)
    conv = convergence_level(pca_index, mil.score, personality.score, v360.score, conf_label, thresholds)

    return {
        "owner_type": resolved_rules["owner_type"],
        "owner_id": resolved_rules["owner_id"],
        "pca_route_fit": pca_winner.score,
        "pca_winning_route": pca_winner.route_id,
        "competency_fit": comp.score,
        "competency_gate": comp.gate.value,
        "pca_index": pca_index,
        "mil_fit": mil.score,
        "mil_gate": mil.gate.value,
        "mil_relative_strengths": mil.evidence["relative_strengths"],
        "personality_fit": personality.score,
        "personality_winning_route": personality.winning_route,
        "careerfit360": v360.score,
        "careerfit360_consensus": v360.evidence.get("consensus"),
        "careerfit360_confidence": conf_label,
        "final_gate": final_gate.value,
        "convergence_level": conv["level"],
        "convergence_detail": conv,
        "careerfit_absolute": absolute,
        "critical_gaps": comp.evidence.get("critical_gaps", []),
        "audit_inputs": {
            "pca_routes": [r.__dict__ for r in pca_routes],
            "mil": mil.evidence,
            "personality": personality.evidence,
            "v360": v360.evidence,
        }
    }
