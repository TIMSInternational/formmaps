"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls,
  useReactFlow, type Node, type Edge, type Connection,
  type NodeTypes, type EdgeTypes, type OnNodesChange, type OnEdgesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { PathwayCourseNode } from "./PathwayCourseNode";
import { PrereqEdge } from "./PrereqEdge";

const nodeTypes: NodeTypes = { pathwayCourse: PathwayCourseNode };
const edgeTypes: EdgeTypes = { prereq: PrereqEdge };

export const COURSE_DRAG_MIME = "application/pathway-course";

interface PathwayCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (c: Connection) => void;
  onDropCourse: (courseId: string, position: { x: number; y: number }) => void;
  readOnly: boolean;
  /** changes when the focus set changes; triggers a fitView */
  fitSignal: string;
  /** node ids to zoom to (empty/undefined = fit all) */
  focusIds?: string[];
}

function CanvasInner({
  nodes, edges, onNodesChange, onEdgesChange, onConnect, onDropCourse, readOnly, fitSignal, focusIds,
}: PathwayCanvasProps) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const courseId = e.dataTransfer.getData(COURSE_DRAG_MIME);
    if (!courseId) return;
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    onDropCourse(courseId, position);
  }, [screenToFlowPosition, onDropCourse]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (focusIds && focusIds.length) {
        fitView({ nodes: focusIds.map((id) => ({ id })), duration: 400, padding: 0.25 });
      } else {
        fitView({ duration: 400, padding: 0.15 });
      }
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

  return (
    <div ref={wrapperRef} style={{ width: "100%", height: "100%" }} onDragOver={handleDragOver} onDrop={handleDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodesConnectable={!readOnly}
        nodesDraggable
        elementsSelectable
        fitView
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--admin-border-default)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export function PathwayCanvas(props: PathwayCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
