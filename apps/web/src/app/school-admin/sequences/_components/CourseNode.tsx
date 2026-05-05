"use client";

import { memo, useState, useMemo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  BookOpen, GraduationCap, Beaker, Calculator, Globe, Music, Palette, Trash2,
} from "lucide-react";

// ── Department icon mapping ──
const deptIcons: Record<string, any> = {
  math: Calculator, mathematics: Calculator, science: Beaker, english: BookOpen,
  history: Globe, art: Palette, music: Music, default: GraduationCap,
};

function getDeptIcon(dept?: string) {
  if (!dept) return GraduationCap;
  const key = dept.toLowerCase().trim();
  for (const [k, v] of Object.entries(deptIcons)) {
    if (key.includes(k)) return v;
  }
  return GraduationCap;
}

// ── Grade-level accent colors ──
const gradeColors: Record<number, string> = {
  9: "#3b82f6", 10: "#8b5cf6", 11: "#f59e0b", 12: "#10b981",
};

function CourseNodeComponent({ id, data, selected }: NodeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = getDeptIcon(data.department as string);
  const grade = data.gradeLevel as number;
  const accent = gradeColors[grade] || "#6b7280";
  const credits = data.credits as number;
  const status = data.status as string;

  const containerStyle = useMemo((): React.CSSProperties => ({
    width: 220,
    background: selected
      ? `${accent}0F`
      : "var(--admin-bg-card)",
    borderColor: selected
      ? accent
      : isHovered
        ? "var(--admin-border-hover)"
        : "var(--admin-border-default)",
    borderRadius: 10,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    cursor: "pointer",
    overflow: "hidden",
    transition: "border-color 0.15s",
  }), [selected, isHovered, accent]);

  const handleStyle: React.CSSProperties = {
    background: accent,
    width: 8,
    height: 8,
    border: "2px solid var(--admin-bg-card)",
  };

  return (
    <div
      style={containerStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Target Handle (top) */}
      <Handle type="target" position={Position.Top} style={{ ...handleStyle, top: -4 }} />

      {/* ── Header ── */}
      <div style={{
        padding: "6px 10px",
        borderBottom: "1px solid var(--admin-border-default)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: selected ? `${accent}08` : "var(--admin-bg-hover)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 22, height: 22, borderRadius: 4,
            background: `${accent}18`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon style={{ width: 12, height: 12, color: accent }} />
          </div>
          <span style={{
            fontSize: 11, fontWeight: 600, fontFamily: "monospace",
            color: selected ? accent : "var(--admin-font-secondary)",
            letterSpacing: "0.02em",
          }}>
            {(data.courseCode as string) || "COURSE"}
          </span>
        </div>
        {isHovered && (
          <button
            onClick={(e) => { e.stopPropagation(); (data.onDelete as any)?.(id); }}
            style={{
              width: 20, height: 20, borderRadius: 4,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: "none",
              color: "var(--admin-font-light)", cursor: "pointer",
              transition: "color 0.1s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--admin-accent-red, #ef4444)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--admin-font-light)"; }}
          >
            <Trash2 style={{ width: 11, height: 11 }} />
          </button>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ padding: "8px 10px" }}>
        {/* Course Name */}
        <div style={{
          fontSize: 13, fontWeight: 600, lineHeight: 1.3,
          color: "var(--admin-font-primary)",
          marginBottom: 6,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any,
          overflow: "hidden",
        }}>
          {(data.label as string) || (data.courseName as string) || "Untitled"}
        </div>

        {/* Meta row: Grade + Credits */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: status ? 6 : 0 }}>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
            background: `${accent}15`, color: accent,
          }}>
            Gr {grade || "—"}
          </span>
          {credits != null && (
            <span style={{
              fontSize: 10, fontWeight: 500, padding: "1px 6px", borderRadius: 3,
              background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)",
            }}>
              {credits} cr
            </span>
          )}
        </div>

        {/* Status badge */}
        {status && (
          <div style={{ display: "flex" }}>
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
              padding: "2px 7px", borderRadius: 3,
              background: status === "required" ? "var(--admin-accent-bg-red, rgba(239,68,68,0.1))"
                : status === "recommended" ? "var(--admin-accent-bg-green, rgba(16,185,129,0.1))"
                : "var(--admin-accent-bg-blue, rgba(59,130,246,0.1))",
              color: status === "required" ? "var(--admin-accent-red, #ef4444)"
                : status === "recommended" ? "var(--admin-accent-green, #10b981)"
                : "var(--admin-accent-blue, #3b82f6)",
            }}>
              {status}
            </span>
          </div>
        )}
      </div>

      {/* Source Handle (bottom) */}
      <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, bottom: -4 }} />
    </div>
  );
}

export const CourseNode = memo(CourseNodeComponent);
