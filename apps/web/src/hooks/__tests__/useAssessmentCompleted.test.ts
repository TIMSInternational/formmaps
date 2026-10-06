import { QueryClient } from "@tanstack/react-query";
import { invalidateAfterAssessmentCompleted } from "../useAssessmentCompleted";
import { assessmentKeys } from "../useAssessmentQueries";
import { pcaDataQueryKey } from "../usePCAData";
import { timsKeys } from "../useTimsQueries";


describe("invalidateAfterAssessmentCompleted", () => {
  it("marks every completion reader stale, and nothing else", async () => {
    const qc = new QueryClient();
    const readers = [
      assessmentKeys.progress("u1"),
      assessmentKeys.dashboardSummary("u1"),
      assessmentKeys.evaluationGroups("u1"),
      assessmentKeys.enhancedLIA("u1"),
      pcaDataQueryKey("u1", "english"),
      timsKeys.scores("u1"),
    ];
    const unrelated = ["careers", "list"];
    for (const k of [...readers, unrelated]) qc.setQueryData(k, { cached: true });

    await invalidateAfterAssessmentCompleted(qc);

    for (const k of readers) expect([k, qc.getQueryState(k)?.isInvalidated]).toEqual([k, true]);
    expect(qc.getQueryState(unrelated)?.isInvalidated).toBe(false);
  });
});
