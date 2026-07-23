using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Pathways;

namespace FormMaps.Infrastructure.Pathways;

/// <summary>
/// Derived-pathways read (FM-DOTNET-058 — routes/school-courses.ts). Faithful port of schoolCoursesService.ts
/// <c>computePathways</c>: loads the active catalog under the caller's read-only RLS session, then delegates the pure
/// graph derivation to <see cref="PathwaysComputer"/>. The load-bearing part is the <c>ORDER BY "code" ASC</c> — same
/// Postgres collation as the legacy Prisma <c>orderBy: { code: "asc" }</c> — which fixes byCode last-wins, forward-edge
/// push order, root order and DFS order. All SQL parameterized; text[] prerequisites passthrough verbatim.
/// </summary>
public sealed class PathwaysReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IPathwaysReader
{
    public async Task<PathwaysResult> ComputePathwaysAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var courses = new List<PathwayCourseRow>();
        await using (var command = Command(session, """
            SELECT "id", "code", "name", "department", "prerequisites", "isHonors"
            FROM "school_courses"
            WHERE "schoolId" = @sid AND "isActive" = true AND "status" = 'active'
            ORDER BY "code" ASC
            """))
        {
            AddParameter(command, "sid", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                courses.Add(new PathwayCourseRow(
                    Id: reader.GetString(0),
                    Code: reader.GetString(1),
                    Name: reader.GetString(2),
                    Department: reader.GetString(3),
                    Prerequisites: reader.IsDBNull(4) ? [] : reader.GetFieldValue<string[]>(4),
                    IsHonors: reader.GetBoolean(5)));
            }
        }

        return PathwaysComputer.Compute(courses);
    }

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
