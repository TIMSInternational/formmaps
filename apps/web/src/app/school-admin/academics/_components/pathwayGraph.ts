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

/** Forward-reachable subgraph from a root course id: the root plus every course
 *  that transitively requires it (follow source→target edges), and the edge ids
 *  whose both ends are inside that set. Used by the per-pathway editor page. */
export function subgraphFromRoot(
  edges: PathwayEdge[],
  rootId: string,
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.source);
    if (list) list.push(e.target);
    else adj.set(e.source, [e.target]);
  }
  const nodeIds = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const next of adj.get(cur) ?? []) {
      if (!nodeIds.has(next)) { nodeIds.add(next); stack.push(next); }
    }
  }
  const edgeIds = new Set<string>();
  for (const e of edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) edgeIds.add(e.id);
  }
  return { nodeIds, edgeIds };
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

/** Compute the PUT payloads for a canvas that may show only PART of the graph
 *  (the per-pathway/root-scoped editor). A downstream course on the canvas can
 *  have prerequisites that live OFF the canvas (a sibling chain converging on it);
 *  those edges aren't drawn. To avoid the wholesale-replacing PUT silently deleting
 *  them, we (a) detect changes using only the on-canvas portion of each course's
 *  prerequisites, and (b) re-append the off-canvas sources to each changed course's
 *  payload. When every prereq source is on the canvas (the all-pathways editor),
 *  the off-canvas set is empty and this reduces to a plain diffPrereqs. */
export function scopedPrereqChanges(
  originalPrereqs: Record<string, string[]>,
  edges: PathwayEdge[],
  courses: CatalogCourse[],
  onCanvasIds: Set<string>,
): Array<{ courseId: string; courseIds: string[]; corequisites: string[] }> {
  const scoped = courses.filter((c) => onCanvasIds.has(c.id));
  const scopedOriginal: Record<string, string[]> = {};
  for (const c of scoped) {
    scopedOriginal[c.id] = (originalPrereqs[c.id] ?? []).filter((src) => onCanvasIds.has(src));
  }
  return diffPrereqs(scopedOriginal, edges, scoped).map((d) => {
    const offCanvas = (originalPrereqs[d.courseId] ?? []).filter((src) => !onCanvasIds.has(src));
    return offCanvas.length ? { ...d, courseIds: [...d.courseIds, ...offCanvas] } : d;
  });
}
