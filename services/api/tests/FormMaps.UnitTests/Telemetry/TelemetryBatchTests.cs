using System.Text.Json;
using FormMaps.Application.Telemetry;

namespace FormMaps.UnitTests.Telemetry;

/// <summary>
/// The body half of POST /api/v1/telemetry/events (formmaps-platform/api/src/routes/telemetry.ts:31),
/// formmaps#65. Everything here is a legacy behaviour a flag flip has to preserve, so the tests are
/// named after the behaviour rather than after the method.
///
/// <para>HTTP status codes, auth and the awaited write live in the integration suite
/// (FormMaps.IntegrationTests.Telemetry); persistence lives in TelemetryEventWriterTests. This file is
/// the pure parse.</para>
/// </summary>
public class TelemetryBatchTests
{
    private static readonly DateTime Now = new(2026, 9, 4, 12, 0, 0, DateTimeKind.Utc);

    private static TelemetryBatchParseResult Parse(string json) =>
        TelemetryBatch.Parse(JsonDocument.Parse(json).RootElement.Clone(), Now);

    private static TelemetryBatchParseResult ParseEvents(string eventsJson) =>
        Parse($$"""{"events": {{eventsJson}} }""");

    // =====================================================================================
    // The allow-list itself (telemetry.ts:13-25)
    // =====================================================================================

    /// <summary>
    /// The list is transcribed from legacy, so it is asserted as a SET rather than sampled: an entry
    /// silently dropped in transcription would cost every event of that type with no error anywhere.
    /// </summary>
    [Fact]
    public void Allow_list_is_exactly_legacys_VALID_EVENTS()
    {
        string[] expected =
        [
            "page_view", "click", "favorite_add", "favorite_remove",
            "form_save", "form_complete", "session_book", "session_complete", "session_cancel",
            "assessment_start", "assessment_complete", "resume_step_complete",
            "login", "logout", "course_start", "course_progress", "course_complete",
            "career_view", "career_explore", "coach_view", "search", "error",
            "web_vital",
        ];

        Assert.Equal(expected.Order(), TelemetryEventTypes.Allowed.Order());
    }

    /// <summary>
    /// formmaps#90's own acceptance: the vital rides the existing channel. Kept separate from the set
    /// assertion above so a future edit that drops it fails with a name that says what broke.
    /// </summary>
    [Fact]
    public void Web_vital_is_accepted_and_keeps_its_metric_payload_intact()
    {
        var result = ParseEvents(
            """[{"type":"web_vital","properties":{"metric":"CLS","value":0.1235,"rating":"good","path":"/login"}}]""");

        Assert.Equal(TelemetryBatchStatus.Ok, result.Status);
        var row = Assert.Single(result.Rows);
        Assert.Equal("web_vital", row.Type);
        Assert.Contains("\"metric\":\"CLS\"", row.PropertiesJson);
        Assert.Contains("0.1235", row.PropertiesJson);
    }

    // =====================================================================================
    // THE SILENT DROP (telemetry.ts:10-12 and :42) — the trap this port must keep
    // =====================================================================================

    /// <summary>
    /// Documented, not endorsed. An unknown type is FILTERED, so the caller gets a 200 and loses the
    /// event. If this ever starts rejecting, the server allow-list and the frontend
    /// <c>TelemetryEventType</c> union (apps/web/src/services/telemetryService.ts:11-39) no longer have
    /// to be kept in step and this test should be REWRITTEN, not deleted.
    /// </summary>
    [Fact]
    public void Unknown_type_is_silently_dropped()
    {
        var result = ParseEvents("""[{"type":"not_a_real_event","properties":{}}]""");

        Assert.Equal(TelemetryBatchStatus.Ok, result.Status);
        Assert.Empty(result.Rows);
    }

    [Fact]
    public void Only_the_unknown_events_are_dropped_from_a_mixed_batch_and_order_is_kept()
    {
        var result = ParseEvents(
            """
            [{"type":"web_vital","properties":{"metric":"LCP","value":1000}},
             {"type":"definitely_not_valid","properties":{}},
             {"type":"page_view","properties":{"page":"/dashboard"}}]
            """);

        Assert.Equal(TelemetryBatchStatus.Ok, result.Status);
        Assert.Equal(["web_vital", "page_view"], result.Rows.Select(r => r.Type));
    }

    /// <summary>
    /// JS <c>Set.has</c> is SameValueZero, so matching is case-sensitive and legacy drops "Page_View".
    /// A case-insensitive comparer in the port would PERSIST events legacy discards.
    /// </summary>
    [Theory]
    [InlineData("Page_View")]
    [InlineData("PAGE_VIEW")]
    [InlineData(" page_view")]
    [InlineData("page_view ")]
    public void Type_matching_is_ordinal_and_case_sensitive(string type)
    {
        var result = ParseEvents($$"""[{"type":{{JsonSerializer.Serialize(type)}}}]""");

        Assert.Equal(TelemetryBatchStatus.Ok, result.Status);
        Assert.Empty(result.Rows);
    }

    /// <summary>
    /// <c>(5).type</c>, <c>"x".type</c>, <c>true.type</c> and <c>[].type</c> are all <c>undefined</c> in
    /// JS, so legacy's filter drops these elements without erroring. Note the string case in particular:
    /// a client sending <c>["page_view"]</c> instead of <c>[{type:"page_view"}]</c> gets a cheerful
    /// 200/0.
    /// </summary>
    [Theory]
    [InlineData("5")]
    [InlineData("\"page_view\"")]
    [InlineData("true")]
    [InlineData("[]")]
    [InlineData("{}")]
    [InlineData("""{"type":5}""")]
    [InlineData("""{"type":null}""")]
    public void Element_without_a_string_type_is_dropped_silently(string element)
    {
        var result = ParseEvents($"[{element}]");

        Assert.Equal(TelemetryBatchStatus.Ok, result.Status);
        Assert.Empty(result.Rows);
    }

    // =====================================================================================
    // THE ONE ELEMENT KIND THAT THROWS (telemetry.ts:42 over a JSON null)
    // =====================================================================================

    /// <summary>
    /// <c>null.type</c> is a TypeError, the route's catch turns it into a 500, and apps/web then RETRIES
    /// the batch (telemetryService.ts:462-471) until the 100-event cap discards it. Ugly, inherited, and
    /// pinned rather than repaired: flipping a route flag has to be behaviour-neutral.
    /// </summary>
    [Fact]
    public void A_json_null_element_is_a_500_not_a_silent_drop()
    {
        Assert.Equal(TelemetryBatchStatus.Malformed, ParseEvents("""[{"type":"page_view"},null]""").Status);
    }

    /// <summary>
    /// The filter runs over EVERY element before anything looks at how many survived, so a null poisons
    /// a batch that would otherwise have been an empty-but-successful 200/0.
    /// </summary>
    [Fact]
    public void A_json_null_poisons_even_a_batch_with_no_valid_events()
    {
        Assert.Equal(TelemetryBatchStatus.Malformed, ParseEvents("""[{"type":"nope"},null]""").Status);
    }

    // =====================================================================================
    // The batch envelope (telemetry.ts:34-37) — the ONLY thing legacy actually validates
    // =====================================================================================

    [Theory]
    [InlineData("{}")]                       // events absent
    [InlineData("""{"events":null}""")]
    [InlineData("""{"events":"page_view"}""")]
    [InlineData("""{"events":{}}""")]
    [InlineData("""{"events":5}""")]
    [InlineData("""{"events":[]}""")]        // length 0
    [InlineData("""[{"type":"page_view"}]""")] // array ROOT: req.body.events is undefined
    public void Envelope_that_is_not_a_1_to_100_array_is_the_400(string json)
    {
        Assert.Equal(TelemetryBatchStatus.InvalidBatch, Parse(json).Status);
    }

    [Fact]
    public void One_hundred_events_is_the_last_accepted_batch_and_one_hundred_and_one_is_the_400()
    {
        Assert.Equal(TelemetryBatchStatus.Ok, ParseEvents(Batch(100)).Status);
        Assert.Equal(100, ParseEvents(Batch(100)).Rows.Count);
        Assert.Equal(TelemetryBatchStatus.InvalidBatch, ParseEvents(Batch(101)).Status);

        static string Batch(int n) =>
            "[" + string.Join(",", Enumerable.Repeat("""{"type":"click"}""", n)) + "]";
    }

    /// <summary>
    /// A body express.json() could not parse. Legacy's SyntaxError reaches the global handler at
    /// index.ts:434, which answers 500 regardless of err.status — so this is NOT a 400.
    /// </summary>
    [Fact]
    public void An_unparseable_body_is_the_500()
    {
        Assert.Equal(TelemetryBatchStatus.Malformed, TelemetryBatch.Parse(null, Now).Status);
    }

    // =====================================================================================
    // timestamp (telemetry.ts:50) — `e.timestamp ? new Date(e.timestamp) : new Date()`
    // =====================================================================================

    [Fact]
    public void An_iso_timestamp_is_kept_as_the_instant_it_names()
    {
        var result = ParseEvents("""[{"type":"page_view","timestamp":"2026-01-02T03:04:05.678Z"}]""");

        Assert.Equal(
            new DateTime(2026, 1, 2, 3, 4, 5, 678, DateTimeKind.Utc),
            Assert.Single(result.Rows).Timestamp);
    }

    /// <summary>
    /// The ternary is JS truthiness, so these five all fall through to <c>new Date()</c> rather than
    /// producing an Invalid Date. <c>""</c> and <c>0</c> are the two that a null-check port would get
    /// wrong, and they would become 500s instead of accepted rows.
    /// </summary>
    [Theory]
    [InlineData("""{"type":"page_view"}""")]
    [InlineData("""{"type":"page_view","timestamp":null}""")]
    [InlineData("""{"type":"page_view","timestamp":""}""")]
    [InlineData("""{"type":"page_view","timestamp":0}""")]
    [InlineData("""{"type":"page_view","timestamp":false}""")]
    public void A_falsy_timestamp_becomes_the_server_clock(string element)
    {
        var result = ParseEvents($"[{element}]");

        Assert.Equal(TelemetryBatchStatus.Ok, result.Status);
        Assert.Equal(Now, Assert.Single(result.Rows).Timestamp);
    }

    [Fact]
    public void A_numeric_timestamp_is_epoch_milliseconds()
    {
        var result = ParseEvents("""[{"type":"page_view","timestamp":1767322800000}]""");

        Assert.Equal(
            DateTimeOffset.FromUnixTimeMilliseconds(1767322800000).UtcDateTime,
            Assert.Single(result.Rows).Timestamp);
    }

    /// <summary><c>new Date(true)</c> coerces to <c>new Date(1)</c>. Absurd, faithful.</summary>
    [Fact]
    public void A_true_timestamp_is_one_millisecond_after_the_epoch()
    {
        var result = ParseEvents("""[{"type":"page_view","timestamp":true}]""");

        Assert.Equal(DateTimeOffset.FromUnixTimeMilliseconds(1).UtcDateTime, Assert.Single(result.Rows).Timestamp);
    }

    /// <summary>
    /// A truthy value that coerces to an Invalid Date reaches Prisma and throws, which is the route's
    /// 500. Note the object case is reached only for an ALLOWED type — see the test below it.
    /// </summary>
    [Theory]
    [InlineData("""{"type":"page_view","timestamp":"not-a-date"}""")]
    [InlineData("""{"type":"page_view","timestamp":{}}""")]
    [InlineData("""{"type":"page_view","timestamp":9000000000000000}""")]
    public void An_invalid_timestamp_on_an_accepted_event_is_the_500(string element)
    {
        Assert.Equal(TelemetryBatchStatus.Malformed, ParseEvents($"[{element}]").Status);
    }

    /// <summary>
    /// Legacy only maps the events that SURVIVED the filter, so a garbage timestamp on an event nobody
    /// is going to store never reaches Prisma and the request is a plain 200/0. Getting this backwards
    /// would turn a harmless client bug into a retried 500.
    /// </summary>
    [Fact]
    public void An_invalid_timestamp_on_a_dropped_event_is_never_looked_at()
    {
        var result = ParseEvents("""[{"type":"not_a_real_event","timestamp":"not-a-date"}]""");

        Assert.Equal(TelemetryBatchStatus.Ok, result.Status);
        Assert.Empty(result.Rows);
    }

    // =====================================================================================
    // properties (telemetry.ts:51) — `e.properties || null`
    // =====================================================================================

    [Theory]
    [InlineData("""{"type":"click"}""")]
    [InlineData("""{"type":"click","properties":null}""")]
    [InlineData("""{"type":"click","properties":false}""")]
    [InlineData("""{"type":"click","properties":0}""")]
    [InlineData("""{"type":"click","properties":""}""")]
    public void A_falsy_properties_value_becomes_sql_null(string element)
    {
        Assert.Null(Assert.Single(ParseEvents($"[{element}]").Rows).PropertiesJson);
    }

    /// <summary>
    /// The column is <c>jsonb</c> and legacy never asserts the value is an object, so a truthy
    /// non-object is stored as-is rather than rejected or wrapped.
    /// </summary>
    [Theory]
    [InlineData("""{"type":"click","properties":{"a":1}}""", """{"a":1}""")]
    [InlineData("""{"type":"click","properties":[1,2]}""", "[1,2]")]
    [InlineData("""{"type":"click","properties":"x"}""", "\"x\"")]
    [InlineData("""{"type":"click","properties":7}""", "7")]
    [InlineData("""{"type":"click","properties":true}""", "true")]
    public void A_truthy_properties_value_is_stored_verbatim(string element, string expected)
    {
        Assert.Equal(expected, Assert.Single(ParseEvents($"[{element}]").Rows).PropertiesJson);
    }

    // =====================================================================================
    // userIdHash (telemetry.ts:39)
    // =====================================================================================

    /// <summary>
    /// The legacy suite asserts <c>/^[0-9a-f]{64}$/</c> on the stored column
    /// (telemetry-web-vital.route.test.ts:64-69), so the vector is pinned here rather than the shape
    /// alone: an upper-case or base64 rendering would satisfy "it's a hash" and still break every
    /// analytic join that spans the cutover.
    /// </summary>
    [Fact]
    public void User_id_hash_is_lowercase_hex_sha256()
    {
        Assert.Equal(
            "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
            TelemetryBatch.HashUserId("password"));
        Assert.Matches("^[0-9a-f]{64}$", TelemetryBatch.HashUserId("user-1"));
    }

    // =====================================================================================
    // Retention (telemetry.ts:40)
    // =====================================================================================

    [Fact]
    public void Retention_is_ninety_days()
    {
        Assert.Equal(TimeSpan.FromDays(90), TelemetryBatch.Retention);
    }
}
