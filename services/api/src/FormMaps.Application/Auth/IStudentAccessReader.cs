namespace FormMaps.Application.Auth;

/// <summary>
/// Legacy <c>getStudentAccess</c> with INDEPENDENT_STUDENT_PAYWALL ON (TIMSInternational/formmaps#240).
/// Re-reads the caller's OWN <c>users."roleName"</c> + <c>"schoolId"</c> from the DB (never the JWT):
/// non-students get full access; a student whose school has an ACTIVE contract
/// (<see cref="StudentAccessRules.SchoolHasActiveContract"/>) gets full access; everyone else is
/// evaluated from their active <c>user_subscriptions</c> row (<see cref="StudentAccessRules.Evaluate"/>).
/// Only consulted while the flag is ON — with it OFF nothing calls this.
/// </summary>
public interface IStudentAccessReader
{
    /// <returns>The caller's access, or null when the caller's user row does not exist (the endpoint answers).</returns>
    /// <exception cref="Exception">Any DB failure propagates — the caller fails closed (503).</exception>
    Task<StudentAccess?> ReadAsync(RequestContext context, CancellationToken cancellationToken = default);
}
