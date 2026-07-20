using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>Outcome status for a test-scores write (legacy routes/test-scores.ts POST/PUT/DELETE).</summary>
public enum TestScoreWriteStatus
{
    /// <summary>Row created (POST) — HTTP 201.</summary>
    Created,

    /// <summary>Row updated (PUT) — HTTP 200.</summary>
    Ok,

    /// <summary>Missing, not owned, or already soft-deleted — uniform IDOR 404 "Test score not found".</summary>
    NotFound,

    /// <summary>Body failed validation — HTTP 400 with the first-error <see cref="TestScoreWriteOutcome.Message"/>.</summary>
    ValidationError,
}

/// <summary>Result of a POST/PUT write: the created/updated full row on success, or a validation message.</summary>
public sealed record TestScoreWriteOutcome(TestScoreWriteStatus Status, TestScoreRow? Row, string? Message);

/// <summary>One validated, present body column mapped to its DB-ready value (jsonb columns cast ::jsonb).</summary>
public sealed record TestScoreColumnValue(object Value, bool IsJsonb);

/// <summary>
/// The validated, present columns of a test-scores write body. <see cref="Columns"/> excludes testDate (which
/// is parsed at write time — an invalid date surfaces as a write error / 500, matching legacy <c>new Date()</c>);
/// testDate presence + raw string are carried separately.
/// </summary>
public sealed class TestScoreWriteFields
{
    public required IReadOnlyDictionary<string, TestScoreColumnValue> Columns { get; init; }

    public bool TestDatePresent { get; init; }

    public string? TestDateRaw { get; init; }
}

/// <summary>Validation result: Ok + parsed fields, or the first Zod-equivalent error message.</summary>
public sealed record TestScoreValidationResult(bool Ok, string? Message, TestScoreWriteFields? Fields)
{
    public static TestScoreValidationResult Success(TestScoreWriteFields fields) => new(true, null, fields);

    public static TestScoreValidationResult Failure(string message) => new(false, message, null);
}

/// <summary>
/// Port of the zod createTestScoreSchema / updateTestScoreSchema(.partial()) in routes/test-scores.ts. Returns
/// the FIRST failing field's message in schema-declaration order (== legacy <c>body.error.errors[0].message</c>).
/// The message strings reproduce zod's default wording as closely as practical (documented divergence points in
/// the slice report). Field order: testType, testDate, satTotal, satMath, satReading, actComposite, actEnglish,
/// actMath, actReading, actScience, apSubject, apScore, totalScore, subScores, isSuperScore, isOfficial.
/// </summary>
public static class TestScoreValidation
{
    private static readonly string[] TestTypes = ["SAT", "ACT", "AP", "PSAT", "TOEFL", "IB"];

    private static readonly string EnumExpected = string.Join(" | ", TestTypes.Select(t => $"'{t}'"));

    public static TestScoreValidationResult ValidateCreate(JsonElement body) => Validate(body, isCreate: true);

    public static TestScoreValidationResult ValidateUpdate(JsonElement body) => Validate(body, isCreate: false);

    private static TestScoreValidationResult Validate(JsonElement body, bool isCreate)
    {
        // z.object(...) / z.object(...).partial(): a non-object top-level body is rejected outright (array,
        // null, or a primitive). An absent/empty/malformed body is normalized to an empty object by the
        // endpoint, so it reaches here as Object (-> "Required" on create, no-op on update).
        if (body.ValueKind != JsonValueKind.Object)
        {
            return TestScoreValidationResult.Failure($"Expected object, received {ZodType(body)}");
        }

        var columns = new Dictionary<string, TestScoreColumnValue>(StringComparer.Ordinal);

        // testType — the only required field (optional on the .partial() update schema).
        if (TryGet(body, "testType", out var testType))
        {
            var error = ValidateEnum(testType);
            if (error is not null)
            {
                return TestScoreValidationResult.Failure(error);
            }

            columns["testType"] = new TestScoreColumnValue(testType.GetString()!, IsJsonb: false);
        }
        else if (isCreate)
        {
            return TestScoreValidationResult.Failure("Required");
        }

        // testDate — z.string().optional(); the value is parsed at write time (invalid -> write error / 500).
        var testDatePresent = false;
        string? testDateRaw = null;
        if (TryGet(body, "testDate", out var testDate))
        {
            if (testDate.ValueKind != JsonValueKind.String)
            {
                return TestScoreValidationResult.Failure($"Expected string, received {ZodType(testDate)}");
            }

            testDatePresent = true;
            testDateRaw = testDate.GetString();
        }

        // Integer score fields (inclusive bounds; all .int() so a float is rejected).
        foreach (var (name, min, max) in IntFields)
        {
            if (!TryGet(body, name, out var value))
            {
                continue;
            }

            var error = ValidateInt(value, min, max, out var parsed);
            if (error is not null)
            {
                // Preserve schema order: bail on the first failing field only after the earlier ones passed.
                return TestScoreValidationResult.Failure(error);
            }

            columns[name] = new TestScoreColumnValue(parsed, IsJsonb: false);
        }

        // Remaining fields in schema order: apSubject, apScore, totalScore, subScores, isSuperScore, isOfficial.
        return FinalizeSubScoresAndBooleans(body, columns, testDatePresent, testDateRaw);
    }

    // The eight SAT/ACT integer fields with their inclusive [min,max], in schema-declaration order. The
    // remaining fields (apSubject, apScore, totalScore, subScores, isSuperScore, isOfficial) follow in
    // FinalizeSubScoresAndBooleans, preserving overall first-error order.
    private static readonly (string Name, int Min, int Max)[] IntFields =
    [
        ("satTotal", 400, 1600),
        ("satMath", 200, 800),
        ("satReading", 200, 800),
        ("actComposite", 1, 36),
        ("actEnglish", 1, 36),
        ("actMath", 1, 36),
        ("actReading", 1, 36),
        ("actScience", 1, 36),
    ];

    private static TestScoreValidationResult FinalizeSubScoresAndBooleans(
        JsonElement body,
        Dictionary<string, TestScoreColumnValue> columns,
        bool testDatePresent,
        string? testDateRaw)
    {
        // apSubject (schema order: after actScience, before apScore).
        if (TryGet(body, "apSubject", out var apSubject))
        {
            if (apSubject.ValueKind != JsonValueKind.String)
            {
                return TestScoreValidationResult.Failure($"Expected string, received {ZodType(apSubject)}");
            }

            if (apSubject.GetString()!.Length > 120)
            {
                return TestScoreValidationResult.Failure("String must contain at most 120 character(s)");
            }

            columns["apSubject"] = new TestScoreColumnValue(apSubject.GetString()!, IsJsonb: false);
        }

        // apScore, totalScore.
        foreach (var (name, min, max) in new[] { ("apScore", 1, 5), ("totalScore", 0, 10000) })
        {
            if (!TryGet(body, name, out var value))
            {
                continue;
            }

            var error = ValidateInt(value, min, max, out var parsed);
            if (error is not null)
            {
                return TestScoreValidationResult.Failure(error);
            }

            columns[name] = new TestScoreColumnValue(parsed, IsJsonb: false);
        }

        // subScores — z.record(z.unknown()): any object; stored as jsonb verbatim.
        if (TryGet(body, "subScores", out var subScores))
        {
            if (subScores.ValueKind != JsonValueKind.Object)
            {
                return TestScoreValidationResult.Failure($"Expected object, received {ZodType(subScores)}");
            }

            columns["subScores"] = new TestScoreColumnValue(subScores.GetRawText(), IsJsonb: true);
        }

        // isSuperScore, isOfficial — z.boolean().optional().
        foreach (var name in new[] { "isSuperScore", "isOfficial" })
        {
            if (!TryGet(body, name, out var value))
            {
                continue;
            }

            if (value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            {
                return TestScoreValidationResult.Failure($"Expected boolean, received {ZodType(value)}");
            }

            columns[name] = new TestScoreColumnValue(value.GetBoolean(), IsJsonb: false);
        }

        return TestScoreValidationResult.Success(new TestScoreWriteFields
        {
            Columns = columns,
            TestDatePresent = testDatePresent,
            TestDateRaw = testDateRaw,
        });
    }

    private static bool TryGet(JsonElement body, string name, out JsonElement value)
    {
        if (body.ValueKind == JsonValueKind.Object && body.TryGetProperty(name, out value))
        {
            return true;
        }

        value = default;
        return false;
    }

    private static string? ValidateEnum(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.String && Array.IndexOf(TestTypes, value.GetString()) >= 0)
        {
            return null;
        }

        var received = value.ValueKind == JsonValueKind.String ? value.GetString() : value.GetRawText();
        return $"Invalid enum value. Expected {EnumExpected}, received '{received}'";
    }

    // Mirrors z.number().int().min(min).max(max): type, then integer, then bounds — first failure wins.
    private static string? ValidateInt(JsonElement value, int min, int max, out int parsed)
    {
        parsed = 0;
        if (value.ValueKind != JsonValueKind.Number)
        {
            return $"Expected number, received {ZodType(value)}";
        }

        var d = value.GetDouble();
        if (d != Math.Truncate(d) || double.IsInfinity(d))
        {
            return "Expected integer, received float";
        }

        if (d < min)
        {
            return $"Number must be greater than or equal to {min}";
        }

        if (d > max)
        {
            return $"Number must be less than or equal to {max}";
        }

        parsed = (int)d;
        return null;
    }

    private static string ZodType(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Object => "object",
        JsonValueKind.Array => "array",
        JsonValueKind.String => "string",
        JsonValueKind.Number => "number",
        JsonValueKind.True or JsonValueKind.False => "boolean",
        JsonValueKind.Null => "null",
        _ => "undefined",
    };
}

/// <summary>
/// Write-owner for the authed test-scores writes (legacy routes/test-scores.ts POST / PUT /:id / DELETE /:id).
/// All writes are self-scoped: create writes for the caller; update/delete resolve the row and 404 (uniform
/// IDOR) unless it exists, is owned by the caller, and is active. Runs under the caller's writable RLS session.
/// </summary>
public interface ITestScoreWriter
{
    Task<TestScoreWriteOutcome> CreateAsync(
        RequestContext context, string userId, JsonElement body, CancellationToken cancellationToken = default);

    Task<TestScoreWriteOutcome> UpdateAsync(
        RequestContext context, string userId, string id, JsonElement body, CancellationToken cancellationToken = default);

    /// <summary>Soft-delete (isActive=false). Returns false when missing/not-owned/already-inactive (404).</summary>
    Task<bool> DeleteAsync(
        RequestContext context, string userId, string id, CancellationToken cancellationToken = default);
}
