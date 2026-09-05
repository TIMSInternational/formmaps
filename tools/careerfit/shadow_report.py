#!/usr/bin/env python3
"""FM-CF-013 shadow comparison report generator.

WHAT IT DOES. Reads an export of ``careerfit_shadow_comparisons`` -- one JSON object per line --
and writes the markdown report the manifest's validation asks for: rank correlation, top-3 overlap,
and a breakdown of disagreements BY CAUSE.

WHAT IT DELIBERATELY DOES NOT DO. It does not compute a single metric of its own. Spearman's rho,
the top-3 overlap and every cause classification are computed ONCE, in
``CareerFitShadowComparator`` (services/api/src/FormMaps.Application/CareerFit/Shadow), and stored on
the row; this script counts and summarises them. A second implementation of the metric in Python
would be a second definition of the answer, and the first thing that would happen is that the two
would disagree and nobody would know which was right. It also does not connect to a database: an
export is produced deliberately, by a human, with the command in the runbook, so that nothing about
producing a report can touch a production system by accident.

THE EXPORT. Produce it with (the runbook carries this too):

    psql "$DATABASE_URL" -At -c "
      COPY (
        SELECT json_build_object(
                 'user_id',            \"userId\",
                 'school_id',          \"schoolId\",
                 'comparable',         \"comparable\",
                 'primary_cause',      \"primaryCause\",
                 'spearman_rho',       \"spearmanRho\",
                 'top_three_overlap',  \"topThreeOverlap\",
                 'rules_version',      \"rulesVersion\",
                 'comparator_version', \"comparatorVersion\",
                 'projection_version', \"projectionVersion\",
                 'disc_graph',         \"discGraph\",
                 'legacy_observed_at', \"legacyObservedAt\",
                 'created_at',         \"createdAt\",
                 'engine_ranking',     \"engineRanking\",
                 'legacy_ranking',     \"legacyRanking\",
                 'delta',              \"disagreements\")
        FROM \"careerfit_shadow_comparisons\"
        ORDER BY \"createdAt\"
      ) TO STDOUT" > cohort.ndjson

SYNTHETIC INPUT IS LABELLED AUTOMATICALLY. A cohort whose user ids are all ``synthetic-*`` gets a
banner saying so at the top of its own report, and the flag cannot be turned off. The only report
committed to this repository today is generated from
``docs/careerfit/shadow/synthetic-shadow-cohort.ndjson`` -- a fixture produced by the real
comparator from CONSTRUCTED pairs -- because this job has never been run against real students.

Usage:
    python3 tools/careerfit/shadow_report.py                       # the committed synthetic fixture
    python3 tools/careerfit/shadow_report.py --input cohort.ndjson --out docs/careerfit/report.md
"""

from __future__ import annotations

import argparse
import collections
import json
import os
import statistics
import sys
from typing import Any

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_INPUT = os.path.join(REPO_ROOT, "docs", "careerfit", "shadow", "synthetic-shadow-cohort.ndjson")
DEFAULT_OUTPUT = os.path.join(REPO_ROOT, "docs", "careerfit", "careerfit-shadow-report.md")

# Ordered most-diagnostic-last: the report reads top to bottom and UNEXPLAINED is the line a reader
# is looking for. Kept in step with CareerFitShadowCause by SHADOW_CAUSE_HELP's own test in C#.
CAUSE_ORDER = [
    "AGREEMENT",
    "LEGACY_ABSENT",
    "LEGACY_LOCKED",
    "ENGINE_NOT_SCORABLE",
    "DISC_GRAPH_MISMATCH",
    "TAXONOMY_UNMAPPED",
    "TAXONOMY_NO_LEGACY_EVIDENCE",
    "TIE",
    "INPUT_COVERAGE",
    "NAME_JOIN",
    "UNEXPLAINED",
]

CAUSE_HELP = {
    "AGREEMENT": "the two rankings agree within the comparator's threshold",
    "LEGACY_ABSENT": "the student has no cached legacy answer at all -- nothing to compare",
    "LEGACY_LOCKED": "legacy answered `locked` (assessments incomplete) -- nothing to compare",
    "ENGINE_NOT_SCORABLE": "legacy scored the student and the ENGINE refused to: an instrument fail-closed. "
    "The population the port would refuse to serve on the day of the flip",
    "DISC_GRAPH_MISMATCH": "the run was scored on a DISC graph other than graph 1, which legacy is fed. "
    "Comparing it would measure the graph, not the port",
    "TAXONOMY_UNMAPPED": "the legacy cluster -> family projection could not land evidence on enough families. "
    "A gap in the PROJECTION, not in either engine",
    "TAXONOMY_NO_LEGACY_EVIDENCE": "the engine ranks the family in its top 3 and no legacy career projects onto it: "
    "legacy expressed no opinion. Also the projection's coverage",
    "TIE": "the family's rank is not determinate on one side, so the delta is a tie-break artefact",
    "INPUT_COVERAGE": "the family scores a competency the student's PCA report did not carry, defaulted to level 0. "
    "A DATA gap",
    "NAME_JOIN": "as INPUT_COVERAGE, but the competency is missing because a PRINTED NAME joins no catalogue entry. "
    "A DATA defect in the report, repaired in the name table",
    "UNEXPLAINED": "full legacy evidence, no tie, every competency this family scores actually measured. "
    "**The only bucket that may indicate a port defect.**",
}


def load(path: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with open(path, encoding="utf-8") as handle:
        for number, line in enumerate(handle, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as error:
                raise SystemExit(f"{path}:{number}: not a JSON object ({error})") from error
    if not rows:
        raise SystemExit(f"{path}: no rows. An empty export is not a report.")
    return rows


def one_value(rows: list[dict[str, Any]], key: str) -> str:
    """A version stamp every row must agree on.

    Rows measured under two comparators or two projections describe two different questions, and
    averaging them would produce a number that is wrong rather than stale. The report refuses
    instead of silently reporting the mixture -- split the export and generate two reports.
    """
    values = sorted({str(row.get(key)) for row in rows})
    if len(values) > 1:
        raise SystemExit(
            f"The export mixes {len(values)} values of {key} ({', '.join(values)}). "
            "These are different measurements; split the export and report them separately."
        )
    return values[0]


def is_synthetic(rows: list[dict[str, Any]]) -> bool:
    return all(str(row.get("user_id", "")).startswith("synthetic-") for row in rows)


def family_causes(rows: list[dict[str, Any]]) -> collections.Counter:
    counter: collections.Counter = collections.Counter()
    for row in rows:
        for disagreement in (row.get("delta") or {}).get("disagreements", []):
            counter[disagreement.get("cause", "?")] += 1
    return counter


def unmapped_clusters(rows: list[dict[str, Any]]) -> collections.Counter:
    counter: collections.Counter = collections.Counter()
    for row in rows:
        for cluster in (row.get("delta") or {}).get("unmapped_clusters", []):
            counter[cluster] += 1
    return counter


def deflated_instruments(rows: list[dict[str, Any]]) -> collections.Counter:
    counter: collections.Counter = collections.Counter()
    for row in rows:
        for instrument in (row.get("delta") or {}).get("uniformly_deflated_instruments", []):
            counter[instrument] += 1
    return counter


def notes(rows: list[dict[str, Any]]) -> list[tuple[str, str]]:
    return [
        (str(row.get("user_id")), (row.get("delta") or {})["note"])
        for row in rows
        if (row.get("delta") or {}).get("note")
    ]


def describe(values: list[float]) -> str:
    if not values:
        return "no comparable pairs"
    if len(values) == 1:
        return f"{values[0]:+.3f} (one pair)"
    return (
        f"mean {statistics.fmean(values):+.3f}, median {statistics.median(values):+.3f}, "
        f"min {min(values):+.3f}, max {max(values):+.3f}, sd {statistics.stdev(values):.3f}"
    )


def render(rows: list[dict[str, Any]], source: str) -> str:
    synthetic = is_synthetic(rows)
    comparable = [row for row in rows if row.get("comparable")]
    rhos = sorted(float(row["spearman_rho"]) for row in comparable if row.get("spearman_rho") is not None)
    overlaps = [int(row["top_three_overlap"]) for row in comparable if row.get("top_three_overlap") is not None]

    pair_causes = collections.Counter(row.get("primary_cause", "?") for row in rows)
    per_family = family_causes(rows)
    unmapped = unmapped_clusters(rows)
    deflated = deflated_instruments(rows)

    out: list[str] = []
    add = out.append

    add("# CareerFit shadow comparison — engine vs legacy `/careers/score`")
    add("")
    add("<!-- GENERATED by tools/careerfit/shadow_report.py. Do not hand-edit; regenerate. -->")
    add("")

    if synthetic:
        add("> **THIS REPORT IS GENERATED FROM SYNTHETIC INPUT. IT IS NOT A MEASUREMENT.**")
        add("> Every row in it comes from a constructed pair in")
        add("> `docs/careerfit/shadow/synthetic-shadow-cohort.ndjson`, produced by the real comparator")
        add("> (`SyntheticShadowCohortTests`) from students that do not exist. The numbers below describe")
        add("> **the classifier's behaviour on inputs whose answer is known by construction**. They say")
        add("> nothing whatsoever about whether the ported engine agrees with the legacy scorer.")
        add("> The shadow job has **never been run against real students** — see “What would be needed”.")
        add("")

    add(f"Source: `{os.path.relpath(source, REPO_ROOT)}` · {len(rows)} rows")
    add("")
    add("| stamp | value |")
    add("| --- | --- |")
    add(f"| rules version | `{one_value(rows, 'rules_version')}` |")
    add(f"| comparator version | `{one_value(rows, 'comparator_version')}` |")
    add(f"| projection version | `{one_value(rows, 'projection_version')}` |")
    add("")

    # ---------------------------------------------------------------- the two metrics
    add("## The two metrics")
    add("")
    add(f"- **Cohort:** {len(rows)} students looked at; **{len(comparable)} comparable** "
        f"({len(rows) - len(comparable)} not, broken down below).")
    add(f"- **Rank correlation (Spearman ρ, tie-corrected midranks, over the families both sides ranked):** "
        f"{describe(rhos)}.")
    if overlaps:
        distribution = collections.Counter(overlaps)
        add(f"- **Top-3 overlap:** mean {statistics.fmean(overlaps):.2f} of 3 — "
            + ", ".join(f"{distribution.get(n, 0)} pair(s) at {n}/3" for n in (3, 2, 1, 0))
            + ".")
    else:
        add("- **Top-3 overlap:** no comparable pairs.")
    add("")
    add("**Why these two and not an index delta.** 360 is not seeded (FM-CF-006 is blocked on TIMS) and")
    add("personality can be absent, so up to 45% of the model's weight can be constant across every")
    add("family. `CareerFitAbsolute` is therefore uniformly *deflated*, and its distance from a legacy")
    add("0–100 `totalScore` measures the missing instruments rather than the port. A constant applied to")
    add("every family cannot reorder them, so the **ordering** survives what the values do not. Raw index")
    add("deltas are not a comparable quantity here, and the shadow table has no column for one.")
    add("")

    # ---------------------------------------------------------------- causes
    add("## Disagreements by cause")
    add("")
    add("Every difference is classified, because in this cohort most differences are known in advance")
    add("**not** to be port defects. `UNEXPLAINED` is the only bucket that may indicate one.")
    add("")
    add("### Pair-level verdict (one per student)")
    add("")
    add("| cause | students | what it means |")
    add("| --- | ---: | --- |")
    for cause in CAUSE_ORDER:
        if pair_causes.get(cause):
            add(f"| `{cause}` | {pair_causes[cause]} | {CAUSE_HELP[cause]} |")
    for cause, count in sorted(pair_causes.items()):
        if cause not in CAUSE_ORDER:
            add(f"| `{cause}` | {count} | **unknown to this generator — a newer comparator wrote it** |")
    add("")
    add("### Family-level classification (one per disagreeing family)")
    add("")
    if per_family:
        add("| cause | families | what it means |")
        add("| --- | ---: | --- |")
        for cause in CAUSE_ORDER:
            if per_family.get(cause):
                add(f"| `{cause}` | {per_family[cause]} | {CAUSE_HELP[cause]} |")
        add("")
        unexplained = per_family.get("UNEXPLAINED", 0)
        total = sum(per_family.values())
        add(f"**{unexplained} of {total}** classified disagreements are `UNEXPLAINED` "
            f"({unexplained / total:.0%}). That is the number to investigate; the rest are accounted for by")
        add("the data or by the comparison's own limits.")
    else:
        add("No family-level disagreement reached the comparator's threshold.")
    add("")

    # ---------------------------------------------------------------- limits
    add("## What limits this comparison")
    add("")
    add("### The legacy cluster → family projection")
    add("")
    add("The two engines do not score the same unit: legacy ranks ~370 individual **programs**, each")
    add("tagged with a cluster; the .NET engine ranks **14 families** and has no catalogue at all. The")
    add("comparison therefore runs through")
    add("`services/api/src/FormMaps.Application/CareerFit/Data/careerfit-shadow-projection.v0.json`.")
    if unmapped:
        add("")
        add("Clusters this export met that the projection does not assign — the work list for completing it:")
        add("")
        add("| cluster | students affected |")
        add("| --- | ---: |")
        for cluster, count in unmapped.most_common():
            add(f"| `{cluster}` | {count} |")
    else:
        add("")
        add("No unmapped cluster appears in this export.")
    add("")

    if deflated:
        add("### Instruments that contributed a constant to every family")
        add("")
        add("These deflate every `CareerFitAbsolute` by the same term. They are **not** a per-family cause —")
        add("a constant cannot reorder families, and recording them per family would let a real port defect")
        add("hide behind the largest caveat in the project — but every number above is measured under them.")
        add("")
        add("| instrument | students |")
        add("| --- | ---: |")
        for instrument, count in deflated.most_common():
            add(f"| `{instrument}` | {count} |")
        add("")

    engine_notes = notes(rows)
    if engine_notes:
        add("### Students legacy could score and the engine could not")
        add("")
        for user_id, note in engine_notes:
            add(f"- `{user_id}` — {note}")
        add("")

    # ---------------------------------------------------------------- honesty
    add("## What this is not")
    add("")
    if synthetic:
        add("**It is not a comparison of the two engines.** No real student has been through this job.")
        add("This repository has no production database access and no local database holds a real student,")
        add("so what has been proven is the machinery: the classifier answers correctly on pairs whose")
        add("answer is known by construction, the row it writes is the row the report reads, and the two")
        add("metrics are computed once and only once.")
        add("")
        add("### What would be needed to produce a real one")
        add("")
        add("1. **Complete the projection.** `GET /api/v1/careers/clusters` (or `SELECT DISTINCT cluster`")
        add("   over the legacy catalogue) against a legacy environment gives the cluster vocabulary, which")
        add("   is not in this repository. Assign each cluster a family, have TIMS review the assignment,")
        add("   bump `projection_version`. Until then every scorable pair comes back `TAXONOMY_UNMAPPED`.")
        add("2. **Apply the schema.** `careerfit-shadow-tables.sql` then `dotnet-service-role.sql`, in that")
        add("   order (docs/migration/sql-apply-runbook.md).")
        add("3. **Run the job** against a real cohort, under a credential whose RLS scope covers the")
        add("   students being measured — `ICareerFitShadowRunner.MeasureAsync` per student, invoked by an")
        add("   operator. It is deliberately mounted on no route.")
        add("4. **Export and regenerate** this report from the real rows. The synthetic banner disappears")
        add("   on its own, because it keys on the user ids.")
        add("")
        add("It is a **human gate**, not an oversight: running a scoring job across real students' data is")
        add("not something an automated agent should do on its own initiative.")
    else:
        add("This report is generated from a real export. Read the caveats above before quoting any number:")
        add("the projection is a judgement about careers, the absent instruments deflate every index, and")
        add("only `UNEXPLAINED` is evidence about the port.")
    add("")
    add("---")
    add("")
    add("Regenerate: `python3 tools/careerfit/shadow_report.py --input <export.ndjson> --out <path>`.")
    add("")
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", default=DEFAULT_INPUT, help="NDJSON export of careerfit_shadow_comparisons")
    parser.add_argument("--out", default=DEFAULT_OUTPUT, help="markdown report to write ('-' for stdout)")
    arguments = parser.parse_args(argv)

    rows = load(arguments.input)
    report = render(rows, arguments.input)

    if arguments.out == "-":
        sys.stdout.write(report)
    else:
        os.makedirs(os.path.dirname(os.path.abspath(arguments.out)), exist_ok=True)
        with open(arguments.out, "w", encoding="utf-8") as handle:
            handle.write(report)
        print(f"wrote {arguments.out} ({len(rows)} rows, "
              f"{sum(1 for r in rows if r.get('comparable'))} comparable)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
