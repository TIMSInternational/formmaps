// Pure graph logic for the pathway visual editor. Edges model the prerequisite
// relation: an edge source→target means "source is a prerequisite of target"
// (take source before target), matching the derived pathway chain direction.
// No React / React Flow imports here so this stays unit-testable.

export interface CatalogCourse {
  id: string;
  code: string;
  name: string;
  department: string;
  gradeLevels?: number[];
  credits?: number;
  prerequisites?: string[];
  corequisites?: string[];
}

export interface PathwayEdge {
  id: string;
  source: string;
  target: string;
}

export interface BuiltGraph {
  edges: PathwayEdge[];
  /** course ids that appear on at least one edge (either end) */
  connectedIds: string[];
  /** course ids with no edges — shown in the side palette */
  paletteIds: string[];
  /** courseId → resolved prerequisite course ids (the load-time baseline for diffing) */
  originalPrereqs: Record<string, string[]>;
}

const norm = (code: string) => code.trim().toUpperCase();

export function edgeId(source: string, target: string): string {
  return `${source}__${target}`;
}

/** Build nodes/edges from the catalog. Prereq codes are resolved (trim+upper)
 *  against the catalog; codes with no matching course are dropped (out-of-catalog). */
export function buildPathwayGraph(courses: CatalogCourse[]): BuiltGraph {
  const byCode = new Map<string, CatalogCourse>();
  for (const c of courses) byCode.set(norm(c.code), c);

  const edges: PathwayEdge[] = [];
  const originalPrereqs: Record<string, string[]> = {};
  const onEdge = new Set<string>();

  for (const course of courses) {
    const resolved: string[] = [];
    for (const raw of course.prerequisites ?? []) {
      const prereq = byCode.get(norm(raw));
      if (!prereq || prereq.id === course.id) continue;
      if (resolved.includes(prereq.id)) continue; // de-dupe
      resolved.push(prereq.id);
      edges.push({ id: edgeId(prereq.id, course.id), source: prereq.id, target: course.id });
      onEdge.add(prereq.id);
      onEdge.add(course.id);
    }
    originalPrereqs[course.id] = resolved;
  }

  const connectedIds = courses.filter((c) => onEdge.has(c.id)).map((c) => c.id);
  const paletteIds = courses.filter((c) => !onEdge.has(c.id)).map((c) => c.id);

  return { edges, connectedIds, paletteIds, originalPrereqs };
}

/** Would adding edge source→target create a cycle? True if target already
 *  reaches source by following prerequisite edges, or if it's a self-edge. */
export function wouldCreateCycle(edges: PathwayEdge[], source: string, target: string): boolean {
  if (source === target) return true;
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.source);
    if (list) list.push(e.target);
    else adj.set(e.source, [e.target]);
  }
  const stack = [target];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === source) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of adj.get(cur) ?? []) stack.push(next);
  }
  return false;
}

/** Compute the set of courses whose prerequisite set changed vs the baseline,
 *  returning the PUT payload pieces for each (corequisites echoed back so the
 *  wholesale-replacing endpoint doesn't drop them). */
export function diffPrereqs(
  original: Record<string, string[]>,
  edges: PathwayEdge[],
  courses: CatalogCourse[],
): Array<{ courseId: string; courseIds: string[]; corequisites: string[] }> {
  // draft prereq sets keyed by target course
  const draft = new Map<string, string[]>();
  for (const e of edges) {
    const list = draft.get(e.target);
    if (list) { if (!list.includes(e.source)) list.push(e.source); }
    else draft.set(e.target, [e.source]);
  }

  const key = (ids: string[]) => [...ids].sort().join("|");
  const out: Array<{ courseId: string; courseIds: string[]; corequisites: string[] }> = [];

  for (const course of courses) {
    const before = original[course.id] ?? [];
    const after = draft.get(course.id) ?? [];
    if (key(before) === key(after)) continue;
    out.push({
      courseId: course.id,
      courseIds: after,
      corequisites: course.corequisites ?? [],
    });
  }
  return out;
}
