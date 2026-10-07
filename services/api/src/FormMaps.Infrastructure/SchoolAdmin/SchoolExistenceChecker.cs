using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolAdmin;

namespace FormMaps.Infrastructure.SchoolAdmin;

/// <summary>
/// Reads "schools" under the caller's read-only session. Only ever called for a Super Admin, whose RLS plan is a
/// bypass, so the answer is "does it exist", not "may I see it".
/// </summary>
public sealed class SchoolExistenceChecker(IFormMapsDatabaseSessionFactory databaseSessionFactory)
    : ISchoolExistenceChecker
{
    public async Task<bool> SchoolExistsAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = """SELECT 1 FROM "schools" WHERE "id" = @sid""";
        var parameter = command.CreateParameter();
        parameter.ParameterName = "sid";
        parameter.Value = schoolId;
        command.Parameters.Add(parameter);

        return await command.ExecuteScalarAsync(cancellationToken) is not null;
    }
}
