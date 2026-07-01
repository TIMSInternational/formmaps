"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyNodeChanges, applyEdgeChanges, MarkerType,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
} from "@xyflow/react";
import { Input } from "@/components/ui/input";
import { Loader2, GitBranch, TriangleAlert, Search } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useSchoolCourses } from "@/hooks/useCurriculumQueries";
import { curriculumKeys } from "@/hooks/useCurriculumQueries";
import { updatePrerequisites } from "@/services/curriculumService";
import type { SchoolCourse } from "@/types/curriculum";
import {
  buildPathwayGraph, scopedPrereqChanges, wouldCreateCycle, edgeId, subgraphFromRoot,
  type CatalogCourse, type PathwayEdge,
} from "./pathwayGraph";
import { layoutTopDown } from "./layoutTopDown";
import { PathwayCanvas, COURSE_DRAG_MIME } from "./PathwayCanvas";

const EDGE_MARKER = { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#94a3b8" };

function toNode(c: SchoolCourse): Node {
  return {
    id: c.id,
    type: "pathwayCourse",
    position: { x: 0, y: 0 },
    data: {
      courseCode: c.code,
      label: c.name,
      department: c.department,
      gradeLevel: c.gradeLevels?.[0],
      credits: c.credits,
      isHonors: c.isHonors,
    },
  };
}

interface PathwayEditorProps {
  /** When set, seed only the forward-reachable subgraph from this root course. */
  rootCourseId?: string;
  /** Called from the in-editor Close button (dialog variant), after a dirty confirm. */
  onClose?: () => void;
  /** "dialog" shows the in-editor Close button; "page" relies on page chrome. */
  variant?: "dialog" | "page";
}

export function PathwayEditor({ rootCourseId, onClose, variant = "dialog" }: PathwayEditorProps) {
  const queryClient = useQueryClient();
  const { data: catalogData, isLoading, isError } = useSchoolCourses({ limit: 500 });

  const catalog = useMemo<SchoolCourse[]>(() => catalogData?.data ?? [], [catalogData]);
  const catalogCourses = useMemo<CatalogCourse[]>(
    () => catalog.map((c) => ({
      id: c.id, code: c.code, name: c.name, department: c.department,
      gradeLevels: c.gradeLevels, credits: c.credits,
      prerequisites: c.prerequisites, corequisites: c.corequisites,
    })),
    [catalog],
  );
  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);

  // The PUT endpoint replaces prerequisites+corequisites wholesale, so editing
  // against a partial catalog could silently wipe data — open read-only instead.
  const catalogIncomplete = !!catalogData && catalogData.total > catalog.length;
  const readOnly = catalogIncomplete;

  // The focused root course (page/per-pathway mode), for the header label.
  const rootCourse = rootCourseId ? byId.get(rootCourseId) : undefined;

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [deptFilter, setDeptFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const originalPrereqs = useRef<Record<string, string[]>>({});
  const seeded = useRef(false);

  // Seed graph once the catalog is loaded.
  useEffect(() => {
    if (seeded.current || !catalogData || catalog.length === 0) return;
    seeded.current = true;
    const built = buildPathwayGraph(catalogCourses);
    originalPrereqs.current = built.originalPrereqs;
    const rfEdgesAll: Edge[] = built.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: "prereq" }));

    let nodeSet: Set<string>;
    let rfEdges: Edge[];
    if (rootCourseId) {
      const sub = subgraphFromRoot(built.edges, rootCourseId);
      nodeSet = sub.nodeIds;
      rfEdges = rfEdgesAll.filter((e) => sub.edgeIds.has(e.id));
    } else {
      nodeSet = new Set(built.connectedIds);
      rfEdges = rfEdgesAll;
    }
    const initialNodes = catalog.filter((c) => nodeSet.has(c.id)).map(toNode);
    setNodes(layoutTopDown(initialNodes, rfEdges));
    setEdges(rfEdges);
  }, [catalogData, catalog, catalogCourses, rootCourseId]);

  const handleEdgeDelete = useCallback((id: string) => {
    setEdges((eds) => eds.filter((e) => e.id !== id));
  }, []);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (readOnly) return;
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, [readOnly]);

  const handleConnect = useCallback((c: Connection) => {
    if (readOnly || !c.source || !c.target) return;
    const source = c.source, target = c.target;
    setEdges((eds) => {
      if (source === target) { toast.error("A course can't be its own prerequisite"); return eds; }
      if (eds.some((e) => e.source === source && e.target === target)) {
        toast.error("That prerequisite already exists"); return eds;
      }
      const plain: PathwayEdge[] = eds.map((e) => ({ id: e.id, source: e.source, target: e.target }));
      if (wouldCreateCycle(plain, source, target)) {
        const a = byId.get(source)?.code ?? "that course";
        const b = byId.get(target)?.code ?? "this course";
        toast.error(`${b} is already required (directly or indirectly) by ${a} — this would create a loop`);
        return eds;
      }
      return [...eds, { id: edgeId(source, target), source, target, type: "prereq" }];
    });
  }, [readOnly, byId]);

  const handleDropCourse = useCallback((courseId: string, position: { x: number; y: number }) => {
    if (readOnly) return;
    const course = byId.get(courseId);
    if (!course) return;
    setNodes((nds) => {
      if (nds.some((n) => n.id === courseId)) return nds;
      return [...nds, { ...toNode(course), position }];
    });
  }, [readOnly, byId]);

  // Courses not currently on the canvas → side palette.
  const paletteCourses = useMemo(() => {
    const onCanvas = new Set(nodes.map((n) => n.id));
    const q = search.trim().toLowerCase();
    return catalog
      .filter((c) => !onCanvas.has(c.id))
      .filter((c) => !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [catalog, nodes, search]);

  const departments = useMemo(
    () => [...new Set(catalog.map((c) => c.department).filter(Boolean))].sort(),
    [catalog],
  );

  // Department focus: highlight a department's courses + their direct neighbors.
  const focusSet = useMemo(() => {
    if (deptFilter === "all") return null;
    const inDept = new Set(nodes.filter((n) => byId.get(n.id)?.department === deptFilter).map((n) => n.id));
    const set = new Set(inDept);
    for (const e of edges) {
      if (inDept.has(e.source)) set.add(e.target);
      if (inDept.has(e.target)) set.add(e.source);
    }
    return set;
  }, [deptFilter, nodes, edges, byId]);

  const displayNodes = useMemo(
    () => nodes.map((n) => (focusSet && !focusSet.has(n.id) ? { ...n, style: { opacity: 0.16 } } : { ...n, style: undefined })),
    [nodes, focusSet],
  );
  const displayEdges = useMemo(
    () => edges.map((e) => ({
      ...e,
      type: "prereq",
      markerEnd: EDGE_MARKER,
      data: { onDelete: readOnly ? undefined : handleEdgeDelete },
      style: focusSet && !(focusSet.has(e.source) && focusSet.has(e.target)) ? { opacity: 0.1 } : undefined,
    })),
    [edges, focusSet, readOnly, handleEdgeDelete],
  );

  // Bumped after a partial save commits some courses to the baseline ref, to
  // force pendingChanges to recompute (the baseline lives in a ref, not state).
  const [baselineVersion, setBaselineVersion] = useState(0);
  const pendingChanges = useMemo(() => {
    if (readOnly) return [];
    const plain: PathwayEdge[] = edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
    // Scope the diff to courses on the canvas and preserve any off-canvas
    // prerequisites of converging chains (see scopedPrereqChanges) so the
    // per-pathway editor never wipes prerequisites it didn't render.
    const onCanvas = new Set(nodes.map((n) => n.id));
    return scopedPrereqChanges(originalPrereqs.current, plain, catalogCourses, onCanvas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, nodes, catalogCourses, readOnly, baselineVersion]);
  const dirty = pendingChanges.length > 0;

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm("Discard unsaved changes to your pathways?")) return;
    onClose?.();
  }, [dirty, onClose]);

  const handleSave = useCallback(async () => {
    if (!dirty || readOnly || saving) return;
    setSaving(true);
    const results = await Promise.allSettled(
      pendingChanges.map((p) =>
        updatePrerequisites(p.courseId, {
          prerequisiteRules: [{ type: "AND", courseIds: p.courseIds }],
          corequisites: p.corequisites,
        }),
      ),
    );
    setSaving(false);
    queryClient.invalidateQueries({ queryKey: curriculumKeys.pathways() });
    queryClient.invalidateQueries({ queryKey: curriculumKeys.schoolCourses() });

    // Commit the courses that saved into the baseline so they stop showing as
    // dirty, and name the ones that failed so the admin knows what to retry.
    const failedCodes: string[] = [];
    results.forEach((r, i) => {
      const change = pendingChanges[i];
      if (r.status === "fulfilled") {
        originalPrereqs.current[change.courseId] = change.courseIds;
      } else {
        failedCodes.push(byId.get(change.courseId)?.code ?? change.courseId);
      }
    });
    setBaselineVersion((v) => v + 1);

    if (failedCodes.length === 0) {
      toast.success(`Saved ${pendingChanges.length} ${pendingChanges.length === 1 ? "course" : "courses"}`);
      if (variant === "dialog") onClose?.();
    } else {
      toast.error(`Couldn't save ${failedCodes.join(", ")} — left unchanged. Other changes were saved.`);
    }
  }, [dirty, readOnly, saving, pendingChanges, queryClient, onClose, byId, variant]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex flex-row items-center gap-3 px-5 py-3" style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
        <div className="flex items-center gap-2 mr-auto" style={{ color: "var(--admin-font-primary)", fontSize: 15, fontWeight: 600 }}>
          <GitBranch style={{ width: 17, height: 17, color: "#2E9098" }} />
          {rootCourse ? `Pathway: ${rootCourse.code} · ${rootCourse.name}` : "Pathway editor"}
        </div>
        <span className="sr-only">Drag between courses to set prerequisites. Pathways are derived from these edges.</span>

        {!isLoading && !readOnly && departments.length > 0 && (
          <select
            aria-label="Filter by department"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            style={{ height: 32, borderRadius: 6, fontSize: 12, padding: "0 8px", background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-secondary)" }}
          >
            <option value="all">All departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}

        {variant === "dialog" && (
          <button onClick={requestClose} style={{ height: 32, borderRadius: 6, padding: "0 14px", fontSize: 13, fontWeight: 500, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-secondary)", cursor: "pointer" }}>
            {dirty ? "Cancel" : "Close"}
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={!dirty || readOnly || saving}
          style={{
            height: 32, borderRadius: 6, padding: "0 18px", fontSize: 13, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 8, border: "none",
            background: !dirty || readOnly ? "var(--admin-bg-hover)" : "#2E9098",
            color: !dirty || readOnly ? "var(--admin-font-tertiary)" : "#fff",
            cursor: !dirty || readOnly || saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving && <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />}
          {dirty ? `Save ${pendingChanges.length}` : "Saved"}
        </button>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 style={{ width: 26, height: 26, color: "#2E9098", animation: "spin 1s linear infinite" }} />
        </div>
      ) : isError ? (
        <div className="flex-1 flex items-center justify-center">
          <p style={{ fontSize: 13, color: "#dc2626" }}>Failed to load your catalog.</p>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* Palette */}
          <aside className="flex flex-col" style={{ width: 240, borderRight: "1px solid var(--admin-border-default)" }}>
            <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
              <div className="relative">
                <Search style={{ width: 13, height: 13, position: "absolute", left: 8, top: 9, color: "var(--admin-font-tertiary)" }} />
                <Input
                  aria-label="Search courses to add"
                  placeholder="Add a course…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ height: 30, paddingLeft: 26, fontSize: 12, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <p style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", padding: "2px 4px" }}>
                {readOnly ? "COURSES" : "DRAG ONTO CANVAS"}
              </p>
              {paletteCourses.map((c) => (
                <div
                  key={c.id}
                  draggable={!readOnly}
                  onDragStart={(e) => { e.dataTransfer.setData(COURSE_DRAG_MIME, c.id); e.dataTransfer.effectAllowed = "move"; }}
                  title={c.name}
                  style={{
                    display: "flex", flexDirection: "column", gap: 1, padding: "6px 8px", borderRadius: 6,
                    border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)",
                    cursor: readOnly ? "default" : "grab",
                  }}
                >
                  <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "var(--admin-font-primary)" }}>{c.code}</span>
                  <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                </div>
              ))}
              {paletteCourses.length === 0 && (
                <p style={{ fontSize: 11, color: "var(--admin-font-tertiary)", padding: "8px 4px" }}>
                  {search ? "No matches" : "Every course is on the canvas"}
                </p>
              )}
            </div>
          </aside>

          {/* Canvas */}
          <div className="flex-1 flex flex-col min-w-0">
            {readOnly && (
              <div className="flex items-center gap-2" style={{ padding: "8px 12px", background: "rgba(217,119,6,0.08)", borderBottom: "1px solid rgba(217,119,6,0.3)" }}>
                <TriangleAlert style={{ width: 14, height: 14, color: "#d97706", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "#d97706" }}>
                  Your catalog is too large to load fully — the editor is read-only to avoid wiping prerequisites.
                </span>
              </div>
            )}
            <div className="flex-1 min-h-0">
              <PathwayCanvas
                nodes={displayNodes}
                edges={displayEdges}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                onConnect={handleConnect}
                onDropCourse={handleDropCourse}
                readOnly={readOnly}
                fitSignal={deptFilter}
                focusIds={focusSet ? [...focusSet] : undefined}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
