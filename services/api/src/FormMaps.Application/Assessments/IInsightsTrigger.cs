namespace FormMaps.Application.Assessments;

/// <summary>
/// The polyglot insights funnel trigger (formmaps#144): after an assessment write that can flip a
/// student's completion gate durably commits, implementations ask the legacy Node backend to run its
/// checkAndTriggerInsights equivalent — the gate re-check plus fingerprint-idempotent background AI
/// generation (routes/assessment.ts / assessmentService.ts). Generation itself STAYS in Node (Bedrock)
/// for the whole mixed era; this interface only carries the "check this student now" signal that the
/// .NET assessment writes were dropping.
///
/// Contract (fail-soft-BUT-LOUD — the formmaps#137 posture): <see cref="TriggerAsync"/> NEVER throws.
/// A failed or skipped trigger logs at Error with the userId + source so the affected student can be
/// backfilled, and the user request that carried the assessment write always succeeds. Callers invoke
/// it ONLY after their own transaction has committed (same ordering rule as the completion audit
/// events), and never wrap it in additional error handling.
/// </summary>
public interface IInsightsTrigger
{
    /// <summary>
    /// Fires the insight-generation check for <paramref name="userId"/> — the student whose completion
    /// gate may have flipped (for 360 feedback that is the EVALUATED user, not the evaluator).
    /// <paramref name="source"/> names the completing write for logs/backfill, mirroring the audit
    /// event names (e.g. "assessment.lia.completed", "evaluation.feedback.submitted").
    /// </summary>
    Task TriggerAsync(string userId, string source, CancellationToken cancellationToken = default);
}
