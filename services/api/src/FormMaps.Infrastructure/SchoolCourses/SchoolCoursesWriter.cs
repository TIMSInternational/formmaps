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

    // ---------------------------------------------------------------- updateCourse (PUT /courses/:courseId)

    // The 12-field allow-list in legacy order (routes/school-courses.ts PUT + service updateCourse). The SET clause
    // carries ONLY the keys the body actually presents (undefined-omit) — an absent key keeps the existing value.
    private static readonly string[] CourseUpdateFields =
    [
        "code", "name", "department", "credits", "gradeLevels", "prerequisites", "corequisites",
        "frameworkType", "description", "maxEnrollment", "isHonors", "status",
    ];

    public async Task<string?> UpdateCourseAsync(
        RequestContext context, string schoolId, string courseId, JsonElement body,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Ownership gate (findUnique select schoolId): missing row OR different school → null (endpoint → 403). No write.
        var ownerSchool = await SelectSchoolIdAsync(session, courseId, cancellationToken);
        if (ownerSchool is null || !string.Equals(ownerSchool, schoolId, StringComparison.Ordinal))
        {
            return null;
        }

        // SET = updatedAt (ALWAYS — @updatedAt bumps even on legacy's empty update({data:{}})) + the present allow-list
        // keys (undefined-omit), each bound with its per-column Prisma typing (wrong-typed present → 500; present null
        // on a nullable column → NULL). Params are built before the CommandText (npgsql allows this).
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        AddParameter(command, "id", courseId);
        AddTimestamp(command, "now", Now());

        var sets = new List<string> { "\"updatedAt\" = @now" };
        if (body.ValueKind == JsonValueKind.Object)
        {
            foreach (var field in CourseUpdateFields)
            {
                if (!body.TryGetProperty(field, out var element))
                {
                    continue; // absent → not written (keeps existing value)
                }

                sets.Add($"\"{field}\" = @{field}");
                BindCourseUpdateValue(command, field, element);
            }
        }

        command.CommandText = $"""UPDATE "school_courses" SET {string.Join(", ", sets)} WHERE "id" = @id""";
        await using (command)
        {
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return courseId; // legacy returns { id: courseId } — the passed-in id, not a DB read
    }

    public async Task<bool> DeleteCourseAsync(
        RequestContext context, string schoolId, string courseId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var ownerSchool = await SelectSchoolIdAsync(session, courseId, cancellationToken);
        if (ownerSchool is null || !string.Equals(ownerSchool, schoolId, StringComparison.Ordinal))
        {
            return false; // endpoint → 403 "Course not in your school"
        }

        // SOFT delete: isActive=false, status='archived' (+ @updatedAt bump). The row stays.
        await using (var command = Command(session, """
            UPDATE "school_courses" SET "isActive" = false, "status" = 'archived', "updatedAt" = @now WHERE "id" = @id
            """))
        {
            AddParameter(command, "id", courseId);
            AddTimestamp(command, "now", Now());
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return true;
    }

    // findUnique(select schoolId) within the caller's writable session. NULL when the row is absent.
    private static async Task<string?> SelectSchoolIdAsync(
        FormMapsDatabaseSession session, string courseId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "schoolId" FROM "school_courses" WHERE "id" = @id""");
        AddParameter(command, "id", courseId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result as string;
    }

    // Bind one present allow-list value under its Prisma column rules (raw copy — NO create-side `||` falsy defaults).
    private static void BindCourseUpdateValue(DbCommand command, string field, JsonElement element)
    {
        switch (field)
        {
            // NOT-NULL text columns: String → value (incl ""); null → DBNull (→ DB NOT-NULL violation → 500); any other
            // present kind → Prisma text type rejection → 500 (fail-closed throw).
            case "code":
            case "name":
            case "department":
            case "status":
                AddParameter(command, field, RequiredStringValue(element, field));
                break;

            // Nullable text: String → value; null → NULL (honored); any other present non-null → 500 (throw).
            case "frameworkType":
            case "description":
                AddParameter(command, field, NullableStringValue(element, field));
                break;

            // Decimal (NOT NULL). Number → decimal; numeric string → parsed (reuses the create-side Decimal coercion —
            // Prisma's Decimal accepts strings); present null → DBNull (→ NOT-NULL 500); false/true/array/object/""/
            // non-numeric string → 500. NOTE: no `|| 0` here (raw update copy) — a present null/false/"" is a 500, NOT 0.
            case "credits":
                AddDecimalOrNullParameter(command, field, CreditsUpdateValue(element));
                break;

            // Int[] (list). Array → its int elements (a non-int element throws → 500); any other present kind (incl
            // null — Prisma cannot set a scalar list to null) → 500 (throw).
            case "gradeLevels":
                AddParameter(command, field, IntArrayValue(element));
                break;

            // String[] (list). Same list rule with string elements.
            case "prerequisites":
            case "corequisites":
                AddParameter(command, field, StringArrayValue(element));
                break;

            // Int? (nullable). Number → int; present null → NULL (honored); string/bool/array/object → 500 (throw). NOTE
            // (parity decision): unlike credits, maxEnrollment does NOT accept a numeric string — Prisma's Int is strict
            // (the task spec lists it as plain "int? nullable", no numeric-string acceptance). A JSON number that is not
            // an exact Int32 (e.g. 30.5) also → 500.
            case "maxEnrollment":
                AddNullableIntParameter(command, field, MaxEnrollmentUpdateValue(element));
                break;

            // Bool (NOT NULL). true/false → value; any other present kind (incl null/number) → Prisma Boolean type
            // rejection → 500 (throw). NOTE: no `|| false` here — a present 0/"yes" is a 500, NOT false.
            case "isHonors":
                AddParameter(command, field, BoolValue(element));
                break;
        }
    }

    // NOT-NULL text: String → value (incl ""); Null → DBNull (DB rejects → 500); else → 500 (fail-closed).
    private static object RequiredStringValue(JsonElement element, string field) =>
        element.ValueKind switch
        {
            JsonValueKind.String => element.GetString()!,
            JsonValueKind.Null => DBNull.Value,
            _ => throw NonStringText(field),
        };

    // Nullable text: String → value; Null → NULL (honored); else → 500 (fail-closed).
    private static object NullableStringValue(JsonElement element, string field) =>
        element.ValueKind switch
        {
            JsonValueKind.String => element.GetString()!,
            JsonValueKind.Null => DBNull.Value,
            _ => throw NonStringText(field),
        };

    // Credits string-coercion mask (FM-061 gate fold, mirrors DataMappingsWriter.ConfidenceStringStyles / FM-056):
    // AllowExponent (decimal.js accepts "1e3"→1000) but NOT AllowThousands/AllowWhite/AllowTrailingSign — the default
    // NumberStyles.Number would FAIL-OPEN, silently parsing "1,000"/" 0.85 "/"5-" that Prisma's decimal.js 500s on
    // (writing a row legacy rejects). Residual (hex/Inf/NaN) stays fail-CLOSED (one-directional, safe).
    private const NumberStyles CreditsStringStyles =
        NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint | NumberStyles.AllowExponent;

    // credits (Decimal, raw update copy): Number → decimal; numeric String → parsed (Prisma Decimal coerces strings);
    // Null → DBNull (→ NOT-NULL 500); anything else (bool/array/object/non-numeric or empty string) → 500 (throw).
    private static object CreditsUpdateValue(JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Number:
                return element.GetDecimal();
            case JsonValueKind.String:
                return decimal.Parse(element.GetString()!, CreditsStringStyles, CultureInfo.InvariantCulture); // ""/non-numeric/thousands/ws → throw → 500
            case JsonValueKind.Null:
                return DBNull.Value;
            default:
                throw NonNumericDecimal("credits");
        }
    }

    // maxEnrollment (Int?, raw update copy): Number → Int32 (non-Int32 number throws → 500); Null → NULL; else → 500.
    private static object MaxEnrollmentUpdateValue(JsonElement element) =>
        element.ValueKind switch
        {
            JsonValueKind.Number => element.GetInt32(),
            JsonValueKind.Null => DBNull.Value,
            _ => throw NonNumericDecimal("maxEnrollment"),
        };

    // Int[] present value: Array → int elements (non-int → 500); anything else present → 500 (Prisma list rules).
    private static int[] IntArrayValue(JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Array)
        {
            throw NonArray("gradeLevels");
        }

        return element.EnumerateArray().Select(e => e.GetInt32()).ToArray();
    }

    // String[] present value: Array → string elements; anything else present → 500.
    private static string[] StringArrayValue(JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Array)
        {
            throw NonArray("prerequisites/corequisites");
        }

        return element.EnumerateArray().Select(e => e.GetString()!).ToArray();
    }

    // Bool present value: true/false → bool; anything else present → 500 (Prisma Boolean type rejection).
    private static bool BoolValue(JsonElement element) =>
        element.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => throw new InvalidOperationException("isHonors: non-boolean value for a Boolean column (Prisma type rejection → 500)"),
        };

    private static InvalidOperationException NonNumericDecimal(string name) =>
        new($"{name}: non-numeric value for a numeric column (Prisma type rejection → 500)");

    private static InvalidOperationException NonArray(string name) =>
        new($"{name}: non-array value for a list column (Prisma type rejection → 500)");

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

                return decimal.Parse(s, CreditsStringStyles, CultureInfo.InvariantCulture); // truthy string → coerce (thousands/ws → throw → 500)
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

    // credits UPDATE binder: a boxed decimal → DbType.Decimal; DBNull → a typed-null decimal parameter.
    private static void AddDecimalOrNullParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.Decimal;
        parameter.Value = value is decimal d ? d : DBNull.Value;
        command.Parameters.Add(parameter);
    }

    // maxEnrollment UPDATE binder: a boxed int → DbType.Int32; DBNull → a typed-null int parameter.
    private static void AddNullableIntParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.Int32;
        parameter.Value = value is int i ? i : DBNull.Value;
        command.Parameters.Add(parameter);
    }

    private static DateTime Now()
    {
        var utc = DateTime.SpecifyKind(DateTimeOffset.UtcNow.UtcDateTime, DateTimeKind.Unspecified);
        return new DateTime(utc.Ticks - (utc.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Unspecified);
    }
}
