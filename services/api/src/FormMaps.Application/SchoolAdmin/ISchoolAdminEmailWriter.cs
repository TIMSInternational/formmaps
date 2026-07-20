using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolAdmin;

/// <summary>
/// The two school-admin email WRITES (legacy sendReminders + setup360, schoolAssessmentsService.ts). Split from
/// <see cref="ISchoolAdminWriter"/> because they own the FIRST outbound-email surface (SES) — sendReminders is
/// email-only (no DB write); setup360 bulk-inserts evaluation_groups + fires invite emails best-effort.
/// </summary>
public interface ISchoolAdminEmailWriter
{
    /// <summary>Returns null when the school does not exist (→ route 404 "School not found").</summary>
    Task<ReminderResult?> SendRemindersAsync(
        RequestContext context, string schoolId, IReadOnlyList<string> studentIds,
        IReadOnlyList<string> assessmentTypes, CancellationToken cancellationToken = default);

    /// <summary>Returns null when there are no students to set up (→ route 400 "No students to setup").</summary>
    Task<Setup360Result?> Setup360Async(
        RequestContext context, string schoolId, string? userId, IReadOnlyList<string> studentIds,
        int? gradeLevel, CancellationToken cancellationToken = default);
}

public sealed record ReminderResult(int Sent, int Failed, int Total);

public sealed record Setup360Result(int Created, int Skipped, int EmailsSent, int StudentsProcessed);
