using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolCourses;
using Npgsql;

namespace FormMaps.Infrastructure.SchoolCourses;

/// <summary>
/// school-courses writes (FM-DOTNET-054 — routes/school-courses.ts POST /courses). Faithful port of
/// schoolCoursesService.ts createCourse. Runs under the caller's WRITABLE RLS session and commits. createdBy/updatedBy
/// stay NULL (FM-048 precedent); isActive/status take their DB defaults (true / 'active'); id = gen_random_uuid();
/// createdDate/updatedAt = now(). All SQL parameterized.
///
/// <para><b>Legacy `||` defaults on the RAW body (no app validation):</b> department = body.department || '';
/// credits = body.credits || 0; gradeLevels/prerequisites/corequisites = body.x || []; maxEnrollment = body.x || null;
/// isHonors = body.x || false; frameworkType/description = body.x (nullable, no default). code/name are String NOT NULL
/// with NO default — a missing/non-string value binds DBNull → NOT-NULL violation → route catch → 500 (replicated).
/// The unique (schoolId, code) violation (23505) → <see cref="CreateCourseResult.Duplicate"/> (endpoint 409).</para>
///
/// <para><b>Fail-closed on wrong-typed strings (faithful to Prisma, FM-054 gate fold):</b> the text columns reject a
/// truthy NON-string body value exactly as Prisma does → 500, rather than silently coercing to a default. department
/// (<c>|| ''</c>): falsy (absent/null/false/0/"") → ""; a non-empty string → the string; a truthy non-string
/// (number≠0, true, array, object) → 500. frameworkType/description (nullable, no default): string → value; absent/
/// null → NULL; any other present non-null (number incl 0, bool incl false, array, object) → 500. code/name (NOT NULL,
/// no default): string → value; anything else → DBNull → NOT-NULL violation → 500. credits/maxEnrollment accept a
/// numeric string (JS truthy string → Prisma coerces) and throw → 500 on a non-numeric truthy string, matching Prisma.</para>
/// </summary>
public sealed class SchoolCoursesWriter(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ISchoolCoursesWriter
{
    public async Task<CreateCourseResult> CreateCourseAsync(
        RequestContext context, string schoolId, JsonElement body, CancellationToken cancellationToken = default)
    {
        // code / name: String NOT NULL, NO default. String kind → the value (incl ""); anything else → DBNull, which
        // trips the NOT-NULL constraint → 500 (faithful to legacy's un-validated req.body.code/name → Prisma).
        var code = RequiredStringOrNull(body, "code");
        var name = RequiredStringOrNull(body, "name");

        const string sql = """
            INSERT INTO "school_courses"
                ("id", "schoolId", "code", "name", "department", "credits", "gradeLevels", "prerequisites",
                 "corequisites", "frameworkType", "description", "maxEnrollment", "isHonors", "createdDate", "updatedAt")
            VALUES
                (gen_random_uuid(), @sid, @code, @name, @department, @credits, @gradeLevels, @prerequisites,
                 @corequisites, @frameworkType, @description, @maxEnrollment, @isHonors, @now, @now)
            RETURNING "id", "code"
            """;

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, sql);
        AddParameter(command, "sid", schoolId);
        AddParameter(command, "code", (object?)code ?? DBNull.Value);
        AddParameter(command, "name", (object?)name ?? DBNull.Value);
        AddParameter(command, "department", StringOrEmptyElseThrow(body, "department"));   // || '' (truthy non-string → 500)
        AddDecimalParameter(command, "credits", CreditsOrZero(body));                     // || 0
        AddParameter(command, "gradeLevels", IntArray(body, "gradeLevels"));              // || []
        AddParameter(command, "prerequisites", StringArray(body, "prerequisites"));       // || []
        AddParameter(command, "corequisites", StringArray(body, "corequisites"));         // || []
        AddParameter(command, "frameworkType", NullableStringElseThrow(body, "frameworkType"));
        AddParameter(command, "description", NullableStringElseThrow(body, "description"));
        AddParameter(command, "maxEnrollment", (object?)MaxEnrollmentOrNull(body) ?? DBNull.Value); // || null
        AddParameter(command, "isHonors", IsHonorsOrFalse(body));                         // || false
        AddTimestamp(command, "now", Now());

        try
        {
            string id;
            string createdCode;
            await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
            {
                await reader.ReadAsync(cancellationToken);
                id = reader.GetString(0);
                createdCode = reader.GetString(1);
            }

            await session.CommitAsync(cancellationToken);
            return new CreateCourseResult(id, createdCode, Duplicate: false);
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            // Unique (schoolId, code) violation → Prisma P2002 in legacy → 409 "Course code already exists".
            return new CreateCourseResult(null, null, Duplicate: true);
        }
    }

    // ---------------------------------------------------------------- body coercion (JS `||` falsiness)

    // String kind → value (incl ""); else null (→ DBNull → NOT-NULL → 500). Captures BOTH missing and non-string.
    private static string? RequiredStringOrNull(JsonElement body, string name) =>
        body.ValueKind == JsonValueKind.Object
        && body.TryGetProperty(name, out var el)
        && el.ValueKind == JsonValueKind.String
            ? el.GetString()
            : null;

    // body.x || '' : String → the string (incl "" — "" || "" == ""); absent/null/false/Number 0 → "" (JS-falsy);
    // a TRUTHY non-string (Number≠0, true, array, object) → the raw value flows to Prisma's text column → type
    // rejection → 500. We throw to reproduce that fail-closed behavior (FM-054 gate fold) rather than coerce to "".
    private static string StringOrEmptyElseThrow(JsonElement body, string name)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty(name, out var el))
        {
            return "";
        }

        switch (el.ValueKind)
        {
            case JsonValueKind.String:
                return el.GetString()!;                 // "" stays "" ("" || "" == "")
            case JsonValueKind.Null:
            case JsonValueKind.False:
                return "";
            case JsonValueKind.Number:
                return el.GetDecimal() == 0m ? "" : throw NonStringText(name); // 0 → "" ; non-zero → 500
            default:                                     // True, Array, Object → truthy non-string → 500
                throw NonStringText(name);
        }
    }

    // Nullable text (no ||): String → value (incl ""); absent/null → NULL; any other present non-null (Number incl 0,
    // bool incl false, array, object) → the raw value flows to Prisma's String? column → type rejection → 500.
    private static object NullableStringElseThrow(JsonElement body, string name)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty(name, out var el))
        {
            return DBNull.Value;
        }

        return el.ValueKind switch
        {
            JsonValueKind.String => el.GetString()!,
            JsonValueKind.Null => DBNull.Value,
            _ => throw NonStringText(name),
        };
    }

    private static InvalidOperationException NonStringText(string name) =>
        new($"{name}: non-string value for a text column (Prisma type rejection → 500)");

    // body.credits || 0 : Number → that value (0 → 0); non-empty numeric String → parsed; else 0. A non-numeric
    // truthy string throws → 500 (Prisma coercion failure), matching legacy.
    private static decimal CreditsOrZero(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty("credits", out var el))
        {
            return 0m;
        }

        switch (el.ValueKind)
        {
            case JsonValueKind.Number:
                return el.GetDecimal();
            case JsonValueKind.String:
                var s = el.GetString();
                if (string.IsNullOrEmpty(s))
                {
                    return 0m;                       // "" is falsy → 0
                }

                return decimal.Parse(s, CultureInfo.InvariantCulture); // truthy string → coerce (throws → 500)
            default:
                return 0m;                           // null / false / absent → 0
        }
    }

    // body.maxEnrollment || null : a non-zero Number → that int (0 → null); non-empty numeric String → parsed; else null.
    private static int? MaxEnrollmentOrNull(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty("maxEnrollment", out var el))
        {
            return null;
        }

        switch (el.ValueKind)
        {
            case JsonValueKind.Number:
                var n = el.GetInt32();
                return n == 0 ? null : n;            // 0 is falsy → null
            case JsonValueKind.String:
                var s = el.GetString();
                if (string.IsNullOrEmpty(s))
                {
                    return null;
                }

                var parsed = int.Parse(s, CultureInfo.InvariantCulture); // throws → 500 on non-numeric truthy string
                return parsed == 0 ? null : parsed;
            default:
                return null;
        }
    }

    // body.isHonors || false : Boolean true → true; everything else → false.
    private static bool IsHonorsOrFalse(JsonElement body) =>
        body.ValueKind == JsonValueKind.Object
        && body.TryGetProperty("isHonors", out var el)
        && el.ValueKind == JsonValueKind.True;

    // body.x || [] : an Array → its int elements (a non-int element throws → 500, matching Prisma Int[]); else [].
    private static int[] IntArray(JsonElement body, string name)
    {
        if (body.ValueKind != JsonValueKind.Object
            || !body.TryGetProperty(name, out var el)
            || el.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        return el.EnumerateArray().Select(e => e.GetInt32()).ToArray();
    }

    // body.x || [] : an Array → its string elements (a non-string element throws → 500, matching Prisma String[]); else [].
    private static string[] StringArray(JsonElement body, string name)
    {
        if (body.ValueKind != JsonValueKind.Object
            || !body.TryGetProperty(name, out var el)
            || el.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        return el.EnumerateArray().Select(e => e.GetString()!).ToArray();
    }

    // ---------------------------------------------------------------- npgsql helpers

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

    private static void AddDecimalParameter(DbCommand command, string name, decimal value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.Decimal;
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
