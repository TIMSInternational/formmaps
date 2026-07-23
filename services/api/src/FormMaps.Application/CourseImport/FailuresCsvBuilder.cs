using System.Globalization;
using System.Text;
using System.Text.Json;

namespace FormMaps.Application.CourseImport;

/// <summary>
/// Pure builder for the import-failures CSV (FM-DOTNET-060 — schoolCoursesService.ts getImportFailuresCsv). The load-
/// bearing parity is <see cref="JsStringify"/> — a faithful reproduction of JS <c>JSON.stringify(rawRow)</c> for the
/// stored jsonb rawRow (arbitrary CSV columns), since a Postgres <c>jsonb::text</c> passthrough would emit <c>": "</c>/
/// <c>", "</c> spacing that diverges from Node's <c>res.send</c> of the stringified object. Both Node (Prisma) and this
/// port read the SAME normalised jsonb, so object key order is Postgres's and identical on both sides.
/// </summary>
public static class FailuresCsvBuilder
{
    /// <summary>csvSafe (lib/sanitize.ts): prefix a leading <c>'</c> when the value starts with any of = + - @ TAB CR so
    /// a spreadsheet cannot evaluate it as a formula. null → "".</summary>
    public static string CsvSafe(string? value)
    {
        var v = value ?? string.Empty;
        return v.Length > 0 && v[0] is '=' or '+' or '-' or '@' or '\t' or '\r' ? "'" + v : v;
    }

    /// <summary>One CSV data line: <c>{rowNumber},"{csvSafe(errors join "; ")·"→""}","{csvSafe(JSON.stringify(rawRow))·"→""}"</c>.
    /// The <c>.replace(/"/g,'""')</c> doubling is applied AFTER csvSafe, matching legacy.</summary>
    public static string DataLine(int rowNumber, IReadOnlyList<string> errorMessages, JsonElement rawRow)
    {
        var errMsg = CsvSafe(string.Join("; ", errorMessages)).Replace("\"", "\"\"");
        var raw = CsvSafe(JsStringify(rawRow)).Replace("\"", "\"\"");
        return $"{rowNumber.ToString(CultureInfo.InvariantCulture)},\"{errMsg}\",\"{raw}\"";
    }

    public const string Header = "row_number,errors,raw_data";

    /// <summary>
    /// Faithful port of JS <c>JSON.stringify(value)</c> (no replacer/space) over a parsed jsonb element: compact (no
    /// whitespace), object keys in element order (= Postgres jsonb normalised order), JS string escaping (only " \ and
    /// control chars — with \b \f \n \r \t short forms — are escaped; &lt; &gt; &amp; + and non-ASCII stay literal),
    /// numbers via the shortest round-trip form. (Numbers never appear in a CSV-sourced rawRow — all cells are strings —
    /// so the number branch is a documented-but-unreachable path; exotic magnitudes ≥1e21 may render in a different
    /// exponential form than V8.)
    /// </summary>
    public static string JsStringify(JsonElement element)
    {
        var sb = new StringBuilder();
        Write(sb, element);
        return sb.ToString();
    }

    private static void Write(StringBuilder sb, JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                sb.Append('{');
                var firstProp = true;
                foreach (var prop in element.EnumerateObject())
                {
                    if (!firstProp)
                    {
                        sb.Append(',');
                    }

                    firstProp = false;
                    WriteString(sb, prop.Name);
                    sb.Append(':');
                    Write(sb, prop.Value);
                }

                sb.Append('}');
                break;

            case JsonValueKind.Array:
                sb.Append('[');
                var firstItem = true;
                foreach (var item in element.EnumerateArray())
                {
                    if (!firstItem)
                    {
                        sb.Append(',');
                    }

                    firstItem = false;
                    Write(sb, item);
                }

                sb.Append(']');
                break;

            case JsonValueKind.String:
                WriteString(sb, element.GetString()!);
                break;

            case JsonValueKind.Number:
                // JS reparses the jsonb number to a double and emits the shortest round-trip form (3.50 → "3.5").
                sb.Append(element.GetDouble().ToString("R", CultureInfo.InvariantCulture));
                break;

            case JsonValueKind.True:
                sb.Append("true");
                break;

            case JsonValueKind.False:
                sb.Append("false");
                break;

            default: // Null (jsonb 'null')
                sb.Append("null");
                break;
        }
    }

    // JS JSON string escaping: escape " and \, use \b \f \n \r \t for those controls, \u00XX for any other control
    // (< 0x20); everything else (incl. <>&+ and non-ASCII) is emitted literally.
    private static void WriteString(StringBuilder sb, string value)
    {
        sb.Append('"');
        foreach (var c in value)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\b': sb.Append("\\b"); break;
                case '\f': sb.Append("\\f"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < ' ')
                    {
                        sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                    }
                    else
                    {
                        sb.Append(c);
                    }

                    break;
            }
        }

        sb.Append('"');
    }
}
