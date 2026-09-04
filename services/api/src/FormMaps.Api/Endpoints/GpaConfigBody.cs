using System.Text.Json;
using FormMaps.Application.Transcript;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Body validation for PUT /api/v1/transcript/school-admin/gpa-config, reproducing the zod schema at
/// transcript.ts:84 AND its error text, because the route returns <c>body.error.errors[0].message</c> verbatim:
///
///   z.object({ scale: z.number().positive().optional(),
///              unweightedMap: z.record(z.string(), z.number()).optional(),
///              weightBonuses: z.record(z.string(), z.number()).optional() })
///
/// zod v3 emits "Expected {expected}, received {received}" for a type mismatch and
/// "Number must be greater than 0" for <c>.positive()</c>, and reports the FIRST issue in shape-declaration
/// order (scale, then unweightedMap, then weightBonuses; within a record, object key order). Unknown keys are
/// stripped without an error, and every field is optional so an empty body is valid.
/// </summary>
internal static class GpaConfigBody
{
    public static bool TryParse(JsonElement body, out GpaConfigInput input, out string message)
    {
        input = new GpaConfigInput(null, null, null);
        message = string.Empty;

        if (body.ValueKind != JsonValueKind.Object)
        {
            message = $"Expected object, received {ZodType(body)}";
            return false;
        }

        double? scale = null;
        if (body.TryGetProperty("scale", out var scaleElement))
        {
            if (scaleElement.ValueKind != JsonValueKind.Number || !scaleElement.TryGetDouble(out var scaleValue))
            {
                message = $"Expected number, received {ZodType(scaleElement)}";
                return false;
            }

            // .positive() -> too_small, inclusive:false, minimum:0.
            if (scaleValue <= 0)
            {
                message = "Number must be greater than 0";
                return false;
            }

            scale = scaleValue;
        }

        if (!TryReadNumberMap(body, "unweightedMap", out var unweightedMap, out message))
        {
            return false;
        }

        if (!TryReadNumberMap(body, "weightBonuses", out var weightBonuses, out message))
        {
            return false;
        }

        input = new GpaConfigInput(scale, unweightedMap, weightBonuses);
        return true;
    }

    private static bool TryReadNumberMap(
        JsonElement body, string name, out IReadOnlyDictionary<string, double>? map, out string message)
    {
        map = null;
        message = string.Empty;

        if (!body.TryGetProperty(name, out var element))
        {
            return true;
        }

        if (element.ValueKind != JsonValueKind.Object)
        {
            message = $"Expected object, received {ZodType(element)}";
            return false;
        }

        // Insertion order preserved so the reported issue is the same property zod would report first, and so the
        // jsonb we persist carries the caller's key order (Postgres re-normalizes it on storage anyway).
        var parsed = new Dictionary<string, double>(StringComparer.Ordinal);
        foreach (var property in element.EnumerateObject())
        {
            if (property.Value.ValueKind != JsonValueKind.Number || !property.Value.TryGetDouble(out var number))
            {
                message = $"Expected number, received {ZodType(property.Value)}";
                return false;
            }

            parsed[property.Name] = number;
        }

        map = parsed;
        return true;
    }

    // zod's getParsedType() names, restricted to what JSON can carry.
    private static string ZodType(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.Object => "object",
        JsonValueKind.Array => "array",
        JsonValueKind.String => "string",
        JsonValueKind.Number => "number",
        JsonValueKind.True or JsonValueKind.False => "boolean",
        JsonValueKind.Null => "null",
        _ => "undefined"
    };
}
