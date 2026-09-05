using System.Text.Json;
using FormMaps.Application.Graduation;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Body parsing for POST / PUT /api/v1/school-admin/graduation/rules (issue #55).
///
/// The two verbs are asymmetric in legacy and that asymmetry is the whole design here:
///
/// * POST (<c>createGraduationRules</c>) hands the body STRAIGHT to Prisma. A missing totalCreditsRequired, a
///   category with no name, or a non-numeric special-requirement value all reach a NOT NULL / Decimal column and
///   500. Following the ratified FM-DOTNET-048 stance on this same router, those become 400s here — a stricter,
///   architecturally-correct answer to a request legacy could never have satisfied.
///
/// * PUT (<c>updateGraduationRules</c>) NORMALIZES nearly everything before writing: a missing category name
///   becomes "", a missing type becomes "custom", every numeric goes through <c>Number(x) || 0</c>, and strings
///   are length-capped. Those defaults are reproduced rather than rejected, because here legacy really does
///   accept the request and a 400 would be a behaviour change. The ONE thing PUT still rejects is a
///   <c>requiredCourses</c> that is present but not an array — legacy calls <c>.map</c> on it and throws.
///
/// The other load-bearing PUT rule: a child list that is ABSENT or not an array means "leave the existing rows
/// alone" (null), while an EMPTY array means "delete them all". Collapsing the two would silently wipe a rule
/// set on any request that omitted the key.
/// </summary>
internal static class GraduationRulesBody
{
    private const string Custom = "custom";

    public static bool TryParseCreate(JsonElement body, out CreateGraduationRulesInput input, out string message)
    {
        input = null!;
        message = string.Empty;

        if (body.ValueKind != JsonValueKind.Object)
        {
            message = "Invalid request body";
            return false;
        }

        var academicYearId = OptionalString(body, "academicYearId");

        if (!body.TryGetProperty("totalCreditsRequired", out var creditsElement)
            || creditsElement.ValueKind != JsonValueKind.Number
            || !creditsElement.TryGetDouble(out var totalCreditsRequired))
        {
            message = "totalCreditsRequired must be a number";
            return false;
        }

        var categories = new List<CategoryRequirementInput>();
        if (body.TryGetProperty("categoryRequirements", out var categoriesElement)
            && categoriesElement.ValueKind != JsonValueKind.Null)
        {
            if (categoriesElement.ValueKind != JsonValueKind.Array)
            {
                message = "categoryRequirements must be an array";
                return false;
            }

            foreach (var element in categoriesElement.EnumerateArray())
            {
                // `category: c.category` straight into a NOT NULL column.
                if (element.ValueKind != JsonValueKind.Object
                    || !element.TryGetProperty("category", out var category)
                    || category.ValueKind != JsonValueKind.String)
                {
                    message = "each categoryRequirement needs a category string";
                    return false;
                }

                if (!TryReadRequiredCourses(element, out var requiredCourses, out message))
                {
                    return false;
                }

                categories.Add(new CategoryRequirementInput(
                    category.GetString()!,
                    // `minCredits: c.minCredits || 0` — a non-number (or 0) becomes 0 without erroring.
                    NumberOrZero(element, "minCredits"),
                    requiredCourses,
                    // `electivesAllowed: c.electivesAllowed ?? true` — only null/absent falls back.
                    OptionalBoolean(element, "electivesAllowed") ?? true));
            }
        }

        var specials = new List<SpecialRequirementInput>();
        if (body.TryGetProperty("specialRequirements", out var specialsElement)
            && specialsElement.ValueKind != JsonValueKind.Null)
        {
            if (specialsElement.ValueKind != JsonValueKind.Array)
            {
                message = "specialRequirements must be an array";
                return false;
            }

            foreach (var element in specialsElement.EnumerateArray())
            {
                if (element.ValueKind != JsonValueKind.Object
                    || !TryReadString(element, "name", out var name)
                    || !TryReadString(element, "type", out var type))
                {
                    message = "each specialRequirement needs name and type strings";
                    return false;
                }

                // `value` reaches a NOT NULL Decimal. Prisma accepts a number or a numeric string here, and
                // rejects anything else, so both are accepted and everything else is a 400.
                if (!TryReadDecimalish(element, "value", out var value))
                {
                    message = "each specialRequirement needs a numeric value";
                    return false;
                }

                specials.Add(new SpecialRequirementInput(
                    name, type, value, OptionalString(element, "unit"), OptionalString(element, "description")));
            }
        }

        input = new CreateGraduationRulesInput(academicYearId, totalCreditsRequired, categories, specials);
        return true;
    }

    public static bool TryParseUpdate(JsonElement body, out UpdateGraduationRulesInput input, out string message)
    {
        input = null!;
        message = string.Empty;

        if (body.ValueKind != JsonValueKind.Object)
        {
            message = "Invalid request body";
            return false;
        }

        // `totalCreditsRequired: body.totalCreditsRequired ?? ruleSet.totalCreditsRequired` — no coercion, so a
        // present non-number would reach the Decimal column and throw. 400 (FM-048 stance).
        double? totalCreditsRequired = null;
        if (body.TryGetProperty("totalCreditsRequired", out var creditsElement)
            && creditsElement.ValueKind != JsonValueKind.Null)
        {
            if (creditsElement.ValueKind != JsonValueKind.Number || !creditsElement.TryGetDouble(out var credits))
            {
                message = "totalCreditsRequired must be a number";
                return false;
            }

            totalCreditsRequired = credits;
        }

        // Array.isArray(...) ? map(...) : null — a non-array (including a string or an object) is NOT an error
        // here, it is "leave the rows alone".
        List<CategoryRequirementInput>? categories = null;
        if (body.TryGetProperty("categoryRequirements", out var categoriesElement)
            && categoriesElement.ValueKind == JsonValueKind.Array)
        {
            categories = [];
            foreach (var element in categoriesElement.EnumerateArray())
            {
                if (!TryReadRequiredCourses(element, out var requiredCourses, out message))
                {
                    return false;
                }

                categories.Add(new CategoryRequirementInput(
                    // (c.category ?? "").slice(0, 100)
                    Slice(OptionalString(element, "category") ?? string.Empty, 100),
                    NumberOrZero(element, "minCredits"),
                    // (c.requiredCourses ?? []).map(r => String(r).slice(0, 40))
                    requiredCourses.Select(r => Slice(r, 40)).ToList(),
                    OptionalBoolean(element, "electivesAllowed") ?? true));
            }
        }

        List<SpecialRequirementInput>? specials = null;
        if (body.TryGetProperty("specialRequirements", out var specialsElement)
            && specialsElement.ValueKind == JsonValueKind.Array)
        {
            specials = [];
            foreach (var element in specialsElement.EnumerateArray())
            {
                specials.Add(new SpecialRequirementInput(
                    Slice(OptionalString(element, "name") ?? string.Empty, 200),
                    // (s.type ?? "custom").slice(0, 40)
                    Slice(OptionalString(element, "type") ?? Custom, 40),
                    NumberOrZero(element, "value"),
                    Slice(OptionalString(element, "unit") ?? string.Empty, 40),
                    Slice(OptionalString(element, "description") ?? string.Empty, 500)));
            }
        }

        input = new UpdateGraduationRulesInput(totalCreditsRequired, categories, specials);
        return true;
    }

    // ---------------------------------------------------------------- element helpers

    // `(c.requiredCourses ?? [])` then `.map` / straight into a text[]. Present-but-not-an-array is the one
    // shape both verbs reject: legacy calls .map on it (PUT) or hands a scalar to a text[] column (POST).
    private static bool TryReadRequiredCourses(
        JsonElement element, out List<string> requiredCourses, out string message)
    {
        requiredCourses = [];
        message = string.Empty;

        if (element.ValueKind != JsonValueKind.Object
            || !element.TryGetProperty("requiredCourses", out var raw)
            || raw.ValueKind == JsonValueKind.Null)
        {
            return true;
        }

        if (raw.ValueKind != JsonValueKind.Array)
        {
            message = "requiredCourses must be an array of strings";
            return false;
        }

        foreach (var item in raw.EnumerateArray())
        {
            // String(r) in the PUT; a text[] column in the POST. Only strings are accepted, which is what every
            // caller sends and what the column holds.
            if (item.ValueKind != JsonValueKind.String)
            {
                message = "requiredCourses must be an array of strings";
                return false;
            }

            requiredCourses.Add(item.GetString()!);
        }

        return true;
    }

    private static bool TryReadString(JsonElement element, string name, out string value)
    {
        value = string.Empty;
        if (!element.TryGetProperty(name, out var raw) || raw.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        value = raw.GetString()!;
        return true;
    }

    private static bool TryReadDecimalish(JsonElement element, string name, out double value)
    {
        value = 0d;
        if (!element.TryGetProperty(name, out var raw))
        {
            return false;
        }

        if (raw.ValueKind == JsonValueKind.Number)
        {
            return raw.TryGetDouble(out value);
        }

        return raw.ValueKind == JsonValueKind.String
            && double.TryParse(raw.GetString(), System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out value);
    }

    // Number(x) || 0 — a non-number, a non-numeric string, and 0 itself all give 0.
    private static double NumberOrZero(JsonElement element, string name)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(name, out var raw))
        {
            return 0d;
        }

        if (raw.ValueKind == JsonValueKind.Number && raw.TryGetDouble(out var number))
        {
            return number;
        }

        if (raw.ValueKind == JsonValueKind.String
            && double.TryParse(raw.GetString(), System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out var parsed))
        {
            return parsed;
        }

        return 0d;
    }

    private static string? OptionalString(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(name, out var raw)
        && raw.ValueKind == JsonValueKind.String
            ? raw.GetString()
            : null;

    private static bool? OptionalBoolean(JsonElement element, string name)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(name, out var raw))
        {
            return null;
        }

        return raw.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            // `?? true` only falls back for null/undefined; any other present value is truthy-or-falsy in JS but
            // reaches a BOOLEAN column and throws, so it is treated as absent here rather than invented.
            _ => null,
        };
    }

    // JS String.prototype.slice counts UTF-16 code units, which is what C# string indexing counts too.
    private static string Slice(string value, int length) =>
        value.Length <= length ? value : value[..length];
}
