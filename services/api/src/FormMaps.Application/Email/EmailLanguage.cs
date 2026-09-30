namespace FormMaps.Application.Email;

/// <summary>
/// EMAIL LANGUAGE — the one rule every transactional email in this backend follows. Mirror of the legacy
/// lib/emailLanguage.ts; keep the two in step.
/// <list type="number">
/// <item>The caller already has an explicit language → use it.</item>
/// <item>The recipient has an account → THEIR saved <c>user_settings.language</c>
/// ("es" / "spanish" / "es-CO" → es; "en…" / "english" → en).</item>
/// <item>The recipient has no account yet (an invitation) → the INVITING user's saved language. For 360°
/// evaluator invites that is the evaluated STUDENT's; for school / admin / staff / parent invites, whoever sent
/// the invitation.</item>
/// <item>Nothing saved, unreadable, or unrecognised → Spanish (<see cref="Default"/>). FormMaps' audience is
/// Colombian.</item>
/// </list>
/// A language lookup never blocks or fails the email it decorates: <see cref="IEmailLanguageResolver"/>
/// swallows read errors and falls back to rule 4.
/// </summary>
public static class EmailLanguage
{
    public const string Spanish = "es";
    public const string English = "en";

    /// <summary>Rule 4.</summary>
    public const string Default = Spanish;

    /// <summary>"es"/"sp"/"spanish"/"es-CO"/"español" → es; "en…"/"english" → en; anything else → null.</summary>
    public static string? Normalize(string? raw)
    {
        if (raw is null)
        {
            return null;
        }

        var v = raw.Trim().ToLowerInvariant();
        if (v == "sp" || v == "spanish" || v.StartsWith("es", StringComparison.Ordinal))
        {
            return Spanish;
        }

        return v.StartsWith("en", StringComparison.Ordinal) ? English : null;
    }

    /// <summary>Normalise, falling back to <see cref="Default"/>.</summary>
    public static string OrDefault(string? raw) => Normalize(raw) ?? Default;

    /// <summary>
    /// The 360° evaluator link, carrying the language its invitation was written in (<c>lang=es|en</c>) so the
    /// evaluator page opens in it. Mirrors legacy evaluatorInviteUrl().
    /// </summary>
    public static string EvaluatorInviteUrl(string baseUrl, string token, string language) =>
        $"{baseUrl}/evaluation/evaluator?token={token}&lang={OrDefault(language)}";
}

/// <summary>Reads saved languages for <see cref="EmailLanguage"/>'s rules 2–4. Never throws.</summary>
public interface IEmailLanguageResolver
{
    /// <summary>The user's saved language, or <see cref="EmailLanguage.Default"/> (null id, no row, bad value, read error).</summary>
    Task<string> ForUserAsync(string? userId, CancellationToken cancellationToken = default);

    /// <summary>Batch form for fan-out senders; every requested id is present in the result.</summary>
    Task<IReadOnlyDictionary<string, string>> ForUsersAsync(
        IReadOnlyCollection<string> userIds, CancellationToken cancellationToken = default);
}
