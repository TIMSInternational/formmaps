using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace FormMaps.Application.Assessments;

/// <summary>
/// JS-parity numeric + serialization helpers for the assessment profile. The legacy assembler runs on
/// Node, so two behaviours must be reproduced BYTE-for-BYTE: <c>Number.prototype.toFixed(2)</c> rounding
/// and <c>JSON.stringify</c> of the fingerprint payload. Getting these wrong silently diverges category
/// averages / GPA and (worse) the <c>fingerprint</c> that downstream consumers use to bust caches.
/// </summary>
public static class JsNumber
{
    /// <summary>
    /// Faithful port of ECMAScript <c>Number.prototype.toFixed(2)</c> for a non-negative value
    /// (all call sites — GPA and 360 category averages — are ≥ 0). toFixed rounds the EXACT IEEE-754
    /// value with ties toward +∞, so e.g. <c>(3.775).toFixed(2) === "3.77"</c> (the double is 3.77499…)
    /// and <c>(1.005).toFixed(2) === "1.00"</c>. We must round the exact value: <c>(decimal)d</c> would
    /// first collapse to 15 significant digits (turning 3.77499… into 3.775 → 3.78, WRONG), so we round
    /// the 17-significant-digit round-trip string instead, which preserves the tie direction.
    /// </summary>
    public static double ToFixed2(double value)
    {
        // "G17" is the shortest string that round-trips to the same double while exposing enough of the
        // exact value to resolve 2-decimal rounding. For the profile's domain (0 ≤ v ≲ 2000) it is always
        // plain (never exponential), so decimal.Parse is exact.
        var exact = decimal.Parse(
            value.ToString("G17", CultureInfo.InvariantCulture),
            NumberStyles.Float,
            CultureInfo.InvariantCulture);
        return (double)Math.Round(exact, 2, MidpointRounding.AwayFromZero);
    }

    /// <summary>
    /// Formats a double exactly as JS <c>JSON.stringify</c> would: shortest round-trip, integral values
    /// with no decimal point ("4" not "4.0"), no exponent for the profile's magnitudes. .NET Core's
    /// default double formatting is shortest-round-trippable, matching V8 for all finite values here.
    /// </summary>
    public static string ToJsonNumber(double value)
    {
        // JSON.stringify(-0) === "0"; normalise so a stray negative zero can't perturb the fingerprint.
        if (value == 0.0)
        {
            return "0";
        }

        return value.ToString(CultureInfo.InvariantCulture);
    }
}

/// <summary>
/// Deterministic 32-hex fingerprint over the salient assessment inputs — consumers recompute / bust
/// caches when it changes (any LIA, PCA, or 360 change). Faithful port of
/// <c>sha256(JSON.stringify({ mil, disc, comp, cats })).slice(0, 32)</c>: the JSON is emitted with the
/// same key order, number formatting, and (crucially) UTF-8 non-ASCII passthrough as Node's
/// JSON.stringify, then hashed over the UTF-8 bytes.
/// </summary>
public static class ProfileFingerprint
{
    public static string Compute(
        IReadOnlyList<KeyValuePair<string, int>> mil,
        DiscMatrix? disc,
        IReadOnlyList<CompetenceEntry>? competences,
        IReadOnlyList<KeyValuePair<string, double>> categories)
    {
        var json = new StringBuilder();
        json.Append("{\"mil\":");
        AppendIntObject(json, mil);
        json.Append(",\"disc\":");
        AppendDisc(json, disc);
        json.Append(",\"comp\":");
        AppendCompetences(json, competences);
        json.Append(",\"cats\":");
        AppendNumberObject(json, categories);
        json.Append('}');

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(json.ToString()));
        var hex = Convert.ToHexStringLower(hash);
        return hex[..32];
    }

    private static void AppendIntObject(StringBuilder sb, IReadOnlyList<KeyValuePair<string, int>> entries)
    {
        sb.Append('{');
        for (var i = 0; i < entries.Count; i++)
        {
            if (i > 0)
            {
                sb.Append(',');
            }

            AppendString(sb, entries[i].Key);
            sb.Append(':');
            sb.Append(entries[i].Value.ToString(CultureInfo.InvariantCulture));
        }

        sb.Append('}');
    }

    private static void AppendNumberObject(StringBuilder sb, IReadOnlyList<KeyValuePair<string, double>> entries)
    {
        sb.Append('{');
        for (var i = 0; i < entries.Count; i++)
        {
            if (i > 0)
            {
                sb.Append(',');
            }

            AppendString(sb, entries[i].Key);
            sb.Append(':');
            sb.Append(JsNumber.ToJsonNumber(entries[i].Value));
        }

        sb.Append('}');
    }

    private static void AppendDisc(StringBuilder sb, DiscMatrix? disc)
    {
        if (disc is null)
        {
            sb.Append("null");
            return;
        }

        sb.Append("{\"workAdaptation\":");
        AppendGraph(sb, disc.WorkAdaptation);
        sb.Append(",\"underPressure\":");
        AppendGraph(sb, disc.UnderPressure);
        sb.Append(",\"selfImage\":");
        AppendGraph(sb, disc.SelfImage);
        sb.Append(",\"primary\":");
        AppendGraph(sb, disc.Primary);
        sb.Append('}');
    }

    private static void AppendGraph(StringBuilder sb, DiscGraph g)
    {
        sb.Append("{\"d\":").Append(JsNumber.ToJsonNumber(g.D));
        sb.Append(",\"i\":").Append(JsNumber.ToJsonNumber(g.I));
        sb.Append(",\"s\":").Append(JsNumber.ToJsonNumber(g.S));
        sb.Append(",\"c\":").Append(JsNumber.ToJsonNumber(g.C));
        sb.Append('}');
    }

    private static void AppendCompetences(StringBuilder sb, IReadOnlyList<CompetenceEntry>? competences)
    {
        if (competences is null)
        {
            sb.Append("null");
            return;
        }

        sb.Append('[');
        for (var i = 0; i < competences.Count; i++)
        {
            if (i > 0)
            {
                sb.Append(',');
            }

            sb.Append("{\"name\":");
            AppendString(sb, competences[i].Name);
            sb.Append(",\"level\":");
            sb.Append(competences[i].Level.ToString(CultureInfo.InvariantCulture));
            sb.Append('}');
        }

        sb.Append(']');
    }

    // JS JSON.stringify string escaping: escape " \ and control chars (<0x20); everything else —
    // including non-ASCII (e.g. the Ó in COMUNICACIÓN) — passes through literally and is hashed as UTF-8.
    private static void AppendString(StringBuilder sb, string value)
    {
        sb.Append('"');
        foreach (var ch in value)
        {
            switch (ch)
            {
                case '"':
                    sb.Append("\\\"");
                    break;
                case '\\':
                    sb.Append("\\\\");
                    break;
                case '\b':
                    sb.Append("\\b");
                    break;
                case '\f':
                    sb.Append("\\f");
                    break;
                case '\n':
                    sb.Append("\\n");
                    break;
                case '\r':
                    sb.Append("\\r");
                    break;
                case '\t':
                    sb.Append("\\t");
                    break;
                default:
                    if (ch < ' ')
                    {
                        sb.Append("\\u").Append(((int)ch).ToString("x4", CultureInfo.InvariantCulture));
                    }
                    else
                    {
                        sb.Append(ch);
                    }

                    break;
            }
        }

        sb.Append('"');
    }
}
