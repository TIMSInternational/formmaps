using FormMaps.Application.Auth;
using FormMaps.Application.StudentApplications;

namespace FormMaps.Application.College;

/// <summary>
/// College applications CRUD (FM-DOTNET-081 — routes/college.ts Feature 1, mounted /api/v1/college). Cross-user
/// scoped: the caller acts on a student's applications gated by <see cref="ICollegeAccessResolver"/>. Reads on a
/// read-only RLS session; create/update/soft-delete on a writable session + commit. List returns the reduced
/// <see cref="ApplicationListRow"/> (with unfiltered checklist/essay counts); create/update return the FULL
/// <see cref="ApplicationRow"/> (raw Prisma passthrough of student_applications, same shape as FM-074).
/// </summary>
public interface ICollegeApplicationsRepository
{
    /// <summary>The student's active applications, createdDate DESC (+ id tie-break), reduced shape.</summary>
    Task<IReadOnlyList<ApplicationListRow>> ListAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default);

    /// <summary>Create (name resolved via the universities lookup). Returns the full created row.</summary>
    Task<ApplicationRow> CreateAsync(
        RequestContext context, string callerId, CollegeCreateInput input, CancellationToken cancellationToken = default);

    /// <summary>
    /// The studentId owner of an ACTIVE application (findUnique { id, isActive:true }), or null (→ 404
    /// "Application not found"). Used to resolve the access target before the update/delete write.
    /// </summary>
    Task<string?> FindActiveOwnerAsync(
        RequestContext context, string id, CancellationToken cancellationToken = default);

    /// <summary>Apply the resolved partial update (existence + access already gated). Returns the full updated row.</summary>
    Task<ApplicationRow> ApplyUpdateAsync(
        RequestContext context, string callerId, string id, CollegeUpdateFields fields, CancellationToken cancellationToken = default);

    /// <summary>Soft-delete (isActive=false) by id (existence + access already gated).</summary>
    Task SoftDeleteAsync(
        RequestContext context, string callerId, string id, CancellationToken cancellationToken = default);
}
