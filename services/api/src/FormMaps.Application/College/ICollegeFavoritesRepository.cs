using FormMaps.Application.Auth;

namespace FormMaps.Application.College;

/// <summary>
/// College search + favorites (FM-DOTNET-082 — routes/college.ts Feature 2, mounted /api/v1/college). Search is a
/// read-only university catalog query (no access gate — any authenticated caller). Favorites are cross-user scoped
/// (gated by <see cref="ICollegeAccessResolver"/> at the endpoint): list (with the nested university), add-to-list
/// (upsert-reactivate on the unique (userId,universityId) + 409 already-active), fit update, soft-delete. Reads on a
/// read-only RLS session; writes on a writable session + commit.
/// </summary>
public interface ICollegeFavoritesRepository
{
    /// <summary>Active universities matching the filter, name ASC, take 20 (Decimal→number, tuition jsonb passthrough).</summary>
    Task<IReadOnlyList<UniversitySearchRow>> SearchAsync(
        RequestContext context, UniversitySearchFilter filter, CancellationToken cancellationToken = default);

    /// <summary>The student's active favorites (+ nested university), createdDate DESC (+ id tie-break).</summary>
    Task<IReadOnlyList<FavoriteWithUniversity>> ListFavoritesAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Add a university to the student's list. Existing + active → AlreadyInList (409). Existing + inactive →
    /// reactivate. Missing → create. fitValid=false (a non-string fitClassification on the write path) → InvalidBody
    /// (500) — but a 409 short-circuits BEFORE the fit check (legacy never writes when already-active).
    /// </summary>
    Task<AddToListResult> AddToListAsync(
        RequestContext context, string studentId, string universityId, bool fitValid, bool hasFit, bool fitIsNull,
        string? fit, string callerId, CancellationToken cancellationToken = default);

    /// <summary>The userId owner of an ACTIVE favorite (findUnique { id, isActive:true }), or null (→ 404 "Not found").</summary>
    Task<string?> FindActiveFavoriteOwnerAsync(
        RequestContext context, string id, CancellationToken cancellationToken = default);

    /// <summary>Apply the fitClassification update (existence + access already gated). Returns the full row.</summary>
    Task<FavoriteRow> UpdateFitAsync(
        RequestContext context, string id, bool hasFit, bool fitIsNull, string? fit, string callerId,
        CancellationToken cancellationToken = default);

    /// <summary>Soft-delete (isActive=false) by id (existence + access already gated).</summary>
    Task SoftDeleteFavoriteAsync(
        RequestContext context, string id, string callerId, CancellationToken cancellationToken = default);
}
