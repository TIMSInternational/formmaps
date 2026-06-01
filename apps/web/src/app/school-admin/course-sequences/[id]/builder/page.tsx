"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, addEdge, applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange, type NodeTypes,
  type EdgeTypes, Panel, BackgroundVariant, useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Save, Search, BookOpen, Plus, Loader2, Network,
} from "lucide-react";
import { toast } from "sonner";
import { useCourseSequenceDetail, useUpdateCourseSequence, useCreateCourseSequence } from "@/hooks/useCourseSequenceQueries";
import { useSchoolCourses, useUpdatePrerequisites } from "@/hooks/useCurriculumQueries";
import type { CourseSequenceNode, CourseSequenceEdge, SchoolCourse } from "@/types/curriculum";
import { CourseNode } from "@/app/school-admin/sequences/_components/CourseNode";
import { TriggerNode } from "@/app/school-admin/sequences/_components/TriggerNode";
import { DashedEdge } from "@/app/school-admin/sequences/_components/DashedEdge";
import { ConnectionLine } from "@/app/school-admin/sequences/_components/ConnectionLine";

// ── Node & Edge Type Maps ──
const nodeTypes: NodeTypes = {
  courseNode: CourseNode as any,
  trigger: TriggerNode as any,
};

const edgeTypes: EdgeTypes = {
  editable: DashedEdge as any,
};

// ── Reset ReactFlow default node styles (matches Twenty's StyledResetReactflowStyles) ──
const canvasResetCSS = `
  .react-flow__node {
    --xy-node-background-color: transparent;
    --xy-node-border: none;
    --xy-node-border-radius: 0;
    --xy-node-boxshadow-hover: none;
    --xy-node-boxshadow-selected: none;
    padding: 0 !important;
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
  }
  .react-flow__node-courseNode,
  .react-flow__node-trigger,
  .react-flow__node-course,
  .react-flow__node-input,
  .react-flow__node-default,
  .react-flow__node-output,
  .react-flow__node-group {
    padding: 0 !important;
    text-align: start;
    white-space: nowrap;
    width: auto;
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
  }
`;

// ── Top-down layout: arrange nodes by depth level, multiple nodes per level ──
const NODE_W = 200;
const NODE_H = 120;
const GAP_X = 60;
const GAP_Y = 180;

function layoutTopDown(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  // Build adjacency: source → targets
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of edges) {
    const list = children.get(e.source) || [];
    list.push(e.target);
    children.set(e.source, list);
    hasParent.add(e.target);
  }

  // Find roots (no incoming edges)
  const roots = nodes.filter((n) => !hasParent.has(n.id)).map((n) => n.id);
  if (roots.length === 0) roots.push(nodes[0].id);

  // BFS to assign levels
  const level = new Map<string, number>();
  const queue = [...roots];
  for (const r of roots) level.set(r, 0);
  while (queue.length) {
    const id = queue.shift()!;
    const lvl = level.get(id)!;
    for (const child of children.get(id) || []) {
      const existing = level.get(child) ?? -1;
      if (lvl + 1 > existing) level.set(child, lvl + 1);
      queue.push(child);
    }
  }
  // Assign unvisited nodes to level 0
  for (const n of nodes) if (!level.has(n.id)) level.set(n.id, 0);

  // Group by level
  const levels = new Map<number, string[]>();
  for (const [id, lvl] of level) {
    const list = levels.get(lvl) || [];
    list.push(id);
    levels.set(lvl, list);
  }

  // Position each level centered horizontally
  const maxLevel = Math.max(...levels.keys());
  const positioned = new Map<string, { x: number; y: number }>();

  // Find the widest level to use as centering reference
  let maxLevelWidth = 0;
  for (let lvl = 0; lvl <= maxLevel; lvl++) {
    const ids = levels.get(lvl) || [];
    const w = ids.length * NODE_W + (ids.length - 1) * GAP_X;
    if (w > maxLevelWidth) maxLevelWidth = w;
  }
  const centerX = maxLevelWidth / 2;

  for (let lvl = 0; lvl <= maxLevel; lvl++) {
    const ids = levels.get(lvl) || [];
    const totalW = ids.length * NODE_W + (ids.length - 1) * GAP_X;
    const startX = centerX - totalW / 2;
    ids.forEach((id, i) => {
      positioned.set(id, { x: startX + i * (NODE_W + GAP_X), y: 40 + lvl * GAP_Y });
    });
  }

  return nodes.map((n) => ({
    ...n,
    position: positioned.get(n.id) || n.position,
  }));
}

// ── Inner component (needs ReactFlowProvider) ──
function BuilderInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramId = params.id as string;
  const reactflow = useReactFlow();

  const [currentId, setCurrentId] = useState(paramId);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [sequenceName, setSequenceName] = useState("");
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [initialized, setInitialized] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const { data: detail, isLoading: detailLoading } = useCourseSequenceDetail(currentId);
  const { data: coursesData } = useSchoolCourses({ limit: 200, search: search || undefined });
  const updateSequence = useUpdateCourseSequence();
  const createSequence = useCreateCourseSequence();
  const updatePrerequisites = useUpdatePrerequisites();

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, []);

  useEffect(() => {
    if (initialized) return;
    // Wait for detail query to finish before deciding
    if (currentId !== "new" && detailLoading) {
      return;
    }


    // 1. Try loading from backend detail
    if (detail) {
      setSequenceName(detail.name);
      setBackedById(currentId);

      // If backend has nodes, use them
      if (detail.nodes?.length) {
        let parsedNodes: Node[] = detail.nodes.map((n: any) => ({
          id: n.id,
          type: n.type || "courseNode",
          position: n.position || { x: Number(n.positionX) || 0, y: Number(n.positionY) || 0 },
          data: {
            courseId: n.data?.courseId || n.courseId || "",
            courseCode: n.data?.courseCode || n.courseCode || "",
            courseName: n.data?.courseName || n.courseName || "",
            label: n.data?.courseName || n.data?.label || n.courseName || "",
            gradeLevel: n.data?.gradeLevel || n.gradeLevel || 0,
            credits: n.data?.credits || n.credits || 0,
            semester: n.data?.semester || "Fall",
            status: n.data?.status || "elective",
            onDelete: handleDeleteNode,
          },
        }));
        let parsedEdges: Edge[] = [];
        if (detail.edges?.length) parsedEdges = detail.edges.map((e: any) => ({
          id: e.id,
          source: e.source || e.sourceNodeId,
          target: e.target || e.targetNodeId,
          type: "editable", animated: false,
        }));
        // Auto-layout: apply top-down layout when edges exist
        if (parsedNodes.length > 1 && parsedEdges.length > 0) {
          parsedNodes = layoutTopDown(parsedNodes, parsedEdges);
        }
        setNodes(parsedNodes);
        setEdges(parsedEdges);
        setInitialized(true);
        return;
      }

      // Backend returned detail but with empty nodes — check localStorage cache
      const cacheKey = `sequence_cache_${currentId}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const data = JSON.parse(cached);
          if (data.nodes?.length) setNodes(data.nodes.map((n: any) => ({
            ...n, data: { ...n.data, onDelete: handleDeleteNode },
          })));
          if (data.edges?.length) setEdges(data.edges);
        } catch (e) {
        }
      }
      setInitialized(true);
      return;
    }

    // 2. For existing IDs where detail failed (404), try localStorage cache
    if (currentId !== "new" && !detail) {
      const cacheKey = `sequence_cache_${currentId}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const data = JSON.parse(cached);
          setSequenceName(data.name || "");
          if (data.nodes?.length) setNodes(data.nodes.map((n: any) => ({
            ...n, data: { ...n.data, onDelete: handleDeleteNode },
          })));
          if (data.edges?.length) setEdges(data.edges);
          setInitialized(true);
          return;
        } catch (e) {
        }
      }
      setInitialized(true);
      return;
    }

    // 3. New sequence
    if (currentId === "new") {
      const qName = searchParams.get("name");
      if (qName) setSequenceName(qName);
      if (searchParams.get("source") === "ai") {
        try {
          const aiData = JSON.parse(localStorage.getItem("ai_sequence_blueprint") || "{}");
          setSequenceName(aiData.name || "AI Generated");
          const remap: Record<number, string> = {};
          let aiNodes: Node[] = [];
          let aiEdges: Edge[] = [];
          if (aiData.nodes) {
            aiNodes = aiData.nodes.map((n: any, i: number) => {
              const nid = `node-${n.courseId}-${Date.now()}-${i}`;
              remap[i] = nid;
              return {
                id: nid, type: "courseNode",
                position: { x: 0, y: 0 }, // will be laid out below
                data: {
                  courseId: n.courseId, courseCode: n.courseCode,
                  courseName: n.courseName, label: n.courseName,
                  gradeLevel: n.gradeLevel || 9, credits: n.credits || 0,
                  semester: "Fall", status: "recommended", onDelete: handleDeleteNode,
                },
              };
            });
          }
          if (aiData.edges) {
            aiEdges = aiData.edges.map((e: any, i: number) => ({
              id: `edge-ai-${i}`,
              source: remap[e.sourceIndex] || e.sourceNodeId,
              target: remap[e.targetIndex] || e.targetNodeId,
              type: "editable", animated: false,
            })).filter((e: Edge) => e.source && e.target);
          }
          // Apply top-down layout
          setNodes(layoutTopDown(aiNodes, aiEdges));
          setEdges(aiEdges);
          localStorage.removeItem("ai_sequence_blueprint");
        } catch {}
      }
      setInitialized(true);
    }
  }, [initialized, detail, detailLoading, currentId, searchParams, handleDeleteNode]);

  // Auto-fit view after nodes are initialized
  useEffect(() => {
    if (initialized && nodes.length > 0) {
      setTimeout(() => reactflow.fitView({ padding: 0.3 }), 50);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized]);

  const onNodesChange = useCallback((c: NodeChange[]) =>
    setNodes((n) => applyNodeChanges(c, n)), []);
  const onEdgesChange = useCallback((c: EdgeChange[]) =>
    setEdges((e) => applyEdgeChanges(c, e)), []);
  const onConnect = useCallback((c: Connection) =>
    setEdges((e) => addEdge({ ...c, type: "editable", animated: false }, e)), []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const json = event.dataTransfer.getData("application/reactflow");
    if (!json) return;
    const course: SchoolCourse = JSON.parse(json);
    const position = reactflow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    setNodes((nds) => [...nds, {
      id: `node-${course.id}-${Date.now()}`, type: "courseNode",
      position: { x: position.x - 120, y: position.y - 25 },
      data: {
        courseId: course.id, courseCode: course.code,
        courseName: course.name, label: course.name,
        credits: course.credits, gradeLevel: course.gradeLevels?.[0] ?? 9,
        department: course.department,
        semester: "Fall", status: "elective", onDelete: handleDeleteNode,
      },
    }]);
  }, [handleDeleteNode, reactflow]);

  const [saving, setSaving] = useState(false);

  // Track whether this sequence has been saved to backend at least once
  const [backedById, setBackedById] = useState<string | null>(null);

  const handleSave = async () => {
    if (!sequenceName.trim()) { toast.error("Enter a name"); return; }
    if (saving) return;
    setSaving(true);

    // Build payload matching backend expectations
    const nodePayload = nodes.map((n, i) => {
      const d = n.data as any;
      return {
        courseId: d.courseId || d.id,
        courseCode: d.courseCode || d.code || "",
        courseName: d.courseName || d.name || d.label || "",
        gradeLevel: d.gradeLevel || (d.gradeLevels?.[0]) || 0,
        positionX: n.position.x,
        positionY: n.position.y,
      };
    });

    // Map node ReactFlow IDs to indices for edge references
    const nodeIdToIndex = new Map(nodes.map((n, i) => [n.id, i]));
    const edgePayload = edges.map((e) => ({
      sourceIndex: nodeIdToIndex.get(e.source),
      targetIndex: nodeIdToIndex.get(e.target),
      label: (e as any).label || "",
    })).filter(e => e.sourceIndex !== undefined && e.targetIndex !== undefined);

    const payload = {
      name: sequenceName,
      description: detail?.description || "",
      nodes: nodePayload,
      edges: edgePayload,
    };

    try {
      let savedId = currentId;

      if (backedById || (currentId !== "new")) {
        // Update existing sequence
        const id = backedById || currentId;
        await updateSequence.mutateAsync({ id, payload } as any);
        savedId = id;
      } else {
        // Brand new — POST create
        const result = await createSequence.mutateAsync(payload as any);
        savedId = (result as any).id;
      }

      setCurrentId(savedId);
      setBackedById(savedId);
      // Update URL so reopening uses the correct ID
      if (paramId === "new" && savedId !== "new") {
        router.replace(`/school-admin/course-sequences/${savedId}/builder`);
      }
      toast.success("Sequence saved!");
    } catch (err) {
      console.error("Save failed:", err);
      toast.error("Failed to save sequence");
    } finally {
      setSaving(false);
    }
  };

  const courses = useMemo(() =>
    (coursesData?.data ?? []).filter((c) =>
      (gradeFilter === "all" || c.gradeLevels?.includes(parseInt(gradeFilter))) &&
      !nodes.some((n) => n.data.courseId === c.id)
    ),
    [coursesData, gradeFilter, nodes],
  );

  if (detailLoading) return (
    <div className="flex flex-col h-screen p-6 space-y-4">
      <Skeleton className="h-10 w-64" style={{ background: "var(--admin-bg-hover)" }} />
      <Skeleton className="h-full w-full" style={{ background: "var(--admin-bg-hover)" }} />
    </div>
  );

  return (
    <div className="flex flex-col -mx-4 -mt-4 -mb-20 md:-mb-4 sm:-mx-6 sm:-mt-5 sm:-mb-5 lg:-mx-8 lg:-mt-6 lg:-mb-6" style={{
      height: "calc(100% + 40px)", overflow: "hidden",
    }}>
      <style>{canvasResetCSS}</style>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* ── Sidebar: Course Library ── */}
        <aside style={{
          width: 320, background: "var(--admin-bg-card)",
          borderRight: "1px solid var(--admin-border-default)",
          display: "flex", flexDirection: "column", zIndex: 10,
        }}>
          <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--admin-border-default)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <BookOpen style={{ width: 16, height: 16, color: "var(--admin-accent-blue, #065292)" }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>Course Library</span>
            </div>
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--admin-font-light)" }} />
                <Input placeholder="Search courses..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 rounded-lg text-sm"
                  style={{ background: "var(--admin-bg-input)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }} />
              </div>
              <Select value={gradeFilter} onValueChange={setGradeFilter}>
                <SelectTrigger className="h-9 rounded-lg text-sm" style={{ background: "var(--admin-bg-input)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}>
                  <SelectValue placeholder="All Grades" />
                </SelectTrigger>
                <SelectContent>
                  {["all", "9", "10", "11", "12"].map((g) => (
                    <SelectItem key={g} value={g}>{g === "all" ? "All Grades" : `Grade ${g}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div style={{
            padding: "8px 16px", borderBottom: "1px solid var(--admin-border-default)",
            background: "var(--admin-bg-hover)", textAlign: "center",
          }}>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--admin-font-tertiary)" }}>
              <Plus style={{ width: 10, height: 10, display: "inline", verticalAlign: "middle", marginRight: 4 }} />
              Drag courses to canvas
            </span>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 12 }} className="space-y-1.5">
            {courses.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--admin-font-tertiary)" }}>
                <BookOpen style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.3 }} />
                <div style={{ fontSize: 12 }}>No courses found</div>
              </div>
            )}
            {courses.map((course) => (
              <div key={course.id} draggable
                onDragStart={(e: React.DragEvent) => {
                  e.dataTransfer.setData("application/reactflow", JSON.stringify(course));
                  e.dataTransfer.effectAllowed = "move";
                }}
                style={{
                  padding: "8px 10px", borderRadius: 8, cursor: "grab",
                  background: "var(--admin-bg-card)",
                  border: "1px solid var(--admin-border-default)",
                  display: "flex", alignItems: "center", gap: 8,
                  transition: "border-color 0.1s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-default)"; }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 4, flexShrink: 0,
                  background: "var(--admin-bg-hover)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <BookOpen style={{ width: 13, height: 13, color: "var(--admin-font-tertiary)" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  <div style={{
                    fontSize: 10, fontWeight: 500, color: "var(--admin-font-tertiary)",
                    textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1,
                    marginBottom: 2,
                  }}>
                    {course.code}
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {course.name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ── React Flow Canvas ── */}
        <div ref={reactFlowWrapper} style={{
          flex: 1, height: "100%", position: "relative",
          overflow: "hidden",
        }}>
          <ReactFlow
            nodes={nodes.map((n) => ({ ...n, data: { ...n.data, onDelete: handleDeleteNode } }))}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ type: "editable", animated: false }}
            defaultViewport={{ x: 0, y: 80, zoom: 1 }}
            minZoom={0.3}
            maxZoom={1.5}
            panOnScroll
            selectNodesOnDrag={false}
            nodesDraggable
            nodesConnectable
            connectionLineComponent={ConnectionLine}
            connectionRadius={0}
            proOptions={{ hideAttribution: true }}
            paneClickDistance={10}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={2}
              color="var(--admin-border-default)"
            />

            {/* Top-left: Nav + Name + Save */}
            <Panel position="top-left">
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 14px", borderRadius: 8,
                background: "var(--admin-bg-card)",
                border: "1px solid var(--admin-border-default)",
              }}>
                <button onClick={() => router.push("/school-admin/course-sequences")}
                  style={{
                    width: 28, height: 28, borderRadius: 6,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "transparent", border: "none",
                    color: "var(--admin-font-light)", cursor: "pointer",
                  }}>
                  <ArrowLeft style={{ width: 16, height: 16 }} />
                </button>
                <div style={{ width: 1, height: 20, background: "var(--admin-border-default)" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 6,
                    background: "var(--admin-accent-blue, #065292)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Network style={{ width: 14, height: 14, color: "#fff" }} />
                  </div>
                  <Input value={sequenceName} onChange={(e) => setSequenceName(e.target.value)}
                    className="h-8 w-56 text-sm font-medium" placeholder="Sequence Name..."
                    style={{
                      background: "transparent", border: "1px solid transparent",
                      color: "var(--admin-font-primary)", borderRadius: 6,
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--admin-accent-blue, #065292)";
                      e.currentTarget.style.background = "var(--admin-bg-hover)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "transparent";
                      e.currentTarget.style.background = "transparent";
                    }}
                  />
                </div>
                <button onClick={handleSave}
                  disabled={saving}
                  style={{
                    height: 32, borderRadius: 6, padding: "0 14px",
                    display: "flex", alignItems: "center", gap: 6,
                    background: "var(--admin-accent-blue, #065292)", color: "#fff", border: "none",
                    cursor: "pointer", fontSize: 12, fontWeight: 600,
                    opacity: saving ? 0.7 : 1,
                  }}>
                  {saving
                    ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />
                    : <Save style={{ width: 12, height: 12 }} />}
                  Save
                </button>
              </div>
            </Panel>

            {/* Top-right: Stats */}
            <Panel position="top-right">
              <div style={{
                padding: "6px 12px", borderRadius: 6,
                background: "var(--admin-bg-card)",
                border: "1px solid var(--admin-border-default)",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 12, color: "var(--admin-font-tertiary)",
                }}>
                  <span><strong style={{ color: "var(--admin-font-primary)" }}>{nodes.length}</strong> courses</span>
                  <span style={{ color: "var(--admin-border-default)" }}>|</span>
                  <span><strong style={{ color: "var(--admin-font-primary)" }}>{edges.length}</strong> paths</span>
                </div>
              </div>
            </Panel>

            {/* Draft tag (bottom-left) */}
            <div style={{ position: "absolute", left: 16, bottom: 16, zIndex: 5 }}>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "4px 10px",
                borderRadius: 4,
                background: "var(--admin-accent-bg-amber, rgba(245,158,11,0.1))",
                color: "var(--admin-accent-amber, #f59e0b)",
                border: "1px solid var(--admin-accent-border-amber, rgba(245,158,11,0.15))",
              }}>
                Draft
              </span>
            </div>

            {/* Empty state */}
            {nodes.length === 0 && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 5 }}>
                <div style={{
                  padding: "32px 40px", borderRadius: 12, textAlign: "center",
                  background: "var(--admin-bg-card)",
                  border: "1px solid var(--admin-border-default)",
                  maxWidth: 380,
                }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: "50%",
                    background: "var(--admin-accent-bg-blue, rgba(59,130,246,0.08))",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 12px",
                  }}>
                    <Network style={{ width: 24, height: 24, color: "var(--admin-accent-blue, #065292)" }} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 6 }}>
                    Empty Sequence Map
                  </div>
                  <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", lineHeight: 1.5 }}>
                    Drag courses from the library to the canvas. Connect courses by dragging from the bottom handle of a prerequisite to the top of the next course.
                  </div>
                </div>
              </div>
            )}
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

// ── Main export ──
export default function CourseSequenceBuilderPage() {
  return (
    <ReactFlowProvider>
      <BuilderInner />
    </ReactFlowProvider>
  );
}
