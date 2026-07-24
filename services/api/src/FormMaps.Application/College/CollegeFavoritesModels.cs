using System.Text.Json;

namespace FormMaps.Application.College;

/// <summary>
/// A university search result (college.ts:181-191 select). acceptanceRate is Decimal → JSON number (::double precision);
/// the sat*/act*/studentCount fields are Int? → number or null; tuition is a jsonb passthrough (default "{}"); the rest
/// are strings. Emitted in the schema select order.
/// </summary>
public sealed record UniversitySearchRow(
    string Id,
    string Name,
    string City,
    string? State,
    double? AcceptanceRate,
    int? SatAverage,
    int? SatReading25,
    int? SatReading75,
    int? SatMath25,
    int? SatMath75,
    int? ActCumulative25,
    int? ActCumulative75,
    int? ActCumulativeMid,
    JsonElement Tuition,
    int? StudentCount,
    string Type,
    string Website);

/// <summary>The nested university subset a favorites list carries (college.ts:207-211 include select).</summary>
public sealed record FavoriteUniversityRef(
    string Id,
    string Name,
    string City,
    string? State,
    double? AcceptanceRate,
    int? SatAverage,
    int? ActCumulativeMid,
    JsonElement Tuition,
    string Type,
    string Website);

/// <summary>A university_favorites scalar row (raw Prisma passthrough), as POST/PUT/list emit it. Timestamps ISO-Z.</summary>
public sealed record FavoriteRow(
    string Id,
    string UserId,
    string UniversityId,
    string FavoritedAt,
    string? Notes,
    string? FitClassification,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>A favorite row plus its nested university (the GET /students/:id/list shape).</summary>
public sealed record FavoriteWithUniversity(FavoriteRow Favorite, FavoriteUniversityRef University);

/// <summary>The GET /search filter (already parsed at the endpoint). Null = filter absent. AcceptanceRate bounds are
/// JS parseFloat results (may be NaN → the filter still applies and yields nothing, faithful to legacy).</summary>
public sealed record UniversitySearchFilter(string? Query, string? State, double? MinAcceptanceRate, double? MaxAcceptanceRate);

/// <summary>The outcome of POST /students/:id/list (add-to-list) — 409 already-active, else the created/reactivated row.</summary>
public enum AddToListOutcome
{
    AlreadyInList,
    InvalidBody,
    Ok,
}

public sealed record AddToListResult(AddToListOutcome Outcome, FavoriteRow? Row);
