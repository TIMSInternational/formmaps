using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolAdmin;

/// <summary>
/// The school-scoping rail (legacy getSchoolUser). Resolves the caller's schoolId by a FRESH read of
/// users.schoolId keyed on the caller's own id — it does NOT trust the JWT/tenant schoolId claim for the
/// query scope (the token schoolId only drives the RLS GUC). Returns null when the caller has no row or a
/// null schoolId, which every school-admin endpoint maps to 400 "No school". A super-admin is still scoped
/// to their OWN users.schoolId — there is no cross-school parameter anywhere on this router. Reusable by
/// sub-slice 2 reads and the school-admin writes.
/// </summary>
public interface ISchoolAdminScopeResolver
{
    Task<string?> ResolveSchoolIdAsync(RequestContext context, CancellationToken cancellationToken = default);
}
