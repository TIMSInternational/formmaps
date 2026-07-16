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
/// Guard chain + shape for the self-scoped timeline reads (RequireIdentity only, NO subscription):
/// GET /api/v1/assessments/me/timeline and /me/timeline/stats. Verifies self-scoping (caller id),
/// the JSON score-omission on non-pca events, and pagination flow.
/// </summary>
public class AssessmentTimelineEndpointsTests
{
    private const string CallerUserId = "user-123";

    [Fact]
    public async Task Timeline_denies_anonymous_before_read()
    {
        var reader = new FakeReader();
        using var f = new Factory(reader);
        using var c = f.CreateClient();
        var r = await c.GetAsync("/api/v1/assessments/me/timeline");
        Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode);
        Assert.Equal(0, reader.CallCount);
    }

    [Fact]
    public async Task Timeline_returns_events_self_scoped_with_score_omission()
    {
        var reader = new FakeReader();
        using var f = new Factory(reader);
        using var c = f.CreateClient();
        using var req = Build("/api/v1/assessments/me/timeline?page=1&limit=50");
        var r = await c.SendAsync(req);

        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal(CallerUserId, reader.LastUserId); // self-scoped
        var data = (await Json(r)).GetProperty("data");
        var events = data.GetProperty("events");
        Assert.Equal(2, events.GetArrayLength());

        // Event 0 = pca (date 3) has score + metadata{sessionId,examType}; event 1 = evaluation, NO score.
        var pca = events[0];
        Assert.Equal("mil", pca.GetProperty("type").GetString());
        Assert.True(pca.TryGetProperty("score", out _));
        Assert.EndsWith("Z", pca.GetProperty("date").GetString());
        Assert.Equal("s1", pca.GetProperty("metadata").GetProperty("sessionId").GetString());

        var eval = events[1];
        Assert.Equal("evaluation", eval.GetProperty("type").GetString());
        Assert.False(eval.TryGetProperty("score", out _)); // omitted on non-pca

        Assert.Equal(2, data.GetProperty("total").GetInt32());
        Assert.Equal(1, data.GetProperty("summary").GetProperty("pca").GetInt32());
    }

    [Fact]
    public async Task Stats_returns_aggregate_self_scoped()
    {
        var reader = new FakeReader();
        using var f = new Factory(reader);
        using var c = f.CreateClient();
        using var req = Build("/api/v1/assessments/me/timeline/stats");
        var r = await c.SendAsync(req);

        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal(CallerUserId, reader.LastUserId);
        var data = (await Json(r)).GetProperty("data");
        Assert.True(data.TryGetProperty("overallCompletion", out _));
        Assert.Equal(5, data.GetProperty("assessmentBreakdown").GetProperty("pca").GetProperty("total").GetInt32());
    }

    private static async Task<JsonElement> Json(HttpResponseMessage r) =>
        JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement;

    private static HttpRequestMessage Build(string path)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, path);
        req.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, CallerUserId);
        req.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.Student);
        req.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "user@example.test");
        req.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Test User");
        req.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.ProfileRead);
        return req;
    }

    private sealed class Factory(FakeReader reader) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IAssessmentTimelineReader>();
                services.AddSingleton<IAssessmentTimelineReader>(reader);
            });
        }
    }

    private sealed class FakeReader : IAssessmentTimelineReader
    {
        public int CallCount { get; private set; }

        public string? LastUserId { get; private set; }

        public Task<TimelineSources> ReadSourcesAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastUserId = userId;
            var pca = new[] { new PcaTimelineRow("s1", "Pattern", "PatternRecognition", true, 90, new DateTime(2026, 6, 3, 0, 0, 0, DateTimeKind.Utc)) };
            var evals = new[] { new EvalTimelineRow("e1", "peer", "Ms. Ruiz", false, new DateTime(2026, 6, 2, 0, 0, 0, DateTimeKind.Utc)) };
            return Task.FromResult(new TimelineSources(pca, evals, []));
        }
    }
}
