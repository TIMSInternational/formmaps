using System.Text.Json;
using FormMaps.Application.Auth;

namespace FormMaps.Application.Prerequisites;

/// <summary>
/// The prerequisites WRITE surface (FM-DOTNET-057 — PUT /courses/:courseId/prerequisites; service updatePrerequisites).
/// Runs under the caller's WRITABLE RLS session (CommitAsync). .NET write-owner for the school_courses
/// prerequisites/corequisites columns via THIS route only.
/// </summary>
public interface IPrerequisitesWriter
{
    /// <summary>
    /// updatePrerequisites: course lookup (id + schoolId) → null (missing / wrong school) → returns false (endpoint
    /// 404). Else resolves prerequisiteRules[].courseIds → school-scoped course CODES, and writes prerequisites =
    /// those codes, corequisites = the body's array (falsy → []; non-array-truthy / non-string element → the legacy
    /// Prisma String[] type rejection = throw → 500), updatedBy = caller, "updatedAt" = now() (Prisma @updatedAt).
    /// Returns true on the write.
    /// </summary>
    Task<bool> UpdatePrerequisitesAsync(
        RequestContext context, string schoolId, string courseId, string userId, JsonElement body,
        CancellationToken cancellationToken = default);
}
