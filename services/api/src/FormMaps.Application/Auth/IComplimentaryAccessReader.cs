namespace FormMaps.Application.Auth;

/// <summary>
/// audit 2026-10-09 E5 (decision D6): the latest expiry among the Super Admin complimentary grants that cover a
/// student right now — their own grant or their school's (<see cref="StudentAccessRules.IsComplimentaryGrantActive"/>).
/// Legacy twin: <c>findActiveComplimentaryExpiry</c> in api/src/lib/studentEntitlement.ts. Read under the caller's
/// own RLS session (prisma/rls/012-complimentary-access.sql lets it see exactly these rows).
/// </summary>
public interface IComplimentaryAccessReader
{
    /// <returns>The expiry (exclusive), or null when no grant covers the student or the table does not exist yet.</returns>
    Task<DateTimeOffset?> GetActiveExpiryAsync(
        RequestContext context, string userId, string? schoolId, CancellationToken cancellationToken = default);
}
