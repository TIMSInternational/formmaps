using System.Text.Json;
using FormMaps.Application.Auth;

namespace FormMaps.Application.Counselor;

/// <summary>
/// Counselor availability (FM-DOTNET-069 — routes/counselor.ts GET+PUT /me/availability). First counselor WRITE slice
/// (establishes the counselor write rail). GET reads the caller's own counselor_availabilities row (null → the endpoint's
/// minimal { timezone:"UTC", weeklySchedule:[] } default). PUT upserts (by the unique userId) timezone + weeklySchedule
/// and returns the full row. weeklySchedule is arbitrary jsonb (verbatim passthrough). Permission counselor:sessions.
/// </summary>
public interface ICounselorAvailabilityRepository
{
    /// <summary>The caller's availability row, or null when none exists yet (read-only session).</summary>
    Task<AvailabilityRow?> GetAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);

    /// <summary>Upsert (by unique userId) timezone + weeklySchedule (raw jsonb text); returns the stored full row.</summary>
    Task<AvailabilityRow> UpsertAsync(
        RequestContext context, string userId, string timezone, string weeklyScheduleJson, CancellationToken cancellationToken = default);
}

/// <summary>
/// A counselor_availabilities row as legacy emits it (raw Prisma passthrough). WeeklySchedule is the verbatim jsonb
/// value; timestamps are ISO-Z.
/// </summary>
public sealed record AvailabilityRow(
    string Id,
    string UserId,
    string Timezone,
    JsonElement WeeklySchedule,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);
