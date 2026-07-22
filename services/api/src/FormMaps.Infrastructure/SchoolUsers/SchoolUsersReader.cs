using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolUsers;

namespace FormMaps.Infrastructure.SchoolUsers;

/// <summary>
/// school:users reads (FM-DOTNET-052 — routes/school.ts GET /users, GET /counselors/:counselorId/students).
/// Faithful port of schoolService.ts listSchoolUsers / getCounselorStudents. Runs under the caller's read-only RLS
/// session. All SQL parameterized; timestamps ISO-Z; gradeLevel nullable.
///
/// <para><b>Deterministic-superset ordering (FM-032 precedent, documented):</b> listSchoolUsers legacy orderBy is
/// the single field <c>createdDate DESC</c> (nondeterministic on equal createdDate); we append <c>, "id" ASC</c>.
/// getCounselorStudents has NO legacy orderBy at all; we add <c>ORDER BY a."id" ASC</c>. Both are stable supersets
/// that never change which rows a page contains — only the tie order within equal keys.</para>
/// </summary>
public sealed class SchoolUsersReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ISchoolUsersReader
{
    public async Task<SchoolUsersPage> ListSchoolUsersAsync(
        RequestContext context, string schoolId, SchoolUsersQuery query, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // where = schoolId = @sid AND isActive; + optional roleName ILIKE (Prisma contains+insensitive, %/_ NOT
        // escaped — faithful); + optional (name ILIKE OR email ILIKE) over the same search term.
        var where = "\"schoolId\" = @sid AND \"isActive\" = true";
        if (!string.IsNullOrEmpty(query.Role))
        {
            where += " AND \"roleName\" ILIKE @role";
        }

        if (!string.IsNullOrEmpty(query.Search))
        {
            where += " AND (\"name\" ILIKE @search OR \"email\" ILIKE @search)";
        }

        int total;
        await using (var countCommand = Command(session, $"""
            SELECT COUNT(*)::int FROM "users" WHERE {where}
            """))
        {
            AddUsersFilters(countCommand, schoolId, query);
            total = await ScalarIntAsync(countCommand, cancellationToken);
        }

        var rows = new List<SchoolUserRow>();
        await using (var listCommand = Command(session, $"""
            SELECT "id", "name", "email", "roleName", "gradeLevel", "isActive", "createdDate"
            FROM "users"
            WHERE {where}
            ORDER BY "createdDate" DESC, "id" ASC
            OFFSET @skip LIMIT @limit
            """))
        {
            AddUsersFilters(listCommand, schoolId, query);
            AddParameter(listCommand, "skip", query.Skip);
            AddParameter(listCommand, "limit", query.Limit);
            await using var reader = await listCommand.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add(new SchoolUserRow(
                    Id: reader.GetString(0),
                    Name: reader.GetString(1),
                    Email: reader.GetString(2),
                    RoleName: reader.GetString(3),
                    GradeLevel: reader.IsDBNull(4) ? null : reader.GetInt32(4),
                    IsActive: reader.GetBoolean(5),
                    CreatedDate: IsoZ(reader.GetDateTime(6))));
            }
        }

        return new SchoolUsersPage(rows, total, query.Page, query.Limit, TotalPages(total, query.Limit));
    }

    public async Task<CounselorStudentsResult> GetCounselorStudentsAsync(
        RequestContext context, string adminSchoolId, string counselorId, int page, int limit, long skip,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // Counselor-in-school gate: read the counselor's schoolId; missing row OR different school → error (→403).
        string? counselorSchoolId;
        var counselorExists = false;
        await using (var counselorCommand = Command(session, """SELECT "schoolId" FROM "users" WHERE "id" = @c"""))
        {
            AddParameter(counselorCommand, "c", counselorId);
            await using var reader = await counselorCommand.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                counselorExists = true;
                counselorSchoolId = reader.IsDBNull(0) ? null : reader.GetString(0);
            }
            else
            {
                counselorSchoolId = null;
            }
        }

        if (!counselorExists || counselorSchoolId != adminSchoolId)
        {
            return new CounselorStudentsResult("Counselor not in your school", [], 0, page, limit, 0);
        }

        var total = await ScalarIntAsync(session, """
            SELECT COUNT(*)::int FROM "counselor_student_assignments"
            WHERE "counselorId" = @c AND "isActive" = true
            """, counselorId, cancellationToken);

        var students = new List<CounselorStudentRow>();
        await using (var listCommand = Command(session, """
            SELECT s."id", s."name", s."email", s."gradeLevel", s."createdDate"
            FROM "counselor_student_assignments" a
            JOIN "users" s ON a."studentId" = s."id"
            WHERE a."counselorId" = @c AND a."isActive" = true
            ORDER BY a."id" ASC
            OFFSET @skip LIMIT @limit
            """))
        {
            AddParameter(listCommand, "c", counselorId);
            AddParameter(listCommand, "skip", skip);
            AddParameter(listCommand, "limit", limit);
            await using var reader = await listCommand.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                students.Add(new CounselorStudentRow(
                    Id: reader.GetString(0),
                    Name: reader.GetString(1),
                    Email: reader.GetString(2),
                    GradeLevel: reader.IsDBNull(3) ? null : reader.GetInt32(3),
                    CreatedDate: IsoZ(reader.GetDateTime(4))));
            }
        }

        return new CounselorStudentsResult(null, students, total, page, limit, TotalPages(total, limit));
    }

    // ---------------------------------------------------------------- helpers

    private static void AddUsersFilters(DbCommand command, string schoolId, SchoolUsersQuery query)
    {
        AddParameter(command, "sid", schoolId);
        if (!string.IsNullOrEmpty(query.Role))
        {
            AddParameter(command, "role", "%" + query.Role + "%");
        }

        if (!string.IsNullOrEmpty(query.Search))
        {
            AddParameter(command, "search", "%" + query.Search + "%");
        }
    }

    // Math.ceil(total / limit): total 0 → 0. limit is always ≥ 1 (clamped upstream).
    private static int TotalPages(int total, int limit) => (total + limit - 1) / limit;

    private async Task<int> ScalarIntAsync(
        FormMapsDatabaseSession session, string sql, string counselorId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, sql);
        AddParameter(command, "c", counselorId);
        return await ScalarIntAsync(command, cancellationToken);
    }

    private static async Task<int> ScalarIntAsync(DbCommand command, CancellationToken cancellationToken)
    {
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is null or DBNull ? 0 : Convert.ToInt32(result, CultureInfo.InvariantCulture);
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

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
