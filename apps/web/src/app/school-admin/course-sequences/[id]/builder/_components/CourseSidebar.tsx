"use client";

import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BookOpen, Search, Plus } from "lucide-react";
import type { SchoolCourse } from "@/types/curriculum";

interface CourseSidebarProps {
  courses: SchoolCourse[];
  search: string;
  onSearchChange: (value: string) => void;
  gradeFilter: string;
  onGradeFilterChange: (value: string) => void;
}

export function CourseSidebar({ courses, search, onSearchChange, gradeFilter, onGradeFilterChange }: CourseSidebarProps) {
  return (
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
            <Input placeholder="Search courses..." value={search} onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 h-9 rounded-lg text-sm"
              style={{ background: "var(--admin-bg-input)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }} />
          </div>
          <Select value={gradeFilter} onValueChange={onGradeFilterChange}>
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
  );
}
