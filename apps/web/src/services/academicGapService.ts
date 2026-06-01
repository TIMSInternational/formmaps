import { apiRequest } from "@/lib/api/apiClient";
import type {
  StudentAcademicGaps,
  AcademicGapSummary,
  CourseRecommendationsResponse,
} from "@/types/academicGap";

const buildPath = (endpoint: string, params?: Record<string, string | number | undefined>) => {
  if (!params) return endpoint;
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      qs.append(key, String(value));
    }
  });
  const queryString = qs.toString();
  return queryString ? `${endpoint}?${queryString}` : endpoint;
};

function toCamel(obj: any): any {
  if (Array.isArray(obj)) return obj.map(toCamel);
  if (obj !== null && typeof obj === "object" && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k.charAt(0).toLowerCase() + k.slice(1), toCamel(v)])
    );
  }
  return obj;
}

// ============================================
// Academic Gap Analysis (SCRUM-139)
// ============================================

export async function getStudentAcademicGaps(studentId: string): Promise<StudentAcademicGaps> {
  const json = await apiRequest(
    buildPath(`/api/v1/school-admin/academic-gaps/students/${studentId}`)
  );
  const raw = toCamel(json.data ?? json) as any;

  // API returns { gaps: [{area, earned, required, shortfall}], creditsEarned, creditsRequired, studentName, gradeLevel }
  const gapsList = Array.isArray(raw.gaps) ? raw.gaps : [];
  return {
    studentId,
    studentName: raw.studentName ?? "",
    gradeLevel: raw.gradeLevel ?? "",
    analysisDate: new Date().toISOString(),
    graduationTarget: "",
    overallStatus: gapsList.length > 0 ? "behind" : "on_track",
    creditGaps: gapsList.map((g: any) => ({
      category: g.area ?? g.category ?? "Unknown",
      creditsEarned: g.earned ?? 0,
      creditsRequired: g.required ?? 0,
      deficit: g.shortfall ?? g.needed ?? Math.max(0, (g.required ?? 0) - (g.earned ?? 0)),
    })),
    courseGaps: [],
    paceGaps: [],
    careerGaps: [],
    prioritizedRecommendations: [],
    creditsEarned: raw.creditsEarned ?? 0,
    creditsRequired: raw.creditsRequired ?? 0,
  } as StudentAcademicGaps;
}

export async function getAcademicGapSummary(params?: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<AcademicGapSummary> {
  const json = await apiRequest(
    buildPath("/api/v1/school-admin/academic-gaps/summary", params as Record<string, string | number>)
  );
  return toCamel(json.data ?? json) as AcademicGapSummary;
}

// ============================================
// AI Course Recommendations (SCRUM-140)
// ============================================

export async function getStudentCourseRecommendations(
  studentId: string
): Promise<CourseRecommendationsResponse> {
  // Try AI-powered recommendations first, fall back to basic ones
  try {
    const json = await apiRequest(
      buildPath(`/api/v1/school-admin/academic-gaps/ai-recommendations/${studentId}`)
    );
    const raw = toCamel(json.data ?? json) as any;

    // AI endpoint returns { semesters: [{label, courses: [{courseCode, courseName, reason, priority, category}]}], summary }
    const semesters = Array.isArray(raw.semesters) ? raw.semesters : [];
    const allCourses = semesters.flatMap((sem: any) =>
      (sem.courses || []).map((c: any) => ({
        courseId: c.courseId ?? "",
        courseCode: c.courseCode ?? "",
        courseName: c.courseName ?? "",
        credits: c.credits ?? 0,
        reason: c.reason ?? "",
        priority: c.priority === "critical" ? "high" : c.priority === "enrichment" ? "low" : "medium",
        source: c.category === "graduation_gap" ? "graduation_requirement" as const
          : c.category === "career_aligned" ? "career_alignment" as const
          : "assessment_based" as const,
        semester: sem.label,
      }))
    );

    // First semester = nextSemester, rest = longTerm
    const firstSemesterLabel = semesters[0]?.label;
    const nextSemester = allCourses.filter((c: any) => c.semester === firstSemesterLabel);
    const longTerm = allCourses.filter((c: any) => c.semester !== firstSemesterLabel);

    return {
      studentId: raw.studentId ?? studentId,
      generatedAt: new Date().toISOString(),
      nextSemester,
      longTerm,
      reasoning: raw.summary ?? "",
    } as CourseRecommendationsResponse;
  } catch {
    // Fallback to basic recommendations
    const json = await apiRequest(
      buildPath(`/api/v1/school-admin/academic-gaps/recommendations/${studentId}`)
    );
    const raw = toCamel(json.data ?? json) as any;
    const recs = Array.isArray(raw.recommendations) ? raw.recommendations : [];

    return {
      studentId,
      generatedAt: new Date().toISOString(),
      nextSemester: recs.map((r: any) => ({
        courseId: r.courseId ?? "",
        courseCode: r.courseCode ?? "",
        courseName: r.courseName ?? "",
        credits: r.credits ?? 0,
        reason: r.reason ?? "",
        priority: "high" as const,
        source: "graduation_requirement" as const,
      })),
      longTerm: [],
      reasoning: recs.length > 0
        ? `This student needs ${recs.length} course(s) to fill graduation credit gaps.`
        : "",
    } as CourseRecommendationsResponse;
  }
}
