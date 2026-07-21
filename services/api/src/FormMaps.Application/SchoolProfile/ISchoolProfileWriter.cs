using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolProfile;

/// <summary>
/// school:manage writes for the profile + settings surface (routes/school.ts PUT /school/profile, PUT /settings).
/// This slice is the .NET write-owner for the schools table's profile/settings columns. Each write runs under the
/// caller's WRITABLE RLS session (CommitAsync), scoped by the resolved schoolId. Both writes always bump
/// <c>updatedAt</c> (Prisma @updatedAt) and RETURN the row, even when the patch is empty (a no-op that still
/// returns the current row — legacy prisma.update with {} does exactly this).
/// </summary>
public interface ISchoolProfileWriter
{
    /// <summary>updateSchoolProfile: apply the allow-listed <paramref name="columns"/> (mass-assignment guard) + updatedAt, RETURNING the full row.</summary>
    Task<SchoolProfileDto> UpdateSchoolProfileAsync(
        RequestContext context, string schoolId, IReadOnlyList<SchoolProfileColumn> columns, CancellationToken cancellationToken = default);

    /// <summary>updateSettings: apply the allow-listed patch + updatedAt, RETURNING the raw notify/timezone/maxStudents columns.</summary>
    Task<SchoolSettingsUpdateResult> UpdateSettingsAsync(
        RequestContext context, string schoolId, SchoolSettingsPatch patch, CancellationToken cancellationToken = default);
}
