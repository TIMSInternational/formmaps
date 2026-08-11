using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.CoursePlan;
using FormMaps.Application.Data;
using FormMaps.Application.StudentCoursePlan;

namespace FormMaps.Infrastructure.StudentCoursePlan;

/// <summary>
/// Student course-planning CRUD (FM-DOTNET-084 — routes/course-plan.ts). Reads on a read-only RLS session; create/
/// delete on a writable session + commit. Self-scoped to the caller (req.userId); every endpoint first resolves the
/// caller's OWN schoolId via a fresh users read (requireSchoolMembership) — a school-less caller short-circuits
/// (GET → the empty view, POST/DELETE → 400) before any plan query. Timestamps bind Kind=Unspecified + ms-truncated;
/// INSERT/DELETE columns are fixed literals (mass-assignment guard). GET's enrollments are a verbatim Prisma
/// passthrough of the active plan rows; totalCreditsEarned is Σ of completed grades' credits (::double precision).
/// </summary>
public sealed class StudentCoursePlanRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : IStudentCoursePlanRepository
{
    // Full studentCoursePlan row in schema field order (Prisma findMany passthrough). "gradeLevel" (#122) sits
    // between "term" and "courseId" because that is where the column was declared in the Prisma schema and this
    // projection has to reproduce findMany's key order verbatim — see StudentCoursePlanEndpoints.RowJson.
    private const string RowColumns =
        """
        "id", "studentId", "schoolId", "academicYearId", "term", "gradeLevel", "courseId", "status", "sortOrder",
        "notes", "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
        """;

    public async Task<CoursePlanView> GetCoursePlanAsync(
        RequestContext context, string studentId, string? academicYearId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // requireSchoolMembership: fresh users read of the caller's OWN { schoolId, gradeLevel }. Missing row or a null
        // schoolId → { ok:false } → the endpoint's empty 200 shape.
        string schoolId;
        int? gradeLevel;
        await using (var userCmd = Command(session, """SELECT "schoolId", "gradeLevel" FROM "users" WHERE "id" = @sid"""))
        {
            AddParameter(userCmd, "sid", studentId);
            await using var reader = await userCmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken) || reader.IsDBNull(0))
            {
                return new CoursePlanView(HasSchool: false, GradeLevel: null, Enrollments: [], TotalCreditsEarned: 0);
            }

            schoolId = reader.GetString(0);
            gradeLevel = reader.IsDBNull(1) ? null : reader.GetInt32(1);
        }

        // Resolve the academic year: ?academicYearId → findUnique(id) [NOT school-scoped — RLS bounds it]; else the
        // current year (findFirst → id ASC deterministic superset). Either may resolve to null → no plan rows.
        var resolvedYearId = await ResolveAcademicYearIdAsync(session, schoolId, academicYearId, cancellationToken);

        var enrollments = new List<CoursePlanRow>();
        if (resolvedYearId is not null)
        {
            await using var planCmd = Command(session, $"""
                SELECT {RowColumns} FROM "student_course_plans"
                WHERE "studentId" = @sid AND "schoolId" = @school AND "academicYearId" = @ay AND "isActive" = true
                ORDER BY "sortOrder" ASC, "id" ASC
                """);
            AddParameter(planCmd, "sid", studentId);
            AddParameter(planCmd, "school", schoolId);
            AddParameter(planCmd, "ay", resolvedYearId);
            await using var reader = await planCmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                enrollments.Add(MapRow(reader));
            }
        }

        // totalCreditsEarned = Σ Number(credits) over the caller's active COMPLETED grades (::double precision = Number()).
        double totalEarned;
        await using (var gradeCmd = Command(session, """
            SELECT COALESCE(SUM("credits"::double precision), 0) FROM "student_grades"
            WHERE "studentId" = @sid AND "schoolId" = @school AND "isActive" = true AND "status" = 'completed'
            """))
        {
            AddParameter(gradeCmd, "sid", studentId);
            AddParameter(gradeCmd, "school", schoolId);
            totalEarned = Convert.ToDouble(await gradeCmd.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
        }

        return new CoursePlanView(HasSchool: true, gradeLevel, enrollments, totalEarned);
    }

    public async Task<CreateCoursePlanOutcome> CreateCourseAsync(
        RequestContext context, string studentId, JsonElement body, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // requireSchoolMembership → 400 NO_SCHOOL.
        var schoolId = await ReadSchoolIdAsync(session, studentId, cancellationToken);
        if (schoolId is null)
        {
            return new CreateCoursePlanOutcome(CreateCoursePlanStatus.NoSchool);
        }

        // Current academic year → 400 "No current academic year".
        var currentYearId = await ResolveCurrentYearIdAsync(session, schoolId, cancellationToken);
        if (currentYearId is null)
        {
            return new CreateCoursePlanOutcome(CreateCoursePlanStatus.NoCurrentYear);
        }

        // #122 — the grade the course is PLANNED FOR. This is the .NET twin of Node's routes/course-plan.ts:75,
        // the student's own self-serve "add course", and it dropped the value exactly like the school-admin writer
        // #124 fixed: the row was created, the request 201'd, and the reader's `?? user.gradeLevel` fallback
        // silently re-bucketed the course into the student's CURRENT grade.
        //
        // Parsed BEFORE the courseId/term extraction below, because Node parses it after the current-year gate and
        // before `prisma.studentCoursePlan.create` — so a body that is BOTH grade-invalid and courseId-invalid gets
        // the 400, not the create's type-500. The rule itself is shared with the school-admin writer
        // (Application/CoursePlan/PlannedGradeLevel.cs); two writers of one feature disagreeing about what a valid
        // grade is would be the same class of bug, merely deferred to the flag flip.
        var (gradeLevel, gradeError) = PlannedGradeLevel.Resolve(body);
        if (gradeError is not null)
        {
            return new CreateCoursePlanOutcome(CreateCoursePlanStatus.InvalidGradeLevel, gradeError);
        }

        // courseId (required String) + semester→term (String?), extracted AFTER the two 400 gates so a Prisma type-500
        // defers past them. courseId must be a JSON string (missing/null/non-string → 500). term: absent/null → NULL;
        // string → value; any other type → 500.
        if (!TryGetString(body, "courseId", out var courseId) || courseId is null)
        {
            return new CreateCoursePlanOutcome(CreateCoursePlanStatus.InvalidBody);
        }

        if (!TryGetOptionalString(body, "semester", out var term))
        {
            return new CreateCoursePlanOutcome(CreateCoursePlanStatus.InvalidBody);
        }

        var columns = new List<string> { "\"studentId\"", "\"schoolId\"", "\"academicYearId\"", "\"courseId\"", "\"status\"", "\"createdDate\"", "\"updatedAt\"" };
        var values = new List<string> { "@sid", "@school", "@ay", "@courseId", "'planned'", "@now", "@now" };

        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        AddParameter(command, "sid", studentId);
        AddParameter(command, "school", schoolId);
        AddParameter(command, "ay", currentYearId);
        AddParameter(command, "courseId", courseId);
        AddTimestamp(command, "now", Now());

        if (term is not null)
        {
            columns.Add("\"term\"");
            values.Add("@term");
            AddParameter(command, "term", term);
        }

        // #122. Omitted when the caller sent nothing — legal, and means "unknown"; the column defaults to NULL and
        // the reader falls back to the student's current grade, which is the pre-existing behaviour. Mirrors
        // Prisma's `gradeLevel: undefined` → column omitted, exactly like `term` above.
        if (gradeLevel is not null)
        {
            columns.Add("\"gradeLevel\"");
            values.Add("@grade");
            AddParameter(command, "grade", gradeLevel.Value);
        }

        command.CommandText = $"""
            INSERT INTO "student_course_plans" ({string.Join(", ", new[] { "\"id\"" }.Concat(columns))})
            VALUES ({string.Join(", ", new[] { "gen_random_uuid()::text" }.Concat(values))})
            """;
        await command.ExecuteNonQueryAsync(cancellationToken);
        await session.CommitAsync(cancellationToken);
        return new CreateCoursePlanOutcome(CreateCoursePlanStatus.Created);
    }

    public async Task<DeleteCoursePlanStatus> DeleteCourseAsync(
        RequestContext context, string studentId, string courseId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var schoolId = await ReadSchoolIdAsync(session, studentId, cancellationToken);
        if (schoolId is null)
        {
            return DeleteCoursePlanStatus.NoSchool;
        }

        // Hard deleteMany — planned rows for this course in the caller's school. Idempotent → always success.
        await using (var command = Command(session, """
            DELETE FROM "student_course_plans"
            WHERE "studentId" = @sid AND "courseId" = @cid AND "status" = 'planned' AND "schoolId" = @school
            """))
        {
            AddParameter(command, "sid", studentId);
            AddParameter(command, "cid", courseId);
            AddParameter(command, "school", schoolId);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return DeleteCoursePlanStatus.Deleted;
    }

    private static async Task<string?> ResolveAcademicYearIdAsync(
        FormMapsDatabaseSession session, string schoolId, string? academicYearId, CancellationToken cancellationToken)
    {
        // yearId present (JS-truthy) → findUnique by id only (RLS-bounded, NOT school-filtered — matches legacy).
        if (!string.IsNullOrEmpty(academicYearId))
        {
            await using var command = Command(session, """SELECT "id" FROM "academic_years" WHERE "id" = @ay""");
            AddParameter(command, "ay", academicYearId);
            var result = await command.ExecuteScalarAsync(cancellationToken);
            return result as string;
        }

        return await ResolveCurrentYearIdAsync(session, schoolId, cancellationToken);
    }

    private static async Task<string?> ResolveCurrentYearIdAsync(
        FormMapsDatabaseSession session, string schoolId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT "id" FROM "academic_years" WHERE "schoolId" = @school AND "isCurrent" = true
            ORDER BY "id" ASC LIMIT 1
            """);
        AddParameter(command, "school", schoolId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result as string;
    }

    private static async Task<string?> ReadSchoolIdAsync(
        FormMapsDatabaseSession session, string studentId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "schoolId" FROM "users" WHERE "id" = @sid""");
        AddParameter(command, "sid", studentId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result as string; // missing row (null) or null schoolId (DBNull → null) → school-less
    }

    // Required String: true + value only for a JSON string; a missing/null/non-string prop → false (→ 500).
    private static bool TryGetString(JsonElement body, string name, out string? value)
    {
        value = null;
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty(name, out var prop))
        {
            return false;
        }

        if (prop.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        value = prop.GetString();
        return true;
    }

    // Optional String?: absent/null → true with a null value (NULL column); string → true with the value; any other
    // type → false (→ 500).
    private static bool TryGetOptionalString(JsonElement body, string name, out string? value)
    {
        value = null;
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty(name, out var prop))
        {
            return true; // absent → undefined → omitted → NULL
        }

        switch (prop.ValueKind)
        {
            case JsonValueKind.Null:
                return true; // explicit null → NULL
            case JsonValueKind.String:
                value = prop.GetString();
                return true;
            default:
                return false; // number/bool/object/array → Prisma rejects a non-string term → 500
        }
    }

    private static CoursePlanRow MapRow(DbDataReader reader) => new(
        Id: reader.GetString(0),
        StudentId: reader.GetString(1),
        SchoolId: reader.GetString(2),
        AcademicYearId: reader.GetString(3),
        Term: reader.IsDBNull(4) ? null : reader.GetString(4),
        // #122 — every ordinal below shifts by one; RowColumns puts "gradeLevel" here because Prisma emits
        // schema-declaration order and that is what legacy's findMany passthrough returns.
        GradeLevel: reader.IsDBNull(5) ? null : reader.GetInt32(5),
        CourseId: reader.GetString(6),
        Status: reader.IsDBNull(7) ? null : reader.GetString(7),
        SortOrder: reader.GetInt32(8),
        Notes: reader.IsDBNull(9) ? null : reader.GetString(9),
        IsActive: reader.GetBoolean(10),
        CreatedBy: reader.IsDBNull(11) ? null : reader.GetString(11),
        CreatedDate: IsoZ(reader.GetDateTime(12)),
        UpdatedBy: reader.IsDBNull(13) ? null : reader.GetString(13),
        UpdatedAt: IsoZ(reader.GetDateTime(14)));

    private DateTime Now() =>
        new DateTime(
            (timeProvider.GetUtcNow().UtcDateTime.Ticks / TimeSpan.TicksPerMillisecond) * TimeSpan.TicksPerMillisecond,
            DateTimeKind.Unspecified);

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

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
