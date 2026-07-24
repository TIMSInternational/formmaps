using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.StudentCoursePlan;
using Npgsql;

namespace FormMaps.Infrastructure.StudentCoursePlan;

/// <summary>
/// Student course change-requests CRUD (FM-DOTNET-085 — routes/course-plan.ts L92-143). Create/delete on a writable
/// session + commit; list on a read-only RLS session. Every endpoint first resolves the caller's OWN {schoolId,
/// gradeLevel} (requireSchoolMembership). Create replays the legacy raw-body coalescing: courseId (required String),
/// credits = body.credits || 0 (decimal.js string coercion), gradeLevel = body.gradeLevel || user.gradeLevel || 9,
/// action (required enum), dueDate = body.dueDate ? new Date(body.dueDate) : settings.courseRequestDeadline || null,
/// nullable strings raw — any Prisma type rejection is a 500 DEFERRED past the membership 400. credits is stored numeric
/// and echoed as a decimal.js STRING (trim_scale::text). Timestamps bind Kind=Unspecified + ms-trunc; fixed columns.
/// </summary>
public sealed class CourseChangeRequestRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : ICourseChangeRequestRepository
{
    // decimal.js parity for a string credits (FM-056): the AllowLeadingSign|AllowDecimalPoint|AllowExponent mask makes
    // every realistic numeric string agree with decimal.js and fail-closes the pathological (hex/Inf/NaN/underscore).
    private const NumberStyles CreditsStringStyles =
        NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint | NumberStyles.AllowExponent;

    // ECMAScript time-clip range for new Date(number) (|ms| ≤ 8.64e15).
    private const double JsMaxTimeMs = 8.64e15;

    // Full courseChangeRequest row (schema field order). credits → decimal.js STRING; action/status → enum labels.
    private const string RowColumns =
        """
        "id", "studentId", "schoolId", "courseId", "courseCode", "courseName", trim_scale("credits")::text,
        "gradeLevel", "semester", "action"::text, "dueDate", "studentNote", "status"::text, "counselorNote",
        "reviewedBy", "reviewedAt", "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
        """;

    public async Task<CreateChangeRequestOutcome> CreateAsync(
        RequestContext context, string studentId, JsonElement body, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // requireSchoolMembership — fresh { schoolId, gradeLevel }. Missing row or null schoolId → 400.
        string schoolId;
        int? userGradeLevel;
        await using (var userCmd = Command(session, """SELECT "schoolId", "gradeLevel" FROM "users" WHERE "id" = @sid"""))
        {
            AddParameter(userCmd, "sid", studentId);
            await using var reader = await userCmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken) || reader.IsDBNull(0))
            {
                return new CreateChangeRequestOutcome(CreateChangeRequestStatus.NoSchool, null);
            }

            schoolId = reader.GetString(0);
            userGradeLevel = reader.IsDBNull(1) ? null : reader.GetInt32(1);
        }

        // schoolAssessmentSettings.courseRequestDeadline (the dueDate default when body.dueDate is falsy).
        DateTime? settingsDeadline = null;
        await using (var settingsCmd = Command(session,
            """SELECT "courseRequestDeadline" FROM "school_assessment_settings" WHERE "schoolId" = @school"""))
        {
            AddParameter(settingsCmd, "school", schoolId);
            var result = await settingsCmd.ExecuteScalarAsync(cancellationToken);
            if (result is DateTime dt)
            {
                settingsDeadline = dt;
            }
        }

        // Resolve every field; any Prisma-equivalent type rejection → InvalidBody (500), deferred past the 400s above.
        if (!TryResolveRequiredString(body, "courseId", out var courseId)
            || !TryResolveCredits(body, out var credits)
            || !TryResolveGradeLevel(body, userGradeLevel, out var gradeLevel)
            || !TryResolveAction(body, out var action)
            || !TryResolveDueDate(body, settingsDeadline, out var dueDate)
            || !TryResolveNullableString(body, "courseCode", out var courseCode)
            || !TryResolveNullableString(body, "courseName", out var courseName)
            || !TryResolveNullableString(body, "semester", out var semester)
            || !TryResolveNullableString(body, "studentNote", out var studentNote))
        {
            return new CreateChangeRequestOutcome(CreateChangeRequestStatus.InvalidBody, null);
        }

        var columns = new List<string> { "\"studentId\"", "\"schoolId\"", "\"courseId\"", "\"credits\"", "\"gradeLevel\"", "\"action\"", "\"createdDate\"", "\"updatedAt\"" };
        var values = new List<string> { "@sid", "@school", "@courseId", "@credits", "@gradeLevel", "@action::\"CourseChangeAction\"", "@now", "@now" };

        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        AddParameter(command, "sid", studentId);
        AddParameter(command, "school", schoolId);
        AddParameter(command, "courseId", courseId!);
        AddParameter(command, "credits", credits);
        AddParameter(command, "gradeLevel", gradeLevel);
        AddParameter(command, "action", action!);
        AddTimestamp(command, "now", Now());

        AddOptionalString(command, columns, values, "courseCode", "cc", courseCode);
        AddOptionalString(command, columns, values, "courseName", "cn", courseName);
        AddOptionalString(command, columns, values, "semester", "sem", semester);
        AddOptionalString(command, columns, values, "studentNote", "sn", studentNote);
        if (dueDate is not null)
        {
            columns.Add("\"dueDate\"");
            values.Add("@dueDate");
            AddTimestamp(command, "dueDate", dueDate.Value);
        }

        command.CommandText = $"""
            INSERT INTO "course_change_requests" ({string.Join(", ", new[] { "\"id\"" }.Concat(columns))})
            VALUES ({string.Join(", ", new[] { "gen_random_uuid()::text" }.Concat(values))})
            RETURNING {RowColumns}
            """;

        CourseChangeRequestRow row;
        try
        {
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            await reader.ReadAsync(cancellationToken);
            row = MapRow(reader);
        }
        catch (PostgresException)
        {
            // e.g. an invalid CourseChangeAction label (22P02) → Prisma would have thrown a validation error → 500.
            return new CreateChangeRequestOutcome(CreateChangeRequestStatus.InvalidBody, null);
        }

        await session.CommitAsync(cancellationToken);
        return new CreateChangeRequestOutcome(CreateChangeRequestStatus.Created, row);
    }

    public async Task<ChangeRequestsView> ListAsync(
        RequestContext context, string studentId, string? status, int page, int limit, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var schoolId = await ReadSchoolIdAsync(session, studentId, cancellationToken);
        if (schoolId is null)
        {
            return new ChangeRequestsView(HasSchool: false, Data: [], Total: 0);
        }

        // where = studentId + schoolId + isActive (+ optional status, cast to the native enum → invalid label 500).
        var where = "\"studentId\" = @sid AND \"schoolId\" = @school AND \"isActive\" = true";
        var hasStatus = !string.IsNullOrEmpty(status);
        if (hasStatus)
        {
            where += " AND \"status\" = @status::\"CourseChangeStatus\"";
        }

        int total;
        await using (var countCmd = Command(session, $"""SELECT COUNT(*)::int FROM "course_change_requests" WHERE {where}"""))
        {
            AddParameter(countCmd, "sid", studentId);
            AddParameter(countCmd, "school", schoolId);
            if (hasStatus)
            {
                AddParameter(countCmd, "status", status!);
            }

            var result = await countCmd.ExecuteScalarAsync(cancellationToken);
            total = result is null or DBNull ? 0 : Convert.ToInt32(result, CultureInfo.InvariantCulture);
        }

        var rows = new List<CourseChangeRequestRow>();
        await using (var listCmd = Command(session, $"""
            SELECT {RowColumns} FROM "course_change_requests" WHERE {where}
            ORDER BY "createdDate" DESC, "id" ASC
            OFFSET @skip LIMIT @take
            """))
        {
            AddParameter(listCmd, "sid", studentId);
            AddParameter(listCmd, "school", schoolId);
            if (hasStatus)
            {
                AddParameter(listCmd, "status", status!);
            }

            AddParameter(listCmd, "skip", (page - 1) * limit);
            AddParameter(listCmd, "take", limit);
            await using var reader = await listCmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add(MapRow(reader));
            }
        }

        return new ChangeRequestsView(HasSchool: true, rows, total);
    }

    public async Task<DeleteChangeRequestStatus> DeleteAsync(
        RequestContext context, string studentId, string requestId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var schoolId = await ReadSchoolIdAsync(session, studentId, cancellationToken);
        if (schoolId is null)
        {
            return DeleteChangeRequestStatus.NoSchool;
        }

        // findUnique by id (no isActive filter) → missing / not owner / wrong school / not pending → "Cannot cancel".
        await using (var findCmd = Command(session,
            """SELECT "studentId", "schoolId", "status"::text FROM "course_change_requests" WHERE "id" = @id"""))
        {
            AddParameter(findCmd, "id", requestId);
            await using var reader = await findCmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)
                || reader.GetString(0) != studentId
                || reader.GetString(1) != schoolId
                || reader.GetString(2) != "pending")
            {
                return DeleteChangeRequestStatus.CannotCancel;
            }
        }

        await using (var update = Command(session,
            """UPDATE "course_change_requests" SET "isActive" = false WHERE "id" = @id"""))
        {
            AddParameter(update, "id", requestId);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return DeleteChangeRequestStatus.Cancelled;
    }

    // ---------------------------------------------------------------- field resolution

    private static bool TryResolveRequiredString(JsonElement body, string name, out string? value)
    {
        value = null;
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty(name, out var prop) || prop.ValueKind != JsonValueKind.String)
        {
            return false; // missing / null / non-string → Prisma required-String rejection → 500
        }

        value = prop.GetString();
        return true;
    }

    // Nullable String? column: absent/null → null (omit → NULL); string → value; any other type → 500.
    private static bool TryResolveNullableString(JsonElement body, string name, out string? value)
    {
        value = null;
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty(name, out var prop))
        {
            return true; // absent → NULL
        }

        switch (prop.ValueKind)
        {
            case JsonValueKind.Null:
                return true;
            case JsonValueKind.String:
                value = prop.GetString();
                return true;
            default:
                return false;
        }
    }

    // credits = body.credits || 0 → decimal (JS-falsy → 0; number → value; numeric string → decimal.js parse; a truthy
    // true/object/array/non-numeric-string → 500). Documented fail-closed residual (accepted, matches DataMappings): a
    // JSON number beyond C# decimal range (~7.9e28) → 500 here where Postgres numeric(65,30) would store it — unreachable
    // for a 0-6 credit value, and never fail-OPEN (.NET never persists a value legacy would have rejected).
    private static bool TryResolveCredits(JsonElement body, out decimal value)
    {
        value = 0m;
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty("credits", out var el))
        {
            return true; // absent → falsy → 0
        }

        switch (el.ValueKind)
        {
            case JsonValueKind.Null:
            case JsonValueKind.False:
                return true; // falsy → 0
            case JsonValueKind.Number:
                return el.TryGetDecimal(out value); // 0 stays 0 (0||0=0); out-of-range → 500 (fail-closed)
            case JsonValueKind.String:
                var s = el.GetString() ?? "";
                if (s.Length == 0)
                {
                    return true; // "" falsy → 0
                }

                return decimal.TryParse(s, CreditsStringStyles, CultureInfo.InvariantCulture, out value);
            default:
                return false; // true / object / array → truthy non-numeric → 500
        }
    }

    // gradeLevel = body.gradeLevel || user.gradeLevel || 9 (Int). A truthy body.gradeLevel must be an INTEGER-VALUED
    // number in int4 range (Prisma Int = Number.isInteger + int4 bounds); a fractional / out-of-range number, string,
    // true, or object → 500; a falsy body.gradeLevel → user.gradeLevel (truthy) else 9. NB the JS number 10.0 / 1e1
    // parses to the integer 10 (JS has no int-vs-float token), so we accept any whole-valued Number via TryGetDouble +
    // `n % 1 == 0` rather than System.Text.Json TryGetInt32 (which rejects the "10.0"/"1e1" tokens).
    private static bool TryResolveGradeLevel(JsonElement body, int? userGradeLevel, out int value)
    {
        value = 0;
        var has = body.ValueKind == JsonValueKind.Object && body.TryGetProperty("gradeLevel", out _);
        if (has && JsTruthy(true, body.GetProperty("gradeLevel")))
        {
            var prop = body.GetProperty("gradeLevel");
            if (prop.ValueKind == JsonValueKind.Number
                && prop.TryGetDouble(out var n) && n % 1 == 0 && n >= int.MinValue && n <= int.MaxValue)
            {
                value = (int)n;
                return true;
            }

            return false; // truthy fractional / out-of-int4 number, string, true, object → Prisma Int rejection → 500
        }

        value = userGradeLevel is int g && g != 0 ? g : 9; // body falsy → user.gradeLevel || 9
        return true;
    }

    // action (CourseChangeAction, required): present JSON string only (missing / null / non-string → 500). The label's
    // validity is enforced by the @action::"CourseChangeAction" cast at INSERT (an invalid label → PostgresException).
    private static bool TryResolveAction(JsonElement body, out string? value)
    {
        value = null;
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty("action", out var prop) || prop.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        value = prop.GetString();
        return true;
    }

    // dueDate = body.dueDate ? new Date(body.dueDate) : settingsDeadline. A truthy body.dueDate resolves via new Date
    // (invalid → 500); a falsy/absent body.dueDate → the settings deadline (or null).
    private static bool TryResolveDueDate(JsonElement body, DateTime? settingsDeadline, out DateTime? value)
    {
        value = settingsDeadline;
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty("dueDate", out var el))
        {
            return true; // absent → settings default
        }

        if (!TryResolveJsDate(el, out var resolved))
        {
            return false; // truthy but Invalid Date → 500
        }

        value = resolved ?? settingsDeadline; // resolved is null only when body.dueDate was falsy → settings default
        return true;
    }

    // x ? new Date(x) : null on a present element — JS-falsy → null; string parsed (invalid → 500); number = epoch ms
    // (time-clip range); true = new Date(1); object/array → Invalid → 500. (Mirrors the FM-065/077/081 date resolver.)
    private static bool TryResolveJsDate(JsonElement el, out DateTime? date)
    {
        date = null;
        switch (el.ValueKind)
        {
            case JsonValueKind.Null:
            case JsonValueKind.False:
                return true;
            case JsonValueKind.String:
                var raw = el.GetString();
                if (string.IsNullOrEmpty(raw)) return true; // "" falsy → null
                if (!DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture,
                        DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed)) return false;
                date = parsed.UtcDateTime;
                return true;
            case JsonValueKind.Number:
                if (!el.TryGetDouble(out var n) || n == 0) return n == 0; // 0 → null; unparseable → 500
                if (double.IsNaN(n) || Math.Abs(n) > JsMaxTimeMs) return false;
                date = DateTimeOffset.FromUnixTimeMilliseconds((long)n).UtcDateTime;
                return true;
            case JsonValueKind.True:
                date = DateTimeOffset.FromUnixTimeMilliseconds(1).UtcDateTime; // new Date(true) = new Date(1)
                return true;
            default:
                return false; // object / array → Invalid → 500
        }
    }

    private static bool JsTruthy(bool has, JsonElement el)
    {
        if (!has) return false;
        return el.ValueKind switch
        {
            JsonValueKind.Null => false,
            JsonValueKind.False => false,
            JsonValueKind.True => true,
            JsonValueKind.String => !string.IsNullOrEmpty(el.GetString()),
            JsonValueKind.Number => !(el.TryGetDouble(out var n) && n == 0),
            _ => true, // Object / Array
        };
    }

    // ---------------------------------------------------------------- helpers

    private static async Task<string?> ReadSchoolIdAsync(
        FormMapsDatabaseSession session, string studentId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "schoolId" FROM "users" WHERE "id" = @sid""");
        AddParameter(command, "sid", studentId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result as string;
    }

    private static void AddOptionalString(
        DbCommand command, List<string> columns, List<string> values, string column, string param, string? value)
    {
        if (value is null)
        {
            return; // absent / explicit null → omit → NULL
        }

        columns.Add($"\"{column}\"");
        values.Add($"@{param}");
        AddParameter(command, param, value);
    }

    private static CourseChangeRequestRow MapRow(DbDataReader reader) => new(
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
        UpdatedAt: IsoZ(reader.GetDateTime(20)));

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
        parameter.Value = new DateTime(
            (value.Ticks / TimeSpan.TicksPerMillisecond) * TimeSpan.TicksPerMillisecond, DateTimeKind.Unspecified);
        command.Parameters.Add(parameter);
    }

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
