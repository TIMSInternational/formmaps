using System.Text.Json.Nodes;

namespace FormMaps.Application.Auth;

/// <summary>What a student may use right now (port of legacy <c>StudentAccess</c>).</summary>
/// <param name="FullPlatform">Whole student product (resume builder, applications, coaching, AI chat ...).</param>
/// <param name="PaidResults">Full assessment results, reports and downloads — only after a real charge.</param>
/// <param name="Scope"><see cref="StudentAccessRules.FullPlatformScope"/>, <see cref="StudentAccessRules.AssessmentsAndReportsScope"/> or null.</param>
/// <param name="Reason">not_student | school_contract | subscription | one_time | complimentary | none.</param>
/// <param name="ExpiresAt">Only for "complimentary": when the grant stops covering (exclusive).</param>
public sealed record StudentAccess(bool FullPlatform, bool PaidResults, string? Scope, string Reason, DateTimeOffset? ExpiresAt = null);

/// <summary>A school's contract window (legacy <c>SchoolContract</c>).</summary>
/// <param name="TimeZone">IANA zone (<c>schools.timezone</c>); null/unknown → <see cref="StudentAccessRules.PlatformTimeZoneId"/>.</param>
public sealed record SchoolContract(
    bool IsActive,
    string? Status,
    DateTimeOffset? ContractStartDate,
    DateTimeOffset? ContractEndDate,
    string? TimeZone = null);

/// <summary>
/// One student's entitlement row: <c>user_subscriptions</c> LEFT JOIN <c>subscription_plans</c>.
/// <paramref name="HasPlan"/> is false when no plan row came back (legacy <c>sub.plan</c> null).
/// </summary>
public sealed record EntitlementSubscription(
    string? Status,
    bool IsActive,
    DateTimeOffset? NextBillingDate,
    bool HasPlan,
    string? PlanInterval);

/// <summary>
/// Pure port of the independent-student paywall rules from legacy
/// <c>api/src/lib/studentEntitlement.ts</c> + <c>api/src/middleware/studentPaywall.ts</c>
/// (tafurfede/formmaps-platform#440, TIMSInternational/formmaps#240). No DB, no clock: every
/// decision takes a pinned <c>now</c> so the Node test matrix can be mirrored one-for-one.
/// </summary>
public static class StudentAccessRules
{
    public const string FlagKey = "INDEPENDENT_STUDENT_PAYWALL";

    public const string FullPlatformScope = "full_platform";
    public const string AssessmentsAndReportsScope = "assessments_and_reports";

    public const string PaidResultsRequiredCode = "PAID_RESULTS_REQUIRED";
    public const string PaidResultsRequiredMessage = "Your full results unlock after your first payment";

    private static readonly HashSet<string> RecurringIntervals =
        new(StringComparer.Ordinal) { "month", "monthly", "year", "yearly" };

    public static readonly StudentAccess NoAccess = new(false, false, null, "none");

    public static StudentAccess FullAccess(string reason) => new(true, true, FullPlatformScope, reason);

    public const string ComplimentaryReason = "complimentary";

    /// <summary>
    /// audit 2026-10-09 E5 (legacy <c>isComplimentaryGrantActive</c>, lib/complimentaryAccess.ts): a Super Admin
    /// complimentary grant covers while not revoked and <c>startsAt &lt;= now &lt; expiresAt</c> — at the exact
    /// expiry instant it no longer covers. It is its own table, never a subscription or payment.
    /// </summary>
    public static bool IsComplimentaryGrantActive(
        DateTimeOffset startsAt, DateTimeOffset expiresAt, DateTimeOffset? revokedAt, DateTimeOffset now) =>
        revokedAt is null && startsAt <= now && now < expiresAt;

    /// <summary>
    /// Legacy <c>getStudentAccess</c> after the school-contract check (audit E5): a subscription that already grants
    /// everything stays the reason; otherwise an active complimentary grant (own or school's, latest expiry) grants
    /// everything until it expires; otherwise the subscription verdict as before.
    /// </summary>
    public static StudentAccess WithComplimentary(StudentAccess fromSubscription, DateTimeOffset? complimentaryExpiresAt)
    {
        if (fromSubscription.FullPlatform && fromSubscription.PaidResults)
        {
            return fromSubscription;
        }

        return complimentaryExpiresAt is { } expiresAt
            ? new StudentAccess(true, true, FullPlatformScope, ComplimentaryReason, expiresAt)
            : fromSubscription;
    }

    /// <summary>INDEPENDENT_STUDENT_PAYWALL — default OFF. Only "true"/"1"/"on" (trimmed, any case) enable it.</summary>
    public static bool IsPaywallEnabled(string? raw)
    {
        var value = (raw ?? string.Empty).Trim().ToLowerInvariant();
        return value is "true" or "1" or "on";
    }

    /// <summary>The platform's home zone (Colombia, UTC-5, no DST) — used when a school has no valid timezone.</summary>
    public const string PlatformTimeZoneId = "America/Bogota";

    // Fixed UTC-5 fallback if the host has no tz database (Bogota has had no DST since 1993).
    private static readonly TimeZoneInfo PlatformTimeZone = FindZone(PlatformTimeZoneId)
        ?? TimeZoneInfo.CreateCustomTimeZone(PlatformTimeZoneId, TimeSpan.FromHours(-5), PlatformTimeZoneId, PlatformTimeZoneId);

    /// <summary>
    /// A school covers its students only with an ACTIVE contract: school active, status "active", and a
    /// contract window that includes now. A missing end date is NOT an active contract (that is what a
    /// seed/test school looks like — #395); status "invited" never covers.
    /// <para>
    /// audit 2026-10-09 E4 (mirrors legacy schoolHasActiveContract): the window is whole CALENDAR DAYS in the
    /// school's timezone (<see cref="PlatformTimeZoneId"/> when unset): covered from 00:00 local on the start
    /// date through 23:59:59 local on the end date (end INCLUSIVE). It compared the stored midnight-UTC
    /// instants, so a contract "ending 30 June" stopped covering at 19:00 on 29 June in Bogota.
    /// </para>
    /// </summary>
    public static bool SchoolHasActiveContract(SchoolContract? school, DateTimeOffset now)
    {
        if (school is null || !school.IsActive || !string.Equals(school.Status, "active", StringComparison.Ordinal))
        {
            return false;
        }

        if (school.ContractEndDate is not { } end)
        {
            return false;
        }

        var zone = ResolveZone(school.TimeZone);
        if (now >= StartOfContractDay(end, zone, addDays: 1))
        {
            return false;
        }

        if (school.ContractStartDate is { } start && now < StartOfContractDay(start, zone))
        {
            return false;
        }

        return true;
    }

    /// <summary>
    /// The instant local midnight starts on the calendar day of <paramref name="date"/> (+ <paramref name="addDays"/>)
    /// in <paramref name="zone"/>. Contract dates are plain dates stored as midnight UTC, so the calendar day is the
    /// UTC date part.
    /// </summary>
    public static DateTimeOffset StartOfContractDay(DateTimeOffset date, TimeZoneInfo zone, int addDays = 0)
    {
        var utc = date.UtcDateTime;
        var local = new DateTime(utc.Year, utc.Month, utc.Day, 0, 0, 0, DateTimeKind.Unspecified).AddDays(addDays);
        while (zone.IsInvalidTime(local))
        {
            local = local.AddMinutes(30); // midnight skipped by a DST jump: the day starts at the first valid time
        }

        return new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(local, zone), TimeSpan.Zero);
    }

    public static TimeZoneInfo ResolveZone(string? timeZoneId) =>
        string.IsNullOrWhiteSpace(timeZoneId) ? PlatformTimeZone : FindZone(timeZoneId) ?? PlatformTimeZone;

    private static TimeZoneInfo? FindZone(string id)
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(id);
        }
        catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return null;
        }
    }

    /// <summary>Legacy <c>isRecurringInterval</c>: month/monthly/year/yearly, trimmed + lower-cased.</summary>
    public static bool IsRecurringInterval(string? interval) =>
        RecurringIntervals.Contains((interval ?? string.Empty).Trim().ToLowerInvariant());

    public static string ScopeForInterval(string? interval) =>
        IsRecurringInterval(interval) ? FullPlatformScope : AssessmentsAndReportsScope;

    /// <summary>
    /// Pure rule for one student's entitlement row (legacy <c>evaluateStudentAccess</c>).
    /// - Subscription: full platform while <see cref="SubscriptionAccess.GrantsAccess"/> (active, trialing,
    ///   past_due within grace). Paid results only when "active" — trialing and past_due get the preview.
    /// - One-time: paid results forever while the row is active (no expiry); never the full platform.
    /// - No plan info: treated as a subscription.
    /// </summary>
    public static StudentAccess Evaluate(EntitlementSubscription? sub, DateTimeOffset now, int graceDays)
    {
        if (sub is null || !sub.IsActive)
        {
            return NoAccess;
        }

        var scope = sub.HasPlan ? ScopeForInterval(sub.PlanInterval) : FullPlatformScope;
        if (scope == AssessmentsAndReportsScope)
        {
            return string.Equals(sub.Status, "active", StringComparison.Ordinal)
                ? new StudentAccess(false, true, scope, "one_time")
                : NoAccess;
        }

        if (!SubscriptionAccess.GrantsAccess(sub.Status, sub.IsActive, sub.NextBillingDate, now, graceDays))
        {
            return NoAccess;
        }

        return new StudentAccess(
            true,
            string.Equals(sub.Status, "active", StringComparison.Ordinal),
            scope,
            "subscription");
    }

    /// <summary>
    /// Legacy <c>redactCompletion</c>: a body whose <c>success</c> is exactly true becomes
    /// <c>{ success: true, data: { sessionId, completed: true, resultsLocked: true } }</c> where sessionId is
    /// <c>data.sessionId ?? data.id ?? null</c>. Anything else (errors, non-objects) is returned unchanged (null).
    /// </summary>
    /// <returns>The redacted body, or null when the original body must pass through untouched.</returns>
    public static JsonObject? RedactCompletionBody(JsonNode? body)
    {
        if (body is not JsonObject root ||
            root["success"] is not JsonValue success ||
            !success.TryGetValue<bool>(out var ok) || !ok)
        {
            return null;
        }

        JsonNode? sessionId = null;
        if (root["data"] is JsonObject data)
        {
            // JSON null parses to a null JsonNode, so `??` matches JS `??` (null and undefined both fall through).
            sessionId = data["sessionId"] ?? data["id"];
        }

        return new JsonObject
        {
            ["success"] = true,
            ["data"] = new JsonObject
            {
                ["sessionId"] = sessionId?.DeepClone(),
                ["completed"] = true,
                ["resultsLocked"] = true,
            },
        };
    }
}
