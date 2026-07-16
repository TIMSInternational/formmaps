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

public class EvaluationReportEndpointsTests
{
    private const string CallerUserId = "user-123";
    private const string SessionId = "group-session-1";

    [Fact]
    public async Task EvaluationReport_denies_anonymous_requests()
    {
        var reader = new FakeEvaluationReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new EvaluationReportApiFactory(reader, guard);
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"/api/v1/reports/evaluation/{SessionId}");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, reader.ResolveCallCount);
        Assert.Equal(0, guard.CallCount);
        Assert.Equal(0, reader.ReadCallCount);
    }

    [Fact]
    public async Task EvaluationReport_returns_not_found_when_group_missing()
    {
        // A missing group must NOT trigger the access check and must yield the uniform 404 —
        // legacy leaks existence with a distinct "Evaluation group not found" message; we do not.
        var reader = new FakeEvaluationReportReader { GroupMissing = true };
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new EvaluationReportApiFactory(reader, guard);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            sessionId: SessionId,
            role: FormMapsRoles.SuperAdmin,
            schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(1, reader.ResolveCallCount);
        Assert.Equal(SessionId, reader.LastSessionId);
        Assert.Equal(0, guard.CallCount);
        Assert.Equal(0, reader.ReadCallCount);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(document.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task EvaluationReport_returns_not_found_when_access_denied()
    {
        // Access is gated on the group's evaluatedUserId, NOT the sessionId, and the detail read
        // must be skipped when denied.
        var reader = new FakeEvaluationReportReader();
        var guard = new FakeUserAccessGuard(allow: false);
        using var factory = new EvaluationReportApiFactory(reader, guard);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            sessionId: SessionId,
            role: FormMapsRoles.Student,
            schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(1, reader.ResolveCallCount);
        Assert.Equal(1, guard.CallCount);
        Assert.Equal(FakeEvaluationReportReader.EvaluatedUserId, guard.LastTargetUserId);
        Assert.Equal(0, reader.ReadCallCount);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(document.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task EvaluationReport_returns_report_for_self_access()
    {
        var reader = new FakeEvaluationReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new EvaluationReportApiFactory(reader, guard);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            sessionId: SessionId,
            role: FormMapsRoles.Student,
            schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, reader.ResolveCallCount);
        Assert.Equal(1, guard.CallCount);
        Assert.Equal(FakeEvaluationReportReader.EvaluatedUserId, guard.LastTargetUserId);
        Assert.Equal(1, reader.ReadCallCount);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.True(root.GetProperty("success").GetBoolean());

        var data = root.GetProperty("data");
        Assert.Equal("group-1", data.GetProperty("groupId").GetString());
        Assert.Equal(FakeEvaluationReportReader.EvaluatedUserId, data.GetProperty("studentId").GetString());
        Assert.Equal("Sam Student", data.GetProperty("studentName").GetString());
        Assert.Equal("Ms. Rivera", data.GetProperty("evaluatorName").GetString());
        Assert.Equal("teacher", data.GetProperty("groupType").GetString());
        Assert.Equal("mentor", data.GetProperty("relation").GetString());
        Assert.True(data.GetProperty("isCompleted").GetBoolean());
        Assert.True(data.TryGetProperty("completedDate", out _));
        Assert.True(data.TryGetProperty("generatedAt", out _));

        var feedback = data.GetProperty("feedback");
        Assert.Equal(2, feedback.GetArrayLength());

        var first = feedback[0];
        Assert.Equal("feedback-1", first.GetProperty("id").GetString());
        // Parity-critical: averageRating is a JSON STRING (Prisma Decimal? -> decimal.js toString).
        Assert.Equal(JsonValueKind.String, first.GetProperty("averageRating").ValueKind);
        Assert.Equal("4.5", first.GetProperty("averageRating").GetString());
        Assert.Equal(10, first.GetProperty("totalQuestions").GetInt32());
        Assert.Equal(10, first.GetProperty("answeredQuestions").GetInt32());
        // Parity-critical: feedbackItems is raw jsonb passed through as a JSON array, not a string.
        Assert.Equal(JsonValueKind.Array, first.GetProperty("feedbackItems").ValueKind);
        Assert.Equal("Leadership", first.GetProperty("feedbackItems")[0].GetProperty("q").GetString());
        Assert.Equal(JsonValueKind.String, first.GetProperty("completedAt").ValueKind);

        // Sensitive columns must NEVER appear on the group data or feedback entries.
        Assert.False(data.TryGetProperty("evaluatorEmail", out _));
        Assert.False(data.TryGetProperty("invitationToken", out _));
        foreach (var entry in feedback.EnumerateArray())
        {
            Assert.False(entry.TryGetProperty("evaluatorEmail", out _));
            Assert.False(entry.TryGetProperty("isActive", out _));
        }
    }

    [Fact]
    public async Task EvaluationReport_serializes_null_average_rating_as_json_null()
    {
        var reader = new FakeEvaluationReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new EvaluationReportApiFactory(reader, guard);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            sessionId: SessionId,
            role: FormMapsRoles.Student,
            schoolId: null);

        var response = await client.SendAsync(request);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var second = document.RootElement.GetProperty("data").GetProperty("feedback")[1];

        // Null Decimal? -> JSON null, key present. Null completedAt -> JSON null, key present.
        Assert.Equal(JsonValueKind.Null, second.GetProperty("averageRating").ValueKind);
        Assert.Equal(JsonValueKind.Null, second.GetProperty("completedAt").ValueKind);
        Assert.Equal(JsonValueKind.Array, second.GetProperty("feedbackItems").ValueKind);
    }

    [Fact]
    public async Task EvaluationReport_returns_report_for_privileged_caller_when_access_granted()
    {
        var reader = new FakeEvaluationReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new EvaluationReportApiFactory(reader, guard);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            sessionId: SessionId,
            role: FormMapsRoles.Counselor,
            schoolId: "school-123");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, reader.ReadCallCount);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(document.RootElement.GetProperty("success").GetBoolean());
    }

    private static HttpRequestMessage BuildAuthenticatedRequest(
        string sessionId,
        string role,
        string? schoolId)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/reports/evaluation/{sessionId}");
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

    private sealed class EvaluationReportApiFactory(
        FakeEvaluationReportReader reader,
        FakeUserAccessGuard guard) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IEvaluationReportReader>();
                services.AddSingleton<IEvaluationReportReader>(reader);
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

    private sealed class FakeEvaluationReportReader : IEvaluationReportReader
    {
        public const string EvaluatedUserId = "student-42";

        public int ResolveCallCount { get; private set; }

        public int ReadCallCount { get; private set; }

        public string? LastSessionId { get; private set; }

        public EvaluationGroupCore? LastGroup { get; private set; }

        public bool GroupMissing { get; init; }

        public Task<EvaluationGroupCore?> ResolveGroupAsync(
            RequestContext requestContext,
            string sessionId,
            CancellationToken cancellationToken = default)
        {
            ResolveCallCount++;
            LastSessionId = sessionId;

            if (GroupMissing)
            {
                return Task.FromResult<EvaluationGroupCore?>(null);
            }

            return Task.FromResult<EvaluationGroupCore?>(new EvaluationGroupCore(
                GroupId: "group-1",
                EvaluatedUserId: EvaluatedUserId,
                EvaluatorName: "Ms. Rivera",
                GroupType: "teacher",
                Relation: "mentor",
                IsCompleted: true,
                CompletedDate: new DateTimeOffset(2026, 6, 10, 0, 0, 0, TimeSpan.Zero)));
        }

        public Task<EvaluationReport> ReadReportAsync(
            RequestContext requestContext,
            EvaluationGroupCore group,
            CancellationToken cancellationToken = default)
        {
            ReadCallCount++;
            LastGroup = group;

            using var itemsDocument = JsonDocument.Parse("""[{"q":"Leadership","rating":5}]""");
            using var emptyDocument = JsonDocument.Parse("[]");

            var feedback = new List<EvaluationFeedbackEntry>
            {
                new(
                    Id: "feedback-1",
                    AverageRating: "4.5",
                    TotalQuestions: 10,
                    AnsweredQuestions: 10,
                    FeedbackItems: itemsDocument.RootElement.Clone(),
                    CompletedAt: new DateTimeOffset(2026, 6, 9, 0, 0, 0, TimeSpan.Zero)),
                new(
                    Id: "feedback-2",
                    AverageRating: null,
                    TotalQuestions: 8,
                    AnsweredQuestions: 0,
                    FeedbackItems: emptyDocument.RootElement.Clone(),
                    CompletedAt: null),
            };

            var report = new EvaluationReport(
                GroupId: group.GroupId,
                StudentId: group.EvaluatedUserId,
                StudentName: "Sam Student",
                EvaluatorName: group.EvaluatorName,
                GroupType: group.GroupType,
                Relation: group.Relation,
                IsCompleted: group.IsCompleted,
                CompletedDate: group.CompletedDate,
                Feedback: feedback,
                GeneratedAt: new DateTimeOffset(2026, 7, 15, 12, 0, 0, TimeSpan.Zero));

            return Task.FromResult(report);
        }
    }
}
