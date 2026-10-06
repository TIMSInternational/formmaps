using System.Text.RegularExpressions;

namespace FormMaps.Application.Auth;

/// <summary>Path class of a request under the student paywall (legacy <c>PaywallClass</c>).</summary>
public enum PaywallClass
{
    /// <summary>Sign in, status, pay — everyone.</summary>
    Open,

    /// <summary>Full results, reports, downloads — paid results only.</summary>
    Results,

    /// <summary>Start / answer / complete every assessment — every signed-up student (D4).</summary>
    Taking,

    /// <summary>Everything else — the full_platform entitlement (any subscription incl. trial).</summary>
    Platform,
}

/// <summary>A 402 the paywall answers with, or null for "allow".</summary>
public sealed record PaywallDenial(string Code, string Message);

/// <summary>
/// Pure port of legacy <c>api/src/middleware/studentPaywall.ts</c>'s path classes and decision
/// (tafurfede/formmaps-platform#440), so .NET-served routes classify exactly like Node. Deny-by-default:
/// any path that is not listed is <see cref="PaywallClass.Platform"/>.
///
/// .NET-only additions (routes Node does not have, all documented inline): <c>/version</c>, the root
/// redirect, <c>/api/v1/billing</c> (the .NET billing surface — Node's is <c>/api/stripe</c>, already open),
/// <c>/api/v1/context</c> (identity echo), <c>/api/v1/migration</c> (static roadmap), and CareerFit's
/// results/run reads under Results.
/// </summary>
public static class StudentPaywallPolicy
{
    public const string PaymentRequiredCode = "PAYMENT_REQUIRED";
    public const string PaymentRequiredMessage = "Complete your purchase to access FormMaps";
    public const string FullPlatformRequiredCode = "FULL_PLATFORM_REQUIRED";
    public const string FullPlatformRequiredMessage = "This feature is part of a FormMaps subscription";

    private static readonly string[] OpenPrefixes =
    [
        // ── legacy OPEN_PREFIXES, verbatim ──
        "/health",
        "/authapi",                         // login, refresh, logout, profile, signup, password
        "/api/stripe",                      // checkout session, session status, billing portal, webhook
        "/api/subscriptionplan",            // product catalog
        "/api/v1/user/me",                  // identity + permissions
        "/api/v1/user/subscription/status", // access state, polled after checkout
        "/api/v1/user/settings",            // language preference
        "/api/v1/user/transactions",        // receipts for what they already paid
        "/api/v1/user/notifications",       // bell in the shell
        "/api/v1/telemetry",                // page-view events, no data returned
        "/api/v1/entitlement",              // results preview (served by Node; listed for parity)
        // ── .NET-only ──
        "/version",                         // build/runtime echo, no data
        "/api/v1/billing",                  // status, checkout-session, cancel, portal, webhook — how they pay
        "/api/v1/context",                  // request-context echo of the caller's own token
        "/api/v1/migration",                // static migration roadmap
    ];

    private static readonly Regex[] ResultsPatterns =
    [
        // ── legacy RESULTS_PATTERNS, verbatim ──
        new(@"^/api/v1/lia/(session/[^/]+|user/[^/]+)/results/?$", RegexOptions.CultureInvariant),
        new(@"^/api/v1/personality/(session/[^/]+|user/[^/]+)/results/?$", RegexOptions.CultureInvariant),
        new(@"^/api/v1/mil(/|$)", RegexOptions.CultureInvariant),
        new(@"^/api/pcaexam/(history|completed-exams|all-results|statistics)(/|$)", RegexOptions.CultureInvariant),
        new(@"^/api/pcaapi/(get-result|get-competences|get-pca-vs-jca|pdf-report|img-report|report-pdf|evaluations)(/|$)", RegexOptions.CultureInvariant),
        new(@"^/api/v1/reports(/|$)", RegexOptions.CultureInvariant),
        new(@"^/api/v1/career-informe(/|$)", RegexOptions.CultureInvariant),
        new(@"^/api/v1/careers(/|$)", RegexOptions.CultureInvariant),
        new(@"^/api/v1/vocational360/(score|integrated|recommendations)(/|$)", RegexOptions.CultureInvariant),
        new(@"^/api/v1/assessments(/|$)", RegexOptions.CultureInvariant),
        new(@"^/api/v1/assessment/(derive-profile|generate-insights)(/|$)", RegexOptions.CultureInvariant),
        // ── .NET-only: CareerFit's persisted scores (POST /evaluate stays Platform) ──
        new(@"^/api/v1/careerfit/(results|runs)(/|$)", RegexOptions.CultureInvariant),
    ];

    private static readonly string[] TakingPrefixes =
    [
        // ── legacy TAKING_PREFIXES, verbatim ──
        "/api/v1/lia",
        "/api/v1/personality",
        "/api/pcaexam",
        "/api/pcaapi",
        "/evaluation",                      // 360 groups / invites (+ public evaluator token links)
        "/api/question360",
        "/api/v1/vocational360",            // instrument + questionnaire (results caught above)
        "/api/v1/assessment/completion",
        "/api/v1/assessment/insights-status",
    ];

    /// <summary>
    /// Legacy <c>classifyPaywallPath</c>: lower-cased (Express string mounts match case-insensitively),
    /// OPEN first, then RESULTS, then TAKING, else PLATFORM. <paramref name="endpointIsResults"/> lets an
    /// endpoint that carries the RequirePaidResults marker count as Results even if no pattern lists it.
    /// </summary>
    public static PaywallClass Classify(string? path, bool endpointIsResults = false)
    {
        var p = (path ?? string.Empty).ToLowerInvariant();
        if (p is "" or "/" || MatchesPrefix(p, OpenPrefixes))
        {
            return PaywallClass.Open;
        }

        if (endpointIsResults || ResultsPatterns.Any(re => re.IsMatch(p)))
        {
            return PaywallClass.Results;
        }

        return MatchesPrefix(p, TakingPrefixes) ? PaywallClass.Taking : PaywallClass.Platform;
    }

    /// <summary>Legacy <c>paywallDecision</c>: null = allow, otherwise the 402 code + message.</summary>
    public static PaywallDenial? Decide(PaywallClass cls, StudentAccess access)
    {
        ArgumentNullException.ThrowIfNull(access);

        if (cls is PaywallClass.Open or PaywallClass.Taking)
        {
            return null;
        }

        if (cls == PaywallClass.Results)
        {
            return access.PaidResults
                ? null
                : new PaywallDenial(StudentAccessRules.PaidResultsRequiredCode, StudentAccessRules.PaidResultsRequiredMessage);
        }

        if (access.FullPlatform)
        {
            return null;
        }

        return access.PaidResults
            ? new PaywallDenial(FullPlatformRequiredCode, FullPlatformRequiredMessage)
            : new PaywallDenial(PaymentRequiredCode, PaymentRequiredMessage);
    }

    private static bool MatchesPrefix(string p, string[] prefixes) =>
        prefixes.Any(prefix => p == prefix || p.StartsWith(prefix + "/", StringComparison.Ordinal));
}
