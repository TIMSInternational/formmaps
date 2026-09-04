using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Telemetry;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Telemetry;

/// <summary>
/// HTTP-level coverage for TelemetryEndpoints (routes/telemetry.ts, ONE endpoint under
/// /api/v1/telemetry), formmaps#65 — a WebApplicationFactory&lt;Program&gt; with a swapped-in fake
/// writer, exercised via dev-header identity, asserting the status codes, the response shape and the
/// legacy quirks a flag flip has to preserve.
///
/// <para>Body-parsing behaviour lives in FormMaps.UnitTests.Telemetry.TelemetryBatchTests and is not
/// re-covered here; persistence lives in TelemetryEventWriterTests; the tenant boundary and its
/// sabotage record live in TelemetryCrossTenantRlsTests. This file is the HTTP contract.</para>
/// </summary>
public class TelemetryEndpointsTests
{
    // =====================================================================================
    // Auth (index.ts:333 + telemetry.ts:8) — authenticate, and nothing else
    // =====================================================================================

    /// <summary>
    /// A consequence webVitals.ts:16 already documents: vitals are collected for signed-in users only,
    /// so the login and marketing pages are invisible to this channel. Same assertion legacy makes
    /// (telemetry-web-vital.route.test.ts:92-98).
    /// </summary>
    [Fact]
    public async Task Anonymous_is_401()
    {
        using var factory = new Factory(new FakeWriter());
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/telemetry/events")
        {
            Content = new StringContent("""{"events":[{"type":"web_vital"}]}""", Encoding.UTF8, "application/json"),
        };
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    /// <summary>
    /// Legacy applies NO role check, NO requirePermission and NO requireSubscription to this router
    /// (the whole file is 64 lines and carries none), so every authenticated role may post. A port that
    /// added a gate here would silently stop collecting for whichever role it excluded.
    /// </summary>
    [Theory]
    [InlineData("student")]
    [InlineData("parent")]
    [InlineData("counselor")]
    [InlineData("coach")]
    [InlineData("school_admin")]
    public async Task Any_authenticated_role_may_post(string role)
    {
        var writer = new FakeWriter();
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client, """{"events":[{"type":"page_view"}]}""", role: role);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, writer.Calls);
    }

    /// <summary>
    /// A coach has no schoolId. Legacy's gate is <c>authenticate</c>, not <c>tenantContext</c> requiring
    /// a school, so a school-less caller ingests normally.
    /// </summary>
    [Fact]
    public async Task A_school_less_caller_is_accepted()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client, """{"events":[{"type":"page_view"}]}""", role: "coach", schoolId: null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, writer.Calls);
    }

    // =====================================================================================
    // The 200 (telemetry.ts:57)
    // =====================================================================================

    [Fact]
    public async Task Happy_path_is_200_with_events_received()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client,
            """{"events":[{"type":"web_vital","properties":{"metric":"LCP","value":2419,"rating":"needs-improvement"}}]}""");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(1, doc.RootElement.GetProperty("data").GetProperty("eventsReceived").GetInt32());
        Assert.Equal("web_vital", Assert.Single(writer.LastRows!).Type);
    }

    /// <summary>
    /// THE TRAP THIS SLICE EXISTS TO KEEP VISIBLE. An unknown type is filtered out and the caller still
    /// gets a 200 — with a smaller count and no error of any kind — so the server allow-list and the
    /// frontend <c>TelemetryEventType</c> union (apps/web/src/services/telemetryService.ts:11-39) are a
    /// matched pair nothing enforces at build time. Legacy pins this too
    /// (telemetry-web-vital.route.test.ts:71-79). If this ever starts returning 400, REWRITE this test
    /// rather than deleting it.
    /// </summary>
    [Fact]
    public async Task An_unknown_type_is_silently_dropped_with_a_200_and_no_write()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client, """{"events":[{"type":"not_a_real_event","properties":{}}]}""");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(0, doc.RootElement.GetProperty("data").GetProperty("eventsReceived").GetInt32());

        // telemetry.ts:44 — `if (validEvents.length > 0)`. NOT an empty INSERT, not an opened session.
        Assert.Equal(0, writer.Calls);
    }

    [Fact]
    public async Task Only_the_unknown_events_are_dropped_from_a_mixed_batch()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client,
            """
            {"events":[{"type":"web_vital","properties":{"metric":"LCP","value":1000}},
                       {"type":"definitely_not_valid","properties":{}},
                       {"type":"page_view","properties":{"page":"/dashboard"}}]}
            """);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, doc.RootElement.GetProperty("data").GetProperty("eventsReceived").GetInt32());
        Assert.Equal(["web_vital", "page_view"], writer.LastRows!.Select(r => r.Type));
    }

    // =====================================================================================
    // The 400 (telemetry.ts:34-36) — the only thing legacy validates
    // =====================================================================================

    [Theory]
    [InlineData("""{}""")]
    [InlineData("""{"events":[]}""")]
    [InlineData("""{"events":"page_view"}""")]
    [InlineData("""{"events":null}""")]
    [InlineData("""[{"type":"page_view"}]""")]
    [InlineData("")]
    public async Task An_envelope_that_is_not_a_1_to_100_array_is_400_with_the_legacy_message(string body)
    {
        var writer = new FakeWriter();
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client, body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
        // Verbatim from telemetry.ts:35. It IS the response body, so a paraphrase is a behaviour change.
        Assert.Equal("1-100 events required", doc.RootElement.GetProperty("message").GetString());
        Assert.Equal(0, writer.Calls);
    }

    [Fact]
    public async Task One_hundred_and_one_events_is_the_400_and_one_hundred_is_not()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await Send(client, Batch(100))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(client, Batch(101))).StatusCode);

        static string Batch(int n) =>
            $$"""{"events":[{{string.Join(",", Enumerable.Repeat("""{"type":"click"}""", n))}}]}""";
    }

    // =====================================================================================
    // The 500 (telemetry.ts:58-60)
    // =====================================================================================

    /// <summary>
    /// Malformed JSON: legacy's express.json() throws and the global handler at index.ts:434 answers 500
    /// regardless of the SyntaxError's own 400 status. Same body as the route's own catch.
    /// </summary>
    [Fact]
    public async Task A_body_that_is_not_json_is_500_not_400()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client, "{not json");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Internal server error", doc.RootElement.GetProperty("message").GetString());
        Assert.Equal(0, writer.Calls);
    }

    /// <summary>
    /// The JSON-null element. <c>null.type</c> is a TypeError inside legacy's filter, so the whole
    /// request is a 500 — and apps/web then RETRIES the batch (telemetryService.ts:462-471) until the
    /// 100-event cap discards it. Inherited, pinned, not repaired.
    /// </summary>
    [Fact]
    public async Task A_json_null_event_poisons_the_whole_batch_with_a_500()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client, """{"events":[{"type":"page_view"},null]}""");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal(0, writer.Calls);
    }

    /// <summary>
    /// A failed write is a 500, NOT a 200 with a count. This is the half of the contract that makes
    /// awaiting the write necessary: <c>eventsReceived</c> reports what was ACCEPTED, and a
    /// fire-and-forget port would report acceptance for rows that never landed.
    /// </summary>
    [Fact]
    public async Task A_failing_write_is_500_and_never_a_200_with_a_count()
    {
        var writer = new FakeWriter { Throw = true };
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client, """{"events":[{"type":"page_view"}]}""");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Internal server error", doc.RootElement.GetProperty("message").GetString());
    }

    /// <summary>
    /// The other half: the response is only produced AFTER the write finished. A writer that blocks
    /// blocks the response, which is what "legacy awaits" means in practice — legacy's <c>await</c> at
    /// telemetry.ts:45.
    /// </summary>
    [Fact]
    public async Task The_response_waits_for_the_write_to_finish()
    {
        var gate = new TaskCompletionSource();
        var writer = new FakeWriter { Gate = gate.Task };
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var pending = Send(client, """{"events":[{"type":"page_view"}]}""");

        // Give the request a real chance to complete early; if the write were backgrounded it would.
        var raced = await Task.WhenAny(pending, Task.Delay(TimeSpan.FromMilliseconds(400)));
        Assert.NotSame(pending, raced);

        gate.SetResult();
        Assert.Equal(HttpStatusCode.OK, (await pending).StatusCode);
        Assert.True(writer.Completed);
    }

    // =====================================================================================
    // The row owner (telemetry.ts:47) — `userId: req.userId!`
    // =====================================================================================

    /// <summary>
    /// THE ENDPOINT-SIDE HALF OF THE TENANT BOUNDARY, and the reason TelemetryCrossTenantRlsTests can
    /// record that the RLS policy alone would allow a row naming a classmate: the owner comes from the
    /// authenticated context and NEVER from the request body, whatever the body claims. Legacy is the
    /// same — <c>req.userId!</c> is the only source, and the body's own fields are never consulted for
    /// it.
    /// </summary>
    [Fact]
    public async Task The_row_owner_is_always_the_caller_never_a_client_supplied_user_id()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client,
            """{"userId":"victim","events":[{"type":"page_view","userId":"victim","properties":{"userId":"victim"}}]}""");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("caller-1", writer.LastUserId);
    }

    /// <summary>
    /// telemetry.ts:40 — <c>Date.now() + 90 * 24 * 60 * 60 * 1000</c>. The retention window is what makes
    /// the row eventually deletable; a port that quietly widened it would keep behavioural data past the
    /// commitment the frontend states (webVitals.ts:13).
    /// </summary>
    [Fact]
    public async Task Expiry_is_ninety_days_out()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var before = DateTime.UtcNow;
        await Send(client, """{"events":[{"type":"page_view"}]}""");
        var after = DateTime.UtcNow;

        Assert.InRange(writer.LastExpiresAt, before.AddDays(90), after.AddDays(90));
    }

    // ---- helpers ----

    private static Task<HttpResponseMessage> Send(
        HttpClient client, string body, string role = "student", string userId = "caller-1", string? schoolId = "school-1")
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/telemetry/events");
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, userId);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "caller@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Caller");
        if (schoolId is not null) request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, schoolId);
        request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        return client.SendAsync(request);
    }

    private sealed class Factory(ITelemetryEventWriter writer) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ITelemetryEventWriter>();
                services.AddSingleton(writer);
            });
        }
    }

    private sealed class FakeWriter : ITelemetryEventWriter
    {
        public bool Throw { get; init; }

        /// <summary>When set, the write blocks on this until the test releases it.</summary>
        public Task? Gate { get; init; }

        public int Calls { get; private set; }
        public bool Completed { get; private set; }
        public string? LastUserId { get; private set; }
        public IReadOnlyList<TelemetryEventRow>? LastRows { get; private set; }
        public DateTime LastExpiresAt { get; private set; }

        public async Task WriteAsync(
            RequestContext context,
            string userId,
            IReadOnlyList<TelemetryEventRow> rows,
            DateTime expiresAt,
            CancellationToken cancellationToken = default)
        {
            Calls++;
            (LastUserId, LastRows, LastExpiresAt) = (userId, rows, expiresAt);

            if (Gate is not null)
            {
                await Gate;
            }

            if (Throw)
            {
                throw new InvalidOperationException("write failed");
            }

            Completed = true;
        }
    }
}
