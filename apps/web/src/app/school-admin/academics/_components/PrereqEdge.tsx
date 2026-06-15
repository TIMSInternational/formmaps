"use client";

import { memo, useState, useCallback } from "react";
import {
  BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, Position, type EdgeProps,
} from "@xyflow/react";
import { Trash2 } from "lucide-react";

const PADDING_BOTTOM = 40;
const PADDING_X = 40;
const BORDER_RADIUS = 16;

// When the target sits above the source, a plain bezier would loop awkwardly —
// route a two-segment smoothstep instead (mirrors the old builder edge).
function computeEdgePath(p: {
  sourceX: number; sourceY: number; sourcePosition: EdgeProps["sourcePosition"];
  targetX: number; targetY: number; targetPosition: EdgeProps["targetPosition"];
}) {
  if (p.sourceY < p.targetY) {
    const [path, labelX, labelY] = getBezierPath(p);
    return { paths: [path], labelX, labelY };
  }
  const midX = (p.sourceX + p.targetX) / 2;
  const midY = p.sourceY + PADDING_BOTTOM;
  const [seg1] = getSmoothStepPath({
    sourceX: p.sourceX, sourceY: p.sourceY, targetX: midX, targetY: midY,
    sourcePosition: p.sourcePosition, targetPosition: Position.Bottom,
    borderRadius: BORDER_RADIUS, offset: PADDING_X,
  });
  const [seg2] = getSmoothStepPath({
    sourceX: midX, sourceY: midY, targetX: p.targetX, targetY: p.targetY,
    sourcePosition: Position.Top, targetPosition: p.targetPosition,
    borderRadius: BORDER_RADIUS, offset: PADDING_X,
  });
  return { paths: [seg1, seg2], labelX: midX, labelY: midY };
}

interface PrereqEdgeData {
  onDelete?: (id: string) => void;
  [key: string]: unknown;
}

function PrereqEdgeComponent({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  selected, markerEnd, data,
}: EdgeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const onDelete = (data as PrereqEdgeData | undefined)?.onDelete;

  const { paths, labelX, labelY } = computeEdgePath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });

  const stroke = selected
    ? "var(--admin-accent-blue, #065292)"
    : isHovered ? "var(--admin-font-light, #555)" : "var(--admin-border-default)";

  const enter = useCallback(() => setIsHovered(true), []);
  const leave = useCallback(() => setIsHovered(false), []);

  return (
    <>
      {paths.map((path, i) => (
        <BaseEdge key={path} path={path} markerEnd={i === paths.length - 1 ? markerEnd : undefined} style={{ stroke, transition: "stroke 0.1s" }} />
      ))}
      {paths.map((path, i) => (
        <path key={`hit-${i}`} d={path} fill="none" stroke="transparent" strokeWidth={20}
          onMouseEnter={enter} onMouseLeave={leave} style={{ cursor: "pointer" }} />
      ))}
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          onMouseEnter={enter} onMouseLeave={leave}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all", padding: 4,
            opacity: isHovered || selected ? 1 : 0, transition: "opacity 0.1s",
          }}
        >
          <button
            aria-label="Remove prerequisite"
            onClick={(e) => { e.stopPropagation(); onDelete?.(id); }}
            style={{
              width: 28, height: 28, borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
              color: "var(--admin-font-tertiary)", cursor: "pointer",
              boxShadow: "0 2px 8px var(--admin-bg-overlay, rgba(0,0,0,0.3))",
              transition: "background 0.1s, color 0.1s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-accent-bg-red, rgba(239,68,68,0.08))"; e.currentTarget.style.color = "var(--admin-accent-red, #ef4444)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--admin-bg-card)"; e.currentTarget.style.color = "var(--admin-font-tertiary)"; }}
          >
            <Trash2 style={{ width: 13, height: 13 }} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const PrereqEdge = memo(PrereqEdgeComponent);
