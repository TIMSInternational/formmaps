using System.Net;
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
/// Guard + clamp + arg-forwarding + result mapping for the counselor alerts GET/PUT (FM-DOTNET-070; repo faked). Pins:
/// anonymous → 401; missing alerts:read → 403; the { data, total, page, limit, totalPages } envelope; page/limit clamp
/// (min(100,…)/default 50; page default 1) echoed + totalPages; ?studentId / ?unreadOnly forwarding to the repo; and
/// the PUT result mapping (AlertNotFound → 404 "Alert not found"; NotAssigned → 404 "Not found"; Ok → 200 success).
/// </summary>
public class CounselorAlertsEndpointsTests
{
    private const string ListPath = "/api/v1/counselor/me/alerts";
    private const string ReadPath = "/api/v1/counselor/me/alerts/al1/read";

    [Theory]
    [InlineData(ListPath, "GET")]
    [InlineData(ReadPath, "PUT")]
    public async Task Anonymous_is_401(string path, string method)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var req = new HttpRequestMessage(new HttpMethod(method), path);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(req)).StatusCode);
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
        var repo = new FakeRepo { Page = new AlertsPage([SampleAlert("al1"), SampleAlert("al2")], Total: 5) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, ListPath + "?limit=2");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(5, data.GetProperty("total").GetInt32());
        Assert.Equal(2, data.GetProperty("limit").GetInt32());
        Assert.Equal(3, data.GetProperty("totalPages").GetInt32()); // ceil(5/2)
        var row = data.GetProperty("data")[0];
        Assert.Equal("al1", row.GetProperty("id").GetString());
        Assert.Equal("high", row.GetProperty("severity").GetString());
        Assert.Equal("s1", row.GetProperty("studentId").GetString());
    }

    [Theory]
    [InlineData("?limit=999", 100)]
    [InlineData("?limit=abc", 50)]
    [InlineData("?limit=0", 50)]
    [InlineData("", 50)]
    public async Task Limit_is_clamped(string query, int expected)
    {
        var repo = new FakeRepo();
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        await Send(client, HttpMethod.Get, ListPath + query);
        Assert.Equal(expected, repo.LastLimit);
    }

    [Fact]
    public async Task StudentId_and_unreadOnly_are_forwarded()
    {
        var repo = new FakeRepo();
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        await Send(client, HttpMethod.Get, ListPath + "?studentId=s9&unreadOnly=true");
        Assert.Equal("s9", repo.LastStudentIdFilter);
        Assert.True(repo.LastUnreadOnly);

        await Send(client, HttpMethod.Get, ListPath + "?unreadOnly=false");
        Assert.Null(repo.LastStudentIdFilter); // absent → null
        Assert.False(repo.LastUnreadOnly);      // "false" → false
    }

    [Theory]
    [InlineData(MarkReadResult.AlertNotFound, HttpStatusCode.NotFound, "Alert not found")]
    [InlineData(MarkReadResult.NotAssigned, HttpStatusCode.NotFound, "Not found")]
    public async Task Put_error_mapping(MarkReadResult result, HttpStatusCode status, string message)
    {
        var repo = new FakeRepo { MarkResult = result };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, ReadPath);
        Assert.Equal(status, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(message, doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Put_ok_returns_success()
    {
        var repo = new FakeRepo { MarkResult = MarkReadResult.Ok };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, ReadPath);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("al1", repo.LastAlertId);
    }

    // ---- helpers ----

    private static AlertRow SampleAlert(string id) => new(
        id, "school-1", "s1", null, "academic", "high", "Title", "A message", null, false, false, null, null, null,
        true, null, "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z");

    private static Task<HttpResponseMessage> Send(
        HttpClient client, HttpMethod method, string path,
        string permission = FormMapsPermissions.AlertsRead, string role = FormMapsRoles.Counselor)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "counselor-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "c@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Counselor");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permission);
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeRepo repo) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ICounselorAlertsRepository>();
                services.AddSingleton<ICounselorAlertsRepository>(repo);
            });
        }
    }

    private sealed class FakeRepo : ICounselorAlertsRepository
    {
        public AlertsPage Page { get; init; } = new([], 0);
        public MarkReadResult MarkResult { get; init; } = MarkReadResult.Ok;

        public string? LastStudentIdFilter { get; private set; }
        public bool LastUnreadOnly { get; private set; }
        public int LastLimit { get; private set; }
        public string? LastAlertId { get; private set; }

        public Task<AlertsPage> ListAsync(
            RequestContext context, string counselorId, string? studentIdFilter, bool unreadOnly, int page, int limit,
            CancellationToken cancellationToken = default)
        {
            LastStudentIdFilter = studentIdFilter;
            LastUnreadOnly = unreadOnly;
            LastLimit = limit;
            return Task.FromResult(Page);
        }

        public Task<MarkReadResult> MarkReadAsync(
            RequestContext context, string counselorId, string alertId, CancellationToken cancellationToken = default)
        {
            LastAlertId = alertId;
            return Task.FromResult(MarkResult);
        }
    }
}
