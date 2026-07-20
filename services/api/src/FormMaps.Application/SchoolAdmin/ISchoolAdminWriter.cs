namespace FormMaps.Application.SchoolAdmin;

using FormMaps.Application.Auth;

/// <summary>
/// School-admin assessment WRITES (FM-DOTNET-044), faithful port of the two DB-only mutations in
/// services/schoolAssessmentsService.ts: updateAssessmentConfig (upsert on schoolId) and upsertSchedules
/// (per-item upsert on the (schoolId, gradeLevel, assessmentType) composite). Both run under the caller's
/// WRITABLE RLS session, scoped by the schoolId the endpoint already resolved via getSchoolUser. The email
/// side-effect writes (send-reminders, setup-360) are NOT here — they need an outbound-email surface that
/// does not yet exist in .NET (deferred slice).
/// </summary>
public interface ISchoolAdminWriter
{
    Task<AssessmentConfig> UpdateAssessmentConfigAsync(
        RequestContext context,
        string schoolId,
        string userId,
        AssessmentConfigPatch patch,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<AssessmentScheduleRow>> UpsertSchedulesAsync(
        RequestContext context,
        string schoolId,
        string? userId,
        IReadOnlyList<ScheduleUpsertItem> items,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// PATCH view of the config body (legacy updateAssessmentConfig only touches provided fields via
/// `body.x !== undefined`, and aiWeights via JS truthiness `if (body.aiWeights)`). Each Has* flag mirrors
/// "the key was present (and, for aiWeights, truthy)"; only flagged fields are written. <c>AiWeightsJson</c>
/// is the compact JSON.stringify of the truthy aiWeights value.
/// </summary>
public sealed record AssessmentConfigPatch(
    bool HasWindowStart, string? WindowStart,
    bool HasWindowEnd, string? WindowEnd,
    bool HasRetakePolicy, string? RetakePolicy,
    bool HasAllowSelfSchedule, bool AllowSelfSchedule,
    bool HasReminderDaysBefore, int ReminderDaysBefore,
    bool HasAiWeights, string? AiWeightsJson);

/// <summary>One validated, complete schedule row to upsert (incomplete items are dropped upstream).</summary>
public sealed record ScheduleUpsertItem(
    int GradeLevel,
    string AssessmentType,
    DateTime StartDate,
    DateTime EndDate);
