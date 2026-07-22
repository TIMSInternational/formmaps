using System.Data;
using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.CurriculumFrameworks;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.CurriculumFrameworks;

/// <summary>
/// curriculum:manage WRITES (FM-DOTNET-055 — routes/school-courses.ts PUT /curriculum/frameworks + PUT
/// /curriculum/frameworks/:type/courses/:courseId). Faithful port of schoolCoursesService.ts updateFrameworks /
/// customizeFrameworkCourse. The .NET write-owner for curriculum_frameworks (enable) and
/// school_framework_course_overrides (customize). Each write opens ONE writable RLS session and commits.
///
/// <para>THE KEY TRAP — the create-vs-update undefined ASYMMETRY (mirrors <c>SchoolProfileUpdateBuilder</c>): on the
/// UPSERT's UPDATE branch the SET clause is built from ONLY the fields the body actually carried
/// (<c>HasCredits</c>/<c>HasLocalName</c>) — an absent credits/localName is NOT written so the column keeps its
/// existing value (legacy Prisma <c>update:{credits:undefined}</c> skips it). gradeLevels is ALWAYS written (it is
/// <c>|| []</c>, never undefined), and updatedBy is ALWAYS set. On the INSERT (create) branch an absent
/// credits/localName is NULL, gradeLevels is the resolved array, and createdBy is set. All values parameterized;
/// credits is a numeric parameter, gradeLevels an integer[] parameter, timestamps tz-independent (Unspecified).</para>
/// </summary>
public sealed class CurriculumFrameworksWriter(IFormMapsDatabaseSessionFactory databaseSessionFactory)
    : ICurriculumFrameworksWriter
{
    public async Task UpdateFrameworksAsync(
        RequestContext context, string schoolId, IReadOnlyList<(string Type, bool Enabled, bool HasEnabled)> frameworks,
        CancellationToken cancellationToken = default)
    {
        // Empty array → NO write (legacy only runs the transaction when frameworks.length > 0).
        if (frameworks.Count == 0)
        {
            return;
        }

        var now = Now();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // ON CONFLICT (schoolId, type). configuredAt = now() on BOTH branches (legacy `new Date()`); createdBy/
        // updatedBy untouched (NULL). CREATE always writes enabled (false when the element omitted it → column
        // default). UPDATE writes enabled ONLY when the element carried a boolean — legacy `update:{enabled:undefined}`
        // SKIPS the column, keeping the existing value (same create-vs-update undefined-asymmetry the customize
        // branch handles; FM-055 gate fold). @enabled is always bound (the INSERT VALUES clause always uses it).
        foreach (var (type, enabled, hasEnabled) in frameworks)
        {
            var updateSets = hasEnabled
                ? "\"enabled\" = @enabled, \"configuredAt\" = @now, \"updatedAt\" = @now"
                : "\"configuredAt\" = @now, \"updatedAt\" = @now";
            await using var command = Command(session, $"""
                INSERT INTO "curriculum_frameworks" ("id", "schoolId", "type", "enabled", "configuredAt", "updatedAt")
                VALUES (gen_random_uuid()::text, @sid, @type, @enabled, @now, @now)
                ON CONFLICT ("schoolId", "type") DO UPDATE SET {updateSets}
                """);
            AddParameter(command, "sid", schoolId);
            AddParameter(command, "type", type);
            AddParameter(command, "enabled", enabled);
            AddTimestamp(command, "now", now);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
    }

    public async Task<CustomizeResult> CustomizeFrameworkCourseAsync(
        RequestContext context, string schoolId, string userId, string frameworkType, string courseId,
        FrameworkOverrideInput input, CancellationToken cancellationToken = default)
    {
        var now = Now();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Load the framework_courses row (credits as decimal.js STRING via trim_scale::text — raw Decimal passthrough,
        // FM-054 finding). Missing → 404.
        string courseCode, courseName, courseFrameworkType;
        string? courseDepartment, courseDescription;
        string courseCredits;
        int[] courseGradeLevels;
        await using (var loadCommand = Command(session, """
            SELECT "code", "name", "frameworkType", "department", trim_scale("credits")::text AS "credits",
                   "gradeLevels", "description"
            FROM "framework_courses" WHERE "id" = @cid
            """))
        {
            AddParameter(loadCommand, "cid", courseId);
            await using var reader = await loadCommand.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return CustomizeResult.NotFound();
            }

            courseCode = reader.GetString(0);
            courseName = reader.GetString(1);
            courseFrameworkType = reader.GetString(2);
            courseDepartment = reader.IsDBNull(3) ? null : reader.GetString(3);
            courseCredits = reader.GetString(4);
            courseGradeLevels = reader.IsDBNull(5) ? [] : reader.GetFieldValue<int[]>(5);
            courseDescription = reader.IsDBNull(6) ? null : reader.GetString(6);
        }

        // :type is UPPERCASED for this check (unlike the raw match in listFrameworkCourses). Mismatch → 400.
        if (!string.Equals(courseFrameworkType, frameworkType.ToUpperInvariant(), StringComparison.Ordinal))
        {
            return CustomizeResult.WrongType();
        }

        // The create-vs-update asymmetry: UPDATE SET only the present keys (+ always gradeLevels + updatedBy).
        var updateSets = new List<string> { "\"gradeLevels\" = @gradeLevels", "\"updatedBy\" = @userId", "\"updatedAt\" = @now" };
        if (input.HasCredits)
        {
            updateSets.Add("\"credits\" = @credits");
        }

        if (input.HasLocalName)
        {
            updateSets.Add("\"localName\" = @localName");
        }

        var sql = $"""
            INSERT INTO "school_framework_course_overrides"
                ("id", "schoolId", "frameworkCourseId", "credits", "gradeLevels", "localName", "createdBy", "updatedAt")
            VALUES (gen_random_uuid()::text, @sid, @cid, @credits, @gradeLevels, @localName, @userId, @now)
            ON CONFLICT ("schoolId", "frameworkCourseId") DO UPDATE SET {string.Join(", ", updateSets)}
            RETURNING trim_scale("credits")::text AS "credits", "gradeLevels", "localName"
            """;

        string? overrideCredits;
        int[] overrideGradeLevels;
        string? overrideLocalName;
        await using (var command = Command(session, sql))
        {
            AddParameter(command, "sid", schoolId);
            AddParameter(command, "cid", courseId);
            AddParameter(command, "credits", (object?)input.Credits ?? DBNull.Value);
            AddParameter(command, "gradeLevels", input.GradeLevels);
            AddParameter(command, "localName", (object?)input.LocalName ?? DBNull.Value);
            AddParameter(command, "userId", userId);
            AddTimestamp(command, "now", now);

            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                throw new InvalidOperationException("override UPSERT RETURNING produced no row");
            }

            overrideCredits = reader.IsDBNull(0) ? null : reader.GetString(0);
            overrideGradeLevels = reader.IsDBNull(1) ? [] : reader.GetFieldValue<int[]>(1);
            overrideLocalName = reader.IsDBNull(2) ? null : reader.GetString(2);
        }

        await session.CommitAsync(cancellationToken);

        // Merged view: name = localName || course.name; credits = override ?? course; gradeLevel = override-if-nonempty.
        var outcome = new CustomizeOutcome(
            Id: courseId,
            Code: courseCode,
            Name: string.IsNullOrEmpty(overrideLocalName) ? courseName : overrideLocalName,
            FrameworkType: courseFrameworkType,
            Department: courseDepartment,
            Credits: overrideCredits ?? courseCredits,
            GradeLevel: overrideGradeLevels.Length > 0 ? overrideGradeLevels : courseGradeLevels,
            Description: courseDescription,
            IsCustomized: true);

        return CustomizeResult.Ok(outcome);
    }

    // ---------------------------------------------------------------- npgsql helpers (mirror SchoolProfileWriter)

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

    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static DateTime Now()
    {
        var utc = DateTime.SpecifyKind(DateTimeOffset.UtcNow.UtcDateTime, DateTimeKind.Unspecified);
        return new DateTime(utc.Ticks - (utc.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Unspecified);
    }
}
