// The server's own per-assessment verdict for the CURRENT user —
// GET /api/v1/assessment/completion → checkAssessmentCompletion in the legacy API.
//
// Two things about this endpoint shape every consumer in this folder:
//
// 1. It is SELF-SCOPED. It reads req.userId and takes no user parameter, as does
//    GET /api/v1/personality/access. A progress lookup made on someone else's behalf
//    (the counselor student page calls getUserAssessmentProgress(studentId)) must not
//    call either, or it reports the VIEWER's assessments as the student's — which is
//    exactly what /counselor/students/[id] used to do for Personality and the overall
//    verdict. isViewingSelf() is the gate.
//
// 2. It is AUTHORITATIVE. It comes straight from the database rows, so it does not
//    depend on the live TIMS round-trip that checkPCAStatus otherwise needs to call
//    a PCA "completed", nor on the client re-deriving the 360 threshold. Any status a
//    client heuristic computes may only be raised to "completed" by this verdict, never
//    lowered — the heuristics still own "in_progress", which the server does not track.
import { apiRequest } from "@/lib/api/apiClient";

export interface ServerAssessmentCompletion {
  liaCompleted?: number;
  liaTotal?: number;
  evalCompleted?: number;
  evalTotal?: number;
  pcaCompleted?: boolean;
  personalityCompleted?: boolean;
  allDone: boolean;
  readyForInsights?: boolean;
}

/**
 * True when `userId` is the signed-in user (or the store has no user yet, in which
 * case the only user a caller can plausibly mean is themselves).
 */
export function isViewingSelf(userId: string): boolean {
  try {
    // Resolved lazily, the way milService reads the store: a static import would make
    // every service that imports this module load the whole store graph (resume,
    // telemetry, i18n…) at module-evaluation time — which is a circular dependency in
    // the app and an unmockable surface in tests that requireActual a service.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGlobalStore } = require("@/store/useGlobalStore");
    const currentId: string | undefined = useGlobalStore.getState().user?.id;
    return !currentId || currentId === userId;
  } catch {
    return true;
  }
}

/**
 * The server's verdict for the current user, or null when the endpoint is unreachable
 * or the response carries no data. Never throws — every caller has a client-side
 * estimate to fall back to and an outage must degrade the numbers, not the page.
 */
export async function getOwnAssessmentCompletion(): Promise<ServerAssessmentCompletion | null> {
  try {
    const json = await apiRequest<{ data?: ServerAssessmentCompletion }>(
      "/api/v1/assessment/completion"
    );
    return json.data ?? null;
  } catch {
    return null;
  }
}
