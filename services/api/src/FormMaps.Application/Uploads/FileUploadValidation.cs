using System.Text.RegularExpressions;

namespace FormMaps.Application.Uploads;

/// <summary>
/// Pure upload helpers ported from the live TS: <c>lib/fileValidation.ts</c> (validateMagicBytes) and
/// <c>lib/sanitize.ts</c> (sanitizeFilename), plus the CSV parsing that routes/upload.ts does inline for the
/// course/grade imports. No I/O — deterministic + unit-tested.
/// </summary>
public static partial class FileUploadValidation
{
    /// <summary>
    /// Port of <c>validateMagicBytes</c>: the buffer's leading bytes must match the DECLARED mimetype (blocks a
    /// renamed executable riding in as an image/doc). &lt;4 bytes → false. Text formats (svg/csv/plain) always pass.
    /// </summary>
    public static bool ValidateMagicBytes(byte[] buffer, string mimetype)
    {
        if (buffer.Length < 4)
        {
            return false;
        }

        var hex = Convert.ToHexStringLower(buffer.AsSpan(0, 4));

        if (mimetype.StartsWith("image/png", StringComparison.Ordinal) && hex.StartsWith("89504e47", StringComparison.Ordinal)) return true;
        if (mimetype.StartsWith("image/jpeg", StringComparison.Ordinal) && hex.StartsWith("ffd8ff", StringComparison.Ordinal)) return true;
        if (mimetype.StartsWith("image/webp", StringComparison.Ordinal) && Ascii(buffer, 0, 4) == "RIFF") return true;
        if (mimetype.StartsWith("image/gif", StringComparison.Ordinal) && Ascii(buffer, 0, 3) == "GIF") return true;
        if (mimetype == "application/pdf" && Ascii(buffer, 0, 4) == "%PDF") return true;
        if (mimetype.StartsWith("image/svg", StringComparison.Ordinal) || mimetype == "text/csv" || mimetype == "text/plain") return true;
        if (mimetype.Contains("officedocument", StringComparison.Ordinal) && hex.StartsWith("504b0304", StringComparison.Ordinal)) return true;
        if (mimetype == "application/msword" && hex.StartsWith("d0cf11e0", StringComparison.Ordinal)) return true;

        return false;
    }

    /// <summary>
    /// Port of <c>sanitizeFilename</c>: strip any leading path, replace every char outside <c>[A-Za-z0-9_.-]</c>
    /// (JS ECMAScript <c>\w</c> = ASCII word chars, plus dot/hyphen) with "_", then cap at 255 chars.
    /// </summary>
    public static string SanitizeFilename(string filename)
    {
        var noPath = StripPath().Replace(filename, "");
        var cleaned = NonWordChars().Replace(noPath, "_");
        return cleaned.Length > 255 ? cleaned[..255] : cleaned;
    }

    /// <summary>
    /// The routes/upload.ts CSV parse: split on "\n", drop blank-after-trim lines; line[0] = headers, the rest =
    /// rows keyed by the LOWERCASED header (a short row omits the missing trailing keys — Node's <c>values[i]</c>
    /// undefined ⇒ the JSON key is dropped; duplicate lowercased headers ⇒ last value wins). Each cell is trimmed
    /// and stripped of one leading + one trailing double-quote. The caller enforces empty / max-rows.
    /// </summary>
    public static CsvParse ParseCsv(string content)
    {
        var lines = content.Split('\n').Where(l => l.Trim().Length > 0).ToList();
        if (lines.Count == 0)
        {
            return new CsvParse([], []);
        }

        var headers = lines[0].Split(',').Select(DequoteTrim).ToArray();
        var rows = new List<IReadOnlyDictionary<string, string>>(lines.Count - 1);
        for (var li = 1; li < lines.Count; li++)
        {
            var values = lines[li].Split(',');

            // Node assigns UNCONDITIONALLY per header (row[h.toLowerCase()] = values[i]); undefined (short row) is a
            // real assignment that JSON.stringify later drops. A null sentinel replays that: last write wins (dup
            // lowercased headers), and if the WINNING write is out-of-range → null → the key is dropped — including
            // the dup-header-with-short-row intersection (Name,name over a 1-value row ⇒ {} in Node).
            var raw = new Dictionary<string, string?>(headers.Length, StringComparer.Ordinal);
            for (var i = 0; i < headers.Length; i++)
            {
                raw[headers[i].ToLowerInvariant()] = i < values.Length ? DequoteTrim(values[i]) : null;
            }

            var row = new Dictionary<string, string>(raw.Count, StringComparer.Ordinal);
            foreach (var (key, value) in raw)
            {
                if (value is not null)
                {
                    row[key] = value;
                }
            }

            rows.Add(row);
        }

        return new CsvParse(headers, rows);
    }

    // JS `.trim().replace(/^"|"$/g, "")`: trim, then remove at most one leading and one trailing double-quote.
    private static string DequoteTrim(string value)
    {
        var v = value.Trim();
        if (v.StartsWith('"'))
        {
            v = v[1..];
        }

        if (v.EndsWith('"'))
        {
            v = v[..^1];
        }

        return v;
    }

    // Node buffer.subarray(a,b).toString("ascii"): each byte masked to 7 bits (& 0x7f). Guards short buffers.
    private static string Ascii(byte[] buffer, int start, int length)
    {
        if (buffer.Length < start + length)
        {
            return "";
        }

        var chars = new char[length];
        for (var i = 0; i < length; i++)
        {
            chars[i] = (char)(buffer[start + i] & 0x7f);
        }

        return new string(chars);
    }

    [GeneratedRegex(@"^.*[\\/]")]
    private static partial Regex StripPath();

    [GeneratedRegex(@"[^A-Za-z0-9_.\-]")]
    private static partial Regex NonWordChars();
}

/// <summary>Parsed CSV: the original-case (trimmed, dequoted) header row + rows keyed by lowercased header.</summary>
public sealed record CsvParse(IReadOnlyList<string> Headers, IReadOnlyList<IReadOnlyDictionary<string, string>> Rows);
