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
/// Guard chain + heterogeneous shape for GET /api/pcaexam/history/{userId}: canAccessUser + a
/// {sessions,latest} payload where real rows are full (carry violationCount) and synthesized LIA rows
/// are partial (do NOT). Verifies STJ serializes the List&lt;object&gt; by runtime type.
/// </summary>
public class ExamHistoryEndpointsTests
{
    private const string TargetUserId = "student-7";

    [Fact]
    public async Task Denies_anonymous()
    {
        var reader = new FakeReader();
        using var f = new Factory(new FakeSub(true), new FakeAccess(true), reader);
        using var c = f.CreateClient();
        var r = await c.GetAsync($"/api/pcaexam/history/{TargetUserId}");
        Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode);
        Assert.Equal(0, reader.CallCount);
    }

    [Fact]
    public async Task Access_denied_is_not_found_and_skips_read()
    {
        var reader = new FakeReader();
        using var f = new Factory(new FakeSub(true), new FakeAccess(false), reader);
        using var c = f.CreateClient();
        using var req = Build(FormMapsRoles.Student);
        var r = await c.SendAsync(req);
        Assert.Equal(HttpStatusCode.NotFound, r.StatusCode);
        Assert.Equal(0, reader.CallCount);
    }

    [Fact]
    public async Task Returns_heterogeneous_sessions_and_latest()
    {
        var reader = new FakeReader();
        using var f = new Factory(new FakeSub(true), new FakeAccess(true), reader);
        using var c = f.CreateClient();
        using var req = Build(FormMapsRoles.Counselor);
        var r = await c.SendAsync(req);

        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal(TargetUserId, reader.LastUserId);
        using var doc = JsonDocument.Parse(await r.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        var sessions = data.GetProperty("sessions");
        Assert.Equal(6, sessions.GetArrayLength()); // 5 synth + 1 real

        // synth row (first) is partial: has scorePercentage, NO violationCount.
        var synth = sessions[0];
        Assert.Equal("lia-lia1-pattern_recognition", synth.GetProperty("id").GetString());
        Assert.False(synth.TryGetProperty("violationCount", out _));
        Assert.False(synth.TryGetProperty("isActive", out _));

        // real row (last) is full: carries violationCount + isActive.
        var real = sessions[5];
        Assert.True(real.TryGetProperty("violationCount", out _));
        Assert.True(real.TryGetProperty("isActive", out _));
        Assert.EndsWith("Z", real.GetProperty("startTime").GetString()); // ISO-Z, not +00:00

        Assert.Equal(5, data.GetProperty("latest").GetArrayLength()); // synth wins the shared examId
    }

    private static HttpRequestMessage Build(string role)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, $"/api/pcaexam/history/{TargetUserId}");
        req.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "user-123");
        req.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        req.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "u@example.test");
        req.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "T");
        req.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.ProfileRead);
        req.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, "school-1");
        return req;
    }

    private sealed class Factory(FakeSub sub, FakeAccess access, FakeReader reader) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISubscriptionGuard>();
                services.AddSingleton<ISubscriptionGuard>(sub);
                services.RemoveAll<IUserAccessGuard>();
                services.AddSingleton<IUserAccessGuard>(access);
                services.RemoveAll<IExamHistoryReader>();
                services.AddSingleton<IExamHistoryReader>(reader);
            });
        }
    }

    private sealed class FakeSub(bool allow) : ISubscriptionGuard
    {
        public Task<GuardDecision> RequireSubscriptionAsync(RequestContext c, CancellationToken t = default) =>
            Task.FromResult(allow ? GuardDecision.Allow() : GuardDecision.Deny(403, "SUBSCRIPTION_REQUIRED", "x"));
    }

    private sealed class FakeAccess(bool allow) : IUserAccessGuard
    {
        public Task<bool> CanAccessUserAsync(RequestContext c, string t, CancellationToken ct = default) => Task.FromResult(allow);
    }

    private sealed class FakeReader : IExamHistoryReader
    {
        public int CallCount { get; private set; }

        public string? LastUserId { get; private set; }

        public Task<ExamHistory> ReadAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastUserId = userId;
            using var empty = JsonDocument.Parse("[]");
            var real = new PcaHistorySession(
                "s1", "feature-detection-001", userId, "Real", "PatternRecognition",
                "2026-06-01T00:00:00.000Z", "2026-06-01T00:10:00.000Z", 600, 10, 10, 7, 3, 0, 70, 70,
                false, true, "Completed", empty.RootElement.Clone(), 0, false, true, null,
                "2026-06-01T00:00:00.000Z", null, "2026-06-01T00:10:00.000Z");
            var lia = new LiaHistorySource("lia1",
                new DateTime(2026, 7, 1, 8, 0, 0, DateTimeKind.Utc),
                new DateTime(2026, 7, 1, 8, 30, 0, DateTimeKind.Utc),
                Parse("""{"pattern_recognition":63,"verbal_reasoning":10,"numerical_speed":40,"working_memory":30,"visual_rotation":55}"""),
                Parse("{}"), Parse("{}"));
            return Task.FromResult(ExamHistorySynthesizer.Build(userId, [real], lia));
        }

        private static JsonElement Parse(string s)
        {
            using var d = JsonDocument.Parse(s);
            return d.RootElement.Clone();
        }
    }
}
