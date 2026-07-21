using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolProfile;

/// <summary>
/// school:manage reads for the profile + settings surface (routes/school.ts GET /school/profile, GET /settings).
/// Both run under the caller's read-only RLS session, scoped by the schoolId the endpoint already resolved.
/// </summary>
public interface ISchoolProfileReader
{
    /// <summary>getSchoolProfile: the full schools row + the <c>email</c> alias, or null when the row is missing.</summary>
    Task<SchoolProfileDto?> GetSchoolProfileAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default);

    /// <summary>getSettings: composed settings for the caller's school + admin identity, or null when the school row is missing.</summary>
    Task<SchoolSettings?> GetSettingsAsync(
        RequestContext context, string userId, string schoolId, CancellationToken cancellationToken = default);
}
