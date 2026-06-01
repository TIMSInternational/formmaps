"use client";

import { memo, useState, useMemo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Play, Plus } from "lucide-react";

const ACCENT = "#065292";

function TriggerNodeComponent({ id, data, selected }: NodeProps) {
  const [isHovered, setIsHovered] = useState(false);

  const containerStyle = useMemo((): React.CSSProperties => ({
    alignItems: "center",
    background: selected
      ? "var(--admin-accent-bg-blue, rgba(59,130,246,0.08))"
      : "var(--admin-bg-card)",
    borderColor: selected
      ? ACCENT
      : isHovered
        ? "var(--admin-border-hover)"
        : "var(--admin-border-default)",
    borderRadius: 8,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    cursor: "pointer",
    display: "flex",
    gap: 8,
    maxWidth: 240,
    minWidth: 44,
    padding: 8,
    position: "relative",
    transition: "border-color 0.1s",
  }), [selected, isHovered]);

  const handleStyle: React.CSSProperties = {
    background: ACCENT,
    width: 8,
    height: 8,
    border: "2px solid var(--admin-bg-card)",
    bottom: -5,
    transition: "transform 0.1s ease-out",
    transform: isHovered && !selected ? "scale(1.4)" : undefined,
  };

  return (
    <>
      <div
        style={containerStyle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Icon Container */}
        <div style={{
          alignItems: "center",
          background: "var(--admin-bg-hover)",
          borderRadius: 4,
          display: "flex",
          height: 32,
          justifyContent: "center",
          width: 32,
          flexShrink: 0,
        }}>
          <Play style={{ width: 14, height: 14, color: ACCENT, fill: ACCENT }} />
        </div>

        {/* Right Part */}
        <div style={{
          alignItems: "flex-start",
          alignSelf: "stretch",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          maxWidth: 184,
        }}>
          <div style={{
            alignItems: "center",
            alignSelf: "stretch",
            display: "flex",
            height: 14,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 500, lineHeight: 1,
              color: selected ? ACCENT : "var(--admin-font-tertiary)",
              transition: "color 0.1s",
            }}>
              Trigger
            </div>
          </div>
          <div style={{
            fontSize: 14, fontWeight: 500, lineHeight: 1.3,
            color: "var(--admin-font-primary)",
            overflow: "hidden", textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {(data.label as string) || "Sequence Start"}
          </div>
        </div>

        {/* Source Handle — visible blue dot */}
        <Handle
          type="source"
          position={Position.Bottom}
          style={handleStyle}
        />
      </div>

      {/* Add Step Element */}
      {(isHovered || selected) && (
        <div style={{
          alignItems: "center",
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          left: "50%",
          position: "absolute",
          transform: "translateX(-50%) translateY(100%)",
        }}>
          <svg width="2" height="56" viewBox="0 0 2 56" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 0V28V56" stroke="var(--admin-border-default)" strokeDasharray="3 3" />
          </svg>
          <button
            style={{
              width: 24, height: 24, borderRadius: 4, padding: 0,
              background: "var(--admin-bg-card)",
              border: "1px solid var(--admin-border-default)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "var(--admin-font-tertiary)",
              transition: "border-color 0.1s, color 0.1s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = ACCENT;
              e.currentTarget.style.color = ACCENT;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--admin-border-default)";
              e.currentTarget.style.color = "var(--admin-font-tertiary)";
            }}
          >
            <Plus style={{ width: 14, height: 14 }} />
          </button>
        </div>
      )}
    </>
  );
}

export const TriggerNode = memo(TriggerNodeComponent);
