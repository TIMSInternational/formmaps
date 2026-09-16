using System.Text;
using System.Text.RegularExpressions;

namespace FormMaps.Application.Informe;

// Engine and AI prose arrives in an analyst's register: hard-wrapped at some source width, with the
// engine's enums shouted in capitals ("Puerta competencial SATISFECHA", "Convergencia DIVERGENTE",
// "ALCANCE. Se midieron…", "FALTA: un PCA"). None of that may reach a student as written. These are
// the renderer-independent passes the legacy informe applied (layout.ts prose/humanize/
// engineParagraphs, resumen.ts teaser, carreras.ts splitBridging), ported verbatim so the .NET
// document reads exactly as the TypeScript one did. Pure functions; no IO.

/// <summary>A paragraph of engine prose, with its shouted lead-in lifted out as a heading when it had one.</summary>
public sealed record EngineParagraph(string? Heading, string Body);

/// <summary>A bridging suggestion shared verbatim by <see cref="Count"/> gated careers.</summary>
public sealed record SharedSuggestion(string Text, int Count);

/// <summary>Which suggestions print once for the section, and per career whether its own inline box still draws.</summary>
public sealed record BridgingSplit(IReadOnlyList<SharedSuggestion> Shared, IReadOnlyList<bool> Inline);

/// <summary>Text passes over engine prose.</summary>
public static partial class EngineProse
{
    /// <summary>Capitals the engine writes legitimately. Everything else shouted is its log register.</summary>
    private static readonly HashSet<string> Acronyms = new(StringComparer.Ordinal)
    {
        "DISC", "PCA", "MIL", "LIA", "STEM", "TIMS", "FORMMAPS", "CAREERFIT",
        "SAT", "ACT", "GPA", "TOEFL", "IELTS", "IB", "AP", "ISO",
    };

    [GeneratedRegex(@"\r\n?")]
    private static partial Regex Newlines();

    [GeneratedRegex(@"\n[ \t]*\n+")]
    private static partial Regex ParagraphBreak();

    [GeneratedRegex(@"\n[ \t]*")]
    private static partial Regex SoftWrap();

    [GeneratedRegex(@"[ \t]{2,}")]
    private static partial Regex SpaceRuns();

    /// <summary>A run of capitalised words — "SÍ ESTÁ MEDIDO Y ES SÓLIDO", "DISC, MIL" — bounded by non-letters.</summary>
    [GeneratedRegex(@"(?<![\p{L}\d])[\p{Lu}][\p{Lu}'’]*(?:,? [\p{Lu}][\p{Lu}'’]*)*(?![\p{L}\d])")]
    private static partial Regex CapsRun();

    /// <summary>"ALCANCE. …", "SÍ ESTÁ MEDIDO Y ES SÓLIDO. …" — a shouted lead-in closed by a period.</summary>
    [GeneratedRegex(@"^([\p{Lu}][\p{Lu}'’]*(?:,? [\p{Lu}][\p{Lu}'’]*)*)\.(?:\s+|$)(.*)$", RegexOptions.Singleline)]
    private static partial Regex LeadIn();

    [GeneratedRegex(@"^(.{20,}?[.!?])(\s|$)", RegexOptions.Singleline)]
    private static partial Regex FirstSentence();

    [GeneratedRegex(@"\s+\S*$")]
    private static partial Regex TrailingPartialWord();

    [GeneratedRegex(@"\n\s*$")]
    private static partial Regex EndsWithNewline();

    [GeneratedRegex(@"(,? )")]
    private static partial Regex WordSeparators();

    [GeneratedRegex(@",? ")]
    private static partial Regex WordSplit();

    /// <summary>
    /// Normalises prose that arrives with hard line breaks: a blank line is a real paragraph break and is
    /// preserved as "\n\n"; a single newline is a soft wrap from somewhere else and becomes a space.
    /// </summary>
    public static string Prose(string? text)
    {
        var normalised = Newlines().Replace(text ?? string.Empty, "\n");
        var paragraphs = ParagraphBreak().Split(normalised)
            .Select(p => SpaceRuns().Replace(SoftWrap().Replace(p, " "), " ").Trim())
            .Where(p => p.Length > 0);
        return string.Join("\n\n", paragraphs);
    }

    /// <summary>
    /// Lowers the engine's enum vocabulary to sentence register. A shouted run becomes lower case
    /// (acronyms inside it are kept) and takes a capital only when it opens a sentence. Ordinary prose
    /// passes through untouched: "Se midieron DISC, MIL y 13 de las 24 competencias." is unchanged.
    /// </summary>
    public static string Humanize(string? text)
    {
        var src = text ?? string.Empty;
        return CapsRun().Replace(src, m =>
        {
            var run = m.Value;
            if (!IsShouted(run))
            {
                return run;
            }

            var sb = new StringBuilder(run.Length);
            foreach (var part in WordSeparators().Split(run))
            {
                sb.Append(IsSeparator(part) || Acronyms.Contains(part) ? part : part.ToLowerInvariant());
            }

            var lowered = sb.ToString();
            var before = src[..m.Index];
            var trimmed = before.TrimEnd();
            var sentenceStart = trimmed.Length == 0
                || trimmed[^1] is '.' or '!' or '?'
                || EndsWithNewline().IsMatch(before);
            return sentenceStart && lowered.Length > 0
                ? char.ToUpperInvariant(lowered[0]) + lowered[1..]
                : lowered;
        });
    }

    /// <summary>
    /// Splits engine prose into paragraphs and lifts each one's shouted lead-in out as a run-in heading
    /// in sentence case. A paragraph without a lead-in comes back as plain body; empty paragraphs are dropped.
    /// </summary>
    public static IReadOnlyList<EngineParagraph> EngineParagraphs(string? text)
    {
        var prose = Prose(text);
        if (prose.Length == 0)
        {
            return [];
        }

        var result = new List<EngineParagraph>();
        foreach (var para in prose.Split("\n\n"))
        {
            var m = LeadIn().Match(para);
            var paragraph = m.Success && IsShouted(m.Groups[1].Value)
                ? new EngineParagraph(Humanize(m.Groups[1].Value), Humanize(m.Groups[2].Value.Trim()))
                : new EngineParagraph(null, Humanize(para));
            if ((paragraph.Heading?.Length ?? 0) > 0 || paragraph.Body.Length > 0)
            {
                result.Add(paragraph);
            }
        }

        return result;
    }

    /// <summary>
    /// The first sentence of an insight, as a spotlight teaser — hard-capped at <paramref name="max"/>
    /// characters and cut at a word boundary, never mid-word, with an ellipsis when cut.
    /// </summary>
    public static string Teaser(string? text, int max = 120)
    {
        var t = Prose(Humanize(text));
        var m = FirstSentence().Match(t);
        var first = m.Success ? m.Groups[1].Value : t;
        if (first.Length <= max)
        {
            return first;
        }

        return TrailingPartialWord().Replace(first[..max], string.Empty) + "…";
    }

    /// <summary>
    /// A bridging suggestion shared verbatim by two or more gated careers prints once for the section,
    /// not once per card. Returns the shared strings (first-appearance order, with how many careers
    /// each covers) and, per career, whether its own inline box still draws.
    /// </summary>
    public static BridgingSplit SplitBridging(IEnumerable<(bool NeedsBridging, string BridgingPaths)> items)
    {
        var norm = items
            .Select(i => i.NeedsBridging ? Prose(Humanize(i.BridgingPaths)) : string.Empty)
            .ToList();
        var counts = norm
            .Where(s => s.Length > 0)
            .GroupBy(s => s, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.Count(), StringComparer.Ordinal);

        var shared = new List<SharedSuggestion>();
        foreach (var s in norm)
        {
            if (s.Length > 0 && counts[s] >= 2 && !shared.Any(x => string.Equals(x.Text, s, StringComparison.Ordinal)))
            {
                shared.Add(new SharedSuggestion(s, counts[s]));
            }
        }

        var inline = norm.Select(s => s.Length > 0 && counts[s] < 2).ToList();
        return new BridgingSplit(shared, inline);
    }

    /// <summary>A run is shouted prose, not a list of acronyms, when any long word in it is not an acronym.</summary>
    private static bool IsShouted(string run) =>
        WordSplit().Split(run).Any(w => w.Length >= 4 && !Acronyms.Contains(w));

    private static bool IsSeparator(string part) => part.Length == 0 || part == " " || part == ", ";
}
