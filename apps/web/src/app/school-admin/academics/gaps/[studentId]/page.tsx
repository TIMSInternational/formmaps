"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";
import { useStudent } from "@/hooks/useSchoolAdmin";
import { useStudentGpa } from "@/hooks/useStudentDetailData";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronRight, ArrowLeft, Sparkles, Loader2, GraduationCap, AlertTriangle,
  CheckCircle2, XCircle, TrendingDown, BookOpen, Check, Plus,
} from "lucide-react";
import { toast } from "sonner";

export default function StudentGapAnalysisPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const studentId = params.studentId as string;

  const { data: student, isLoading: studentLoading } = useStudent(studentId);
  const { data: gpaData } = useStudentGpa(studentId);

  // Graduation progress for this student
  const { data: gradData, isLoading: gradLoading } = useQuery({
    queryKey: ["graduation-progress", studentId],
    queryFn: async () => {
      const res = await apiRequest(`/api/v1/school-admin/graduation/progress/${studentId}`);
      return res?.data || res;
    },
    enabled: !!studentId,
    staleTime: 1000 * 60 * 5,
  });

  // AI recommendations (on demand)
  const { data: aiData, isLoading: aiLoading, refetch: generateRecs } = useQuery({
    queryKey: ["ai-recommendations", studentId],
    queryFn: async () => {
      const res = await apiRequest(`/api/v1/school-admin/academic-gaps/ai-recommendations/${studentId}`);
      return res?.data || res;
    },
    enabled: false,
    retry: false,
    staleTime: 1000 * 60 * 15,
  });

  // Approve course → add to student's course plan
  const approveCourse = useMutation({
    mutationFn: async ({ courseId, term }: { courseId: string; term: string }) => {
      return apiRequest("/api/v1/school-admin/course-plans/add", {
        method: "POST",
        data: { studentId, courseId, term, status: "planned" },
      });
    },
    onSuccess: () => {
      toast.success("Course added to student's plan");
      queryClient.invalidateQueries({ queryKey: ["ai-recommendations", studentId] });
    },
    onError: () => toast.error("Failed to add course"),
  });

  const [approvedCourses, setApprovedCourses] = useState<Set<string>>(new Set());

  if (studentLoading || gradLoading) return (
    <div className="space-y-4" style={{ maxWidth: 900, margin: "0 auto" }}>
      <Skeleton className="h-10 w-64" style={{ background: "var(--admin-bg-hover)" }} />
      <Skeleton className="h-[500px]" style={{ background: "var(--admin-bg-hover)" }} />
    </div>
  );

  const progress = gradData;
  const overallPct = progress?.overallProgress || 0;
  const statusColor = overallPct >= 75 ? "#10b981" : overallPct >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="space-y-6" style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Breadcrumbs */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--admin-font-tertiary)" }}>
        <button onClick={() => router.push("/school-admin/academics?tab=gaps")} style={{
          background: "none", border: "none", cursor: "pointer", color: "var(--admin-font-tertiary)",
          display: "flex", alignItems: "center", gap: 4, padding: 0, fontSize: 13,
        }}>
          <ArrowLeft style={{ width: 14, height: 14 }} />
          Academics
        </button>
        <ChevronRight style={{ width: 12, height: 12 }} />
        <span style={{ color: "var(--admin-font-tertiary)" }}>Academic Gaps</span>
        <ChevronRight style={{ width: 12, height: 12 }} />
        <span style={{ color: "var(--admin-font-primary)", fontWeight: 600 }}>{student?.name || "Student"}</span>
      </div>

      {/* Student Header Card */}
      <div style={{
        padding: "24px 28px", borderRadius: 12, border: "1px solid var(--admin-border-default)",
        background: "linear-gradient(135deg, rgba(59,130,246,0.04), rgba(139,92,246,0.04))",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: `linear-gradient(135deg, ${statusColor}40, ${statusColor}20)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: statusColor, fontSize: 20, fontWeight: 700,
          }}>
            {student?.name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--admin-font-primary)", margin: 0 }}>{student?.name}</h1>
            <div style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2, display: "flex", gap: 16 }}>
              {(student as any)?.gradeLevel && <span>Grade {(student as any).gradeLevel}</span>}
              {(gpaData as any)?.gpa != null && <span>GPA: {(gpaData as any).gpa.toFixed(2)}</span>}
              <span>{progress?.totalCreditsEarned || 0} / {progress?.totalCreditsRequired || 0} credits</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: statusColor }}>{overallPct}%</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: statusColor, textTransform: "uppercase" }}>
              {overallPct >= 75 ? "On Track" : overallPct >= 50 ? "At Risk" : "Off Track"}
            </div>
          </div>
        </div>

        {/* Category progress bars */}
        {progress?.categoryProgress?.length > 0 && (
          <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {progress.categoryProgress.map((cat: any) => {
              const pct = cat.progress || 0;
              const catColor = cat.met ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";
              return (
                <div key={cat.category} style={{ padding: "10px 12px", borderRadius: 6, background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{cat.category}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: catColor }}>{cat.earned}/{cat.required}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "var(--admin-bg-hover)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 2, width: `${Math.min(100, pct)}%`, background: catColor }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Generate AI Recommendations Button */}
      {!aiData?.semesters?.length && (
        <div style={{
          padding: "32px", borderRadius: 12, border: "1px dashed var(--admin-border-default)",
          background: "var(--admin-bg-card)", textAlign: "center",
        }}>
          <Sparkles style={{ width: 32, height: 32, color: "#8b5cf6", margin: "0 auto 12px" }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-font-primary)", margin: "0 0 6px" }}>AI Course Pathway</h3>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", maxWidth: 400, margin: "0 auto 16px" }}>
            Generate a personalized semester-by-semester course plan based on this student's career interests, cognitive profile, and graduation requirements.
          </p>
          <button onClick={() => generateRecs()} disabled={aiLoading} style={{
            height: 44, borderRadius: 8, padding: "0 28px", fontSize: 14, fontWeight: 600,
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "linear-gradient(135deg, #8b5cf6, #065292)", color: "#fff",
            border: "none", cursor: aiLoading ? "wait" : "pointer",
            opacity: aiLoading ? 0.7 : 1,
          }}>
            {aiLoading ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : <Sparkles style={{ width: 16, height: 16 }} />}
            {aiLoading ? "Analyzing Student Profile..." : "Generate Course Pathway"}
          </button>
        </div>
      )}

      {/* Loading state */}
      {aiLoading && (
        <div style={{ padding: "40px", borderRadius: 12, background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.15)", textAlign: "center" }}>
          <Loader2 style={{ width: 28, height: 28, color: "#8b5cf6", margin: "0 auto 12px", animation: "spin 1s linear infinite" }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: "#8b5cf6" }}>Building personalized course pathway...</div>
          <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 4 }}>Analyzing career profile, cognitive strengths, and graduation requirements</div>
        </div>
      )}

      {/* AI Summary */}
      {aiData?.summary && (
        <div style={{
          padding: "16px 20px", borderRadius: 8, background: "rgba(139,92,246,0.05)",
          border: "1px solid rgba(139,92,246,0.15)",
          fontSize: 13, color: "var(--admin-font-primary)", lineHeight: 1.6,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Sparkles style={{ width: 14, height: 14, color: "#8b5cf6" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#8b5cf6", textTransform: "uppercase" }}>AI Plan Summary</span>
          </div>
          {aiData.summary}
        </div>
      )}

      {/* Semester-by-Semester Pathway */}
      {aiData?.semesters?.map((sem: any, si: number) => (
        <div key={si} style={{ borderRadius: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
          <div style={{
            padding: "14px 20px", borderBottom: "1px solid var(--admin-border-default)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "var(--admin-bg-hover)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: si === 0 ? "rgba(59,130,246,0.1)" : "var(--admin-bg-card)",
                border: "1px solid var(--admin-border-default)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, color: si === 0 ? "#065292" : "var(--admin-font-tertiary)",
              }}>{si + 1}</div>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{sem.label}</span>
            </div>
            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{sem.courses.length} courses</span>
          </div>

          <div style={{ padding: 16 }} className="space-y-3">
            {sem.courses.map((course: any) => {
              const priorityColor = course.priority === "critical" ? "#ef4444" : course.priority === "recommended" ? "#f59e0b" : "#065292";
              const isApproved = approvedCourses.has(course.courseId);
              return (
                <div key={course.courseId} style={{
                  padding: "14px 16px", borderRadius: 8, border: "1px solid var(--admin-border-default)",
                  borderLeft: `3px solid ${priorityColor}`,
                  background: isApproved ? "rgba(16,185,129,0.03)" : "var(--admin-bg-card)",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{course.courseName}</span>
                        <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--admin-font-tertiary)" }}>{course.courseCode}</span>
                        <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: `${priorityColor}15`, color: priorityColor, textTransform: "capitalize" }}>{course.priority}</span>
                        {course.isHonors && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>Honors</span>}
                        {course.frameworkType && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: "rgba(59,130,246,0.1)", color: "#065292" }}>{course.frameworkType}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", lineHeight: 1.5, marginBottom: 6 }}>{course.reason}</div>
                      <div style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                        {course.credits > 0 && <span>{course.credits} credits</span>}
                        {course.department && <span>· {course.department}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (isApproved) return;
                        setApprovedCourses(prev => new Set(prev).add(course.courseId));
                        approveCourse.mutate({ courseId: course.courseId, term: sem.label });
                      }}
                      disabled={isApproved || approveCourse.isPending}
                      style={{
                        height: 34, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600,
                        display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                        background: isApproved ? "rgba(16,185,129,0.1)" : "var(--admin-bg-hover)",
                        color: isApproved ? "#10b981" : "var(--admin-font-primary)",
                        border: isApproved ? "1px solid rgba(16,185,129,0.2)" : "1px solid var(--admin-border-default)",
                        cursor: isApproved ? "default" : "pointer",
                      }}
                    >
                      {isApproved ? <Check style={{ width: 14, height: 14 }} /> : <Plus style={{ width: 14, height: 14 }} />}
                      {isApproved ? "Added" : "Add to Plan"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
