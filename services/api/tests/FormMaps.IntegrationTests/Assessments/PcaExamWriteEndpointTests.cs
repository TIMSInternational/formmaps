using System.Net;
using System.Net.Http.Json;
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
/// Guard chain + HTTP status/body mapping for the two pca-exam write endpoints (POST /exams/{id}/start,
/// POST /submit). The writer/reader/access-guard are faked (their DB behavior is proven by
/// PcaExamWriterTests); this pins the thin endpoint layer: anon -> 401 before work, subscription-required
/// -> 403 skips the write, self-scoped start, submit ownership via canAccessUser (a privileged role CAN
/// submit a scoped session, and the route's getSession-null -> "Session not found" vs canAccessUser-deny ->
/// "Not found"), and each PcaExamWriteStatus -> the exact legacy body.
/// </summary>
public class PcaExamWriteEndpointTests
{
    private const string CallerUserId = "user-123";
    private const string ExamId = "exam-1";
    private const string SessionId = "session-1";

    // ---------------------------------------------------------------- start

    [Fact]
    public async Task Start_denies_anonymous_before_the_write()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(new FakeSubscriptionGuard(allow: true), writer);
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync($"/api/pcaexam/exams/{ExamId}/start", new { });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, writer.StartCalls);
    }

    [Fact]
    public async Task Start_ok_returns_200_and_passes_self_id()
    {
        var writer = new FakeWriter
        {
            StartOutcome = new PcaExamStartOutcome(
                PcaExamWriteStatus.Ok,
                new ExamStartPayload(SessionId, ExamId, "Pattern", 5, 3, [])),
        };
        using var factory = new Factory(new FakeSubscriptionGuard(allow: true), writer);
        using var client = factory.CreateClient();

        // Even a privileged role starts its OWN session (self-scoped, like legacy startExamSession(req.userId)).
        var response = await Send(client, HttpMethod.Post, $"/api/pcaexam/exams/{ExamId}/start", "{}", FormMapsRoles.SchoolAdmin, "school-1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(CallerUserId, writer.LastStartUserId);
        Assert.Equal(ExamId, writer.LastStartExamId);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Pattern", doc.RootElement.GetProperty("data").GetProperty("examName").GetString());
    }

    [Fact]
    public async Task Start_retake_maps_to_409_exam_already_completed()
    {
        var writer = new FakeWriter { StartOutcome = new PcaExamStartOutcome(PcaExamWriteStatus.AlreadyCompleted, null) };
        using var factory = new Factory(new FakeSubscriptionGuard(allow: true), writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, $"/api/pcaexam/exams/{ExamId}/start", "{}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        await AssertMessage(response, "Exam already completed");
    }

    [Fact]
    public async Task Start_exam_not_found_maps_to_404_exam_not_found()
    {
        var writer = new FakeWriter { StartOutcome = new PcaExamStartOutcome(PcaExamWriteStatus.ExamNotFound, null) };
        using var factory = new Factory(new FakeSubscriptionGuard(allow: true), writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, $"/api/pcaexam/exams/{ExamId}/start", "{}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Exam not found");
    }

    [Fact]
    public async Task Start_subscription_required_skips_the_write()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(
            new FakeSubscriptionGuard(GuardDecision.Deny(403, "SUBSCRIPTION_REQUIRED", "denied")), writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, $"/api/pcaexam/exams/{ExamId}/start", "{}");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, writer.StartCalls);
    }

    // --------------------------------------------------------------- submit

    [Fact]
    public async Task Submit_denies_anonymous_before_any_work()
    {
        var writer = new FakeWriter();
        var reader = new FakeSessionReader { Session = Session("owner") };
        using var factory = new Factory(new FakeSubscriptionGuard(allow: true), writer, reader, new FakeAccessGuard(allow: true));
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/pcaexam/submit", new { sessionId = SessionId });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, reader.Calls);
        Assert.Equal(0, writer.SubmitCalls);
    }

    [Fact]
    public async Task Submit_missing_session_at_route_maps_to_404_session_not_found()
    {
        var writer = new FakeWriter();
        var reader = new FakeSessionReader { Session = null }; // getSession -> null
        using var factory = new Factory(new FakeSubscriptionGuard(allow: true), writer, reader, new FakeAccessGuard(allow: true));
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/pcaexam/submit", """{"sessionId":"session-1","answers":[]}""");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Session not found");
        Assert.Equal(0, writer.SubmitCalls); // never reached the writer
    }

    [Fact]
    public async Task Submit_access_denied_maps_to_404_not_found()
    {
        var writer = new FakeWriter();
        var reader = new FakeSessionReader { Session = Session("student-x") };
        var guard = new FakeAccessGuard(allow: false);
        using var factory = new Factory(new FakeSubscriptionGuard(allow: true), writer, reader, guard);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/pcaexam/submit", """{"sessionId":"session-1","answers":[]}""");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Not found"); // canAccessUser deny -> uniform "Not found" (NOT "Session not found")
        Assert.Equal("student-x", guard.LastTargetUserId); // ownership tested against the SESSION owner
        Assert.Equal(0, writer.SubmitCalls);
    }

    [Fact]
    public async Task Submit_ok_returns_200_and_a_privileged_role_can_submit_a_scoped_session()
    {
        var writer = new FakeWriter
        {
            SubmitOutcome = new PcaExamSubmitOutcome(PcaExamWriteStatus.Ok, new ExamSubmitResult(SessionId, 66.6, 2, 3, "Completed")),
        };
        var reader = new FakeSessionReader { Session = Session("student-x") };  // a foreign (scoped) session
        var guard = new FakeAccessGuard(allow: true);
        using var factory = new Factory(new FakeSubscriptionGuard(allow: true), writer, reader, guard);
        using var client = factory.CreateClient();

        var body = """{"sessionId":"session-1","timeTaken":42,"answers":[{"questionNumber":1,"answer":"1","timeSpent":30},{"questionNumber":2,"selectedAnswer":"9"}]}""";
        var response = await Send(client, HttpMethod.Post, "/api/pcaexam/submit", body, FormMapsRoles.Counselor);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(SessionId, writer.LastSubmitSessionId);
        Assert.Equal(42, writer.LastTimeTaken);
        Assert.Equal(2, writer.LastAnswers!.Count);
        Assert.Equal("1", writer.LastAnswers![0].UserAnswer);   // answer coalesced
        Assert.Equal(30, writer.LastAnswers![0].TimeSpent);
        Assert.Equal("9", writer.LastAnswers![1].UserAnswer);   // selectedAnswer coalesced
        Assert.Equal(0, writer.LastAnswers![1].TimeSpent);       // absent timeSpent -> 0
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, doc.RootElement.GetProperty("data").GetProperty("correct").GetInt32());
    }

    [Fact]
    public async Task Submit_already_completed_maps_to_409()
    {
        var response = await SubmitOutcome(new PcaExamSubmitOutcome(PcaExamWriteStatus.AlreadyCompleted, null));
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        await AssertMessage(response, "Exam already completed");
    }

    [Fact]
    public async Task Submit_exam_not_found_maps_to_404_exam_not_found()
    {
        var response = await SubmitOutcome(new PcaExamSubmitOutcome(PcaExamWriteStatus.ExamNotFound, null));
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Exam not found");
    }

    [Fact]
    public async Task Submit_writer_session_not_found_maps_to_404_session_not_found()
    {
        var response = await SubmitOutcome(new PcaExamSubmitOutcome(PcaExamWriteStatus.SessionNotFound, null));
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Session not found");
    }

    [Fact]
    public async Task Submit_subscription_required_skips_everything()
    {
        var writer = new FakeWriter();
        var reader = new FakeSessionReader { Session = Session("owner") };
        using var factory = new Factory(
            new FakeSubscriptionGuard(GuardDecision.Deny(403, "SUBSCRIPTION_REQUIRED", "denied")), writer, reader, new FakeAccessGuard(allow: true));
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/pcaexam/submit", """{"sessionId":"session-1"}""");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, reader.Calls);
        Assert.Equal(0, writer.SubmitCalls);
    }

    // ---------------------------------------------------------------- helpers

    private async Task<HttpResponseMessage> SubmitOutcome(PcaExamSubmitOutcome outcome)
    {
        var writer = new FakeWriter { SubmitOutcome = outcome };
        var reader = new FakeSessionReader { Session = Session(CallerUserId) };
        using var factory = new Factory(new FakeSubscriptionGuard(allow: true), writer, reader, new FakeAccessGuard(allow: true));
        using var client = factory.CreateClient();
        return await Send(client, HttpMethod.Post, "/api/pcaexam/submit", """{"sessionId":"session-1","answers":[]}""");
    }

    private static PcaHistorySession Session(string userId) => new(
        Id: SessionId, ExamId: ExamId, UserId: userId, ExamName: "Pattern", ExamType: "PatternRecognition",
        StartTime: "2026-01-01T00:00:00.000Z", EndTime: null, TotalTimeSpent: null, TotalQuestions: 3,
        QuestionsAnswered: 0, CorrectAnswers: 0, IncorrectAnswers: 0, UnansweredQuestions: 0,
        ScorePercentage: 0, AccuracyPercentage: 0, IsTimeExpired: false, IsCompleted: false, Status: "InProgress",
        Violations: JsonDocument.Parse("null").RootElement.Clone(), ViolationCount: 0, FlagForReview: false,
        IsActive: true, CreatedBy: null, CreatedDate: "2026-01-01T00:00:00.000Z", UpdatedBy: null,
        UpdatedAt: "2026-01-01T00:00:00.000Z");

    private static async Task AssertMessage(HttpResponseMessage response, string expected)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(expected, doc.RootElement.GetProperty("message").GetString());
    }

    private static Task<HttpResponseMessage> Send(
        HttpClient client, HttpMethod method, string path, string body, string role = "student", string? schoolId = null)
    {
        var request = new HttpRequestMessage(method, path)
        {
            Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json"),
        };
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, CallerUserId);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "user@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Test User");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.ProfileRead);
        if (!string.IsNullOrWhiteSpace(schoolId))
        {
            request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, schoolId);
        }

        return client.SendAsync(request);
    }

    private sealed class Factory : WebApplicationFactory<Program>
    {
        private readonly FakeSubscriptionGuard _subscription;
        private readonly FakeWriter _writer;
        private readonly FakeSessionReader? _reader;
        private readonly FakeAccessGuard? _accessGuard;

        public Factory(FakeSubscriptionGuard subscription, FakeWriter writer,
            FakeSessionReader? reader = null, FakeAccessGuard? accessGuard = null)
        {
            _subscription = subscription;
            _writer = writer;
            _reader = reader;
            _accessGuard = accessGuard;
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISubscriptionGuard>();
                services.AddSingleton<ISubscriptionGuard>(_subscription);
                services.RemoveAll<IPcaExamWriter>();
                services.AddSingleton<IPcaExamWriter>(_writer);
                if (_reader is not null)
                {
                    services.RemoveAll<IExamSessionReader>();
                    services.AddSingleton<IExamSessionReader>(_reader);
                }

                if (_accessGuard is not null)
                {
                    services.RemoveAll<IUserAccessGuard>();
                    services.AddSingleton<IUserAccessGuard>(_accessGuard);
                }
            });
        }
    }

    private sealed class FakeSubscriptionGuard : ISubscriptionGuard
    {
        private readonly GuardDecision _decision;

        public FakeSubscriptionGuard(bool allow)
            : this(allow ? GuardDecision.Allow() : GuardDecision.Deny(403, "SUBSCRIPTION_REQUIRED", "denied")) { }

        public FakeSubscriptionGuard(GuardDecision decision) => _decision = decision;

        public Task<GuardDecision> RequireSubscriptionAsync(RequestContext context, CancellationToken cancellationToken = default) =>
            Task.FromResult(_decision);
    }

    private sealed class FakeAccessGuard : IUserAccessGuard
    {
        private readonly bool _allow;

        public FakeAccessGuard(bool allow) => _allow = allow;

        public string? LastTargetUserId { get; private set; }

        public Task<bool> CanAccessUserAsync(RequestContext caller, string targetUserId, CancellationToken cancellationToken = default)
        {
            LastTargetUserId = targetUserId;
            return Task.FromResult(_allow);
        }
    }

    private sealed class FakeSessionReader : IExamSessionReader
    {
        public PcaHistorySession? Session { get; init; }

        public int Calls { get; private set; }

        public Task<PcaHistorySession?> GetSessionAsync(RequestContext context, string sessionId, CancellationToken cancellationToken = default)
        {
            Calls++;
            return Task.FromResult(Session);
        }

        public Task<CompletedExams> GetCompletedExamsAsync(RequestContext context, string userId, CancellationToken cancellationToken = default) =>
            Task.FromResult(new CompletedExams([], [], 0));
    }

    private sealed class FakeWriter : IPcaExamWriter
    {
        public PcaExamStartOutcome StartOutcome { get; init; } =
            new(PcaExamWriteStatus.Ok, new ExamStartPayload("s", "e", "Pattern", 5, 0, []));

        public PcaExamSubmitOutcome SubmitOutcome { get; init; } =
            new(PcaExamWriteStatus.Ok, new ExamSubmitResult("s", 0, 0, 0, "Completed"));

        public int StartCalls { get; private set; }

        public int SubmitCalls { get; private set; }

        public string? LastStartUserId { get; private set; }

        public string? LastStartExamId { get; private set; }

        public string? LastSubmitSessionId { get; private set; }

        public int LastTimeTaken { get; private set; }

        public IReadOnlyList<SubmitAnswer>? LastAnswers { get; private set; }

        public Task<PcaExamStartOutcome> StartExamAsync(
            RequestContext context, string examId, string userId, CancellationToken cancellationToken = default)
        {
            StartCalls++;
            LastStartExamId = examId;
            LastStartUserId = userId;
            return Task.FromResult(StartOutcome);
        }

        public Task<PcaExamSubmitOutcome> SubmitExamAsync(
            RequestContext context, string sessionId, IReadOnlyList<SubmitAnswer> answers, int timeTaken, CancellationToken cancellationToken = default)
        {
            SubmitCalls++;
            LastSubmitSessionId = sessionId;
            LastAnswers = answers;
            LastTimeTaken = timeTaken;
            return Task.FromResult(SubmitOutcome);
        }
    }
}
