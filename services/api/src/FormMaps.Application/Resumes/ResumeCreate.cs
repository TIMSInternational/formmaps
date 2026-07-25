using System.Text.Json;

namespace FormMaps.Application.Resumes;

/// <summary>
/// Pure port of the POST /api/resume field-coalescing (routes/resume.ts L109-120). Legacy is a straight Prisma
/// <c>create</c> with per-field JS-<c>||</c> defaults on <c>req.body</c>:
/// <code>
///   name: req.body.name || "My Resume", template: req.body.template || "default",
///   careerField: req.body.careerField || "", personalInfo: req.body.personalInfo || {},
///   experience|education|skills|sections|customFields: req.body.X || [], fieldVisibility: req.body.fieldVisibility || {}
/// </code>
/// String columns (name/template/careerField) take a truthy string, fall back on any falsy value, and — because
/// Prisma coerces the value straight into a Postgres String column — 500 on a truthy NON-string (number, bool,
/// object, array). The jsonb columns accept ANY truthy JSON verbatim (an empty array/object is JS-truthy, so
/// <c>personalInfo:[]</c> stores <c>[]</c>, not the <c>{}</c> default); only a falsy value falls back to the default.
/// </summary>
public static class ResumeCreate
{
    /// <summary>Resolve the create values from the request body, or <c>null</c> when a String column received a
    /// truthy non-string (→ the caller returns 500, matching Prisma's String coercion failure).</summary>
    public static ResumeCreateValues? Resolve(JsonElement body)
    {
        if (!TryResolveString(body, "name", "My Resume", out var name)) return null;
        if (!TryResolveString(body, "template", "default", out var template)) return null;
        if (!TryResolveString(body, "careerField", "", out var careerField)) return null;

        return new ResumeCreateValues(
            name!,
            template!,
            careerField!,
            ResolveJson(body, "personalInfo", "{}"),
            ResolveJson(body, "experience", "[]"),
            ResolveJson(body, "education", "[]"),
            ResolveJson(body, "skills", "[]"),
            ResolveJson(body, "sections", "[]"),
            ResolveJson(body, "fieldVisibility", "{}"),
            ResolveJson(body, "customFields", "[]"));
    }

    // `req.body[key] || fallback` for a Postgres String column: falsy → fallback; truthy string → value;
    // truthy non-string → false (the caller turns this into a 500, matching Prisma's coercion reject).
    private static bool TryResolveString(JsonElement body, string key, string fallback, out string? value)
    {
        value = fallback;
        if (!TryGetProperty(body, key, out var element)) return true; // absent → fallback

        switch (element.ValueKind)
        {
            case JsonValueKind.Null:
            case JsonValueKind.Undefined:
            case JsonValueKind.False:
                return true; // falsy → fallback
            case JsonValueKind.Number:
                if (element.GetDouble() == 0) return true; // 0 → falsy → fallback
                return false; // truthy number → String column reject → 500
            case JsonValueKind.String:
                var s = element.GetString()!;
                if (s.Length == 0) return true; // "" → falsy → fallback
                value = s;
                return true;
            default:
                // true / object / array — all JS-truthy, none is a string → Prisma String reject → 500
                return false;
        }
    }

    // `req.body[key] || fallback` for a jsonb column: falsy → the default JSON text; any truthy value → its raw JSON
    // (jsonb accepts every JSON scalar/array/object). Empty array/object are truthy and are stored as-is.
    private static string ResolveJson(JsonElement body, string key, string fallback)
    {
        if (!TryGetProperty(body, key, out var element)) return fallback; // absent → default

        return element.ValueKind switch
        {
            JsonValueKind.Null or JsonValueKind.Undefined or JsonValueKind.False => fallback,
            JsonValueKind.Number => element.GetDouble() == 0 ? fallback : element.GetRawText(),
            JsonValueKind.String => element.GetString()!.Length == 0 ? fallback : element.GetRawText(),
            _ => element.GetRawText(), // true / object / array → verbatim
        };
    }

    private static bool TryGetProperty(JsonElement body, string key, out JsonElement value)
    {
        value = default;
        return body.ValueKind == JsonValueKind.Object && body.TryGetProperty(key, out value);
    }
}

/// <summary>The resolved column values for a resume INSERT: three String columns + eight jsonb columns as raw JSON
/// text (each already coalesced to its default when the body value was falsy/absent).</summary>
public sealed record ResumeCreateValues(
    string Name,
    string Template,
    string CareerField,
    string PersonalInfoJson,
    string ExperienceJson,
    string EducationJson,
    string SkillsJson,
    string SectionsJson,
    string FieldVisibilityJson,
    string CustomFieldsJson);
