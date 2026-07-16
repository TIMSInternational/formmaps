using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Guard chain + shape for GET /api/pcaexam/all-results: RequireIdentity -> RequireSubscription ->
/// ADMIN_ROLES gate (403 before any DB read) -> double-nested {data:{data,total,page,limit,totalPages}}.
/// Verifies JS-parseInt pagination flows to the reader and non-admins never touch the DB.
/// </summary>
public class ExamAllResultsEndpointsTests
{
    [Fact]
    public async Task Denies_anonymous()
    {
        var reader = new FakeReader();
        using var f = new Factory(new FakeSub(true), reader);
        using var c = f.CreateClient();
        var r = await c.GetAsync("/api/pcaexam/all-results");
        Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode);
        Assert.Equal(0, reader.CallCount);
    }

    [Theory]
    [InlineData(FormMapsRoles.Student)]
    [InlineData(FormMapsRoles.Counselor)] // counselor is NOT in ADMIN_ROLES
    public async Task Non_admin_is_403_and_skips_read(string role)
    {
        var reader = new FakeReader();
        using var f = new Factory(new FakeSub(true), reader);
        using var c = f.CreateClient();
        using var req = Build(role, "/api/pcaexam/all-results");
        var r = await c.SendAsync(req);
        Assert.Equal(HttpStatusCode.Forbidden, r.StatusCode);
        Assert.Equal(0, reader.CallCount);
        using var doc = JsonDocument.Parse(await r.Content.ReadAsStringAsync());
        Assert.Equal("Admin access required", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Admin_gets_double_nested_envelope_with_pagination()
    {
        var reader = new FakeReader(total: 45);
        using var f = new Factory(new FakeSub(true), reader);
        using var c = f.CreateClient();
        using var req = Build(FormMapsRoles.SchoolAdmin, "/api/pcaexam/all-results?page=2&limit=20");
        var r = await c.SendAsync(req);

        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal(20, reader.LastSkip);  // (page 2 - 1) * 20
        Assert.Equal(20, reader.LastLimit);

        using var doc = JsonDocument.Parse(await r.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(45, data.GetProperty("total").GetInt32());
        Assert.Equal(2, data.GetProperty("page").GetInt32());
        Assert.Equal(20, data.GetProperty("limit").GetInt32());
        Assert.Equal(3, data.GetProperty("totalPages").GetInt32()); // ceil(45/20)
        var inner = data.GetProperty("data"); // double-nested rows array
        Assert.Equal(1, inner.GetArrayLength());
        Assert.EndsWith("Z", inner[0].GetProperty("startTime").GetString()); // ISO-Z full row
        Assert.True(inner[0].TryGetProperty("violationCount", out _)); // full row (not synthesized)
    }

    [Fact]
    public async Task Defaults_when_no_query_params()
    {
        var reader = new FakeReader(total: 0);
        using var f = new Factory(new FakeSub(true), reader);
        using var c = f.CreateClient();
        using var req = Build(FormMapsRoles.SuperAdmin, "/api/pcaexam/all-results");
        var r = await c.SendAsync(req);

        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal(0, reader.LastSkip);   // page defaults to 1
        Assert.Equal(20, reader.LastLimit); // limit defaults to 20
        using var doc = JsonDocument.Parse(await r.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(0, data.GetProperty("total").GetInt32());
        Assert.Equal(0, data.GetProperty("totalPages").GetInt32()); // ceil(0/20)=0
    }

    private static HttpRequestMessage Build(string role, string path)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, path);
        req.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "user-123");
        req.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        req.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "u@example.test");
        req.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "T");
        req.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.ProfileRead);
        req.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, "school-1");
        return req;
    }

    private sealed class Factory(FakeSub sub, FakeReader reader) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISubscriptionGuard>();
                services.AddSingleton<ISubscriptionGuard>(sub);
                services.RemoveAll<IAllResultsReader>();
                services.AddSingleton<IAllResultsReader>(reader);
            });
        }
    }

    private sealed class FakeSub(bool allow) : ISubscriptionGuard
    {
        public Task<GuardDecision> RequireSubscriptionAsync(RequestContext c, CancellationToken t = default) =>
            Task.FromResult(allow ? GuardDecision.Allow() : GuardDecision.Deny(403, "SUBSCRIPTION_REQUIRED", "x"));
    }

    private sealed class FakeReader(int total = 0) : IAllResultsReader
    {
        public int CallCount { get; private set; }

        public int LastSkip { get; private set; } = -1;

        public int LastLimit { get; private set; } = -1;

        public Task<AllResultsPage> ReadAsync(RequestContext context, int skip, int limit, CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastSkip = skip;
            LastLimit = limit;
            using var empty = JsonDocument.Parse("[]");
            var row = new PcaHistorySession(
                "s1", "feature-detection-001", "u1", "Real", "PatternRecognition",
                "2026-06-01T00:00:00.000Z", "2026-06-01T00:10:00.000Z", 600, 10, 10, 7, 3, 0, 70, 70,
                false, true, "Completed", empty.RootElement.Clone(), 0, false, true, null,
                "2026-06-01T00:00:00.000Z", null, "2026-06-01T00:10:00.000Z");
            return Task.FromResult(new AllResultsPage([row], total));
        }
    }
}
