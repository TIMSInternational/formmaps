using System.Text.Json.Nodes;

namespace FormMaps.Application.Auth;

/// <summary>What a student may use right now (port of legacy <c>StudentAccess</c>).</summary>
/// <param name="FullPlatform">Whole student product (resume builder, applications, coaching, AI chat ...).</param>
/// <param name="PaidResults">Full assessment results, reports and downloads — only after a real charge.</param>
/// <param name="Scope"><see cref="StudentAccessRules.FullPlatformScope"/>, <see cref="StudentAccessRules.AssessmentsAndReportsScope"/> or null.</param>
/// <param name="Reason">not_student | school_contract | subscription | one_time | none.</param>
public sealed record StudentAccess(bool FullPlatform, bool PaidResults, string? Scope, string Reason);

/// <summary>A school's contract window (legacy <c>SchoolContract</c>).</summary>
public sealed record SchoolContract(
    bool IsActive,
    string? Status,
    DateTimeOffset? ContractStartDate,
    DateTimeOffset? ContractEndDate);

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

    /// <summary>INDEPENDENT_STUDENT_PAYWALL — default OFF. Only "true"/"1"/"on" (trimmed, any case) enable it.</summary>
    public static bool IsPaywallEnabled(string? raw)
    {
        var value = (raw ?? string.Empty).Trim().ToLowerInvariant();
        return value is "true" or "1" or "on";
    }

    /// <summary>
    /// A school covers its students only with an ACTIVE contract: school active, status "active", and a
    /// contract window that includes now. A missing end date is NOT an active contract (that is what a
    /// seed/test school looks like).
    /// </summary>
    public static bool SchoolHasActiveContract(SchoolContract? school, DateTimeOffset now)
    {
        if (school is null || !school.IsActive || !string.Equals(school.Status, "active", StringComparison.Ordinal))
        {
            return false;
        }

        if (school.ContractEndDate is not { } end || end < now)
        {
            return false;
        }

        if (school.ContractStartDate is { } start && start > now)
        {
            return false;
        }

        return true;
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
