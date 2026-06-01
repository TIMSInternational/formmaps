"use client";

import { memo, useState, useCallback } from "react";
import {
  BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { Plus, Trash2 } from "lucide-react";

// ── Edge path (mirrors Twenty's getEdgePath) ──
const EDGE_PADDING_BOTTOM = 40;
const EDGE_PADDING_X = 40;
const EDGE_BORDER_RADIUS = 16;

function computeEdgePath({
  sourceX, sourceY, sourcePosition,
  targetX, targetY, targetPosition,
  markerStart, markerEnd,
}: {
  sourceX: number; sourceY: number; sourcePosition: any;
  targetX: number; targetY: number; targetPosition: any;
  markerStart?: string; markerEnd?: string;
}) {
  if (sourceY < targetY) {
    const [path, labelX, labelY] = getBezierPath({
      sourceX, sourceY, sourcePosition,
      targetX, targetY, targetPosition,
    });
    return {
      segments: [{ path, markerStart, markerEnd }],
      overlayPosition: [labelX, labelY] as [number, number],
    };
  }
  const midX = (sourceX + targetX) / 2;
  const midY = sourceY + EDGE_PADDING_BOTTOM;
  const [seg1] = getSmoothStepPath({
    sourceX, sourceY, targetX: midX, targetY: midY,
    sourcePosition, targetPosition: "bottom" as any,
    borderRadius: EDGE_BORDER_RADIUS, offset: EDGE_PADDING_X,
  });
  const [seg2] = getSmoothStepPath({
    sourceX: midX, sourceY: midY, targetX, targetY,
    sourcePosition: "top" as any, targetPosition,
    borderRadius: EDGE_BORDER_RADIUS, offset: EDGE_PADDING_X,
  });
  return {
    segments: [
      { path: seg1, markerStart, markerEnd: undefined },
      { path: seg2, markerStart: undefined, markerEnd },
    ],
    overlayPosition: [midX, midY] as [number, number],
  };
}

// ── Edge Component ──
function EditableEdgeComponent({
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  selected, markerStart, markerEnd,
}: EdgeProps) {
  const [isHovered, setIsHovered] = useState(false);

  const {
    segments,
    overlayPosition: [labelX, labelY],
  } = computeEdgePath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    markerStart: markerStart as string | undefined,
    markerEnd: markerEnd as string | undefined,
  });

  // Three states: default → hover → selected (mirrors Twenty)
  const stroke = selected
    ? "var(--admin-accent-blue, #065292)"
    : isHovered
      ? "var(--admin-font-light, #555)"
      : "var(--admin-border-default)";

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  return (
    <>
      {/* Path segments — only safe props to BaseEdge */}
      {segments.map((segment) => (
        <BaseEdge
          key={segment.path}
          path={segment.path}
          markerStart={segment.markerStart}
          markerEnd={segment.markerEnd}
          style={{ stroke, transition: "stroke 0.1s" }}
        />
      ))}

      {/* Wide invisible hover target */}
      {segments.map((segment, i) => (
        <path
          key={`hover-${i}`}
          d={segment.path}
          fill="none"
          stroke="transparent"
          strokeWidth={20}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: "pointer" }}
        />
      ))}

      {/* Button group on hover/selected */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
            padding: 4,
            opacity: isHovered || selected ? 1 : 0,
            transition: "opacity 0.1s",
          }}
          className="nodrag nopan"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div style={{
            display: "flex",
            borderRadius: 4,
            overflow: "hidden",
            border: "1px solid var(--admin-border-default)",
            background: "var(--admin-bg-card)",
            boxShadow: "0 2px 8px var(--admin-bg-overlay, rgba(0,0,0,0.3))",
          }}>
            <button
              style={{
                width: 28, height: 28,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "transparent", border: "none",
                borderRight: "1px solid var(--admin-border-default)",
                color: "var(--admin-font-tertiary)",
                cursor: "pointer", transition: "background 0.1s, color 0.1s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--admin-bg-hover)";
                e.currentTarget.style.color = "var(--admin-font-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--admin-font-tertiary)";
              }}
              title="Add step between"
            >
              <Plus style={{ width: 14, height: 14 }} />
            </button>
            <button
              style={{
                width: 28, height: 28,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "transparent", border: "none",
                color: "var(--admin-font-tertiary)",
                cursor: "pointer", transition: "background 0.1s, color 0.1s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--admin-accent-bg-red, rgba(239,68,68,0.08))";
                e.currentTarget.style.color = "var(--admin-accent-red, #ef4444)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--admin-font-tertiary)";
              }}
              title="Delete connection"
            >
              <Trash2 style={{ width: 13, height: 13 }} />
            </button>
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const DashedEdge = memo(EditableEdgeComponent);
