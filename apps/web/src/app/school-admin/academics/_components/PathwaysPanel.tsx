"use client";

import { useState } from "react";
import { ArrowRight, GitBranch, RefreshCw, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCoursePathways } from "@/hooks/useCurriculumQueries";
import { EditPrerequisitesDialog } from "./EditPrerequisitesDialog";
import type { PathwayCourse } from "@/types/curriculum";

const NODE_BTN: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px",
  borderRadius: 6, background: "var(--admin-bg-card)",
  border: "1px solid var(--admin-border-default)", cursor: "pointer", transition: "border-color 0.15s",
};
const BTN_SECONDARY: React.CSSProperties = {
  height: 32, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600,
  display: "flex", alignItems: "center", gap: 6,
  background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
  color: "var(--admin-font-secondary)", cursor: "pointer",
};

function CourseNode({ course, onClick }: { course: PathwayCourse; onClick: () => void }) {
  return (
    <button onClick={onClick} title={`${course.name} — click to edit prerequisites`} style={NODE_BTN}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#065292"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-default)"; }}>
      <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{course.code}</span>
      <span className="hidden md:inline" style={{ fontSize: 11, color: "var(--admin-font-tertiary)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{course.name}</span>
      {course.isHonors && <Badge style={{ fontSize: 9, background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "none" }}>Honors</Badge>}
    </button>
  );
}

export function PathwaysPanel() {
  const { data, isLoading, isError, refetch } = useCoursePathways();
  const [editCourse, setEditCourse] = useState<PathwayCourse | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" style={{ background: "var(--admin-bg-hover)" }} />
        <Skeleton className="h-[400px]" style={{ background: "var(--admin-bg-hover)" }} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <p style={{ fontSize: 13, color: "#dc2626" }}>Failed to load pathways.</p>
        <button onClick={() => refetch()} style={BTN_SECONDARY}>
          <RefreshCw style={{ width: 12, height: 12 }} /> Retry
        </button>
      </div>
    );
  }

  const groups = data?.groups ?? [];

  if (groups.length === 0) {
    return (
      <div className="py-16 text-center" style={{ borderRadius: 8, border: "1px dashed var(--admin-border-default)" }}>
        <GitBranch style={{ width: 32, height: 32, margin: "0 auto 12px", opacity: 0.3, color: "var(--admin-font-tertiary)" }} />
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--admin-font-primary)", marginBottom: 4 }}>No pathways yet</div>
        <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", maxWidth: 420, margin: "0 auto" }}>
          Pathways are derived from course prerequisites. Add prerequisites to your courses
          (or run Analyze Prerequisites on the Courses tab) and chains will appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>
        Derived from your course prerequisites — click any course to edit its prerequisites.
      </p>

      {data?.truncated && (
        <div className="flex items-center gap-2" style={{ padding: "8px 12px", borderRadius: 6, background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.3)" }}>
          <TriangleAlert style={{ width: 14, height: 14, color: "#d97706", flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "#d97706" }}>
            Your prerequisite graph is large — only the first 200 pathways are shown.
          </span>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.department}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 8 }}>
            {group.department}
            <span style={{ fontSize: 11, fontWeight: 400, color: "var(--admin-font-tertiary)", marginLeft: 8 }}>
              {group.chains.length} {group.chains.length === 1 ? "pathway" : "pathways"}
            </span>
          </h3>
          <div className="space-y-2">
            {group.chains.map((chain) => (
              <div key={chain.map((c) => c.code).join("|")} className="flex flex-wrap items-center gap-2"
                style={{ padding: "10px 12px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
                {chain.map((courseNode, i) => (
                  <span key={courseNode.courseId + i} className="flex items-center gap-2">
                    {i > 0 && <ArrowRight style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)" }} />}
                    <CourseNode course={courseNode} onClick={() => setEditCourse(courseNode)} />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}

      <EditPrerequisitesDialog course={editCourse} onClose={() => setEditCourse(null)} />
    </div>
  );
}
