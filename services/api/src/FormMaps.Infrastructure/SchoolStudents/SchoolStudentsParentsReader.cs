using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolStudents;

namespace FormMaps.Infrastructure.SchoolStudents;

/// <summary>
/// school:manage parent-link reads (FM-DOTNET-063 — routes/school-students.ts listParents / listParentsForStudent).
/// Runs under the caller's read-only RLS session; parameterized SQL. The /parents roster JOINs student_parent_links
/// → users to school-scope via the student relation (student_parent_links has no schoolId column — the byte-for-byte
/// legacy `where: { student: { schoolId } }` relation filter), paginates LINKS, then groups by lower(parentEmail)
/// keep-first in memory. Stats are school-wide (search-independent, un-paginated). Timestamps ISO-Z; the per-student
/// status uses <see cref="TimeProvider"/> (accepted / token-expired / pending).
/// </summary>
public sealed class SchoolStudentsParentsReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : ISchoolStudentsParentsReader
{
    public async Task<bool> IsStudentInCallerSchoolAsync(
        RequestContext context, string callerSchoolId, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """SELECT "schoolId" FROM "users" WHERE "id" = @id""");
        AddParameter(command, "id", studentId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return false; // !student
        }

        // student.schoolId === admin.schoolId (a null student schoolId can never equal the non-null caller school).
        return !reader.IsDBNull(0) && reader.GetString(0) == callerSchoolId;
    }

    public async Task<IReadOnlyList<StudentParentLinkView>> ListParentsForStudentAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // now (ms epoch is compared JS-side); read tokenExpiresAt as a UTC instant to match Prisma's UTC storage.
        var now = timeProvider.GetUtcNow().UtcDateTime;

        var links = new List<StudentParentLinkView>();
        await using var command = Command(session, """
            SELECT "id", "parentName", "parentEmail", "relation", "isAccepted",
                   "tokenExpiresAt", "createdDate", "acceptedAt", "parentUserId"
            FROM "student_parent_links"
            WHERE "studentId" = @id AND "isActive" = true
            ORDER BY "createdDate" DESC, "id" ASC
            """);
        AddParameter(command, "id", studentId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var isAccepted = reader.GetBoolean(4);
            var tokenExpiresAt = reader.IsDBNull(5) ? (DateTime?)null : reader.GetDateTime(5);
            var status = isAccepted
                ? "accepted"
                : tokenExpiresAt is { } exp && DateTime.SpecifyKind(exp, DateTimeKind.Utc) < now
                    ? "expired"
                    : "pending";

            links.Add(new StudentParentLinkView(
                Id: reader.GetString(0),
                Name: reader.GetString(1),
                Email: reader.GetString(2),
                Relationship: reader.GetString(3),
                Status: status,
                InvitedAt: IsoZ(reader.GetDateTime(6)),
                AcceptedAt: reader.IsDBNull(7) ? null : IsoZ(reader.GetDateTime(7)),
                ParentUserId: reader.IsDBNull(8) ? null : reader.GetString(8)));
        }

        return links;
    }

    public async Task<ParentsListPage> ListParentsAsync(
        RequestContext context, string schoolId, ParentsListQuery query, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // where = student.schoolId = @school AND link.isActive; + optional search over parentName OR parentEmail
        // (Prisma `contains` insensitive = ILIKE '%term%'; no %/_ escaping — faithful).
        var where = "s.\"schoolId\" = @school AND l.\"isActive\" = true";
        var hasSearch = !string.IsNullOrEmpty(query.Search);
        if (hasSearch)
        {
            where += " AND (l.\"parentName\" ILIKE @search OR l.\"parentEmail\" ILIKE @search)";
        }

        int total;
        await using (var countCommand = Command(session, $"""
            SELECT COUNT(*)::int
            FROM "student_parent_links" l
            JOIN "users" s ON l."studentId" = s."id"
            WHERE {where}
            """))
        {
            AddParameter(countCommand, "school", schoolId);
            if (hasSearch)
            {
                AddParameter(countCommand, "search", "%" + query.Search + "%");
            }

            total = await ScalarIntFromAsync(countCommand, cancellationToken);
        }

        // Paginate LINKS (createdDate DESC + id ASC tie-break), then group by lower(parentEmail) keep-first. A parent
        // linked to N students yields N links → N appended students; total counts raw LINKS (so data.Count can be < total).
        var groups = new Dictionary<string, GroupAccumulator>(StringComparer.Ordinal);
        var order = new List<string>();
        await using (var listCommand = Command(session, $"""
            SELECT l."id", l."parentName", l."parentEmail", l."parentUserId", l."isAccepted", l."acceptedAt",
                   l."createdDate", s."id", s."name", s."email", s."gradeLevel"
            FROM "student_parent_links" l
            JOIN "users" s ON l."studentId" = s."id"
            WHERE {where}
            ORDER BY l."createdDate" DESC, l."id" ASC
            OFFSET @skip LIMIT @limit
            """))
        {
            AddParameter(listCommand, "school", schoolId);
            if (hasSearch)
            {
                AddParameter(listCommand, "search", "%" + query.Search + "%");
            }

            AddParameter(listCommand, "skip", query.Skip);
            AddParameter(listCommand, "limit", query.Limit);
            await using var reader = await listCommand.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var parentEmail = reader.GetString(2);
                var key = parentEmail.ToLowerInvariant();
                if (!groups.TryGetValue(key, out var group))
                {
                    group = new GroupAccumulator(
                        Id: reader.GetString(0),
                        ParentName: reader.GetString(1),
                        ParentEmail: parentEmail,
                        ParentUserId: reader.IsDBNull(3) ? null : reader.GetString(3),
                        IsAccepted: reader.GetBoolean(4),
                        AcceptedAt: reader.IsDBNull(5) ? null : IsoZ(reader.GetDateTime(5)),
                        CreatedDate: IsoZ(reader.GetDateTime(6)),
                        Students: []);
                    groups[key] = group;
                    order.Add(key);
                }

                group.Students.Add(new ParentStudent(
                    Id: reader.GetString(7),
                    Name: reader.IsDBNull(8) ? null : reader.GetString(8),
                    Email: reader.GetString(9),
                    GradeLevel: reader.IsDBNull(10) ? null : reader.GetInt32(10)));
            }
        }

        var data = order.Select(key =>
        {
            var g = groups[key];
            return new ParentGroup(g.Id, g.ParentName, g.ParentEmail, g.ParentUserId, g.IsAccepted, g.AcceptedAt,
                g.CreatedDate, g.Students);
        }).ToList();

        // Stats — school-wide, NO search filter, NO pagination (three independent aggregates).
        var totalParents = await StatIntAsync(session, """
            SELECT COUNT(DISTINCT l."parentEmail")::int
            FROM "student_parent_links" l JOIN "users" s ON l."studentId" = s."id"
            WHERE s."schoolId" = @school AND l."isActive" = true
            """, schoolId, cancellationToken);
        var linkedStudents = await StatIntAsync(session, """
            SELECT COUNT(*)::int
            FROM "student_parent_links" l JOIN "users" s ON l."studentId" = s."id"
            WHERE s."schoolId" = @school AND l."isActive" = true
            """, schoolId, cancellationToken);
        var pendingInvites = await StatIntAsync(session, """
            SELECT COUNT(*)::int
            FROM "student_parent_links" l JOIN "users" s ON l."studentId" = s."id"
            WHERE s."schoolId" = @school AND l."isActive" = true AND l."isAccepted" = false
            """, schoolId, cancellationToken);

        var totalPages = (int)Math.Ceiling(total / (double)query.Limit);
        return new ParentsListPage(data, total, totalPages, query.Page,
            new ParentsStats(totalParents, linkedStudents, pendingInvites));
    }

    // ---------------------------------------------------------------- helpers

    private sealed record GroupAccumulator(
        string Id, string ParentName, string ParentEmail, string? ParentUserId, bool IsAccepted,
        string? AcceptedAt, string CreatedDate, List<ParentStudent> Students);

    private async Task<int> StatIntAsync(
        FormMapsDatabaseSession session, string sql, string schoolId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, sql);
        AddParameter(command, "school", schoolId);
        return await ScalarIntFromAsync(command, cancellationToken);
    }

    private static async Task<int> ScalarIntFromAsync(DbCommand command, CancellationToken cancellationToken)
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
