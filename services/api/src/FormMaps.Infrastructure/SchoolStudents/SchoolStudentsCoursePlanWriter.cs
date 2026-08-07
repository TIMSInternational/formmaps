using System.Data;
using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolStudents;

namespace FormMaps.Infrastructure.SchoolStudents;

/// <summary>
/// school:manage school-admin course-plan WRITES (formmaps#107 — school-students.ts:187/209). Each write runs under
/// ONE writable RLS session and commits; INSERT/DELETE column names are fixed literals (mass-assignment guard);
/// timestamps are bound tz-independently (ms-truncated).
///
/// <para>THE INVARIANT: schoolId and academicYearId are resolved FROM THE STUDENT's row inside this same writable
/// transaction — never from the caller. Copying the admin-scoped resolution used by
/// <see cref="SchoolStudentsReviewWriter"/>'s approved+add branch would write a row scoped to the WRONG school (or
/// none at all, for a Super Admin), and SchoolStudentsCoursePlanReader reads plans by
/// (studentId, schoolId, academicYearId) — so such a row is silently invisible to every reader.</para>
/// </summary>
public sealed class SchoolStudentsCoursePlanWriter(IFormMapsDatabaseSessionFactory databaseSessionFactory)
    : ISchoolStudentsCoursePlanWriter
{
    // Prisma schema field order (term BEFORE courseId) — this is the raw row legacy echoes at 201.
    private const string PlanProjection = """
        "id", "studentId", "schoolId", "academicYearId", "term", "courseId", "status", "sortOrder", "notes",
        "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
        """;

    public async Task<CoursePlanCourseCreateResult> CreateCoursePlanCourseAsync(
        RequestContext context, string studentId, string courseId, string? term, string? createdBy,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // *** THE STUDENT's school — NOT the caller's. *** A Super Admin has no schoolId of their own, and a
        // school_admin's school is only incidentally the same one. Missing row or null schoolId → 400.
        var schoolId = await ScalarStringAsync(
            session, """SELECT "schoolId" FROM "users" WHERE "id" = @id""", "id", studentId, cancellationToken);
        if (schoolId is null)
        {
            // No commit → the session rolls back on dispose. Nothing was written in any case.
            return new CoursePlanCourseCreateResult(CoursePlanCourseCreateStatus.NoStudentSchool, null);
        }

        // findFirst({ schoolId, isCurrent: true }) with no orderBy → id ASC is a deterministic superset.
        var academicYearId = await ScalarStringAsync(
            session,
            """SELECT "id" FROM "academic_years" WHERE "schoolId" = @school AND "isCurrent" = true ORDER BY "id" ASC LIMIT 1""",
            "school", schoolId, cancellationToken);
        if (academicYearId is null)
        {
            return new CoursePlanCourseCreateResult(CoursePlanCourseCreateStatus.NoCurrentAcademicYear, null);
        }

        StudentCoursePlanRow row;
        await using (var insert = Command(session, $"""
            INSERT INTO "student_course_plans"
                ("id", "studentId", "schoolId", "academicYearId", "term", "courseId", "status", "sortOrder",
                 "isActive", "createdBy", "createdDate", "updatedAt")
            VALUES (gen_random_uuid()::text, @student, @school, @ay, @term, @course, 'planned', 0, true,
                    @createdBy, @now, @now)
            RETURNING {PlanProjection}
            """))
        {
            AddParameter(insert, "student", studentId);
            AddParameter(insert, "school", schoolId);
            AddParameter(insert, "ay", academicYearId);
            // `term: req.body.semester || req.body.term` — undefined → Prisma omits the nullable column → NULL.
            AddParameter(insert, "term", term is null ? DBNull.Value : term);
            AddParameter(insert, "course", courseId);
            AddParameter(insert, "createdBy", string.IsNullOrEmpty(createdBy) ? DBNull.Value : createdBy);
            AddTimestamp(insert, "now", Now());

            await using var reader = await insert.ExecuteReaderAsync(cancellationToken);
            await reader.ReadAsync(cancellationToken);
            row = ReadPlanRow(reader);
        }

        await session.CommitAsync(cancellationToken);
        return new CoursePlanCourseCreateResult(CoursePlanCourseCreateStatus.Created, row);
    }

    public async Task<bool> DeleteCoursePlanCourseAsync(
        RequestContext context, string studentId, string enrollmentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        int deleted;
        await using (var command = Command(session, """
            DELETE FROM "student_course_plans" WHERE "id" = @id AND "studentId" = @sid
            """))
        {
            // `"studentId" = @sid` is load-bearing: without it a caller authorised for student A could delete
            // student B's plan row by passing B's enrollment id. deleteMany's count === 0 → 404 "Not found".
            AddParameter(command, "id", enrollmentId);
            AddParameter(command, "sid", studentId);
            deleted = await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return deleted > 0;
    }

    // ---------------------------------------------------------------- mappers

    private static StudentCoursePlanRow ReadPlanRow(DbDataReader r) => new(
        Id: r.GetString(0),
        StudentId: r.GetString(1),
        SchoolId: r.GetString(2),
        AcademicYearId: r.GetString(3),
        Term: r.IsDBNull(4) ? null : r.GetString(4),
        CourseId: r.GetString(5),
        Status: r.IsDBNull(6) ? null : r.GetString(6),
        SortOrder: r.GetInt32(7),
        Notes: r.IsDBNull(8) ? null : r.GetString(8),
        IsActive: r.GetBoolean(9),
        CreatedBy: r.IsDBNull(10) ? null : r.GetString(10),
        CreatedDate: IsoZ(r.GetDateTime(11)),
        UpdatedBy: r.IsDBNull(12) ? null : r.GetString(12),
        UpdatedAt: IsoZ(r.GetDateTime(13)));

    // ---------------------------------------------------------------- helpers

    private static async Task<string?> ScalarStringAsync(
        FormMapsDatabaseSession session, string sql, string paramName, string paramValue,
        CancellationToken cancellationToken)
    {
        await using var command = Command(session, sql);
        AddParameter(command, paramName, paramValue);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is null or DBNull ? null : (string)result;
    }

    private static DateTime Now() => DateTime.UtcNow;

    private static DateTime TruncateToMs(DateTime value) =>
        new(value.Ticks - value.Ticks % TimeSpan.TicksPerMillisecond, value.Kind);

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
        parameter.Value = DateTime.SpecifyKind(TruncateToMs(value), DateTimeKind.Unspecified);
        command.Parameters.Add(parameter);
    }

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
