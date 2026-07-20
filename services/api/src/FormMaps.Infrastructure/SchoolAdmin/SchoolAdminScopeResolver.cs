using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolAdmin;

namespace FormMaps.Infrastructure.SchoolAdmin;

/// <summary>
/// Port of legacy getSchoolUser: reads users.schoolId keyed on the caller's OWN id (context.Actor.UserId),
/// under the caller's read-only RLS session. Returns null when there is no user row or schoolId is null —
/// the endpoint maps that to 400 "No school". Deliberately ignores the JWT/tenant schoolId claim for the
/// query scope (that claim only feeds the RLS GUC); a super-admin resolves their own school here too.
/// </summary>
public sealed class SchoolAdminScopeResolver(IFormMapsDatabaseSessionFactory databaseSessionFactory)
    : ISchoolAdminScopeResolver
{
    public async Task<string?> ResolveSchoolIdAsync(RequestContext context, CancellationToken cancellationToken = default)
    {
        var userId = context.Actor!.UserId;
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = """SELECT "schoolId" FROM "users" WHERE "id" = @uid""";
        var parameter = command.CreateParameter();
        parameter.ParameterName = "uid";
        parameter.Value = userId;
        command.Parameters.Add(parameter);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null; // no user row -> "No school"
        }

        return reader.IsDBNull(0) ? null : reader.GetString(0); // null schoolId -> "No school"
    }
}
