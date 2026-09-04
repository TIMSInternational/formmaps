using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.CareerFit.Shadow;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.CareerFit;

/// <summary>
/// FM-CF-013. Reads one student's <c>users."schoolId"</c> in a read-only RLS session opened for the
/// CALLER (<c>OpenReadOnlyAsync</c>), never a bypass session — the shadow job's first read and its gate.
/// </summary>
/// <remarks>
/// <para>
/// THE SAME QUERY AND THE SAME MEANING AS <see cref="CareerFitInputReader"/>'S TENANT GATE, on purpose.
/// That reader opens with <c>SELECT "schoolId" FROM "users" WHERE "id" = @uid</c> because "users" is the
/// one policied table in its set (005-sensitive.sql: bypass OR self OR same school) and its answer is
/// both "may this caller see this student" and "what tenant does the row they write belong to". The
/// shadow job needs exactly those two facts before it reads the legacy cache, so it asks the same
/// question the same way rather than inferring a tenant from the caller's own context — a super-admin
/// operator has no tenant of its own, and a row written under one would be unreadable afterwards by the
/// school staff who asked for the cohort.
/// </para>
/// <para>
/// WHY NOT FOLD IT INTO <see cref="LegacyCareerScoreReader"/>. The arm that most needs the tenant is
/// LEGACY_ABSENT — the student with no <c>user_career_profiles</c> row at all — so the fact cannot ride
/// on the legacy row. It is its own read because it is its own question, and because it must run first.
/// </para>
/// <para>
/// Deliberately NOT here: any write, any other column of "users" (a name or an email is not an input to
/// anything this slice does), and any distinction between "no such user" and "not visible to you".
/// </para>
/// </remarks>
public sealed class CareerFitStudentTenantReader(IFormMapsDatabaseSessionFactory databaseSessionFactory)
    : ICareerFitStudentTenantReader
{
    private const string SelectSql = """
        SELECT "schoolId" FROM "users" WHERE "id" = @uid LIMIT 1
        """;

    /// <inheritdoc />
    public async Task<CareerFitStudentTenant?> ReadAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentException.ThrowIfNullOrWhiteSpace(userId);

        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = SelectSql;
        AddParameter(command, "uid", userId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new CareerFitStudentTenant(userId, reader.IsDBNull(0) ? null : reader.GetString(0));
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
