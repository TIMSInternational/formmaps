using System.Globalization;
using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Audit;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Audit;

/// <summary>
/// The thin HTTP layer over <see cref="IAuditEventReader" />: the authorization gate, the query-string
/// to <see cref="AuditEventQuery" /> binding, and the response shape. The reader's own behaviour
/// (filtering, keyset paging, cursor encoding) is proven against a real Postgres in
/// <c>AuditEventReaderTests</c>; this file uses a fake reader deliberately so a failure here can only
/// mean the endpoint is wrong.
/// </summary>
/// <remarks>
/// THE GATE IS THE POINT. <see cref="IAuditEventReader" /> runs under <c>RequestContext.System()</c>
/// and therefore bypasses RLS entirely — it can see every school's events, and
/// <see cref="AuditEventQuery.SchoolId" /> is a filter, not a boundary. The super-admin check in this
/// endpoint is the ONLY thing between a caller and the whole cross-tenant audit trail, which is why
/// every denial test below also asserts the reader was never reached: a 403 returned AFTER the query
/// ran would still be a 403, and would still be a cross-tenant read performed on behalf of someone who
/// is not allowed to make one.
/// </remarks>
public class AuditEndpointsTests
{
    private const string Path = "/api/v1/audit/events";

    // -------------------------------------------------------------------------------------------
    // Authorization gate
    // -------------------------------------------------------------------------------------------

    [Fact]
    public async Task Anonymous_Returns401_AndNeverReachesTheReader()
    {
        var reader = new FakeAuditEventReader();
        using var factory = new AuditApiFactory(reader);
        using var client = factory.CreateClient();

        var response = await client.GetAsync(Path);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, reader.QueryCalls);
    }

    // Every non-super-admin role, not just school_admin: the gate is `IsSuperAdmin`, and an
    // implementation that accidentally allows (say) counselor is invisible to a single-role test.
    [Theory]
    [InlineData(FormMapsRoles.SchoolAdmin)]
    [InlineData(FormMapsRoles.Counselor)]
    [InlineData(FormMapsRoles.Teacher)]
    [InlineData(FormMapsRoles.Student)]
    [InlineData(FormMapsRoles.Parent)]
    [InlineData(FormMapsRoles.Coach)]
    public async Task AuthenticatedNonSuperAdmin_Returns403_AndNeverReachesTheReader(string role)
    {
        var reader = new FakeAuditEventReader();
        using var factory = new AuditApiFactory(reader);
        using var client = factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, Path);
        AddDevHeaders(request, role);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, reader.QueryCalls);

        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(body.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("missing_permission", body.RootElement.GetProperty("code").GetString());
    }

    // v1's gate is IsSuperAdmin, NOT the "audit:read" permission string — the constant exists as a
    // forward-compat marker only (see the spec's Read-access model: no role in Node's ROLE_PERMISSIONS
    // can emit it yet). A caller who hands us the permission directly must still be refused, otherwise
    // the inert marker is quietly a live grant.
    [Fact]
    public async Task NonSuperAdminPresentingTheAuditReadPermission_StillReturns403()
    {
        var reader = new FakeAuditEventReader();
        using var factory = new AuditApiFactory(reader);
        using var client = factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, Path);
        AddDevHeaders(request, FormMapsRoles.SchoolAdmin);
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, "audit:read");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, reader.QueryCalls);
    }

    // The gate must run on the NORMALIZED role. Real sessions carry "admin"/"super_admin"/"superadmin"
    // (FormMapsRoles.Normalize exists precisely because the wire value varies), so a gate written as
    // `Role == "Super Admin"` would lock the actual platform admins out of their own audit trail.
    [Theory]
    [InlineData("Super Admin")]
    [InlineData("super_admin")]
    [InlineData("superadmin")]
    [InlineData("admin")]
    public async Task SuperAdminRoleAliases_AreAllAccepted(string role)
    {
        var reader = new FakeAuditEventReader();
        using var factory = new AuditApiFactory(reader);
        using var client = factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, Path);
        AddDevHeaders(request, role);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, reader.QueryCalls);
    }

    // -------------------------------------------------------------------------------------------
    // Response shape
    // -------------------------------------------------------------------------------------------

    [Fact]
    public async Task SuperAdmin_Returns200_WithEveryFieldOfEveryItem()
    {
        var occurredAt = new DateTimeOffset(2026, 3, 4, 5, 6, 7, TimeSpan.Zero);
        var reader = new FakeAuditEventReader
        {
            Page = new AuditEventPage(
                [new AuditEventRecord(
                    "evt_1", occurredAt, "audit.test.a", "user_1", "student", "school_1",
                    "test_score", "score_1", "success", null)],
                NextCursor: "Y3Vyc29yLTI="),
        };
        using var factory = new AuditApiFactory(reader);
        using var client = factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, Path);
        AddDevHeaders(request, FormMapsRoles.SuperAdmin);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, reader.QueryCalls);

        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = body.RootElement;
        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal("Y3Vyc29yLTI=", root.GetProperty("nextCursor").GetString());

        // Ten fields read individually, not a count: eight of them are strings and six are nullable,
        // which is exactly the shape where actorRole lands in schoolId and a count-only assertion
        // stays green.
        var item = Assert.Single(root.GetProperty("items").EnumerateArray().ToArray());
        Assert.Equal("evt_1", item.GetProperty("id").GetString());
        Assert.Equal(occurredAt, item.GetProperty("occurredAt").GetDateTimeOffset());
        Assert.Equal("audit.test.a", item.GetProperty("eventType").GetString());
        Assert.Equal("user_1", item.GetProperty("actorUserId").GetString());
        Assert.Equal("student", item.GetProperty("actorRole").GetString());
        Assert.Equal("school_1", item.GetProperty("schoolId").GetString());
        Assert.Equal("test_score", item.GetProperty("subjectType").GetString());
        Assert.Equal("score_1", item.GetProperty("subjectId").GetString());
        Assert.Equal("success", item.GetProperty("outcome").GetString());
        Assert.Equal(JsonValueKind.Null, item.GetProperty("metadata").ValueKind);
    }

    // AuditEventRecord.MetadataJson is the raw JSONB TEXT. Handing the record straight to the
    // serializer emits it as an escaped string ("{\"attemptCount\":3}"), which every consumer then has
    // to parse a second time and which no JSON tooling can filter on. It must land as real JSON.
    [Fact]
    public async Task Metadata_IsEmittedAsJson_NotAsAnEscapedString()
    {
        var reader = new FakeAuditEventReader
        {
            Page = new AuditEventPage(
                [new AuditEventRecord(
                    "evt_1", DateTimeOffset.UtcNow, "audit.test.a", null, null, null,
                    "test_score", null, "success", """{"attemptCount": 3, "subtest": "verbal"}""")],
                NextCursor: null),
        };
        using var factory = new AuditApiFactory(reader);
        using var client = factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, Path);
        AddDevHeaders(request, FormMapsRoles.SuperAdmin);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var metadata = body.RootElement.GetProperty("items")[0].GetProperty("metadata");
        Assert.Equal(JsonValueKind.Object, metadata.ValueKind);
        Assert.Equal(3, metadata.GetProperty("attemptCount").GetInt32());
        Assert.Equal("verbal", metadata.GetProperty("subtest").GetString());
    }

    [Fact]
    public async Task EmptyPage_Returns200_WithAnEmptyArrayAndNullCursor()
    {
        var reader = new FakeAuditEventReader();
        using var factory = new AuditApiFactory(reader);
        using var client = factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, Path);
        AddDevHeaders(request, FormMapsRoles.SuperAdmin);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Array, body.RootElement.GetProperty("items").ValueKind);
        Assert.Empty(body.RootElement.GetProperty("items").EnumerateArray().ToArray());
        Assert.Equal(JsonValueKind.Null, body.RootElement.GetProperty("nextCursor").ValueKind);
    }

    // -------------------------------------------------------------------------------------------
    // Query-string binding
    // -------------------------------------------------------------------------------------------

    // Nine parameters, all optional, all forwarded. Without this test an endpoint that binds NOTHING
    // (or swaps subjectType and subjectId, or drops from/to) returns a perfectly valid 200 page of the
    // wrong events, and every other test in this file passes.
    [Fact]
    public async Task EveryQueryStringParameter_ReachesTheReader()
    {
        var reader = new FakeAuditEventReader();
        using var factory = new AuditApiFactory(reader);
        using var client = factory.CreateClient();
        var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"{Path}?eventType=lia.session.completed&actorUserId=user_9&subjectType=lia_session"
            + "&subjectId=session_9&schoolId=school_9&from=2026-01-02T03:04:05Z&to=2026-02-03T04:05:06Z"
            + "&limit=7&cursor=Y3Vyc29yLTE%3D");
        AddDevHeaders(request, FormMapsRoles.SuperAdmin);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var query = Assert.IsType<AuditEventQuery>(reader.LastQuery);
        Assert.Equal("lia.session.completed", query.EventType);
        Assert.Equal("user_9", query.ActorUserId);
        Assert.Equal("lia_session", query.SubjectType);
        Assert.Equal("session_9", query.SubjectId);
        Assert.Equal("school_9", query.SchoolId);
        Assert.Equal(
            DateTimeOffset.Parse("2026-01-02T03:04:05Z", CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind).UtcDateTime,
            query.From?.UtcDateTime);
        Assert.Equal(
            DateTimeOffset.Parse("2026-02-03T04:05:06Z", CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind).UtcDateTime,
            query.To?.UtcDateTime);
        Assert.Equal(7, query.Limit);
        Assert.Equal("Y3Vyc29yLTE=", query.Cursor);
    }

    // Negative control on the test above: absent parameters must arrive as NULL, not as empty strings.
    // An endpoint reading `request.Query["eventType"].ToString()` yields "" for a missing key, the
    // reader appends `AND "eventType" = ''`, and the auditor gets a permanently empty page with a 200.
    [Fact]
    public async Task OmittedParameters_ArriveAsNull_WithLimitDefaultedTo50()
    {
        var reader = new FakeAuditEventReader();
        using var factory = new AuditApiFactory(reader);
        using var client = factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, Path);
        AddDevHeaders(request, FormMapsRoles.SuperAdmin);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var query = Assert.IsType<AuditEventQuery>(reader.LastQuery);
        Assert.Null(query.EventType);
        Assert.Null(query.ActorUserId);
        Assert.Null(query.SubjectType);
        Assert.Null(query.SubjectId);
        Assert.Null(query.SchoolId);
        Assert.Null(query.From);
        Assert.Null(query.To);
        Assert.Null(query.Cursor);
        Assert.Equal(50, query.Limit);
    }

    // -------------------------------------------------------------------------------------------
    // Failure mapping
    // -------------------------------------------------------------------------------------------

    // The cursor arrives straight off the query string, so a client can send anything. The reader
    // rejects a token it did not issue with ArgumentException (see IAuditEventReader); unmapped, that
    // is a 500 for what is unambiguously a caller error, and it alerts on-call for a typo'd URL.
    [Fact]
    public async Task MalformedCursor_Returns400_NotA500()
    {
        var reader = new FakeAuditEventReader
        {
            Throw = new ArgumentException("bad cursor", nameof(AuditEventQuery.Cursor)),
        };
        using var factory = new AuditApiFactory(reader);
        using var client = factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, $"{Path}?cursor=not-a-cursor");
        AddDevHeaders(request, FormMapsRoles.SuperAdmin);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(body.RootElement.GetProperty("success").GetBoolean());
        // The rejected value is attacker-controlled and error bodies are logged; it must not be echoed.
        Assert.DoesNotContain("not-a-cursor", body.RootElement.GetRawText(), StringComparison.Ordinal);
    }

    // Second blast-radius control: ArgumentException is a BASE type (ArgumentNullException and
    // ArgumentOutOfRangeException both derive from it), so `catch (ArgumentException)` alone would
    // relabel an internal contract violation anywhere below this endpoint as the caller's bad cursor.
    // Only the documented cursor rejection is a 400.
    [Fact]
    public async Task ArgumentExceptionAboutSomethingOtherThanTheCursor_IsNotReportedAsA400()
    {
        var reader = new FakeAuditEventReader
        {
            Throw = new ArgumentNullException("someInternalDependency"),
        };
        using var factory = new AuditApiFactory(reader);
        using var client = factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, Path);
        AddDevHeaders(request, FormMapsRoles.SuperAdmin);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    // Blast-radius control on the test above. Mapping the malformed cursor with `catch (Exception)`
    // would also convert a dead database into "400 Bad Request", telling an auditor their query was
    // wrong when in fact the audit trail is unreachable — the one lie this endpoint must never tell.
    // Measured, not assumed: the fault surfaces as 500 in both environments (Development falls through
    // to the framework's exception page, production to UseFormMapsApiSecurity's JSON handler).
    [Fact]
    public async Task ReaderFailure_IsNotSwallowedAsA400()
    {
        var reader = new FakeAuditEventReader
        {
            Throw = new InvalidOperationException("audit_events is unreachable"),
        };
        using var factory = new AuditApiFactory(reader);
        using var client = factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, Path);
        AddDevHeaders(request, FormMapsRoles.SuperAdmin);

        var response = await client.SendAsync(request);

        // 500, not 400 and not an empty 200. (Development has no custom exception handler, so this is
        // the framework page; production's UseFormMapsApiSecurity handler returns the same status with
        // a JSON body. Either way the caller learns the trail is unreachable.)
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    // -------------------------------------------------------------------------------------------

    private static void AddDevHeaders(HttpRequestMessage request, string role)
    {
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "user-admin-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "admin@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Test Admin");
    }

    private sealed class AuditApiFactory(FakeAuditEventReader reader) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IAuditEventReader>();
                services.AddSingleton<IAuditEventReader>(reader);
            });
        }
    }

    private sealed class FakeAuditEventReader : IAuditEventReader
    {
        public AuditEventPage Page { get; init; } = new([], null);

        public Exception? Throw { get; init; }

        public int QueryCalls { get; private set; }

        public AuditEventQuery? LastQuery { get; private set; }

        public Task<AuditEventPage> QueryAsync(AuditEventQuery query, CancellationToken cancellationToken = default)
        {
            QueryCalls++;
            LastQuery = query;

            return Throw is null
                ? Task.FromResult(Page)
                : Task.FromException<AuditEventPage>(Throw);
        }
    }
}
