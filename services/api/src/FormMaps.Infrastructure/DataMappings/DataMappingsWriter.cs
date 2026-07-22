using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.DataMappings;

namespace FormMaps.Infrastructure.DataMappings;

/// <summary>
/// school:data-mapping WRITES (FM-DOTNET-056 — routes/school-courses.ts POST /data-mappings + POST
/// /data-mappings/bulk-approve). Faithful port of schoolCoursesService.ts createDataMapping / bulkApproveMappings.
/// The .NET write-owner for INSERTs + bulk status-approve on data_mappings. Each write opens ONE writable RLS session
/// and commits. All values parameterized; id = gen_random_uuid()::text; createdDate/updatedAt = now();
/// createdBy/updatedBy stay NULL; isActive takes the DB default (true).
///
/// <para><b>createDataMapping — RAW body, no app validation (faithful to Prisma type/NOT-NULL rejection = 500):</b>
/// externalCode/internalCourseId are String NOT NULL with no default → String kind binds the value (incl ""); anything
/// else (missing/number/bool/array/object/null) binds DBNull → NOT-NULL violation → 500. externalSource is String NOT
/// NULL but the route applies <c>|| "manual"</c>: a non-empty String → the string; a JS-falsy value (absent/null/false/
/// Number 0/"") → "manual"; a truthy non-string (Number≠0, true, array, object) flows to Prisma's String column →
/// type rejection → 500. externalName is String? → String → value; absent/null → NULL; any other present non-null →
/// 500. confidence is Decimal? → Number OR numeric String → decimal; absent/null → NULL; a non-numeric (incl "", bool,
/// array, object) → coercion failure → 500. source is FORCED 'manual', status 'approved', approvedBy=@caller,
/// approvedAt=now(). There is NO 23505/P2002 catch — a duplicate (schoolId, externalCode, externalSource) surfaces as
/// a uniform 500 (UNLIKE createCourse's 409).</para>
/// </summary>
public sealed class DataMappingsWriter(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IDataMappingsWriter
{
    public async Task<DataMappingRow> CreateAsync(
        RequestContext context, string schoolId, JsonElement body, string approvedBy,
        CancellationToken cancellationToken = default)
    {
        // externalCode / internalCourseId: String NOT NULL, no default → String → value; else DBNull → 500.
        var externalCode = RequiredStringOrNull(body, "externalCode");
        var internalCourseId = RequiredStringOrNull(body, "internalCourseId");

        var sql = $"""
            INSERT INTO "data_mappings"
                ("id", "schoolId", "externalCode", "externalName", "externalSource", "internalCourseId",
                 "confidence", "source", "status", "approvedBy", "approvedAt", "createdDate", "updatedAt")
            VALUES
                (gen_random_uuid()::text, @sid, @externalCode, @externalName, @externalSource, @internalCourseId,
                 @confidence, 'manual'::"DataMappingSource", 'approved'::"DataMappingStatus", @approvedBy, @now, @now, @now)
            RETURNING {DataMappingsReader.Columns}
            """;

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, sql);
        AddParameter(command, "sid", schoolId);
        AddParameter(command, "externalCode", (object?)externalCode ?? DBNull.Value);
        AddParameter(command, "externalName", NullableStringElseThrow(body, "externalName"));
        AddParameter(command, "externalSource", ExternalSourceOrManual(body));  // || "manual"
        AddParameter(command, "internalCourseId", (object?)internalCourseId ?? DBNull.Value);
        AddConfidenceParameter(command, "confidence", ConfidenceOrNull(body));   // Decimal? (no default)
        AddParameter(command, "approvedBy", approvedBy);
        AddTimestamp(command, "now", Now());

        // NO 23505 catch — a duplicate surfaces as a uniform 500 (the session dispose rolls back).
        DataMappingRow row;
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            await reader.ReadAsync(cancellationToken);
            row = DataMappingsReader.ReadRow(reader);
        }

        await session.CommitAsync(cancellationToken);
        return row;
    }

    public async Task<int> BulkApproveAsync(
        RequestContext context, string schoolId, IReadOnlyList<string> ids, string approvedBy,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // The ratified safe divergence: @ids is the endpoint-normalized array (empty when missing/non-array), so an
        // empty text[] → `= ANY('{}')` matches nothing → 0 approved (NOT legacy's dropped-filter approve-ALL). School-
        // scoped. updatedBy is NOT set (legacy data only sets status/approvedBy/approvedAt); updatedAt bumps (@updatedAt).
        await using var command = Command(session, """
            UPDATE "data_mappings"
            SET "status" = 'approved'::"DataMappingStatus", "approvedBy" = @caller, "approvedAt" = @now, "updatedAt" = @now
            WHERE "id" = ANY(@ids) AND "schoolId" = @sid
            """);
        AddParameter(command, "caller", approvedBy);
        AddTimestamp(command, "now", Now());
        AddParameter(command, "ids", ids.ToArray());
        AddParameter(command, "sid", schoolId);

        var affected = await command.ExecuteNonQueryAsync(cancellationToken);
        await session.CommitAsync(cancellationToken);
        return affected;
    }

    // ---------------------------------------------------------------- body coercion (JS `||` falsiness / raw passthrough)

    // String kind → value (incl ""); else null (→ DBNull → NOT-NULL → 500). Captures BOTH missing and non-string.
    private static string? RequiredStringOrNull(JsonElement body, string name) =>
        body.ValueKind == JsonValueKind.Object
        && body.TryGetProperty(name, out var el)
        && el.ValueKind == JsonValueKind.String
            ? el.GetString()
            : null;

    // body.externalSource || "manual": non-empty String → the string; JS-falsy (absent/null/false/Number 0/"") →
    // "manual"; a truthy non-string (Number≠0, true, array, object) → the raw value flows to Prisma's String column →
    // type rejection → 500 (we throw to reproduce that fail-closed behavior).
    private static string ExternalSourceOrManual(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty("externalSource", out var el))
        {
            return "manual";
        }

        switch (el.ValueKind)
        {
            case JsonValueKind.String:
                var s = el.GetString()!;
                return string.IsNullOrEmpty(s) ? "manual" : s;  // "" is falsy → "manual"
            case JsonValueKind.Null:
            case JsonValueKind.False:
                return "manual";
            case JsonValueKind.Number:
                return el.GetDecimal() == 0m ? "manual" : throw NonStringText("externalSource"); // 0 falsy → "manual"
            default:  // True, Array, Object → truthy non-string → 500
                throw NonStringText("externalSource");
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

    // confidence (Decimal?, no ||): Number → that value; a numeric String → parsed decimal; absent/null → NULL; any
    // non-numeric (incl "", true/false, array, object) → coercion failure → 500 (Prisma rejects). Returns a boxed
    // decimal or DBNull.Value.
    //
    // String coercion parity note (FM-056): legacy passes a string confidence straight to Prisma, which constructs a
    // decimal.js Decimal. decimal.js accepts a strictly LARGER grammar than any .NET NumberStyles mask (hex "0x10"→16,
    // "Infinity"/"NaN", ES underscore "1_000", …), so EXACT parity is unreachable — and reproducing it would mean
    // faithfully persisting NaN/Infinity/hex as a confidence, i.e. a bug. We deliberately restrict to
    // AllowLeadingSign|AllowDecimalPoint|AllowExponent. That mask makes every REALISTIC numeric string AND legacy's
    // rejections agree exactly ("0.85"→0.85, "1e3"→1000, "1,000"/" 0.85 "→reject like decimal.js) and leaves ONLY the
    // pathological cases (hex/Inf/NaN/underscore) diverging — all FAIL-CLOSED (.NET rejects → 500 where legacy would
    // write a nonsense value). No fail-OPEN divergence remains: .NET never writes a row legacy would have rejected.
    // Reachability is edge-only anyway (the route types confidence as number; a string arrives only from a
    // non-conforming client). See DataMappingsWriterTests confidence-string cases (red-if-regressed).
    private const NumberStyles ConfidenceStringStyles =
        NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint | NumberStyles.AllowExponent;

    private static object ConfidenceOrNull(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty("confidence", out var el))
        {
            return DBNull.Value;
        }

        return el.ValueKind switch
        {
            JsonValueKind.Number => el.GetDecimal(),
            JsonValueKind.String => decimal.Parse(el.GetString()!, ConfidenceStringStyles, CultureInfo.InvariantCulture),
            JsonValueKind.Null => DBNull.Value,
            _ => throw NonNumeric("confidence"),  // true/false/array/object → 500
        };
    }

    private static InvalidOperationException NonStringText(string name) =>
        new($"{name}: non-string value for a text column (Prisma type rejection → 500)");

    private static InvalidOperationException NonNumeric(string name) =>
        new($"{name}: non-numeric value for a Decimal column (Prisma type rejection → 500)");

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

    private static void AddConfidenceParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        if (value is decimal d)
        {
            parameter.DbType = DbType.Decimal;
            parameter.Value = d;
        }
        else
        {
            parameter.Value = DBNull.Value;
        }

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
