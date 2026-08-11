using System.Data;
using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolStudents;

namespace FormMaps.Infrastructure.SchoolStudents;

/// <summary>
/// school:manage school-students review WRITES (FM-DOTNET-066 — verifyCommunityService / reviewChangeRequest). Each
/// runs under ONE writable RLS session and commits. Enum columns are written via a native ::enum cast; timestamps
/// bound tz-independently (ms-truncated); updatedAt always set (@updatedAt). SET/INSERT column names are fixed
/// literals (mass-assignment guard).
/// </summary>
public sealed class SchoolStudentsReviewWriter(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ISchoolStudentsReviewWriter
{
    private const string CommunityProjection = """
        "id", "studentId", "schoolId", "organization", "description", trim_scale("hours")::text, "date",
        "supervisorName", "supervisorEmail", "status"::text, "note", "verifiedBy", "verifiedAt", "isActive",
        "createdBy", "createdDate", "updatedBy", "updatedAt"
        """;

    private const string ChangeRequestProjection = """
        "id", "studentId", "schoolId", "courseId", "courseCode", "courseName", trim_scale("credits")::text,
        "gradeLevel", "semester", "action"::text, "dueDate", "studentNote", "status"::text, "counselorNote",
        "reviewedBy", "reviewedAt", "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
        """;

    public async Task<CommunityServiceEntryRow?> VerifyCommunityServiceAsync(
        RequestContext context, string entryId, string userId, string? callerSchoolId,
        string status, string? note, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Ownership: entry must exist; a non-null caller school must match (Super Admin = null → platform-wide).
        string? entrySchoolId;
        await using (var lookup = Command(session, """SELECT "schoolId" FROM "community_service_entries" WHERE "id" = @id"""))
        {
            AddParameter(lookup, "id", entryId);
            var result = await lookup.ExecuteScalarAsync(cancellationToken);
            if (result is null or DBNull)
            {
                return null; // !entry
            }

            entrySchoolId = (string)result;
        }

        if (callerSchoolId is not null && entrySchoolId != callerSchoolId)
        {
            return null; // cross-school
        }

        // note: `decision.note ? decision.note.slice(0,1000) : null` (empty → null; else first 1000 chars).
        var noteValue = string.IsNullOrEmpty(note) ? (object)DBNull.Value : note[..Math.Min(1000, note.Length)];

        CommunityServiceEntryRow row;
        await using (var update = Command(session, $"""
            UPDATE "community_service_entries"
            SET "status" = @status::"CommunityServiceStatus", "verifiedBy" = @userId, "verifiedAt" = @now,
                "note" = @note, "updatedAt" = @now
            WHERE "id" = @id
            RETURNING {CommunityProjection}
            """))
        {
            AddParameter(update, "status", status);
            AddParameter(update, "userId", userId);
            AddTimestamp(update, "now", Now());
            AddParameter(update, "note", noteValue);
            AddParameter(update, "id", entryId);
            await using var reader = await update.ExecuteReaderAsync(cancellationToken);
            await reader.ReadAsync(cancellationToken);
            row = ReadCommunityRow(reader);
        }

        await session.CommitAsync(cancellationToken);
        return row;
    }

    public async Task<bool> IsStudentInCallerSchoolAsync(
        RequestContext context, string callerSchoolId, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """SELECT "schoolId" FROM "users" WHERE "id" = @id""");
        AddParameter(command, "id", studentId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return false;
        }

        return !reader.IsDBNull(0) && reader.GetString(0) == callerSchoolId;
    }

    public async Task<CourseChangeRequestRow?> ReviewChangeRequestAsync(
        RequestContext context, string adminUserId, string studentId, string requestId,
        string? status, string? counselorNote, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Lookup: !cr || cr.studentId !== studentId → null (404 "Request not found").
        string action;
        string courseId;
        string? semester;
        int gradeLevel;
        await using (var lookup = Command(session, """
            SELECT "studentId", "action"::text, "courseId", "semester", "gradeLevel"
            FROM "course_change_requests" WHERE "id" = @id
            """))
        {
            AddParameter(lookup, "id", requestId);
            await using var reader = await lookup.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken) || reader.GetString(0) != studentId)
            {
                return null;
            }

            action = reader.GetString(1);
            courseId = reader.GetString(2);
            semester = reader.IsDBNull(3) ? null : reader.GetString(3);
            // #122 — the grade the request was FILED FOR. NOT NULL in the schema and read unguarded, exactly as
            // ReadChangeRequestRow already reads the same column off the UPDATE's RETURNING below.
            gradeLevel = reader.GetInt32(4);
        }

        // data = {status(if provided), reviewedBy, reviewedAt}; counselorNote only if truthy; updatedAt always.
        var sets = new List<string> { "\"reviewedBy\" = @admin", "\"reviewedAt\" = @now", "\"updatedAt\" = @now" };
        if (status is not null)
        {
            sets.Add("\"status\" = @status::\"CourseChangeStatus\"");
        }

        var hasNote = !string.IsNullOrEmpty(counselorNote);
        if (hasNote)
        {
            sets.Add("\"counselorNote\" = @note");
        }

        CourseChangeRequestRow updated;
        await using (var update = Command(session, $"""
            UPDATE "course_change_requests" SET {string.Join(", ", sets)}
            WHERE "id" = @id
            RETURNING {ChangeRequestProjection}
            """))
        {
            AddParameter(update, "admin", adminUserId);
            AddTimestamp(update, "now", Now());
            AddParameter(update, "id", requestId);
            if (status is not null)
            {
                AddParameter(update, "status", status);
            }

            if (hasNote)
            {
                AddParameter(update, "note", counselorNote!);
            }

            await using var reader = await update.ExecuteReaderAsync(cancellationToken);
            await reader.ReadAsync(cancellationToken);
            updated = ReadChangeRequestRow(reader);
        }

        // On approved + add, create a planned student_course_plan (when the admin has a school + a current AY).
        if (status == "approved" && action == "add")
        {
            var adminSchoolId = await ScalarStringAsync(session, """SELECT "schoolId" FROM "users" WHERE "id" = @admin""", "admin", adminUserId, cancellationToken);
            if (adminSchoolId is not null)
            {
                var currentAyId = await ScalarStringAsync(session, """
                    SELECT "id" FROM "academic_years" WHERE "schoolId" = @school AND "isCurrent" = true ORDER BY "id" ASC LIMIT 1
                    """, "school", adminSchoolId, cancellationToken);
                if (currentAyId is not null)
                {
                    // #122 — "gradeLevel" is a pure CARRY-THROUGH of the request being approved, not anything the
                    // caller sends: course_change_requests."gradeLevel" is NOT NULL and is the grade the request was
                    // filed FOR. Dropping it stored NULL, and the reader's `?? user.gradeLevel` fallback then
                    // re-bucketed an approved grade-11 request into a grade-10 student's grade 10 — the row is
                    // created and the request 200s either way, which is how this survived. The counselor path
                    // through the SAME approval (Node's routes/counselor-analytics.ts) carries it too; if only one
                    // did, the resulting plan would depend on who clicked approve.
                    await using var insert = Command(session, """
                        INSERT INTO "student_course_plans"
                            ("id", "studentId", "schoolId", "academicYearId", "courseId", "term", "gradeLevel", "status", "sortOrder", "isActive", "createdDate", "updatedAt")
                        VALUES (gen_random_uuid()::text, @student, @school, @ay, @course, @term, @grade, 'planned', 0, true, @now, @now)
                        """);
                    AddParameter(insert, "student", studentId);
                    AddParameter(insert, "school", adminSchoolId);
                    AddParameter(insert, "ay", currentAyId);
                    AddParameter(insert, "course", courseId);
                    AddParameter(insert, "term", string.IsNullOrEmpty(semester) ? "Fall" : semester); // cr.semester || "Fall"
                    AddParameter(insert, "grade", gradeLevel);
                    AddTimestamp(insert, "now", Now());
                    await insert.ExecuteNonQueryAsync(cancellationToken);
                }
            }
        }

        await session.CommitAsync(cancellationToken);
        return updated;
    }

    // ---------------------------------------------------------------- mappers

    private static CommunityServiceEntryRow ReadCommunityRow(DbDataReader r) => new(
        Id: r.GetString(0),
        StudentId: r.GetString(1),
        SchoolId: r.GetString(2),
        Organization: r.GetString(3),
        Description: r.IsDBNull(4) ? null : r.GetString(4),
        Hours: r.GetString(5),
        Date: IsoZ(r.GetDateTime(6)),
        SupervisorName: r.IsDBNull(7) ? null : r.GetString(7),
        SupervisorEmail: r.IsDBNull(8) ? null : r.GetString(8),
        Status: r.GetString(9),
        Note: r.IsDBNull(10) ? null : r.GetString(10),
        VerifiedBy: r.IsDBNull(11) ? null : r.GetString(11),
        VerifiedAt: r.IsDBNull(12) ? null : IsoZ(r.GetDateTime(12)),
        IsActive: r.GetBoolean(13),
        CreatedBy: r.IsDBNull(14) ? null : r.GetString(14),
        CreatedDate: IsoZ(r.GetDateTime(15)),
        UpdatedBy: r.IsDBNull(16) ? null : r.GetString(16),
        UpdatedAt: IsoZ(r.GetDateTime(17)));

    private static CourseChangeRequestRow ReadChangeRequestRow(DbDataReader r) => new(
        Id: r.GetString(0),
        StudentId: r.GetString(1),
        SchoolId: r.GetString(2),
        CourseId: r.GetString(3),
        CourseCode: r.IsDBNull(4) ? null : r.GetString(4),
        CourseName: r.IsDBNull(5) ? null : r.GetString(5),
        Credits: r.GetString(6),
        GradeLevel: r.GetInt32(7),
        Semester: r.IsDBNull(8) ? null : r.GetString(8),
        Action: r.GetString(9),
        DueDate: r.IsDBNull(10) ? null : IsoZ(r.GetDateTime(10)),
        StudentNote: r.IsDBNull(11) ? null : r.GetString(11),
        Status: r.GetString(12),
        CounselorNote: r.IsDBNull(13) ? null : r.GetString(13),
        ReviewedBy: r.IsDBNull(14) ? null : r.GetString(14),
        ReviewedAt: r.IsDBNull(15) ? null : IsoZ(r.GetDateTime(15)),
        IsActive: r.GetBoolean(16),
        CreatedBy: r.IsDBNull(17) ? null : r.GetString(17),
        CreatedDate: IsoZ(r.GetDateTime(18)),
        UpdatedBy: r.IsDBNull(19) ? null : r.GetString(19),
        UpdatedAt: IsoZ(r.GetDateTime(20)));

    // ---------------------------------------------------------------- helpers

    private static async Task<string?> ScalarStringAsync(
        FormMapsDatabaseSession session, string sql, string paramName, string paramValue, CancellationToken cancellationToken)
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
