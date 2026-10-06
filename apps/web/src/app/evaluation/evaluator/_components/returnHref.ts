import { normalizeRole } from "@/lib/roleUtils";
import { Roles } from "@/lib/permissions";

/**
 * Where a signed-in person returns after finishing an evaluation: the list they started it from.
 * Signed-out evaluators (an emailed token link) get none — they must never be routed into the app.
 */
export function evaluatorReturnHref(user: { isAuthenticated?: boolean; role?: string | null } | null | undefined): string | undefined {
  if (!user?.isAuthenticated) return undefined;
  switch (normalizeRole(user.role)) {
    case Roles.STUDENT: return "/dashboard/assessments/evaluation";
    case Roles.PARENT: return "/parent/evaluations";
    case Roles.TEACHER: return "/teacher/evaluations";
    default: return "/dashboard";
  }
}

/** Seconds the completion screen shows before a signed-in evaluator is taken back. */
export const AUTO_RETURN_SECONDS = 3;
