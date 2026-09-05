namespace FormMaps.Infrastructure.Data;

/// <summary>
/// Reproduces how an UNCOERCED Prisma <c>Decimal</c> reaches the wire (issue #55).
///
/// Postgres renders a DECIMAL(65,30) column with all thirty fractional digits
/// ("4.000000000000000000000000000000"). Prisma hands that text to decimal.js, whose <c>toString()</c> strips
/// trailing zeros, and because <c>JSON.stringify</c> calls <c>toJSON()</c> on the Decimal, THAT string is what
/// the client receives — a JSON string, not a number.
///
/// Most FormMaps routes coerce these with <c>Number(...)</c> before responding (see
/// <c>transcriptService.serializeStudentGpa</c>). Several deliberately do not, and those are the callers of this
/// helper: <c>gpa_configurations.scale</c> and every Decimal on the graduation rule-set tree. Normalizing the
/// TEXT rather than round-tripping through a double keeps full precision and cannot introduce an exponent form
/// that decimal.js would not have produced for these magnitudes.
/// </summary>
public static class PrismaDecimalText
{
    public static string Normalize(string raw)
    {
        var value = raw.Trim();

        if (value.Contains('.', StringComparison.Ordinal) && !value.Contains('e', StringComparison.OrdinalIgnoreCase))
        {
            value = value.TrimEnd('0').TrimEnd('.');
        }

        // "0.000" -> "0" is already covered above; the remaining guards only fire on input Postgres never emits.
        return value.Length == 0 || value == "-" ? "0" : value;
    }
}
