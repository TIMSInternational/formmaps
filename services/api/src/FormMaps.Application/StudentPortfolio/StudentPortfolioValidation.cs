using System.Globalization;
using System.Text.Json;

namespace FormMaps.Application.StudentPortfolio;

/// <summary>
/// Port of the zod createPortfolioSchema / updatePortfolioSchema(.partial()) in routes/student.ts. Returns the FIRST
/// failing field's message in schema-declaration order (== legacy <c>body.error.errors[0].message</c>), reproducing
/// zod's default wording. Field order: type, title, organization, startDate, endDate, isCurrent, description, role,
/// hoursPerWeek, weeksPerYear, activityCategory, totalHours, achievements, skills. On the partial (update) schema
/// every field — including title — is optional.
/// </summary>
public static class StudentPortfolioValidation
{
    private static readonly string[] ActivityCategories =
        ["academic", "athletic", "arts", "community_service", "work", "leadership", "other"];

    private static readonly string EnumExpected = string.Join(" | ", ActivityCategories.Select(c => $"'{c}'"));

    public static PortfolioValidationResult ValidateCreate(JsonElement body) => Validate(body, isCreate: true);

    public static PortfolioValidationResult ValidateUpdate(JsonElement body) => Validate(body, isCreate: false);

    private static PortfolioValidationResult Validate(JsonElement body, bool isCreate)
    {
        // z.object(...) / .partial(): a non-object top-level body is rejected outright. (An absent/empty body is
        // normalized to {} by the endpoint; a malformed body 500s before reaching here.)
        if (body.ValueKind != JsonValueKind.Object)
        {
            return PortfolioValidationResult.Failure($"Expected object, received {ZodType(body)}");
        }

        string? error;

        // 1. type — z.string().optional()
        error = CheckString(body, "type", min: null, max: null, out var hasType, out var type);
        if (error is not null) return PortfolioValidationResult.Failure(error);

        // 2. title — z.string().min(1).max(150); required on create, optional on update.
        bool hasTitle;
        string? title;
        if (Has(body, "title"))
        {
            error = CheckString(body, "title", min: 1, max: 150, out hasTitle, out title);
            if (error is not null) return PortfolioValidationResult.Failure(error);
        }
        else
        {
            if (isCreate) return PortfolioValidationResult.Failure("Required");
            hasTitle = false;
            title = null;
        }

        // 3. organization — z.string().max(100).optional()
        error = CheckString(body, "organization", min: null, max: 100, out var hasOrg, out var org);
        if (error is not null) return PortfolioValidationResult.Failure(error);

        // 4. startDate — z.string().optional()
        error = CheckString(body, "startDate", min: null, max: null, out var hasStart, out var start);
        if (error is not null) return PortfolioValidationResult.Failure(error);

        // 5. endDate — z.string().optional()
        error = CheckString(body, "endDate", min: null, max: null, out var hasEnd, out var end);
        if (error is not null) return PortfolioValidationResult.Failure(error);

        // 6. isCurrent — z.boolean().optional()
        error = CheckBool(body, "isCurrent", out var hasIsCurrent, out var isCurrent);
        if (error is not null) return PortfolioValidationResult.Failure(error);

        // 7. description — z.string().max(2000).optional()
        error = CheckString(body, "description", min: null, max: 2000, out var hasDesc, out var desc);
        if (error is not null) return PortfolioValidationResult.Failure(error);

        // 8. role — z.string().max(50).optional()
        error = CheckString(body, "role", min: null, max: 50, out var hasRole, out var role);
        if (error is not null) return PortfolioValidationResult.Failure(error);

        // 9. hoursPerWeek — z.number().optional()
        error = CheckDecimal(body, "hoursPerWeek", out var hasHpw, out var hpw);
        if (error is not null) return PortfolioValidationResult.Failure(error);

        // 10. weeksPerYear — z.number().int().min(0).max(52).optional()
        error = CheckInt(body, "weeksPerYear", 0, 52, out var hasWpy, out var wpy);
        if (error is not null) return PortfolioValidationResult.Failure(error);

        // 11. activityCategory — z.enum([...]).optional()
        error = CheckEnum(body, "activityCategory", out var hasCat, out var cat);
        if (error is not null) return PortfolioValidationResult.Failure(error);

        // 12. totalHours — z.number().optional()
        error = CheckDecimal(body, "totalHours", out var hasTotal, out var total);
        if (error is not null) return PortfolioValidationResult.Failure(error);

        // 13. achievements — z.array(z.string()).optional()
        error = CheckStringArray(body, "achievements", out var hasAch, out var ach);
        if (error is not null) return PortfolioValidationResult.Failure(error);

        // 14. skills — z.array(z.string()).optional()
        error = CheckStringArray(body, "skills", out var hasSkills, out var skills);
        if (error is not null) return PortfolioValidationResult.Failure(error);

        return PortfolioValidationResult.Success(new PortfolioInput(
            hasType, type, hasTitle, title, hasOrg, org, hasStart, start, hasEnd, end,
            hasIsCurrent, isCurrent, hasDesc, desc, hasRole, role, hasHpw, hpw, hasWpy, wpy,
            hasCat, cat, hasTotal, total, hasAch, ach, hasSkills, skills));
    }

    private static string? CheckString(JsonElement body, string name, int? min, int? max, out bool present, out string? value)
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
        if (min is not null && s.Length < min.Value)
        {
            return $"String must contain at least {min.Value} character(s)";
        }

        if (max is not null && s.Length > max.Value)
        {
            return $"String must contain at most {max.Value} character(s)";
        }

        present = true;
        value = s;
        return null;
    }

    private static string? CheckBool(JsonElement body, string name, out bool present, out bool value)
    {
        present = false;
        value = false;
        if (!Has(body, name, out var el))
        {
            return null;
        }

        if (el.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
        {
            return $"Expected boolean, received {ZodType(el)}";
        }

        present = true;
        value = el.GetBoolean();
        return null;
    }

    // z.number(): any finite JSON number → decimal for storage.
    private static string? CheckDecimal(JsonElement body, string name, out bool present, out decimal? value)
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

        present = true;
        value = el.GetDecimal();
        return null;
    }

    // z.number().int().min(min).max(max): type → integer → bounds, first failure wins.
    private static string? CheckInt(JsonElement body, string name, int min, int max, out bool present, out int? value)
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

        present = true;
        value = (int)d;
        return null;
    }

    private static string? CheckEnum(JsonElement body, string name, out bool present, out string? value)
    {
        present = false;
        value = null;
        if (!Has(body, name, out var el))
        {
            return null;
        }

        if (el.ValueKind == JsonValueKind.String && Array.IndexOf(ActivityCategories, el.GetString()) >= 0)
        {
            present = true;
            value = el.GetString();
            return null;
        }

        var received = el.ValueKind == JsonValueKind.String ? el.GetString() : el.GetRawText();
        return $"Invalid enum value. Expected {EnumExpected}, received '{received}'";
    }

    private static string? CheckStringArray(JsonElement body, string name, out bool present, out string[]? value)
    {
        present = false;
        value = null;
        if (!Has(body, name, out var el))
        {
            return null;
        }

        if (el.ValueKind != JsonValueKind.Array)
        {
            return $"Expected array, received {ZodType(el)}";
        }

        var list = new List<string>();
        foreach (var item in el.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String)
            {
                return $"Expected string, received {ZodType(item)}";
            }

            list.Add(item.GetString()!);
        }

        present = true;
        value = list.ToArray();
        return null;
    }

    private static bool Has(JsonElement body, string name) => body.TryGetProperty(name, out _);

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

/// <summary>Validation result: Ok + the parsed presence-aware input, or the first Zod-equivalent error message.</summary>
public sealed record PortfolioValidationResult(bool Ok, string? Message, PortfolioInput? Input)
{
    public static PortfolioValidationResult Success(PortfolioInput input) => new(true, null, input);

    public static PortfolioValidationResult Failure(string message) => new(false, message, null);
}
