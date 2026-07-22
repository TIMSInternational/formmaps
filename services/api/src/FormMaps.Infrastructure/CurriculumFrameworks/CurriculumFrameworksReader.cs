using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.CurriculumFrameworks;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.CurriculumFrameworks;

/// <summary>
/// curriculum:manage READS (FM-DOTNET-055 — routes/school-courses.ts GET /curriculum/frameworks + GET
/// /curriculum/frameworks/:type/courses). Faithful port of schoolCoursesService.ts listFrameworks /
/// listFrameworkCourses. Runs under the caller's read-only RLS session. All SQL parameterized.
///
/// <para>listFrameworks projects the school's curriculum_frameworks rows onto the four FIXED types
/// ["AP","IB","NATIONAL","CUSTOM"] in order, attaching a GLOBAL framework_courses count (grouped by frameworkType,
/// isActive=true — NOT school-scoped). listFrameworkCourses is a GLOBAL catalog read (NO school scope) filtered by
/// the RAW, case-sensitive frameworkType. credits is emitted as a JSON STRING (raw Prisma Decimal → decimal.js
/// toString via trim_scale::text — FM-054 finding); gradeLevels is
/// int[]; timestamps ISO-Z.</para>
/// </summary>
public sealed class CurriculumFrameworksReader(IFormMapsDatabaseSessionFactory databaseSessionFactory)
    : ICurriculumFrameworksReader
{
    private static readonly string[] FixedTypes = ["AP", "IB", "NATIONAL", "CUSTOM"];

    public async Task<IReadOnlyList<FrameworkSummary>> ListFrameworksAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // The school's frameworks (isActive). type → (id, enabled, configuredAt).
        var frameworks = new Dictionary<string, (string Id, bool Enabled, DateTime? ConfiguredAt)>(StringComparer.Ordinal);
        await using (var command = Command(session, """
            SELECT "id", "type", "enabled", "configuredAt"
            FROM "curriculum_frameworks"
            WHERE "schoolId" = @sid AND "isActive" = true
            """))
        {
            AddParameter(command, "sid", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                frameworks[reader.GetString(1)] = (
                    reader.GetString(0),
                    reader.GetBoolean(2),
                    reader.IsDBNull(3) ? null : reader.GetDateTime(3));
            }
        }

        // GLOBAL course count grouped by frameworkType (isActive) — NOT school-scoped (prisma.frameworkCourse.groupBy).
        var countMap = new Dictionary<string, int>(StringComparer.Ordinal);
        await using (var command = Command(session, """
            SELECT "frameworkType", COUNT(*)::int
            FROM "framework_courses"
            WHERE "isActive" = true
            GROUP BY "frameworkType"
            """))
        {
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                countMap[reader.GetString(0)] = reader.GetInt32(1);
            }
        }

        var result = new List<FrameworkSummary>(FixedTypes.Length);
        foreach (var type in FixedTypes)
        {
            var courseCount = countMap.TryGetValue(type, out var count) ? count : 0;
            if (frameworks.TryGetValue(type, out var fw))
            {
                result.Add(new FrameworkSummary(
                    HasRow: true,
                    Id: fw.Id,
                    Type: type,
                    Enabled: fw.Enabled,
                    ConfiguredAt: fw.ConfiguredAt is { } at ? IsoZ(at) : null,
                    CourseCount: courseCount));
            }
            else
            {
                // No row → id + configuredAt keys are OMITTED by the endpoint; enabled defaults false.
                result.Add(new FrameworkSummary(
                    HasRow: false, Id: null, Type: type, Enabled: false, ConfiguredAt: null, CourseCount: courseCount));
            }
        }

        return result;
    }

    public async Task<FrameworkCoursesPage> ListFrameworkCoursesAsync(
        RequestContext context, string frameworkType, int page, int limit, long skip, string? search,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // WHERE frameworkType = @type (RAW, case-sensitive) AND isActive; optional (name ILIKE OR code ILIKE).
        var where = "\"frameworkType\" = @type AND \"isActive\" = true";
        if (!string.IsNullOrEmpty(search))
        {
            where += " AND (\"name\" ILIKE @search OR \"code\" ILIKE @search)";
        }

        int total;
        await using (var countCommand = Command(session, $"""SELECT COUNT(*)::int FROM "framework_courses" WHERE {where}"""))
        {
            AddParameter(countCommand, "type", frameworkType);
            AddSearch(countCommand, search);
            total = Convert.ToInt32(await countCommand.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
        }

        var rows = new List<FrameworkCourseRow>();
        await using (var listCommand = Command(session, $"""
            SELECT "id", "frameworkType", "code", "name", "department", trim_scale("credits")::text AS "credits",
                   "gradeLevels", "description", "isGlobal", "schoolId", "isActive", "createdBy", "createdDate",
                   "updatedBy", "updatedAt"
            FROM "framework_courses"
            WHERE {where}
            ORDER BY "code" ASC, "id" ASC
            OFFSET @skip LIMIT @limit
            """))
        {
            AddParameter(listCommand, "type", frameworkType);
            AddSearch(listCommand, search);
            AddParameter(listCommand, "skip", skip);
            AddParameter(listCommand, "limit", limit);
            await using var reader = await listCommand.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add(new FrameworkCourseRow(
                    Id: reader.GetString(0),
                    FrameworkType: reader.GetString(1),
                    Code: reader.GetString(2),
                    Name: reader.GetString(3),
                    Department: reader.IsDBNull(4) ? null : reader.GetString(4),
                    Credits: reader.GetString(5),
                    GradeLevels: reader.IsDBNull(6) ? [] : reader.GetFieldValue<int[]>(6),
                    Description: reader.IsDBNull(7) ? null : reader.GetString(7),
                    IsGlobal: reader.GetBoolean(8),
                    SchoolId: reader.IsDBNull(9) ? null : reader.GetString(9),
                    IsActive: reader.GetBoolean(10),
                    CreatedBy: reader.IsDBNull(11) ? null : reader.GetString(11),
                    CreatedDate: IsoZ(reader.GetDateTime(12)),
                    UpdatedBy: reader.IsDBNull(13) ? null : reader.GetString(13),
                    UpdatedAt: IsoZ(reader.GetDateTime(14))));
            }
        }

        var totalPages = (int)Math.Ceiling(total / (double)limit);
        return new FrameworkCoursesPage(rows, total, page, limit, totalPages);
    }

    // ---------------------------------------------------------------- helpers

    private static void AddSearch(DbCommand command, string? search)
    {
        if (!string.IsNullOrEmpty(search))
        {
            // Prisma `contains` (mode insensitive), NO escaping of %/_ — faithful to legacy.
            AddParameter(command, "search", $"%{search}%");
        }
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
