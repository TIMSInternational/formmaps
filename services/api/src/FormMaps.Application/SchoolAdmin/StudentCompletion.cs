namespace FormMaps.Application.SchoolAdmin;

/// <summary>
/// Pure per-student completion verdict — faithful port of <c>computeStudentCompletion</c>
/// (services/assessmentService.ts), the single source of truth for whether a student is "done".
/// A PCA row exists as soon as the survey STARTS, so existence is not completion — pcaCompleted
/// requires an <c>isCompleted</c> row. The 360 gate is a THRESHOLD, not 100%: min(evalTotal, 3)
/// completed evaluations (so one unresponsive parent can't permanently lock a student).
/// </summary>
public static class StudentCompletion
{
    public static StudentCompletionVerdict Compute(
        IReadOnlyList<string> liaExamTypes,
        IReadOnlyList<bool> evalGroupsCompleted,
        IReadOnlyList<bool> pcaEvalsCompleted)
    {
        var liaCompleted = new HashSet<string>(liaExamTypes, StringComparer.Ordinal).Count;
        var evalTotal = evalGroupsCompleted.Count;
        var evalCompleted = evalGroupsCompleted.Count(c => c);
        var pcaCompleted = pcaEvalsCompleted.Any(c => c);

        var allLiaDone = liaCompleted >= 5;
        var evalRequired = Math.Min(evalTotal, 3);
        var allEvalDone = evalTotal > 0 && evalCompleted >= evalRequired;
        var allDone = allLiaDone && allEvalDone && pcaCompleted;

        return new StudentCompletionVerdict(liaCompleted, 5, evalCompleted, evalTotal, pcaCompleted, allDone);
    }
}

public sealed record StudentCompletionVerdict(
    int LiaCompleted,
    int LiaTotal,
    int EvalCompleted,
    int EvalTotal,
    bool PcaCompleted,
    bool AllDone);
