using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Reports;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Reports;

public class TimelineReportEndpointsTests
{
    private const string CallerUserId = "user-123";

    [Fact]
    public async Task TimelineReport_denies_anonymous_requests()
    {
        var reader = new FakeTimelineReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new TimelineReportApiFactory(reader, guard);
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"/api/v1/reports/timeline/{CallerUserId}");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, guard.CallCount);
        Assert.Equal(0, reader.CallCount);
    }

    [Fact]
    public async Task TimelineReport_returns_report_for_self_access()
    {
        var reader = new FakeTimelineReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new TimelineReportApiFactory(reader, guard);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            targetUserId: CallerUserId,
            role: FormMapsRoles.Student,
            schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, guard.CallCount);
        Assert.Equal(CallerUserId, guard.LastTargetUserId);
        Assert.Equal(CallerUserId, guard.LastCaller?.Actor?.UserId);
        Assert.Equal(1, reader.CallCount);
        Assert.Equal(CallerUserId, reader.LastTargetUserId);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.True(root.GetProperty("success").GetBoolean());

        var data = root.GetProperty("data");
        Assert.Equal("student-1", data.GetProperty("studentId").GetString());
        Assert.Equal("Ada Student", data.GetProperty("studentName").GetString());
        Assert.Equal(3, data.GetProperty("totalEvents").GetInt32());

        var summary = data.GetProperty("summary");
        Assert.Equal(1, summary.GetProperty("mil").GetInt32());
        Assert.Equal(1, summary.GetProperty("evaluations").GetInt32());
        Assert.Equal(1, summary.GetProperty("courses").GetInt32());

        var events = data.GetProperty("events");
        Assert.Equal(3, events.GetArrayLength());

        // Event[0] is the mil event (newest date) and must carry a score.
        var mil = events[0];
        Assert.Equal("mil", mil.GetProperty("type").GetString());
        Assert.Equal("MIL Cognitive", mil.GetProperty("title").GetString());
        Assert.Equal("completed", mil.GetProperty("status").GetString());
        Assert.True(mil.TryGetProperty("score", out var scoreEl));
        Assert.Equal(88.5, scoreEl.GetDouble());

        // Parity-critical: evaluation and course events must have NO "score" key (absent, not null).
        var evaluation = events.EnumerateArray().Single(e => e.GetProperty("type").GetString() == "evaluation");
        Assert.Equal("360° - Peer", evaluation.GetProperty("title").GetString());
        Assert.Equal("pending", evaluation.GetProperty("status").GetString());
        Assert.False(evaluation.TryGetProperty("score", out _));

        var course = events.EnumerateArray().Single(e => e.GetProperty("type").GetString() == "course");
        Assert.Equal("course-abc", course.GetProperty("title").GetString());
        Assert.False(course.TryGetProperty("score", out _));

        Assert.True(data.TryGetProperty("generatedAt", out _));
    }

    [Fact]
    public async Task TimelineReport_returns_not_found_when_non_privileged_reads_other_user()
    {
        var reader = new FakeTimelineReportReader();
        var guard = new FakeUserAccessGuard(allow: false);
        using var factory = new TimelineReportApiFactory(reader, guard);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            targetUserId: "other-user",
            role: FormMapsRoles.Student,
            schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(1, guard.CallCount);
        Assert.Equal("other-user", guard.LastTargetUserId);
        Assert.Equal(0, reader.CallCount);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(document.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task TimelineReport_returns_report_for_privileged_caller_when_access_granted()
    {
        var reader = new FakeTimelineReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new TimelineReportApiFactory(reader, guard);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            targetUserId: "other-user",
            role: FormMapsRoles.Counselor,
            schoolId: "school-123");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, guard.CallCount);
        Assert.Equal(1, reader.CallCount);
        Assert.Equal("other-user", reader.LastTargetUserId);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(document.RootElement.GetProperty("success").GetBoolean());
    }

    [Fact]
    public async Task TimelineReport_returns_not_found_when_target_user_missing()
    {
        var reader = new FakeTimelineReportReader { ReturnNull = true };
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new TimelineReportApiFactory(reader, guard);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            targetUserId: "ghost-user",
            role: FormMapsRoles.SuperAdmin,
            schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(1, guard.CallCount);
        Assert.Equal(1, reader.CallCount);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(document.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    private static HttpRequestMessage BuildAuthenticatedRequest(
        string targetUserId,
        string role,
        string? schoolId)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/reports/timeline/{targetUserId}");
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, CallerUserId);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "user@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Test User");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.ProfileRead);

        if (!string.IsNullOrWhiteSpace(schoolId))
        {
            request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, schoolId);
        }

        return request;
    }

    private sealed class TimelineReportApiFactory(
        FakeTimelineReportReader reader,
        FakeUserAccessGuard guard) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ITimelineReportReader>();
                services.AddSingleton<ITimelineReportReader>(reader);
                services.RemoveAll<IUserAccessGuard>();
                services.AddSingleton<IUserAccessGuard>(guard);
            });
        }
    }

    private sealed class FakeUserAccessGuard(bool allow) : IUserAccessGuard
    {
        public int CallCount { get; private set; }

        public RequestContext? LastCaller { get; private set; }

        public string? LastTargetUserId { get; private set; }

        public Task<bool> CanAccessUserAsync(
            RequestContext caller,
            string targetUserId,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastCaller = caller;
            LastTargetUserId = targetUserId;
            return Task.FromResult(allow);
        }
    }

    private sealed class FakeTimelineReportReader : ITimelineReportReader
    {
        public int CallCount { get; private set; }

        public RequestContext? LastContext { get; private set; }

        public string? LastTargetUserId { get; private set; }

        public bool ReturnNull { get; init; }

        public Task<TimelineReport?> ReadAsync(
            RequestContext requestContext,
            string targetUserId,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastContext = requestContext;
            LastTargetUserId = targetUserId;

            if (ReturnNull)
            {
                return Task.FromResult<TimelineReport?>(null);
            }

            var events = new List<TimelineEvent>
            {
                new(
                    Type: "mil",
                    Title: "MIL Cognitive",
                    Status: "completed",
                    Date: new DateTimeOffset(2026, 6, 3, 0, 0, 0, TimeSpan.Zero))
                {
                    Score = 88.5,
                },
                new(
                    Type: "evaluation",
                    Title: "360° - Peer",
                    Status: "pending",
                    Date: new DateTimeOffset(2026, 6, 2, 0, 0, 0, TimeSpan.Zero)),
                new(
                    Type: "course",
                    Title: "course-abc",
                    Status: "enrolled",
                    Date: new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero)),
            };

            var report = new TimelineReport(
                StudentId: "student-1",
                StudentName: "Ada Student",
                Events: events,
                TotalEvents: events.Count,
                Summary: new TimelineSummary(Mil: 1, Evaluations: 1, Courses: 1),
                GeneratedAt: new DateTimeOffset(2026, 7, 15, 12, 0, 0, TimeSpan.Zero));

            return Task.FromResult<TimelineReport?>(report);
        }
    }
}
