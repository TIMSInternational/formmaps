using FormMaps.Application.Auth;

namespace FormMaps.Application.Transcript;

/// <summary>
/// Write surface of legacy routes/transcript.ts. Three writes, all under the CALLER's writable RLS session
/// (legacy's <c>tenantGucOp</c>/<c>setTenantGuc</c> does the same — it sets the tenant GUCs, it does not bypass).
/// </summary>
public interface ITranscriptWriter
{
    /// <summary>computeAndPersistGpa(userId, schoolId) — upsert student_gpas, returning the persisted row.</summary>
    Task<StudentGpaRow> ComputeAndPersistGpaAsync(
        RequestContext context, string userId, string schoolId, CancellationToken cancellationToken = default);

    /// <summary>prisma.gpaConfiguration.upsert for PUT /school-admin/gpa-config, returning the row.</summary>
    Task<GpaConfigurationRow> UpsertGpaConfigAsync(
        RequestContext context, string schoolId, string actorId, GpaConfigInput input, CancellationToken cancellationToken = default);

    /// <summary>computeClassRanks(schoolId, adminUserId) — rank every active student and upsert their GPA row.</summary>
    Task<ClassRankComputation> ComputeClassRanksAsync(
        RequestContext context, string schoolId, string adminUserId, CancellationToken cancellationToken = default);
}
