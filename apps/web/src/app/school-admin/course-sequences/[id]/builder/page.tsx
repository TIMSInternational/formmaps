"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, addEdge, applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange, type NodeTypes,
  type EdgeTypes, Panel, BackgroundVariant, useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useCourseSequenceDetail, useUpdateCourseSequence, useCreateCourseSequence } from "@/hooks/useCourseSequenceQueries";
import { useSchoolCourses, useUpdatePrerequisites } from "@/hooks/useCurriculumQueries";
import type { SchoolCourse } from "@/types/curriculum";
import { CourseNode } from "@/app/school-admin/sequences/_components/CourseNode";
import { TriggerNode } from "@/app/school-admin/sequences/_components/TriggerNode";
import { DashedEdge } from "@/app/school-admin/sequences/_components/DashedEdge";
import { ConnectionLine } from "@/app/school-admin/sequences/_components/ConnectionLine";
import { CourseSidebar } from "./_components/CourseSidebar";
import { BuilderToolbar, CanvasStats, EmptyCanvasState } from "./_components/BuilderToolbar";
import { layoutTopDown } from "./_components/layoutTopDown";

// ── Node & Edge Type Maps ──
const nodeTypes: NodeTypes = {
  courseNode: CourseNode as any,
  trigger: TriggerNode as any,
};

const edgeTypes: EdgeTypes = {
  editable: DashedEdge as any,
};

// ── Reset ReactFlow default node styles ──
const canvasResetCSS = `.react-flow__node{--xy-node-background-color:transparent;--xy-node-border:none;--xy-node-border-radius:0;--xy-node-boxshadow-hover:none;--xy-node-boxshadow-selected:none;padding:0!important;background:transparent!important;border:none!important;box-shadow:none!important}.react-flow__node-courseNode,.react-flow__node-trigger,.react-flow__node-course,.react-flow__node-input,.react-flow__node-default,.react-flow__node-output,.react-flow__node-group{padding:0!important;text-align:start;white-space:nowrap;width:auto;background:transparent!important;border:none!important;box-shadow:none!important}`;


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
  const [saving, setSaving] = useState(false);
  const [backedById, setBackedById] = useState<string | null>(null);
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
    if (currentId !== "new" && detailLoading) return;

    if (detail) {
      setSequenceName(detail.name);
      setBackedById(currentId);

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
        if (parsedNodes.length > 1 && parsedEdges.length > 0) {
          parsedNodes = layoutTopDown(parsedNodes, parsedEdges);
        }
        setNodes(parsedNodes);
        setEdges(parsedEdges);
        setInitialized(true);
        return;
      }

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
                position: { x: 0, y: 0 },
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
          setNodes(layoutTopDown(aiNodes, aiEdges));
          setEdges(aiEdges);
          localStorage.removeItem("ai_sequence_blueprint");
        } catch {}
      }
      setInitialized(true);
    }
  }, [initialized, detail, detailLoading, currentId, searchParams, handleDeleteNode]);

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

  const handleSave = async () => {
    if (!sequenceName.trim()) { toast.error("Enter a name"); return; }
    if (saving) return;
    setSaving(true);

    const nodePayload = nodes.map((n) => {
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
        const id = backedById || currentId;
        await updateSequence.mutateAsync({ id, payload } as any);
        savedId = id;
      } else {
        const result = await createSequence.mutateAsync(payload as any);
        savedId = (result as any).id;
      }

      setCurrentId(savedId);
      setBackedById(savedId);
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
        <CourseSidebar
          courses={courses}
          search={search}
          onSearchChange={setSearch}
          gradeFilter={gradeFilter}
          onGradeFilterChange={setGradeFilter}
        />

        <div ref={reactFlowWrapper} style={{ flex: 1, height: "100%", position: "relative", overflow: "hidden" }}>
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
            <Background variant={BackgroundVariant.Dots} gap={20} size={2} color="var(--admin-border-default)" />

            <Panel position="top-left">
              <BuilderToolbar
                sequenceName={sequenceName}
                onSequenceNameChange={setSequenceName}
                onBack={() => router.push("/school-admin/course-sequences")}
                onSave={handleSave}
                saving={saving}
                nodeCount={nodes.length}
                edgeCount={edges.length}
              />
            </Panel>

            <Panel position="top-right">
              <CanvasStats nodeCount={nodes.length} edgeCount={edges.length} />
            </Panel>

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

            {nodes.length === 0 && <EmptyCanvasState />}
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
