using System.Globalization;
using System.Text.Json;

namespace FormMaps.Application.CoursePlan;

/// <summary>
/// Parsing for the <c>gradeLevel</c> on a course-plan write (formmaps#122) — the grade a course is PLANNED FOR,
/// which is NOT the student's current grade. The .NET twin of Node's <c>api/src/lib/coursePlanGrade.ts</c>
/// (<c>parsePlannedGradeLevel</c>).
///
/// <para>WHY THIS IS SHARED. It landed in #124 as a private helper on
/// <c>SchoolStudentsCoursePlanWriteEndpoints</c>, which sits in FormMaps.Api — unreachable from
/// FormMaps.Infrastructure, where the student self-serve writer (<c>StudentCoursePlanRepository</c>, the .NET twin
/// of Node's routes/course-plan.ts) parses its own body. Copying it there would have produced exactly the drift
/// Node extracted this function to prevent: two halves of one feature disagreeing about what a valid grade is, with
/// the disagreement only surfacing at the flag flip. It lives in FormMaps.Application because that is the one
/// project both Api and Infrastructure reference; the behaviour below is #124's byte for byte, moved not rewritten.</para>
///
/// <para>WHY THE VALUE IS STORED AT ALL. Every row of a four-year plan carries the SAME academicYearId (the
/// school's current year), so nothing else in the row distinguishes "Grade 9 Fall" from "Grade 12 Fall". Dropping
/// it — which every writer did — makes the reader's <c>?? user.gradeLevel</c> fall back to the student's current
/// grade and silently re-bucket the course. The row is created, the request succeeds, and the only symptom is a
/// four-year plan collapsed into one row of the grid.</para>
/// </summary>
public static class PlannedGradeLevel
{
    /// <summary>Widest range any FormMaps school uses. K-8 schools exist in the data, so this is NOT 9-12.</summary>
    public const int Min = 1;

    /// <inheritdoc cref="Min"/>
    public const int Max = 12;

    public const string NotAWholeNumberMessage = "gradeLevel must be a whole number";

    public static string OutOfRangeMessage => $"gradeLevel must be between {Min} and {Max}";

    /// <summary>
    /// Reads <c>gradeLevel</c> off a request body. Returns (value, null) on success — where a null VALUE means the
    /// caller sent nothing, which is LEGAL and means "unknown", so older clients that never sent the field do not
    /// start 400ing — or (null, message) for a 400.
    ///
    /// <para>Accepts a JSON number or a numeric STRING, because the field crosses the wire from a &lt;select&gt; and
    /// which of the two arrives depends on the control. Nonsense that was actually SENT is refused loudly instead of
    /// being coerced into a plausible grade — silent coercion is what kept the original bug invisible.</para>
    /// </summary>
    public static (int? Value, string? Error) Resolve(JsonElement body)
    {
        // A non-object body (the student route accepts a top-level ARRAY, where TryGetProperty would throw) is
        // Node's `req.body?.gradeLevel` on an array: undefined, i.e. absent.
        if (body.ValueKind != JsonValueKind.Object
            || !body.TryGetProperty("gradeLevel", out var raw)
            || raw.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return (null, null);
        }

        double? numeric = raw.ValueKind switch
        {
            JsonValueKind.Number => raw.TryGetDouble(out var d) ? d : null,
            // "" is the empty-input case Node treats as absent, not as invalid.
            JsonValueKind.String => string.IsNullOrEmpty(raw.GetString())
                ? null
                : double.TryParse(raw.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var s)
                    ? s
                    : double.NaN,
            _ => double.NaN,
        };

        if (raw.ValueKind == JsonValueKind.String && string.IsNullOrEmpty(raw.GetString()))
        {
            return (null, null);
        }

        if (numeric is null || double.IsNaN(numeric.Value) || numeric.Value != Math.Floor(numeric.Value)
            || double.IsInfinity(numeric.Value))
        {
            return (null, NotAWholeNumberMessage);
        }

        var value = (int)numeric.Value;
        if (value < Min || value > Max)
        {
            return (null, OutOfRangeMessage);
        }

        return (value, null);
    }
}
