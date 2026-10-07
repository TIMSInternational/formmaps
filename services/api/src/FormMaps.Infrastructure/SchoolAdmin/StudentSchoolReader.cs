using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolAdmin;

namespace FormMaps.Infrastructure.SchoolAdmin;

/// <summary>Reads "users"."schoolId" for one id under the caller's read-only (Super Admin: bypass) session.</summary>
public sealed class StudentSchoolReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IStudentSchoolReader
{
    public async Task<string?> ReadStudentSchoolIdAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = """SELECT "schoolId" FROM "users" WHERE "id" = @sid""";
        var parameter = command.CreateParameter();
        parameter.ParameterName = "sid";
        parameter.Value = studentId;
        command.Parameters.Add(parameter);

        return await command.ExecuteScalarAsync(cancellationToken) as string;
    }
}
