using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Counselor;

/// <summary>
/// Counselor dashboard self-contained reads (FM-DOTNET-067 — routes/counselor.ts /dashboard,
/// /dashboard/change-requests, /me/students/{id}, /students/{id}). Read-only RLS session; parameterized SQL.
///
/// <para>Parity notes preserved from the live TS: (a) the /dashboard pendingRequests count has NO isActive filter,
/// while the /dashboard/change-requests list DOES (status='pending' AND isActive=true); (b) change-requests
/// <c>total</c> = the returned page length (rows.Count), NOT a full COUNT; (c) each change-request row carries the
/// joined student name RAW (the endpoint emits both nested <c>student.name</c> and <c>studentName</c> = name ||
/// "Student"); (d) note content truncates to the first 200 chars; (e) an empty caseload → <c>= ANY('{}')</c> matches
/// nothing → count 0 / empty list. course_change_requests.credits = raw Decimal → JSON STRING (trim_scale::text);
/// course_change_requests.status is the native CourseChangeStatus enum (compared ::text); counselor_sessions.status is
/// a plain string column.</para>
/// </summary>
public sealed class CounselorDashboardReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : ICounselorDashboardReader
{
    public async Task<CounselorDashboardResult> GetDashboardAsync(
        RequestContext context, string counselorId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        // UTC wall-clock at ms precision, bound Kind=Unspecified so Npgsql binds it as `timestamp` (without time
        // zone) — matching the Prisma @db.Timestamp(3) startTime/followUpDate columns. A Kind=Utc value would infer
        // `timestamptz` and Postgres would apply a TimeZone-GUC-dependent cast on the comparison, diverging on any
        // non-UTC session (see LiaSessionWriter.cs:144-147 — the codebase's tz-independence rule). Legacy `new Date()`
        // is tz-independent (Prisma binds it as `timestamp`).
        var now = TruncateToMilliseconds(
            DateTime.SpecifyKind(timeProvider.GetUtcNow().UtcDateTime, DateTimeKind.Unspecified));

        // Active caseload assignment studentIds.
        var studentIds = new List<string>();
        await using (var command = Command(session, """
            SELECT "studentId" FROM "counselor_student_assignments"
            WHERE "counselorId" = @cid AND "isActive" = true
            """))
        {
            AddParameter(command, "cid", counselorId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                studentIds.Add(reader.GetString(0));
            }
        }

        var ids = studentIds.ToArray();

        // pendingRequests — NOTE: NO isActive filter (asymmetry vs /dashboard/change-requests). Empty caseload → 0.
        int pendingRequests;
        await using (var command = Command(session, """
            SELECT COUNT(*)::int FROM "course_change_requests"
            WHERE "studentId" = ANY(@ids) AND "status"::text = 'pending'
            """))
        {
            AddParameter(command, "ids", ids);
            pendingRequests = await ScalarIntAsync(command, cancellationToken);
        }

        // upcomingSessions — counselor's own confirmed sessions starting after now (status is a plain string column).
        int upcomingSessions;
        await using (var command = Command(session, """
            SELECT COUNT(*)::int FROM "counselor_sessions"
            WHERE "counselorId" = @cid AND "status" = 'confirmed' AND "startTime" > @now
            """))
        {
            AddParameter(command, "cid", counselorId);
            AddParameter(command, "now", now);
            upcomingSessions = await ScalarIntAsync(command, cancellationToken);
        }

        // followUps — open follow-ups with a date set.
        int followUps;
        await using (var command = Command(session, """
            SELECT COUNT(*)::int FROM "counselor_notes"
            WHERE "authorId" = @cid AND "isActive" = true AND "followUpCompleted" = false AND "followUpDate" IS NOT NULL
            """))
        {
            AddParameter(command, "cid", counselorId);
            followUps = await ScalarIntAsync(command, cancellationToken);
        }

        // overdueFollowUps — open follow-ups whose date is in the past.
        int overdueFollowUps;
        await using (var command = Command(session, """
            SELECT COUNT(*)::int FROM "counselor_notes"
            WHERE "authorId" = @cid AND "isActive" = true AND "followUpCompleted" = false AND "followUpDate" < @now
            """))
        {
            AddParameter(command, "cid", counselorId);
            AddParameter(command, "now", now);
            overdueFollowUps = await ScalarIntAsync(command, cancellationToken);
        }

        // pendingFollowUpsList — 5 oldest open dated follow-ups (followUpDate ASC + id tie-break).
        List<CounselorDashboardNote> pendingFollowUpsList;
        await using (var command = Command(session, $"""
            {NoteSelect}
            WHERE n."authorId" = @cid AND n."isActive" = true AND n."followUpCompleted" = false AND n."followUpDate" IS NOT NULL
            ORDER BY n."followUpDate" ASC, n."id" ASC
            LIMIT 5
            """))
        {
            AddParameter(command, "cid", counselorId);
            pendingFollowUpsList = await ReadNotesAsync(command, cancellationToken);
        }

        // recentNotes — 5 most recent notes (createdDate DESC + id tie-break).
        List<CounselorDashboardNote> recentNotes;
        await using (var command = Command(session, $"""
            {NoteSelect}
            WHERE n."authorId" = @cid AND n."isActive" = true
            ORDER BY n."createdDate" DESC, n."id" ASC
            LIMIT 5
            """))
        {
            AddParameter(command, "cid", counselorId);
            recentNotes = await ReadNotesAsync(command, cancellationToken);
        }

        return new CounselorDashboardResult(
            TotalStudents: studentIds.Count,
            PendingRequests: pendingRequests,
            UpcomingSessions: upcomingSessions,
            FollowUps: followUps,
            OverdueFollowUps: overdueFollowUps,
            PendingFollowUpsList: pendingFollowUpsList,
            RecentNotes: recentNotes);
    }

    public async Task<CounselorChangeRequestsResult> GetDashboardChangeRequestsAsync(
        RequestContext context, string counselorId, int limit, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // Caller's own school (fresh read on the caller's id). No school → empty early return.
        string? schoolId;
        await using (var command = Command(session, """SELECT "schoolId" FROM "users" WHERE "id" = @cid"""))
        {
            AddParameter(command, "cid", counselorId);
            var result = await command.ExecuteScalarAsync(cancellationToken);
            schoolId = result is null or DBNull ? null : (string)result;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return new CounselorChangeRequestsResult([], 0);
        }

        // Active caseload studentIds. Empty caseload → empty early return.
        var studentIds = new List<string>();
        await using (var command = Command(session, """
            SELECT "studentId" FROM "counselor_student_assignments"
            WHERE "counselorId" = @cid AND "isActive" = true
            """))
        {
            AddParameter(command, "cid", counselorId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                studentIds.Add(reader.GetString(0));
            }
        }

        if (studentIds.Count == 0)
        {
            return new CounselorChangeRequestsResult([], 0);
        }

        var rows = new List<CounselorChangeRequestRow>();
        await using (var command = Command(session, """
            SELECT ccr."id", ccr."studentId", ccr."schoolId", ccr."courseId", ccr."courseCode", ccr."courseName",
                   trim_scale(ccr."credits")::text, ccr."gradeLevel", ccr."semester", ccr."action"::text, ccr."dueDate",
                   ccr."studentNote", ccr."status"::text, ccr."counselorNote", ccr."reviewedBy", ccr."reviewedAt",
                   ccr."isActive", ccr."createdBy", ccr."createdDate", ccr."updatedBy", ccr."updatedAt", u."name"
            FROM "course_change_requests" ccr
            LEFT JOIN "users" u ON u."id" = ccr."studentId"
            WHERE ccr."schoolId" = @school AND ccr."studentId" = ANY(@ids)
                  AND ccr."status"::text = 'pending' AND ccr."isActive" = true
            ORDER BY ccr."createdDate" DESC, ccr."id" ASC
            LIMIT @limit
            """))
        {
            AddParameter(command, "school", schoolId);
            AddParameter(command, "ids", studentIds.ToArray());
            AddParameter(command, "limit", limit);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add(new CounselorChangeRequestRow(
                    Id: reader.GetString(0),
                    StudentId: reader.GetString(1),
                    SchoolId: reader.GetString(2),
                    CourseId: reader.GetString(3),
                    CourseCode: reader.IsDBNull(4) ? null : reader.GetString(4),
                    CourseName: reader.IsDBNull(5) ? null : reader.GetString(5),
                    Credits: reader.GetString(6),
                    GradeLevel: reader.GetInt32(7),
                    Semester: reader.IsDBNull(8) ? null : reader.GetString(8),
                    Action: reader.GetString(9),
                    DueDate: reader.IsDBNull(10) ? null : IsoZ(reader.GetDateTime(10)),
                    StudentNote: reader.IsDBNull(11) ? null : reader.GetString(11),
                    Status: reader.GetString(12),
                    CounselorNote: reader.IsDBNull(13) ? null : reader.GetString(13),
                    ReviewedBy: reader.IsDBNull(14) ? null : reader.GetString(14),
                    ReviewedAt: reader.IsDBNull(15) ? null : IsoZ(reader.GetDateTime(15)),
                    IsActive: reader.GetBoolean(16),
                    CreatedBy: reader.IsDBNull(17) ? null : reader.GetString(17),
                    CreatedDate: IsoZ(reader.GetDateTime(18)),
                    UpdatedBy: reader.IsDBNull(19) ? null : reader.GetString(19),
                    UpdatedAt: IsoZ(reader.GetDateTime(20)),
                    StudentName: reader.IsDBNull(21) ? null : reader.GetString(21)));
            }
        }

        // total = the returned page length (legacy `total: requests.length`), NOT a full COUNT.
        return new CounselorChangeRequestsResult(rows, rows.Count);
    }

    public async Task<bool> HasActiveAssignmentAsync(
        RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT 1 FROM "counselor_student_assignments"
            WHERE "counselorId" = @cid AND "studentId" = @sid AND "isActive" = true
            LIMIT 1
            """);
        AddParameter(command, "cid", counselorId);
        AddParameter(command, "sid", studentId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken);
    }

    public async Task<CounselorStudentDetail?> GetStudentDetailAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT "id", "name", "email", "gradeLevel", "schoolId", "createdDate" FROM "users" WHERE "id" = @id
            """);
        AddParameter(command, "id", studentId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new CounselorStudentDetail(
            Id: reader.GetString(0),
            Name: reader.IsDBNull(1) ? null : reader.GetString(1),
            Email: reader.IsDBNull(2) ? null : reader.GetString(2),
            GradeLevel: reader.IsDBNull(3) ? null : reader.GetInt32(3),
            SchoolId: reader.IsDBNull(4) ? null : reader.GetString(4),
            CreatedDate: IsoZ(reader.GetDateTime(5)));
    }

    // ---------------------------------------------------------------- helpers

    // The shared note projection: scalar note columns + the joined student name (raw, may be null).
    private const string NoteSelect = """
        SELECT n."id", n."studentId", n."type", n."content", n."followUpDate", n."createdDate", u."name"
        FROM "counselor_notes" n
        LEFT JOIN "users" u ON u."id" = n."studentId"
        """;

    private static async Task<List<CounselorDashboardNote>> ReadNotesAsync(
        DbCommand command, CancellationToken cancellationToken)
    {
        var notes = new List<CounselorDashboardNote>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var content = reader.IsDBNull(3) ? string.Empty : reader.GetString(3);
            var rawName = reader.IsDBNull(6) ? null : reader.GetString(6);
            notes.Add(new CounselorDashboardNote(
                Id: reader.GetString(0),
                StudentId: reader.GetString(1),
                StudentName: JsOr(rawName, "Student"),
                Type: reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                // legacy `(content || "").slice(0, 200)` — first 200 chars, never throws.
                Content: content.Length <= 200 ? content : content[..200],
                FollowUpDate: reader.IsDBNull(4) ? null : IsoZ(reader.GetDateTime(4)),
                CreatedAt: IsoZ(reader.GetDateTime(5))));
        }

        return notes;
    }

    // JS `value || fallback` for strings: an empty string is falsy → fallback (not just null).
    private static string JsOr(string? value, string fallback) => string.IsNullOrEmpty(value) ? fallback : value;

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

    private static DateTime TruncateToMilliseconds(DateTime value) =>
        new(value.Ticks - (value.Ticks % TimeSpan.TicksPerMillisecond), value.Kind);
}
