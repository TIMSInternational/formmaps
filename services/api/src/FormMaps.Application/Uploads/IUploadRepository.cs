using FormMaps.Application.Auth;

namespace FormMaps.Application.Uploads;

/// <summary>
/// The DB touches for routes/upload.ts (FM-DOTNET-088). Only two of the six endpoints write: /school-logo resolves
/// the caller's own schoolId then sets school.logoUrl; /profile-image sets coach.imageUrl when the caller is a
/// coach. Everything runs on the caller's Identity/tenant RLS session (authenticate + tenantContext, self-scoped —
/// no permission, no runAsSystem).
/// </summary>
public interface IUploadRepository
{
    /// <summary>Read the caller's own users.schoolId (null when there's no user row or a null schoolId → "No school").</summary>
    Task<string?> GetCallerSchoolIdAsync(RequestContext context, CancellationToken cancellationToken = default);

    /// <summary>Set school.logoUrl for the caller's school (bumps updatedAt, like Prisma @updatedAt).</summary>
    Task UpdateSchoolLogoAsync(RequestContext context, string schoolId, string logoUrl, CancellationToken cancellationToken = default);

    /// <summary>Set coach.imageUrl for the caller if a coach row exists (no-op otherwise — the legacy if(coach) update).</summary>
    Task UpdateCoachImageAsync(RequestContext context, string userId, string imageUrl, CancellationToken cancellationToken = default);
}
