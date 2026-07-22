using System.Text.Json;

namespace FormMaps.Application.SchoolUsers;

/// <summary>
/// Pure port of legacy normalizeStudentIds (schoolService.ts:154-163): every array element must be a
/// <c>typeof string</c> whose <c>.trim()</c> is non-empty, else the whole call fails with
/// "studentIds[] must contain student ids". Otherwise the trimmed values are deduped via a Set (insertion order
/// preserved). A number/null/empty-string/boolean/object element all trip the error (only JSON strings pass).
/// </summary>
public static class StudentIdNormalizer
{
    private const string ElementError = "studentIds[] must contain student ids";

    public static StudentIdNormalization Normalize(IReadOnlyList<JsonElement> elements)
    {
        var cleaned = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var element in elements)
        {
            if (element.ValueKind != JsonValueKind.String)
            {
                return new StudentIdNormalization([], ElementError);
            }

            var trimmed = (element.GetString() ?? string.Empty).Trim();
            if (trimmed.Length == 0)
            {
                return new StudentIdNormalization([], ElementError);
            }

            if (seen.Add(trimmed))
            {
                cleaned.Add(trimmed);
            }
        }

        return new StudentIdNormalization(cleaned, null);
    }
}
