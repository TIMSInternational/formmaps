using System.Text.Json;

namespace FormMaps.Application.StudentApplications;

/// <summary>
/// Port of the zod createApplicationSchema in routes/student.ts (POST /applications only — PUT is raw-body + bounded,
/// no zod). Returns the FIRST failing field's message in schema-declaration order (== legacy
/// <c>parsed.error.errors[0]?.message</c>). Field order: name, type, location, matchScore, deadline, notes, column.
/// type (.default("university")) and column (.default("researching")) fall back to their defaults when absent; matchScore
/// is z.number() (float-allowed) — the endpoint enforces integrality afterward (a non-integer 500s at the Int column).
/// </summary>
public static class StudentApplicationValidation
{
    private static readonly string[] Columns = ["researching", "shortlisted", "applying", "applied", "accepted"];

    private static readonly string EnumExpected = string.Join(" | ", Columns.Select(c => $"'{c}'"));

    public static ApplicationValidationResult ValidateCreate(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object)
        {
            return ApplicationValidationResult.Failure($"Expected object, received {ZodType(body)}");
        }

        string? error;

        // 1. name — z.string().min(1).max(100) (required)
        bool hasName;
        string? name;
        if (Has(body, "name", out var nameEl))
        {
            error = CheckString(nameEl, min: 1, max: 100, out name);
            if (error is not null) return ApplicationValidationResult.Failure(error);
            hasName = true;
        }
        else
        {
            return ApplicationValidationResult.Failure("Required");
        }

        _ = hasName;

        // 2. type — z.string().max(50).default("university")
        var type = "university";
        if (Has(body, "type", out var typeEl))
        {
            error = CheckString(typeEl, min: null, max: 50, out var t);
            if (error is not null) return ApplicationValidationResult.Failure(error);
            type = t!;
        }

        // 3. location — z.string().max(200).optional()
        error = CheckOptionalString(body, "location", 200, out var hasLoc, out var loc);
        if (error is not null) return ApplicationValidationResult.Failure(error);

        // 4. matchScore — z.number().min(0).max(100).optional()
        error = CheckNumberRange(body, "matchScore", 0, 100, out var hasMs, out var ms);
        if (error is not null) return ApplicationValidationResult.Failure(error);

        // 5. deadline — z.string().optional()
        error = CheckOptionalString(body, "deadline", null, out var hasDeadline, out var deadline);
        if (error is not null) return ApplicationValidationResult.Failure(error);

        // 6. notes — z.string().max(2000).optional()
        error = CheckOptionalString(body, "notes", 2000, out var hasNotes, out var notes);
        if (error is not null) return ApplicationValidationResult.Failure(error);

        // 7. column — z.enum([...]).default("researching"). zod's ZodEnum type-checks FIRST: a non-string raises
        // invalid_type ("Expected 'a' | 'b', received <type>"); only an invalid STRING raises invalid_enum_value
        // ("Invalid enum value. Expected ..., received 'foo'").
        var column = "researching";
        if (Has(body, "column", out var colEl))
        {
            if (colEl.ValueKind != JsonValueKind.String)
            {
                return ApplicationValidationResult.Failure($"Expected {EnumExpected}, received {ZodType(colEl)}");
            }

            if (Array.IndexOf(Columns, colEl.GetString()) < 0)
            {
                return ApplicationValidationResult.Failure($"Invalid enum value. Expected {EnumExpected}, received '{colEl.GetString()}'");
            }

            column = colEl.GetString()!;
        }

        return ApplicationValidationResult.Success(new CreateApplicationParsed(
            name!, type, hasLoc, loc, hasMs, ms, hasDeadline, deadline, hasNotes, notes, column));
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

    private static string? CheckOptionalString(JsonElement body, string name, int? max, out bool present, out string? value)
    {
        present = false;
        value = null;
        if (!Has(body, name, out var el))
        {
            return null;
        }

        var error = CheckString(el, min: null, max: max, out value);
        if (error is not null)
        {
            return error;
        }

        present = true;
        return null;
    }

    // z.number().min(min).max(max): type → bounds (NO .int() — float allowed; integrality enforced later at the Int col).
    private static string? CheckNumberRange(JsonElement body, string name, int min, int max, out bool present, out decimal? value)
    {
        present = false;
        value = null;
        if (!Has(body, name, out var el))
        {
            return null;
        }

        if (el.ValueKind != JsonValueKind.Number)
        {
            return $"Expected number, received {ZodType(el)}";
        }

        var d = el.GetDouble();
        if (d < min)
        {
            return $"Number must be greater than or equal to {min}";
        }

        if (d > max)
        {
            return $"Number must be less than or equal to {max}";
        }

        present = true;
        value = el.GetDecimal();
        return null;
    }

    private static bool Has(JsonElement body, string name, out JsonElement el) => body.TryGetProperty(name, out el);

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

/// <summary>Validation result: Ok + parsed fields, or the first zod-equivalent error message.</summary>
public sealed record ApplicationValidationResult(bool Ok, string? Message, CreateApplicationParsed? Parsed)
{
    public static ApplicationValidationResult Success(CreateApplicationParsed parsed) => new(true, null, parsed);

    public static ApplicationValidationResult Failure(string message) => new(false, message, null);
}

/// <summary>Parsed create body — matchScore kept as decimal (float-allowed by zod); the endpoint enforces the Int
/// column integrality (a non-integer → 500) before constructing the repo input.</summary>
public sealed record CreateApplicationParsed(
    string Name, string Type, bool HasLocation, string? Location, bool HasMatchScore, decimal? MatchScore,
    bool HasDeadline, string? Deadline, bool HasNotes, string? Notes, string Column);
