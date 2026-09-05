namespace FormMaps.Application.Telemetry;

/// <summary>
/// The telemetry event allow-list. A transcription of <c>VALID_EVENTS</c> at
/// formmaps-platform/api/src/routes/telemetry.ts:13-25, in the same order, with nothing added and
/// nothing removed.
///
/// <para>READ THE LEGACY COMMENT BEFORE EDITING (telemetry.ts:10-12). Unknown types are silently
/// DROPPED by the filter at telemetry.ts:42, not rejected: a client that starts sending a new type
/// gets a 200 and loses every event of that type until BOTH this list and the frontend's
/// <c>TelemetryEventType</c> union (apps/web/src/services/telemetryService.ts:11-39) are updated. The
/// two lists are a matched pair that nothing enforces at build time, which is why the legacy suite
/// pins the silent drop as a test (api/src/__tests__/telemetry-web-vital.route.test.ts:71-79) rather
/// than leaving it folklore. This port does the same, in
/// TelemetryBatchTests.Unknown_type_is_silently_dropped.</para>
///
/// <para>Matching is ORDINAL and case-sensitive because JavaScript's <c>Set.prototype.has</c> is
/// SameValueZero — <c>"Page_View"</c> is not <c>"page_view"</c> and legacy drops it. A
/// case-insensitive comparer here would persist events legacy discards, which is a behaviour change
/// disguised as leniency.</para>
/// </summary>
public static class TelemetryEventTypes
{
    public static readonly IReadOnlySet<string> Allowed = new HashSet<string>(StringComparer.Ordinal)
    {
        "page_view", "click", "favorite_add", "favorite_remove",
        "form_save", "form_complete", "session_book", "session_complete", "session_cancel",
        "assessment_start", "assessment_complete", "resume_step_complete",
        "login", "logout", "course_start", "course_progress", "course_complete",
        "career_view", "career_explore", "coach_view", "search", "error",

        // formmaps#90. Core Web Vitals (LCP/INP/CLS/TTFB/FCP), sent by apps/web/src/lib/webVitals.ts.
        // Rides the existing batched, userId-hashed, 90-day-expiry channel instead of adding a vendor.
        // Properties carry a metric name, a value and a rating -- no PII.
        "web_vital",
    };

    /// <summary>
    /// True when legacy's <c>VALID_EVENTS.has(e.type)</c> would be true. A null type models
    /// <c>e.type === undefined</c>, which is what property access yields for every non-object array
    /// element (numbers, strings, booleans, arrays) and for an object with no <c>type</c> key — legacy
    /// filters those out silently rather than erroring. The one element kind that does NOT reach here
    /// is JSON <c>null</c>; see <see cref="TelemetryBatch"/> for why that one throws instead.
    /// </summary>
    public static bool IsAllowed(string? type) => type is not null && Allowed.Contains(type);
}
