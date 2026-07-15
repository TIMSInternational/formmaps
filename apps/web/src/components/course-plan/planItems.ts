import type { StudentCourseEnrollment } from "@/types/coursePlan";
import type { GraduationPlan } from "@/types/graduationPlan";

/** Map graduation-plan items to draft_proposed pseudo-enrollments for SequenceBuilder. */
export function planItemsToEnrollments(plan: GraduationPlan): StudentCourseEnrollment[] {
  return plan.items.map((i) => ({
    id: `gp-${plan.id}-${i.courseId}-${i.gradeLevel}-${i.term ?? ""}`,
    courseId: i.courseId,
    courseCode: i.courseCode,
    courseName: i.courseName,
    category: i.category ?? "",
    credits: i.credits,
    gradeLevel: i.gradeLevel,
    semester: i.term ?? "Fall",
    status: "draft_proposed" as const,
  }));
}
