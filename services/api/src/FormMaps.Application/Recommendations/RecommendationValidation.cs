using System.Globalization;
using System.Text.Json;

namespace FormMaps.Application.Recommendations;

/// <summary>
/// Port of the four zod schemas in routes/recommendations.ts. Each returns the FIRST failing field's message in
/// schema-declaration order — legacy responds with <c>body.error.errors[0].message</c>, so the exact zod strings are
/// part of the observable surface and are reproduced here (same approach as StudentApplicationValidation).
/// </summary>
public static class RecommendationValidation
{
    // ---- createRequestSchema (recommendations.ts:48) ----

    public static ValidationResult<CreateRequestBody> ValidateCreate(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object)
        {
            return ValidationResult<CreateRequestBody>.Failure($"Expected object, received {ZodType(body)}");
        }

        // 1. recommenderId — z.string().min(1).max(64)
        var error = RequiredString(body, "recommenderId", min: 1, max: 64, out var recommenderId);
        if (error is not null) return ValidationResult<CreateRequestBody>.Failure(error);

        // 2. relationship — z.string().min(1).max(100)
        error = RequiredString(body, "relationship", min: 1, max: 100, out var relationship);
        if (error is not null) return ValidationResult<CreateRequestBody>.Failure(error);

        // 3. requestMessage — z.string().min(1).max(2000)
        error = RequiredString(body, "requestMessage", min: 1, max: 2000, out var requestMessage);
        if (error is not null) return ValidationResult<CreateRequestBody>.Failure(error);

        // 4. dueDate — z.string().max(40).refine(parseable, "Invalid due date").optional()
        //    The string checks run BEFORE the refinement, so a 50-char unparseable value reports the max message.
        string? dueDate = null;
        if (body.TryGetProperty("dueDate", out var dueEl))
        {
            error = CheckString(dueEl, min: null, max: 40, out dueDate);
            if (error is not null) return ValidationResult<CreateRequestBody>.Failure(error);
            if (!IsParseableDate(dueDate!)) return ValidationResult<CreateRequestBody>.Failure("Invalid due date");
        }

        return ValidationResult<CreateRequestBody>.Success(
            new CreateRequestBody(recommenderId!, relationship!, requestMessage!, dueDate));
    }

    // ---- respondSchema (recommendations.ts:150) ----

    public static ValidationResult<RespondBody> ValidateRespond(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object)
        {
            return ValidationResult<RespondBody>.Failure($"Expected object, received {ZodType(body)}");
        }

        var error = RequiredEnum(body, "action", ["accept", "decline"], out var action);
        if (error is not null) return ValidationResult<RespondBody>.Failure(error);

        // declineReason — z.string().max(1000).optional()
        string? declineReason = null;
        if (body.TryGetProperty("declineReason", out var reasonEl))
        {
            error = CheckString(reasonEl, min: null, max: 1000, out declineReason);
            if (error is not null) return ValidationResult<RespondBody>.Failure(error);
        }

        return ValidationResult<RespondBody>.Success(new RespondBody(action!, declineReason));
    }

    // ---- updateStatusSchema (recommendations.ts:173) ----

    public static ValidationResult<string> ValidateStatus(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object)
        {
            return ValidationResult<string>.Failure($"Expected object, received {ZodType(body)}");
        }

        var error = RequiredEnum(body, "status", ["in_progress", "submitted"], out var status);
        return error is not null
            ? ValidationResult<string>.Failure(error)
            : ValidationResult<string>.Success(status!);
    }

    // ---- linkApplicationsSchema (recommendations.ts:234) ----

    public static ValidationResult<IReadOnlyList<string>> ValidateLinkApplications(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object)
        {
            return ValidationResult<IReadOnlyList<string>>.Failure($"Expected object, received {ZodType(body)}");
        }

        if (!body.TryGetProperty("applicationIds", out var el))
        {
            return ValidationResult<IReadOnlyList<string>>.Failure("Required");
        }

        if (el.ValueKind != JsonValueKind.Array)
        {
            return ValidationResult<IReadOnlyList<string>>.Failure($"Expected array, received {ZodType(el)}");
        }

        // ZodArray checks its own length constraints before parsing elements, so [] reports the min message.
        var items = el.EnumerateArray().ToList();
        if (items.Count < 1)
        {
            return ValidationResult<IReadOnlyList<string>>.Failure("Array must contain at least 1 element(s)");
        }

        var ids = new List<string>(items.Count);
        foreach (var item in items)
        {
            var error = CheckString(item, min: 1, max: null, out var value);
            if (error is not null) return ValidationResult<IReadOnlyList<string>>.Failure(error);
            ids.Add(value!);
        }

        return ValidationResult<IReadOnlyList<string>>.Success(ids);
    }

    // ---- primitives ----

    private static string? RequiredString(JsonElement body, string name, int? min, int? max, out string? value)
    {
        value = null;
        if (!body.TryGetProperty(name, out var el))
        {
            return "Required";
        }

        return CheckString(el, min, max, out value);
    }

    private static string? CheckString(JsonElement el, int? min, int? max, out string? value)
    {
        value = null;
        if (el.ValueKind != JsonValueKind.String)
        {
            return $"Expected string, received {ZodType(el)}";
        }

        var s = el.GetString()!;
        if (min is not null && s.Length < min.Value)
        {
            return $"String must contain at least {min.Value} character(s)";
        }

        if (max is not null && s.Length > max.Value)
        {
            return $"String must contain at most {max.Value} character(s)";
        }

        value = s;
        return null;
    }

    // z.enum([...]) type-checks FIRST: a non-string raises invalid_type; only an invalid STRING raises
    // invalid_enum_value. Same split StudentApplicationValidation documents for `column`.
    private static string? RequiredEnum(JsonElement body, string name, string[] values, out string? value)
    {
        value = null;
        var expected = string.Join(" | ", values.Select(v => $"'{v}'"));

        if (!body.TryGetProperty(name, out var el))
        {
            return "Required";
        }

        if (el.ValueKind != JsonValueKind.String)
        {
            return $"Expected {expected}, received {ZodType(el)}";
        }

        var s = el.GetString()!;
        if (Array.IndexOf(values, s) < 0)
        {
            return $"Invalid enum value. Expected {expected}, received '{s}'";
        }

        value = s;
        return null;
    }

    /// <summary>`!Number.isNaN(Date.parse(v))`. ISO-8601 (what the UI sends) agrees between the two runtimes.</summary>
    private static bool IsParseableDate(string raw) =>
        DateTime.TryParse(
            raw, CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal,
            out _);

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

/// <summary>Validation outcome: Ok + the parsed value, or the first zod-equivalent error message.</summary>
public sealed record ValidationResult<T>(bool Ok, string? Message, T? Value)
{
    public static ValidationResult<T> Success(T value) => new(true, null, value);

    public static ValidationResult<T> Failure(string message) => new(false, message, default);
}

/// <summary>Parsed createRequestSchema body.</summary>
public sealed record CreateRequestBody(
    string RecommenderId, string Relationship, string RequestMessage, string? DueDate);

/// <summary>Parsed respondSchema body.</summary>
public sealed record RespondBody(string Action, string? DeclineReason);
