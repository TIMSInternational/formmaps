using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.Application.CommunityService;

/// <summary>
/// Port of the zod create/updateCommunityServiceSchema in routes/student.ts. Returns the FIRST failing field's message
/// in schema-declaration order (== legacy <c>parsed.error.errors[0]?.message</c>). Field order: organization,
/// description, hours, date, supervisorName, supervisorEmail. On create, organization/hours/date are required; on
/// update every field is optional PLUS a top-level .refine() "At least one field is required" (fires last, only when
/// no field is present). date uses z.string().refine(Date.parse valid AND t &lt;= now) → "Date must be a valid,
/// non-future date"; supervisorEmail uses z.string().email() (the zod v3 regex, via ExternalEmailNormalization).
/// </summary>
public static class CommunityServiceValidation
{
    public static CommunityServiceValidationResult ValidateCreate(JsonElement body, DateTimeOffset now)
    {
        if (body.ValueKind != JsonValueKind.Object)
        {
            return CommunityServiceValidationResult.Failure($"Expected object, received {ZodType(body)}");
        }

        string? error;

        // 1. organization — z.string().min(1).max(200) (required)
        if (!Has(body, "organization", out var orgEl))
        {
            return CommunityServiceValidationResult.Failure("Required");
        }

        error = CheckString(orgEl, min: 1, max: 200, out var organization);
        if (error is not null) return CommunityServiceValidationResult.Failure(error);

        // 2. description — z.string().max(2000).optional()
        error = CheckOptionalString(body, "description", 2000, out var hasDesc, out var desc);
        if (error is not null) return CommunityServiceValidationResult.Failure(error);

        // 3. hours — z.number().min(0).max(10000) (required)
        if (!Has(body, "hours", out var hoursEl))
        {
            return CommunityServiceValidationResult.Failure("Required");
        }

        error = CheckNumberRange(hoursEl, 0, 10000, out var hours);
        if (error is not null) return CommunityServiceValidationResult.Failure(error);

        // 4. date — z.string().refine(valid && non-future) (required)
        if (!Has(body, "date", out var dateEl))
        {
            return CommunityServiceValidationResult.Failure("Required");
        }

        error = CheckDate(dateEl, now, out var date);
        if (error is not null) return CommunityServiceValidationResult.Failure(error);

        // 5. supervisorName — z.string().max(100).optional()
        error = CheckOptionalString(body, "supervisorName", 100, out var hasName, out var name);
        if (error is not null) return CommunityServiceValidationResult.Failure(error);

        // 6. supervisorEmail — z.string().email().max(200).optional()
        error = CheckOptionalEmail(body, "supervisorEmail", 200, out var hasEmail, out var email);
        if (error is not null) return CommunityServiceValidationResult.Failure(error);

        return CommunityServiceValidationResult.Ok(new CommunityServiceCreateInput(
            organization!, hasDesc, desc, hours, date, hasName, name, hasEmail, email));
    }

    public static CommunityServiceUpdateResult ValidateUpdate(JsonElement body, DateTimeOffset now)
    {
        if (body.ValueKind != JsonValueKind.Object)
        {
            return CommunityServiceUpdateResult.Failure($"Expected object, received {ZodType(body)}");
        }

        string? error;

        // organization — z.string().min(1).max(200).optional()
        error = CheckOptionalString(body, "organization", 200, out var hasOrg, out var org, min: 1);
        if (error is not null) return CommunityServiceUpdateResult.Failure(error);

        error = CheckOptionalString(body, "description", 2000, out var hasDesc, out var desc);
        if (error is not null) return CommunityServiceUpdateResult.Failure(error);

        var hasHours = false;
        decimal? hours = null;
        if (Has(body, "hours", out var hoursEl))
        {
            error = CheckNumberRange(hoursEl, 0, 10000, out var h);
            if (error is not null) return CommunityServiceUpdateResult.Failure(error);
            hasHours = true;
            hours = h;
        }

        var hasDate = false;
        DateTime? date = null;
        if (Has(body, "date", out var dateEl))
        {
            error = CheckDate(dateEl, now, out var d);
            if (error is not null) return CommunityServiceUpdateResult.Failure(error);
            hasDate = true;
            date = d;
        }

        error = CheckOptionalString(body, "supervisorName", 100, out var hasName, out var name);
        if (error is not null) return CommunityServiceUpdateResult.Failure(error);

        error = CheckOptionalEmail(body, "supervisorEmail", 200, out var hasEmail, out var email);
        if (error is not null) return CommunityServiceUpdateResult.Failure(error);

        // Top-level .refine(): fires last, only when NO field is present.
        if (!(hasOrg || hasDesc || hasHours || hasDate || hasName || hasEmail))
        {
            return CommunityServiceUpdateResult.Failure("At least one field is required");
        }

        return CommunityServiceUpdateResult.Ok(new CommunityServicePatch(
            hasOrg, org, hasDesc, desc, hasHours, hours, hasDate, date, hasName, name, hasEmail, email));
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

    private static string? CheckOptionalString(JsonElement body, string name, int? max, out bool present, out string? value, int? min = null)
    {
        present = false;
        value = null;
        if (!Has(body, name, out var el))
        {
            return null;
        }

        var error = CheckString(el, min, max, out value);
        if (error is not null)
        {
            return error;
        }

        present = true;
        return null;
    }

    // z.number().min(min).max(max) — hours is a Decimal column so a float is fine (no .int()).
    private static string? CheckNumberRange(JsonElement el, int min, int max, out decimal value)
    {
        value = 0;
        if (el.ValueKind != JsonValueKind.Number)
        {
            return $"Expected number, received {ZodType(el)}";
        }

        var d = el.GetDouble();
        if (d < min) return $"Number must be greater than or equal to {min}";
        if (d > max) return $"Number must be less than or equal to {max}";
        value = el.GetDecimal();
        return null;
    }

    // z.string().refine(s => !isNaN(Date.parse(s)) && Date.parse(s) <= Date.now()). Type-check first, then the refine.
    private static string? CheckDate(JsonElement el, DateTimeOffset now, out DateTime value)
    {
        value = default;
        if (el.ValueKind != JsonValueKind.String)
        {
            return $"Expected string, received {ZodType(el)}";
        }

        const string message = "Date must be a valid, non-future date";
        var s = el.GetString()!;
        if (!DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed))
        {
            return message; // Date.parse → NaN
        }

        if (parsed > now)
        {
            return message; // future
        }

        value = parsed.UtcDateTime;
        return null;
    }

    // z.string().email().max(max): type → email (zod v3 regex) → max, in that order.
    private static string? CheckOptionalEmail(JsonElement body, string name, int max, out bool present, out string? value)
    {
        present = false;
        value = null;
        if (!Has(body, name, out var el))
        {
            return null;
        }

        if (el.ValueKind != JsonValueKind.String)
        {
            return $"Expected string, received {ZodType(el)}";
        }

        var s = el.GetString()!;
        if (!ExternalEmailNormalization.IsValidZodEmail(s))
        {
            return "Invalid email";
        }

        if (s.Length > max)
        {
            return $"String must contain at most {max} character(s)";
        }

        present = true;
        value = s;
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

public sealed record CommunityServiceValidationResult(bool Success, string? Message, CommunityServiceCreateInput? Input)
{
    public static CommunityServiceValidationResult Ok(CommunityServiceCreateInput input) => new(true, null, input);

    public static CommunityServiceValidationResult Failure(string message) => new(false, message, null);
}

public sealed record CommunityServiceUpdateResult(bool Success, string? Message, CommunityServicePatch? Patch)
{
    public static CommunityServiceUpdateResult Ok(CommunityServicePatch patch) => new(true, null, patch);

    public static CommunityServiceUpdateResult Failure(string message) => new(false, message, null);
}
