"use client";

import { memo, useState, useMemo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  BookOpen, GraduationCap, Beaker, Calculator, Globe, Music, Palette,
} from "lucide-react";

const deptIcons: Record<string, typeof GraduationCap> = {
  math: Calculator, mathematics: Calculator, science: Beaker, english: BookOpen,
  history: Globe, social: Globe, art: Palette, music: Music, language: Globe,
};

function getDeptIcon(dept?: string) {
  if (!dept) return GraduationCap;
  const key = dept.toLowerCase().trim();
  for (const [k, v] of Object.entries(deptIcons)) if (key.includes(k)) return v;
  return GraduationCap;
}

const gradeColors: Record<number, string> = {
  9: "#2E9098", 10: "#8b5cf6", 11: "#f59e0b", 12: "#10b981",
};

// Node data shape (set by PathwayEditorDialog)
export interface PathwayNodeData {
  courseCode: string;
  label: string;
  department?: string;
  gradeLevel?: number;
  credits?: number;
  isHonors?: boolean;
  [key: string]: unknown;
}

function PathwayCourseNodeComponent({ data, selected }: NodeProps) {
  const d = data as PathwayNodeData;
  const [isHovered, setIsHovered] = useState(false);
  const Icon = getDeptIcon(d.department);
  const grade = d.gradeLevel ?? 0;
  const accent = gradeColors[grade] || "#6b7280";
  const credits = d.credits;

  const containerStyle = useMemo((): React.CSSProperties => ({
    width: 220,
    background: selected ? `${accent}0F` : "var(--admin-bg-card)",
    borderColor: selected ? accent : isHovered ? "var(--admin-border-hover)" : "var(--admin-border-default)",
    borderRadius: 10,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    cursor: "grab",
    overflow: "hidden",
    transition: "border-color 0.15s",
  }), [selected, isHovered, accent]);

  const handleStyle: React.CSSProperties = {
    background: accent, width: 9, height: 9, border: "2px solid var(--admin-bg-card)",
  };

  return (
    <div style={containerStyle} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      {/* Target handle (top) = "this course requires …" — drag INTO here */}
      <Handle type="target" position={Position.Top} style={{ ...handleStyle, top: -5 }} />

      <div style={{
        padding: "6px 10px",
        borderBottom: "1px solid var(--admin-border-default)",
        display: "flex", alignItems: "center", gap: 6,
        background: selected ? `${accent}08` : "var(--admin-bg-hover)",
      }}>
        <div style={{
          width: 22, height: 22, borderRadius: 4, background: `${accent}18`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon style={{ width: 12, height: 12, color: accent }} />
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, fontFamily: "monospace",
          color: selected ? accent : "var(--admin-font-secondary)", letterSpacing: "0.02em",
        }}>
          {d.courseCode || "COURSE"}
        </span>
        {d.isHonors && (
          <span style={{
            marginLeft: "auto", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
            background: "rgba(245,158,11,0.15)", color: "#f59e0b",
          }}>H</span>
        )}
      </div>

      <div style={{ padding: "8px 10px" }}>
        <div style={{
          fontSize: 13, fontWeight: 600, lineHeight: 1.3, color: "var(--admin-font-primary)", marginBottom: 6,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as "vertical", overflow: "hidden",
        }}>
          {d.label || "Untitled"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {grade > 0 && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: `${accent}15`, color: accent }}>
              Gr {grade}
            </span>
          )}
          {credits != null && (
            <span style={{ fontSize: 10, fontWeight: 500, padding: "1px 6px", borderRadius: 3, background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)" }}>
              {credits} cr
            </span>
          )}
        </div>
      </div>

      {/* Source handle (bottom) = "this course is a prerequisite of …" — drag FROM here */}
      <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, bottom: -5 }} />
    </div>
  );
}

export const PathwayCourseNode = memo(PathwayCourseNodeComponent);
