namespace FormMaps.Application.CareerFit.Shadow;

// FM-CF-013. The student's own tenant, read once, before anything else the shadow job does.
//
// WHY THE JOB NEEDS ITS OWN READ OF THIS. careerfit_shadow_comparisons carries careerfit_runs' policy
// VERBATIM, and the WITH CHECK half of that policy admits a row only when it is the caller's own, or
// when its "schoolId" is the caller's tenant, or under bypass. A COMPARABLE pair takes the tenant off
// the run it measured (CareerFitShadowComparator uses run.SchoolId, which CareerFitInputReader
// snapshotted from the policied users row). The three pre-scoring arms — LEGACY_ABSENT, LEGACY_LOCKED,
// ENGINE_NOT_SCORABLE — have no run to take it from, and they are precisely the population the design
// says must be recorded, so they need the same fact from the same place.
//
// AND IT IS ALSO THE GATE, IN THE SAME POSITION CareerFitInputReader PUTS IT. "users" is policied
// (005-sensitive.sql: bypass OR self OR same school), so a caller who may not see the student gets no
// row back and the job refuses the pair instead of writing a record about someone it cannot see. That
// ordering is load-bearing: it runs BEFORE the legacy cache read, so a cross-school operator cannot
// even establish whether a student legacy scored exists.
//
// Deliberately NOT here: any decision about what to do with the answer (the runner's), any fallback
// that reconstructs a tenant from another table, and any distinction between "no such user" and "not
// visible to you" — the platform makes them the same outcome on purpose, and so does this.

/// <summary>
/// One student's tenant as the policied <c>users</c> row reports it to THIS caller's session.
/// <see cref="SchoolId"/> is null for a genuinely school-less user (a super-admin, an unaffiliated
/// account) — which is NOT the same as the student being invisible: that is a null
/// <see cref="CareerFitStudentTenant"/>.
/// </summary>
/// <param name="UserId">The student the row belongs to.</param>
/// <param name="SchoolId">The student's <c>users."schoolId"</c>, or null when they have none.</param>
public sealed record CareerFitStudentTenant(string UserId, string? SchoolId);

/// <summary>Reads a student's own tenant under the caller's RLS session — the shadow job's first read and its gate.</summary>
public interface ICareerFitStudentTenantReader
{
    /// <summary>
    /// The student's tenant, or null when no <c>users</c> row for them is visible to this session. Absent
    /// and invisible are deliberately the same answer; distinguishing them would hand a caller a probe.
    /// </summary>
    Task<CareerFitStudentTenant?> ReadAsync(
        Auth.RequestContext context, string userId, CancellationToken cancellationToken = default);
}
