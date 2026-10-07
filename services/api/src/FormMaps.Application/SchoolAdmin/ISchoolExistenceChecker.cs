using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolAdmin;

/// <summary>Whether a school row exists — the check behind a Super Admin's X-Acting-School-Id.</summary>
public interface ISchoolExistenceChecker
{
    Task<bool> SchoolExistsAsync(RequestContext context, string schoolId, CancellationToken cancellationToken = default);
}
