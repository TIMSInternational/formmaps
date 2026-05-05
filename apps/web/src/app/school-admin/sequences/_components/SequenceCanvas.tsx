"use client";

import { useCallback } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, addEdge,
  useNodesState, useEdgesState,
  type Connection, type Node, type Edge, type NodeTypes, type EdgeTypes,
  BackgroundVariant, Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CourseNode } from "./CourseNode";
import { TriggerNode } from "./TriggerNode";
import { DashedEdge } from "./DashedEdge";
import { ConnectionLine } from "./ConnectionLine";
import { Plus, Save, Trash2 } from "lucide-react";

const nodeTypes: NodeTypes = { course: CourseNode as any, trigger: TriggerNode as any };
const edgeTypes: EdgeTypes = { editable: DashedEdge as any };

interface SequenceCanvasProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  sequenceName?: string;
  readonly?: boolean;
  onSave?: (nodes: Node[], edges: Edge[]) => void;
}

function SequenceCanvasInner({ initialNodes = [], initialEdges = [], sequenceName, readonly, onSave }: SequenceCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge({ ...connection, type: "editable", animated: false }, eds));
  }, [setEdges]);

  const addCourseNode = useCallback(() => {
    const id = `course-${Date.now()}`;
    const lastNode = nodes[nodes.length - 1];
    const y = lastNode ? (lastNode.position?.y || 0) + 120 : 200;
    const x = lastNode ? lastNode.position?.x || 200 : 200;

    const newNode: Node = {
      id, type: "course",
      position: { x, y },
      data: { label: "New Course", courseCode: "NEW-000", gradeLevel: 9, credits: 1, department: "" },
    };
    setNodes((nds) => [...nds, newNode]);
    if (lastNode) {
      setEdges((eds) => [...eds, { id: `e-${lastNode.id}-${id}`, source: lastNode.id, target: id, type: "editable" }]);
    }
  }, [nodes, setNodes, setEdges]);

  const deleteSelected = useCallback(() => {
    setNodes((nds) => nds.filter((n) => !n.selected));
    setEdges((eds) => eds.filter((e) => !e.selected));
  }, [setNodes, setEdges]);

  const handleSave = useCallback(() => {
    onSave?.(nodes, edges);
  }, [nodes, edges, onSave]);

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 500, position: "relative" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={readonly ? undefined : onNodesChange}
        onEdgesChange={readonly ? undefined : onEdgesChange}
        onConnect={readonly ? undefined : onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: "editable", animated: false }}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={1.5}
        panOnScroll
        selectNodesOnDrag={false}
        nodesDraggable={!readonly}
        nodesConnectable={!readonly}
        connectionLineComponent={ConnectionLine}
        connectionRadius={0}
        deleteKeyCode={readonly ? null : "Delete"}
        proOptions={{ hideAttribution: true }}
        paneClickDistance={10}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={2}
          color="var(--admin-border-default)"
        />

        {!readonly && (
          <Panel position="top-right">
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={addCourseNode} title="Add course" style={{
                width: 32, height: 32, borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "var(--admin-bg-card)",
                border: "1px solid var(--admin-border-default)",
                color: "var(--admin-font-tertiary)", cursor: "pointer",
                transition: "border-color 0.1s, color 0.1s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--admin-accent-blue)"; e.currentTarget.style.color = "var(--admin-accent-blue)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-default)"; e.currentTarget.style.color = "var(--admin-font-tertiary)"; }}>
                <Plus style={{ width: 14, height: 14 }} />
              </button>
              <button onClick={deleteSelected} title="Delete selected" style={{
                width: 32, height: 32, borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "var(--admin-bg-card)",
                border: "1px solid var(--admin-border-default)",
                color: "var(--admin-font-tertiary)", cursor: "pointer",
                transition: "border-color 0.1s, color 0.1s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--admin-accent-red)"; e.currentTarget.style.color = "var(--admin-accent-red)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-default)"; e.currentTarget.style.color = "var(--admin-font-tertiary)"; }}>
                <Trash2 style={{ width: 13, height: 13 }} />
              </button>
              {onSave && (
                <button onClick={handleSave} title="Save" style={{
                  height: 32, borderRadius: 6, padding: "0 14px",
                  display: "flex", alignItems: "center", gap: 6,
                  background: "var(--admin-accent-blue, #3b82f6)", border: "none", color: "#fff",
                  cursor: "pointer", fontSize: 12, fontWeight: 600,
                }}>
                  <Save style={{ width: 13, height: 13 }} /> Save
                </button>
              )}
            </div>
          </Panel>
        )}

        {sequenceName && (
          <Panel position="top-left">
            <div style={{
              padding: "6px 12px", borderRadius: 6,
              background: "var(--admin-bg-card)",
              border: "1px solid var(--admin-border-default)",
              fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)",
            }}>
              {sequenceName}
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

export function SequenceCanvas(props: SequenceCanvasProps) {
  return (
    <ReactFlowProvider>
      <SequenceCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
