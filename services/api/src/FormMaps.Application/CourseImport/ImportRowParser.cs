using System.Text.Json;

namespace FormMaps.Application.CourseImport;

/// <summary>
/// Pure parse of one JSON import row into an <see cref="ImportRow"/> (FM-DOTNET-059 gate fold). Captures JS truthiness
/// by presence and reproduces legacy's per-field type behavior for the (out-of-contract) case where a scalar arrives as
/// a non-string JSON value — the frontend sends "parsed CSV data" (all strings), but a typed-JSON client must behave
/// like legacy:
/// <list type="bullet">
/// <item>string fields (code/name/department/description): a JSON string is taken verbatim; absent/JSON-null → null; a
/// present NON-string (number/bool/object/array) is a Prisma <c>String</c> type error → the row must FAIL
/// (<see cref="ImportRow.RowTypeInvalid"/>). (code/name additionally fail the truthiness check when null — same
/// outcome.)</item>
/// <item>credits: legacy does <c>row.credits ? parseFloat(row.credits) : …</c> — a JSON NUMBER is JS-coerced to its
/// string then parseFloat'd, so a truthy number is accepted (its text is carried); a JSON number 0 / "" / null / absent
/// is JS-falsy → null (skip). A non-string/non-number credits (bool/object/array) → RowTypeInvalid.</item>
/// <item>gradeLevels: a present array is kept (empty [] is JS-truthy); but a present array with ANY non-int32 element
/// (fractional, string, out-of-range) is a Prisma <c>Int[]</c> type error → RowTypeInvalid (legacy fails the row rather
/// than silently dropping the element).</item>
/// </list>
/// <see cref="ImportRow.RawJson"/> preserves the ORIGINAL row object verbatim (the error rawRow jsonb).
/// </summary>
public static class ImportRowParser
{
    public static ImportRow Parse(JsonElement element)
    {
        var typeInvalid = false;

        var (department, deptBad) = ScalarString(element, "department");
        var (description, descBad) = ScalarString(element, "description");
        typeInvalid |= deptBad || descBad;

        var (credits, creditsBad) = Credits(element);
        typeInvalid |= creditsBad;

        var (gradeLevels, gradesBad) = GradeLevels(element);
        typeInvalid |= gradesBad;

        // code/name: a present non-string is a type error too, but code/name null ALSO fails the required-check (same
        // outcome — row fails), so we do NOT mark those RowTypeInvalid (a null here routes to "code and name are
        // required", matching legacy's outcome; only the message text differs on the unreachable numeric-code path).
        var (code, _) = ScalarString(element, "code");
        var (name, _) = ScalarString(element, "name");

        return new ImportRow(code, name, department, credits, gradeLevels, description, typeInvalid, element.GetRawText());
    }

    // Returns (value, badType). A JSON string → (string, false); absent/JSON-null → (null, false); a present NON-string
    // → (null, true) so the caller marks the row type-invalid.
    private static (string? Value, bool BadType) ScalarString(JsonElement row, string property)
    {
        if (row.ValueKind != JsonValueKind.Object || !row.TryGetProperty(property, out var value))
        {
            return (null, false); // absent
        }

        return value.ValueKind switch
        {
            JsonValueKind.String => (value.GetString(), false),
            JsonValueKind.Null => (null, false),
            _ => (null, true), // present non-string → Prisma String reject → row fails
        };
    }

    // credits: JS `row.credits ? parseFloat(row.credits) : …`. A JSON string → itself; a truthy JSON number → its text
    // (parseFloat coerces a JS number to string); a JSON number 0 / empty string / null / absent → null (JS-falsy,
    // skip). A non-string/non-number present value → (null, badType) so the row fails.
    private static (string? Value, bool BadType) Credits(JsonElement row)
    {
        if (row.ValueKind != JsonValueKind.Object || !row.TryGetProperty("credits", out var value))
        {
            return (null, false);
        }

        switch (value.ValueKind)
        {
            case JsonValueKind.String:
                var s = value.GetString();
                return (string.IsNullOrEmpty(s) ? null : s, false); // "" is JS-falsy → skip
            case JsonValueKind.Number:
                // JS number truthiness: 0 (and -0) is falsy → skip; else carry the number's literal text for parseFloat.
                return value.GetDouble() == 0 ? (null, false) : (value.GetRawText(), false);
            case JsonValueKind.Null:
                return (null, false);
            default:
                return (null, true); // bool/object/array credits → Prisma Decimal reject → row fails
        }
    }

    // gradeLevels: present array kept (empty [] JS-truthy); absent/JSON-null/non-array → null (JS-falsy). A present
    // array with any element that is not a JSON int32 → badType (Prisma Int[] reject → row fails), NOT silently dropped.
    private static (IReadOnlyList<int>? Value, bool BadType) GradeLevels(JsonElement row)
    {
        if (row.ValueKind != JsonValueKind.Object
            || !row.TryGetProperty("gradeLevels", out var value)
            || value.ValueKind != JsonValueKind.Array)
        {
            return (null, false);
        }

        var list = new List<int>(value.GetArrayLength());
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.Number && item.TryGetInt32(out var n))
            {
                list.Add(n);
            }
            else
            {
                return (null, true); // fractional/string/out-of-range element → Prisma Int[] reject → row fails
            }
        }

        return (list, false); // a present array (incl empty) is JS-truthy → kept
    }
}
