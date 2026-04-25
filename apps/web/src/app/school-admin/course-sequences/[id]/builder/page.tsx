"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type NodeTypes,
  Panel,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Save,
  Search,
  BookOpen,
  Plus,
  Loader2,
  Info,
  Trash2,
  Network,
} from "lucide-react";
import { toast } from "sonner";
import { useCourseSequenceDetail, useUpdateCourseSequence, useCreateCourseSequence } from "@/hooks/useCourseSequenceQueries";
import { useSchoolCourses, useUpdatePrerequisites } from "@/hooks/useCurriculumQueries";
import type { CourseSequenceNode, CourseSequenceEdge, SchoolCourse } from "@/types/curriculum";

// ============================================
// Custom Node Component
// ============================================

type CourseNodeData = {
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  gradeLevel: number;
  semester: string;
  status: "required" | "elective" | "recommended";
  onDelete?: (id: string) => void;
};

const statusColors = {
  required: "bg-red-50 text-red-700 border-red-200/60 ring-1 ring-red-100",
  elective: "bg-blue-50 text-blue-700 border-blue-200/60 ring-1 ring-blue-100",
  recommended: "bg-emerald-50 text-emerald-700 border-emerald-200/60 ring-1 ring-emerald-100",
};

function CourseNode({ id, data }: { id: string; data: CourseNodeData }) {
  return (
    <div className="bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-xl hover:border-teal-300 min-w-[200px] max-w-[260px] group transition-all duration-300 overflow-hidden ring-1 ring-black/5">
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-slate-400 border-2 border-white"
      />
      <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 text-teal-600" />
          <span className="text-[13px] font-bold tracking-tight text-slate-700 truncate">{data.courseCode}</span>
        </div>
        <button
          onClick={() => data.onDelete?.(id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-slate-400 hover:text-red-500 hover:bg-red-50 p-1 rounded-md"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-4 py-3 space-y-3">
        <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">{data.courseName}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded-md">Gr {data.gradeLevel}</span>
          <span className="text-xs font-medium text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded-md">{data.credits} cr</span>
        </div>
        <div className="pt-1 border-t border-slate-50 flex justify-center">
          <Badge className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 ${statusColors[data.status]}`}>
            {data.status}
          </Badge>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-teal-500 border-2 border-white"
      />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  courseNode: CourseNode as any,
};

// ============================================
// Main Builder Page
// ============================================

export default function CourseSequenceBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sequenceId = params.id as string;

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [sequenceName, setSequenceName] = useState("");
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [initialized, setInitialized] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const { data: detail, isLoading: detailLoading } = useCourseSequenceDetail(sequenceId);
  const { data: coursesData } = useSchoolCourses({ limit: 200, search: search || undefined });
  const updateSequence = useUpdateCourseSequence();
  const createSequence = useCreateCourseSequence();
  const updatePrerequisites = useUpdatePrerequisites();

  // Initialize nodes/edges from saved data or AI generation
  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, []);

  useEffect(() => {
    if (initialized) return;

    if (detail) {
      setSequenceName(detail.name);
      if (detail.nodes?.length) {
        setNodes(
          detail.nodes.map((n: CourseSequenceNode) => ({
            id: n.id,
            type: "courseNode",
            position: n.position,
            data: { ...n.data, onDelete: handleDeleteNode },
          }))
        );
      }
      if (detail.edges?.length) {
        setEdges(
          detail.edges.map((e: CourseSequenceEdge) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            type: e.type ?? "smoothstep",
            animated: e.animated ?? true,
            style: { stroke: "#0d9488", strokeWidth: 2 },
          }))
        );
      }
      setInitialized(true);
    } else if (sequenceId === "new") {
      if (searchParams.get("source") === "ai") {
        const aiDataJson = localStorage.getItem("ai_sequence_blueprint");
        if (aiDataJson) {
          try {
            const aiData = JSON.parse(aiDataJson);
            setSequenceName(aiData.name || "AI Generated Sequence");
            
            // Map the Nodes
            const generatedNodes: Node[] = [];
            const nodeIdRemap: Record<number, string> = {};
            
            if (aiData.nodes) {
              aiData.nodes.forEach((n: any, idx: number) => {
                const newId = `node-${n.courseId}-${Date.now()}-${idx}`;
                nodeIdRemap[idx] = newId;
                generatedNodes.push({
                  id: newId,
                  type: "courseNode",
                  position: { x: Number(n.positionX) || 0, y: Number(n.positionY) || 0 },
                  data: {
                    courseId: n.courseId,
                    courseCode: n.courseCode,
                    courseName: n.courseName,
                    gradeLevel: n.gradeLevel || 9,
                    credits: n.credits || 0,
                    semester: "Fall",
                    status: "recommended", // default AI status
                    onDelete: handleDeleteNode,
                  }
                });
              });
              setNodes(generatedNodes);
            }
            
            // Map the Edges
            if (aiData.edges) {
              const generatedEdges: Edge[] = aiData.edges.map((e: any, idx: number) => {
                const sourceId = nodeIdRemap[e.sourceIndex] || e.sourceNodeId;
                const targetId = nodeIdRemap[e.targetIndex] || e.targetNodeId;
                return {
                  id: `edge-ai-${idx}-${Date.now()}`,
                  source: sourceId,
                  target: targetId,
                  type: "smoothstep",
                  animated: true,
                  style: { stroke: "#a855f7", strokeWidth: 2 }, // Purple for AI generated edges
                  label: e.label,
                };
              }).filter((e: Edge) => e.source && e.target);
              
              setEdges(generatedEdges);
            }

            // Clean up to prevent re-triggering
            localStorage.removeItem("ai_sequence_blueprint");
          } catch (e) {
            console.error("Failed to parse AI sequence view", e);
          }
        }
      }
      setInitialized(true);
    }
  }, [initialized, detail, sequenceId, searchParams, handleDeleteNode]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );
  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "smoothstep",
            animated: true,
            style: { stroke: "#0d9488", strokeWidth: 2 },
          },
          eds
        )
      ),
    []
  );



  // Drag a course from the sidebar panel onto the canvas
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const courseJson = event.dataTransfer.getData("application/reactflow");
      if (!courseJson) return;

      const course: SchoolCourse = JSON.parse(courseJson);
      const wrapper = reactFlowWrapper.current;
      if (!wrapper) return;

      const rect = wrapper.getBoundingClientRect();
      const position = {
        x: event.clientX - rect.left - 100,
        y: event.clientY - rect.top - 50,
      };

      const newNode: Node = {
        id: `node-${course.id}-${Date.now()}`,
        type: "courseNode",
        position,
        data: {
          courseId: course.id,
          courseCode: course.code,
          courseName: course.name,
          credits: course.credits,
          gradeLevel: course.gradeLevels?.[0] ?? 9,
          semester: "Fall",
          status: "elective",
          onDelete: handleDeleteNode,
        },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [handleDeleteNode]
  );

  const handleSave = () => {
    if (!sequenceName.trim()) { toast.error("Please enter a sequence name"); return; }

    const seqNodes: CourseSequenceNode[] = nodes.map((n) => ({
      id: n.id,
      type: n.type ?? "courseNode",
      data: n.data as CourseSequenceNode["data"],
      position: n.position,
    }));
    const seqEdges: CourseSequenceEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type ?? "smoothstep",
      animated: (e.animated as boolean | undefined) ?? true,
    }));

    const payload = {
      name: sequenceName,
      description: detail?.description,
      nodes: seqNodes,
      edges: seqEdges,
      columns: detail?.columns ?? [],
    };

    const syncPrereqs = async () => {
      const syncPromises: Promise<any>[] = [];
      
      seqNodes.forEach(node => {
        const courseId = node.data.courseId;
        const incomingEdges = seqEdges.filter(e => e.target === node.id);
        const requiredCourseIds = incomingEdges
          .map(e => seqNodes.find(n => n.id === e.source)?.data.courseId)
          .filter(Boolean) as string[];
          
        if (requiredCourseIds.length >= 0) {
          const promise = updatePrerequisites.mutateAsync({
            courseId, 
            payload: { prerequisiteRules: [{ type: "AND", courseIds: requiredCourseIds }], corequisites: [] }
          }).catch(err => {
            console.error("Prerequisite sync failed for course", courseId, err);
          });
          syncPromises.push(promise);
        }
      });
      
      if (syncPromises.length > 0) {
        toast.loading("Syncing course rules to backend...", { id: "prereq-sync" });
        await Promise.allSettled(syncPromises);
        toast.success("Sequence and prerequisites synced successfully!", { id: "prereq-sync" });
      }
    };

    if (sequenceId === "new") {
      createSequence.mutate(payload, {
        onSuccess: async (data) => {
          toast.success("Sequence created visually");
          await syncPrereqs();
          router.replace(`/school-admin/course-sequences/${data.id}/builder`);
        },
        onError: () => toast.error("Failed to create sequence"),
      });
    } else {
      updateSequence.mutate(
        {
          id: sequenceId,
          payload,
        },
        {
          onSuccess: async () => {
            toast.success("Sequence saved visually");
            await syncPrereqs();
          },
          onError: () => toast.error("Failed to save sequence"),
        }
      );
    }
  };

  const courses = (coursesData?.data ?? []).filter(
    (c) => (gradeFilter === "all" || c.gradeLevels?.includes(parseInt(gradeFilter))) && !nodes.some((n) => n.data.courseId === c.id)
  );

  if (detailLoading) {
    return (
      <div className="flex flex-col h-screen p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#f8fafc]">

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Course Panel Sidebar */}
        <aside className="w-80 bg-white/60 backdrop-blur-xl border-r border-slate-200/60 flex flex-col shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] z-10">
          <div className="p-5 border-b border-slate-200/60 space-y-4 bg-white/50">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 tracking-tight">
              <BookOpen className="h-5 w-5 text-teal-600" />
              Course Library
            </h3>
            <div className="space-y-3">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-teal-500 transition-colors" />
                <Input
                  placeholder="Search courses..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-10 w-full bg-slate-50/50 border-slate-200/80 rounded-xl focus-visible:ring-teal-500/20 focus-visible:border-teal-400 transition-all text-sm"
                />
              </div>
              <Select value={gradeFilter} onValueChange={setGradeFilter}>
                <SelectTrigger className="h-10 w-full bg-slate-50/50 border-slate-200/80 rounded-xl text-sm font-medium">
                  <SelectValue placeholder="All Grade Levels" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-xl border-slate-100">
                  <SelectItem value="all">All Grades</SelectItem>
                  {[9, 10, 11, 12].map((g) => (
                    <SelectItem key={g} value={String(g)}>Grade {g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="bg-gradient-to-b from-slate-50 to-white border-b border-slate-100 py-2.5 px-4 flex justify-center">
            <p className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 flex items-center gap-1.5">
              <Plus className="h-3 w-3" /> Drag courses to canvas
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
            {courses.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-3">
                <BookOpen className="h-8 w-8 text-slate-200" />
                <p className="text-sm font-medium">No courses found</p>
              </div>
            )}
            {courses.map((course) => (
              <div
                key={course.id}
                draggable
                onDragStart={(e: React.DragEvent) => {
                  e.dataTransfer.setData("application/reactflow", JSON.stringify(course));
                  e.dataTransfer.effectAllowed = "move";
                }}
                className="cursor-grab active:cursor-grabbing bg-white border border-slate-200/60 rounded-xl p-3 shadow-sm hover:shadow-md hover:border-teal-300 hover:ring-1 hover:ring-teal-500/10 transition-all duration-200 group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-1.5 py-0 text-[10px] rounded-sm font-mono tracking-tight">
                        {course.code}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-800 font-semibold leading-tight mb-1.5">{course.name}</p>
                    <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
                      <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {course.credits} cr</span>
                      <span>•</span>
                      <span>Gr {course.gradeLevels?.join(", ")}</span>
                    </div>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-slate-50 group-hover:bg-teal-50 group-hover:text-teal-600 text-slate-300 flex items-center justify-center shrink-0 transition-colors">
                    <Plus className="h-4 w-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="p-4 border-t border-slate-200/60 bg-slate-50/50 backdrop-blur-md">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Node Status Types</p>
            <div className="flex flex-wrap gap-2">
              {(["required", "elective", "recommended"] as const).map((s) => (
                <Badge key={s} className={`text-[10px] px-2 py-0.5 rounded-full ${statusColors[s]}`}>
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        </aside>

        {/* React Flow Canvas */}
        <div ref={reactFlowWrapper} className="flex-1 relative bg-slate-50/50">
          <ReactFlow
            nodes={nodes.map((n) => ({
              ...n,
              data: { ...n.data, onDelete: handleDeleteNode },
            }))}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            className="react-flow-premium"
            defaultEdgeOptions={{
              type: "smoothstep",
              animated: true,
              style: { stroke: "#0ea5e9", strokeWidth: 3, opacity: 0.6 },
            }}
          >
            <Background color="#cbd5e1" gap={24} size={2} className="opacity-60" />
            <Controls className="shadow-[0_8px_30px_rgb(0,0,0,0.12)] border-0 rounded-xl overflow-hidden m-6" />
            <MiniMap
              nodeColor={() => "#0ea5e9"}
              maskColor="rgba(248, 250, 252, 0.7)"
              className="shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-xl overflow-hidden border border-slate-200/60 m-6"
              zoomable={true}
              pannable={true}
            />
            <Panel position="top-right" className="m-6">
              <Card className="border border-slate-200/60 shadow-lg shadow-slate-200/50 text-sm bg-white/80 backdrop-blur-xl rounded-xl">
                <CardContent className="p-4 space-y-1.5">
                  <p className="font-bold text-slate-800 flex items-center gap-2">
                    <Network className="h-4 w-4 text-teal-500" />
                    Sequence Blueprint
                  </p>
                  <div className="flex items-center gap-4 text-slate-500 font-medium text-xs">
                    <span><strong className="text-slate-700">{nodes.length}</strong> courses</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span><strong className="text-slate-700">{edges.length}</strong> prerequisite paths</span>
                  </div>
                </CardContent>
              </Card>
            </Panel>

            <Panel position="top-left" className="m-6 z-50">
              <div className="flex items-center gap-4 px-4 py-3 bg-white/80 backdrop-blur-xl border border-slate-200/60 shadow-xl rounded-2xl">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
                  onClick={() => router.push("/school-admin/course-sequences")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="h-6 w-px bg-slate-200" />
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-md shadow-inner">
                    <Network className="h-4 w-4 text-white" />
                  </div>
                  <Input
                    value={sequenceName}
                    onChange={(e) => setSequenceName(e.target.value)}
                    className="h-8 w-64 font-bold text-base bg-transparent border-transparent hover:border-slate-200 focus:bg-white focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 transition-all rounded-lg px-2 -ml-2"
                    placeholder="Sequence Name..."
                  />
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 border-slate-200 text-slate-500 hover:text-teal-600 hover:border-teal-200 hover:bg-teal-50 rounded-lg transition-all"
                    title="Drag courses from the left panel onto the canvas. Connect two courses by dragging the edge dot from the bottom of a prerequisite course to another."
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={updateSequence.isPending}
                    className="h-8 px-4 rounded-lg bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white shadow-md active:scale-[0.98] border-0 text-sm"
                  >
                    {updateSequence.isPending ? (
                      <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3 mr-1.5" />
                    )}
                    <span className="font-semibold">Save</span>
                  </Button>
                </div>
              </div>
            </Panel>

            {nodes.length === 0 && (
              <Panel position="top-center" style={{ top: "140px" }} className="z-0">
                <motion.div
                  initial={{ opacity: 0, y: -20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl px-10 py-8 text-center border-2 border-dashed border-teal-200/60 max-w-md mx-auto"
                >
                  <div className="h-16 w-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Network className="h-8 w-8 text-teal-500" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-800 tracking-tight">Empty Sequence Map</h2>
                  <p className="text-sm font-medium text-slate-500 mt-2 leading-relaxed">
                    Drag courses from the library to the canvas. Connect courses by dragging lines from the bottom of a prerequisite course to the top of the next course.
                  </p>
                </motion.div>
              </Panel>
            )}
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
