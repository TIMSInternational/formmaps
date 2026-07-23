using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Counselor;

/// <summary>
/// Guard + clamp + notes-resolution + result mapping for the counselor sessions GET/complete (FM-DOTNET-071; repo
/// faked). Pins: anonymous → 401; missing counselor:sessions → 403; the { data, total, page, limit, totalPages }
/// envelope + row shape (nested student{name} + studentName, verbatim calendarEventIds jsonb); limit clamp
/// (min(50,…)/default 20) + status forwarding; the complete notes resolution (counselorNotes ?? notes ?? "" →
/// non-string "" → slice 5000); NotYourSession → 403 "Not your session"; malformed body → 500.
/// </summary>
public class CounselorSessionsEndpointsTests
{
    private const string ListPath = "/api/v1/counselor/me/sessions";
    private const string CompletePath = "/api/v1/counselor/me/sessions/sess1/complete";

    [Theory]
    [InlineData(ListPath, "GET")]
    [InlineData(CompletePath, "PUT")]
    public async Task Anonymous_is_401(string path, string method)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path))).StatusCode);
    }

    [Fact]
    public async Task Missing_permission_is_403()
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, ListPath, permission: FormMapsPermissions.ReportsRead);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Get_envelope_and_row_shape()
    {
        var repo = new FakeRepo { Page = new SessionsPage([SampleSession("sess1", "Alice")], Total: 3) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, ListPath + "?limit=2");
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(3, data.GetProperty("total").GetInt32());
        Assert.Equal(2, data.GetProperty("totalPages").GetInt32()); // ceil(3/2)
        var row = data.GetProperty("data")[0];
        Assert.Equal("sess1", row.GetProperty("id").GetString());
        Assert.Equal("Alice", row.GetProperty("studentName").GetString());
        Assert.Equal("Alice", row.GetProperty("student").GetProperty("name").GetString());
        Assert.Equal("ev1", row.GetProperty("calendarEventIds").GetProperty("a").GetString()); // verbatim jsonb
    }

    [Theory]
    [InlineData("?limit=999", 50)]
    [InlineData("?limit=abc", 20)]
    [InlineData("", 20)]
    public async Task Limit_is_clamped(string query, int expected)
    {
        var repo = new FakeRepo();
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        await Send(client, HttpMethod.Get, ListPath + query);
        Assert.Equal(expected, repo.LastLimit);
    }

    [Theory]
    [InlineData("?page=3", 3)]
    [InlineData("?page=abc", 1)] // NaN → 1
    [InlineData("?page=0", 1)]   // 0 is falsy → 1
    [InlineData("", 1)]
    public async Task Page_is_clamped_and_echoed(string query, int expected)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, ListPath + query);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(expected, doc.RootElement.GetProperty("data").GetProperty("page").GetInt32());
    }

    [Theory]
    [InlineData("?status=confirmed", "confirmed")]
    [InlineData("?status=all", "all")]   // repo decides to ignore "all"
    [InlineData("", null)]
    public async Task Status_is_forwarded(string query, string? expected)
    {
        var repo = new FakeRepo();
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        await Send(client, HttpMethod.Get, ListPath + query);
        Assert.Equal(expected, repo.LastStatusFilter);
    }

    [Theory]
    [InlineData("""{"counselorNotes":"hello"}""", "hello")]
    [InlineData("""{"notes":"fromNotes"}""", "fromNotes")]              // counselorNotes absent → notes
    [InlineData("""{"counselorNotes":null,"notes":"x"}""", "x")]        // ?? skips null
    [InlineData("""{"counselorNotes":5}""", "")]                        // non-string → ""
    [InlineData("""{"counselorNotes":""}""", "")]                       // empty string present → "" (nullish keeps it)
    [InlineData("""{}""", "")]                                          // both absent → ""
    public async Task Complete_resolves_notes(string body, string expected)
    {
        var repo = new FakeRepo { CompleteResult = CompleteResult.Ok };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        await Send(client, HttpMethod.Put, CompletePath, body: body);
        Assert.Equal(expected, repo.LastNotes);
    }

    [Fact]
    public async Task Complete_truncates_notes_to_5000()
    {
        var repo = new FakeRepo { CompleteResult = CompleteResult.Ok };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var big = new string('x', 6000);
        await Send(client, HttpMethod.Put, CompletePath, body: $$"""{"counselorNotes":"{{big}}"}""");
        Assert.Equal(5000, repo.LastNotes!.Length);
    }

    [Fact]
    public async Task Complete_not_your_session_is_403()
    {
        var repo = new FakeRepo { CompleteResult = CompleteResult.NotYourSession };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, CompletePath, body: "{}");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not your session", doc.RootElement.GetProperty("message").GetString());
    }

    [Theory]
    [InlineData("5")]
    [InlineData("{\"a\":")]
    public async Task Complete_malformed_or_primitive_body_is_500(string body)
    {
        var repo = new FakeRepo { CompleteResult = CompleteResult.Ok };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, CompletePath, body: body);
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    // ---- helpers ----

    private static SessionRow SampleSession(string id, string? studentName)
    {
        using var doc = JsonDocument.Parse("""{"a":"ev1"}""");
        return new SessionRow(id, "counselor-1", "s1", "2026-01-01T00:00:00.000Z", "2026-01-01T01:00:00.000Z",
            "confirmed", "topic", "notes", "cnotes", "link", doc.RootElement.Clone(), "", null, null, null,
            true, null, "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z", studentName);
    }

    private static Task<HttpResponseMessage> Send(
        HttpClient client, HttpMethod method, string path, string? body = null,
        string permission = FormMapsPermissions.CounselorSessions, string role = FormMapsRoles.Counselor)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "counselor-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "c@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Counselor");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permission);
        if (body is not null)
        {
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        }

        return client.SendAsync(request);
    }

    private sealed class Factory(FakeRepo repo) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ICounselorSessionsRepository>();
                services.AddSingleton<ICounselorSessionsRepository>(repo);
            });
        }
    }

    private sealed class FakeRepo : ICounselorSessionsRepository
    {
        public SessionsPage Page { get; init; } = new([], 0);
        public CompleteResult CompleteResult { get; init; } = CompleteResult.Ok;

        public string? LastStatusFilter { get; private set; }
        public int LastLimit { get; private set; }
        public string? LastNotes { get; private set; }

        public Task<SessionsPage> ListAsync(
            RequestContext context, string counselorId, string? statusFilter, int page, int limit,
            CancellationToken cancellationToken = default)
        {
            LastStatusFilter = statusFilter;
            LastLimit = limit;
            return Task.FromResult(Page);
        }

        public Task<CompleteResult> CompleteAsync(
            RequestContext context, string counselorId, string sessionId, string counselorNotes,
            CancellationToken cancellationToken = default)
        {
            LastNotes = counselorNotes;
            return Task.FromResult(CompleteResult);
        }
    }
}
