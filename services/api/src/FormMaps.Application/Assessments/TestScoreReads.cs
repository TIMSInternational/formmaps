using System.Text.Json;
using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>SAT superscore block (best sections; satTotal only when both present).</summary>
public sealed record SatSuperscore(int? SatMath, int? SatReading, int? SatTotal);

/// <summary>ACT superscore block (best sections; actComposite only when all four present).</summary>
public sealed record ActSuperscore(int? ActEnglish, int? ActMath, int? ActReading, int? ActScience, int? ActComposite);

/// <summary>GET /superscore response payload (sat/act each null when the student has no such score).</summary>
public sealed record SuperscoreResult(SatSuperscore? Sat, ActSuperscore? Act);

/// <summary>One college-fit entry (SAT bands summed + reach/match/safety classification).</summary>
public sealed record CollegeFitEntry(
    string Id,
    string Name,
    string City,
    string? State,
    double? AcceptanceRate,
    int Sat25,
    int Sat75,
    string Fit);

/// <summary>GET /college-fit response payload (superscore null + empty colleges when no SAT data).</summary>
public sealed record CollegeFitResult(int? Superscore, IReadOnlyList<CollegeFitEntry> Colleges);

/// <summary>
/// Full student_test_scores row (legacy list/student-view returns the raw Prisma rows). camelCase on the
/// wire; timestamps ISO-Z; subScores jsonb passthrough (JsonElement, JSON-null when absent).
/// </summary>
public sealed record TestScoreRow(
    string Id,
    string UserId,
    string TestType,
    string? TestDate,
    int? SatTotal,
    int? SatMath,
    int? SatReading,
    int? ActComposite,
    int? ActEnglish,
    int? ActMath,
    int? ActReading,
    int? ActScience,
    string? ApSubject,
    int? ApScore,
    int? TotalScore,
    JsonElement SubScores,
    bool IsSuperScore,
    bool IsOfficial,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>
/// Read-owner for the authed test-scores READS (legacy routes/test-scores.ts). Superscore + college-fit are
/// self-scoped (the caller's own active scores); the student-view list is authorized at the endpoint by the
/// bespoke counselor-assignment / parent-link check. All reads run under the caller's read-only RLS session.
/// </summary>
public interface ITestScoreReader
{
    Task<SuperscoreResult> GetSuperscoreAsync(RequestContext context, CancellationToken cancellationToken = default);

    Task<CollegeFitResult> GetCollegeFitAsync(RequestContext context, CancellationToken cancellationToken = default);

    Task<bool> HasActiveCounselorAssignmentAsync(
        RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default);

    Task<bool> HasActiveParentLinkAsync(
        RequestContext context, string studentId, string parentEmail, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<TestScoreRow>> ListActiveScoresAsync(
        RequestContext context, string userId, string? testType, CancellationToken cancellationToken = default);
}
