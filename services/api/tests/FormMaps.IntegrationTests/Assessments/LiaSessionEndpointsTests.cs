using System.Net;
using System.Net.Http.Headers;
using System.Text;
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
/// Guard chain + HTTP status/body mapping for the 9 new LIA session write/read routes (start, subtest/start,
/// answer, practice/answer, timeout, violations, access, session, session/practice), following the same
/// fake-writer/fake-reader WebApplicationFactory pattern as LiaCompleteEndpointTests. The writer/reader DB
/// behavior itself is proven by the Task 3-7 unit/integration tests; this file pins the thin endpoint layer:
/// anon -> 401 before any work; each outcome status maps to the exact legacy handleError (lia.ts) body.
/// </summary>
public class LiaSessionEndpointsTests
{
    private const string CallerUserId = "user-123";
    private const string SessionId = "session-1";
    private const string Base = "/api/v1/lia";

    // ---------------------------------------------------------------------------------------------
    // Cross-cutting guard tests
    // ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task Anonymous_calls_to_every_new_route_return_401()
    {
        var (writer, reader) = (new FakeLiaSessionWriter(), new FakeLiaSessionReader());
        using var factory = new LiaApiFactory(new FakeSubscriptionGuard(allow: true), writer, reader);
        using var client = factory.CreateClient();

        var subtestBody = JsonBody(new { subtest = "pattern_recognition" });
        var routes = new (HttpMethod Method, string Path, HttpContent? Body)[]
        {
            (HttpMethod.Get, $"{Base}/access", null),
            (HttpMethod.Post, $"{Base}/start", null),
            (HttpMethod.Get, $"{Base}/session/{SessionId}", null),
            (HttpMethod.Get, $"{Base}/session/{SessionId}/practice", null),
            (HttpMethod.Post, $"{Base}/session/{SessionId}/practice/answer", null),
            (HttpMethod.Post, $"{Base}/session/{SessionId}/subtest/start", JsonBody(new { subtest = "pattern_recognition" })),
            (HttpMethod.Post, $"{Base}/session/{SessionId}/answer", null),
            (HttpMethod.Post, $"{Base}/session/{SessionId}/timeout", JsonBody(new { subtest = "pattern_recognition" })),
            (HttpMethod.Post, $"{Base}/session/{SessionId}/violations", null),
            (HttpMethod.Post, $"{Base}/session/{SessionId}/complete", null),
        };

        foreach (var (method, path, body) in routes)
        {
            var request = new HttpRequestMessage(method, path) { Content = body };
            var response = await client.SendAsync(request);
            Assert.True(
                HttpStatusCode.Unauthorized == response.StatusCode,
                $"{method} {path} expected 401 but got {(int)response.StatusCode}");
        }

        Assert.Equal(0, writer.StartCalls + writer.StartSubtestCalls + writer.SubmitAnswerCalls
            + writer.SubmitPracticeAnswerCalls + writer.HandleTimeoutCalls + writer.SaveViolationsCalls);
        Assert.Equal(0, reader.AccessCalls + reader.GetSessionCalls + reader.GetPracticeCalls);
    }

    // Regression guard (fix round 1): /subtest/start and /timeout previously bound a non-nullable
    // SubtestStartRequest/TimeoutRequest body, so an anonymous caller with an EMPTY/missing body got a
    // framework 400 from ASP.NET's own model binding BEFORE the identity guard ever ran. The sweep above
    // masks this because it always sends a well-formed {"subtest":...} body for these two routes; this
    // test pins the true "guard order first" contract with no body at all.
    [Fact]
    public async Task Anonymous_calls_with_no_body_to_subtest_start_and_timeout_still_return_401_not_a_framework_400()
    {
        var (writer, reader) = (new FakeLiaSessionWriter(), new FakeLiaSessionReader());
        using var factory = new LiaApiFactory(new FakeSubscriptionGuard(allow: true), writer, reader);
        using var client = factory.CreateClient();

        var routes = new[]
        {
            $"{Base}/session/{SessionId}/subtest/start",
            $"{Base}/session/{SessionId}/timeout",
        };

        foreach (var path in routes)
        {
            var response = await client.SendAsync(new HttpRequestMessage(HttpMethod.Post, path));
            Assert.True(
                HttpStatusCode.Unauthorized == response.StatusCode,
                $"POST {path} with no body expected 401 (identity guard first) but got {(int)response.StatusCode}");
        }

        Assert.Equal(0, writer.StartSubtestCalls + writer.HandleTimeoutCalls);
    }

    // ---------------------------------------------------------------------------------------------
    // POST /start
    // ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task Start_returns_200_with_the_session_payload_and_defaults_language_to_es()
    {
        var writer = new FakeLiaSessionWriter { StartOutcome = new(LiaStartStatus.Started, SampleStartPayload()) };
        var response = await Send(HttpMethod.Post, "/start", writer: writer, body: JsonBody(new { }));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("es", writer.LastLanguage);
        Assert.Equal(CallerUserId, writer.LastOwnerUserId);
        using var document = await ParseBody(response);
        Assert.True(document.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(SessionId, document.RootElement.GetProperty("data").GetProperty("session_id").GetString());
    }

    [Fact]
    public async Task Start_passes_through_english_language_exactly()
    {
        var writer = new FakeLiaSessionWriter { StartOutcome = new(LiaStartStatus.Started, SampleStartPayload()) };
        var response = await Send(HttpMethod.Post, "/start", writer: writer, body: JsonBody(new { language = "en" }));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("en", writer.LastLanguage);
    }

    [Fact]
    public async Task Locked_session_start_returns_409_with_the_session_locked_error_code()
    {
        var writer = new FakeLiaSessionWriter { StartOutcome = new(LiaStartStatus.Locked, null) };
        var response = await Send(HttpMethod.Post, "/start", writer: writer, body: JsonBody(new { }));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var document = await ParseBody(response);
        Assert.False(document.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("session_locked", document.RootElement.GetProperty("error").GetString());
        Assert.Equal(
            "Assessment locked after too many exits — ask your school administrator to unlock it",
            document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task AlreadyCompleted_start_returns_409_with_no_error_field()
    {
        var writer = new FakeLiaSessionWriter { StartOutcome = new(LiaStartStatus.AlreadyCompleted, null) };
        var response = await Send(HttpMethod.Post, "/start", writer: writer, body: JsonBody(new { }));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var document = await ParseBody(response);
        Assert.Equal("Assessment already completed", document.RootElement.GetProperty("message").GetString());
        Assert.False(document.RootElement.TryGetProperty("error", out _));
    }

    // ---------------------------------------------------------------------------------------------
    // GET /access, GET /session/{id}, GET /session/{id}/practice
    // ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task GetAccess_returns_200_with_the_reader_result_and_no_error_branch()
    {
        var reader = new FakeLiaSessionReader { AccessResult = new LiaCheckAccessResult(HasAccess: true, HasCompleted: false) };
        var response = await Send(HttpMethod.Get, "/access", reader: reader);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(CallerUserId, reader.LastOwnerUserId);
        using var document = await ParseBody(response);
        Assert.True(document.RootElement.GetProperty("data").GetProperty("has_access").GetBoolean());
    }

    [Fact]
    public async Task GetSession_returns_200_with_the_session_detail()
    {
        var reader = new FakeLiaSessionReader { SessionDetailResult = SampleSessionDetail() };
        var response = await Send(HttpMethod.Get, $"/session/{SessionId}", reader: reader);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(SessionId, reader.LastSessionId);
        Assert.Equal(CallerUserId, reader.LastOwnerUserId);
        using var document = await ParseBody(response);
        Assert.Equal(SessionId, document.RootElement.GetProperty("data").GetProperty("id").GetString());
    }

    [Fact]
    public async Task GetSession_not_found_maps_to_the_uniform_404()
    {
        var reader = new FakeLiaSessionReader { SessionDetailResult = null };
        var response = await Send(HttpMethod.Get, $"/session/{SessionId}", reader: reader);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var document = await ParseBody(response);
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task GetPracticeQuestions_returns_200_with_the_question_list()
    {
        var reader = new FakeLiaSessionReader
        {
            PracticeQuestionsResult = new List<ClientQuestion> { SampleClientQuestion() },
        };
        var response = await Send(HttpMethod.Get, $"/session/{SessionId}/practice", reader: reader);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = await ParseBody(response);
        Assert.Equal(1, document.RootElement.GetProperty("data").GetArrayLength());
    }

    [Fact]
    public async Task GetPracticeQuestions_not_found_maps_to_the_uniform_404()
    {
        var reader = new FakeLiaSessionReader { PracticeQuestionsResult = null };
        var response = await Send(HttpMethod.Get, $"/session/{SessionId}/practice", reader: reader);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---------------------------------------------------------------------------------------------
    // POST /session/{id}/practice/answer
    // ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task SubmitPracticeAnswer_returns_200_and_truncates_answer_to_20_chars()
    {
        var writer = new FakeLiaSessionWriter
        {
            SubmitPracticeAnswerOutcome = new(LiaPracticeAnswerStatus.Ok, SamplePracticeResult()),
        };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/practice/answer", writer: writer,
            body: JsonBody(new { question_id = "q1", answer = "123456789012345678901234567890" }));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("q1", writer.LastQuestionId);
        Assert.Equal("12345678901234567890", writer.LastAnswer);
        Assert.Equal(20, writer.LastAnswer!.Length);
    }

    [Fact]
    public async Task SubmitPracticeAnswer_missing_fields_returns_400_with_the_exact_legacy_message()
    {
        var writer = new FakeLiaSessionWriter();
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/practice/answer", writer: writer,
            body: JsonBody(new { question_id = "q1" }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var document = await ParseBody(response);
        Assert.Equal("question_id and answer are required", document.RootElement.GetProperty("message").GetString());
        Assert.Equal(0, writer.SubmitPracticeAnswerCalls);
    }

    [Fact]
    public async Task SubmitPracticeAnswer_not_in_practice_returns_400()
    {
        var writer = new FakeLiaSessionWriter
        {
            SubmitPracticeAnswerOutcome = new(LiaPracticeAnswerStatus.NotInPractice, null),
        };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/practice/answer", writer: writer,
            body: JsonBody(new { question_id = "q1", answer = "a" }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var document = await ParseBody(response);
        Assert.Equal("not_in_practice", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task SubmitPracticeAnswer_question_not_found_maps_to_the_uniform_404()
    {
        var writer = new FakeLiaSessionWriter
        {
            SubmitPracticeAnswerOutcome = new(LiaPracticeAnswerStatus.QuestionNotFound, null),
        };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/practice/answer", writer: writer,
            body: JsonBody(new { question_id = "missing", answer = "a" }));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var document = await ParseBody(response);
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task SubmitPracticeAnswer_session_not_found_maps_to_the_uniform_404()
    {
        var writer = new FakeLiaSessionWriter
        {
            SubmitPracticeAnswerOutcome = new(LiaPracticeAnswerStatus.NotFound, null),
        };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/practice/answer", writer: writer,
            body: JsonBody(new { question_id = "q1", answer = "a" }));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---------------------------------------------------------------------------------------------
    // POST /session/{id}/answer
    // ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task SubmitAnswer_returns_200_and_truncates_answer_and_floors_time_spent()
    {
        var writer = new FakeLiaSessionWriter
        {
            SubmitAnswerOutcome = new(LiaSubmitAnswerStatus.Ok, SampleAnswerResult()),
        };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/answer", writer: writer,
            body: JsonBody(new { question_id = "q1", answer = "123456789012345678901234567890", time_spent_ms = 4500 }));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("q1", writer.LastQuestionId);
        Assert.Equal("12345678901234567890", writer.LastAnswer);
        Assert.Equal(4500, writer.LastTimeSpentMs);
    }

    [Fact]
    public async Task SubmitAnswer_missing_question_id_returns_400_with_the_distinct_legacy_message()
    {
        var writer = new FakeLiaSessionWriter();
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/answer", writer: writer, body: JsonBody(new { }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var document = await ParseBody(response);
        Assert.Equal("question_id is required", document.RootElement.GetProperty("message").GetString());
        Assert.Equal(0, writer.SubmitAnswerCalls);
    }

    [Fact]
    public async Task SubmitAnswer_allows_a_skipped_null_answer_through()
    {
        var writer = new FakeLiaSessionWriter
        {
            SubmitAnswerOutcome = new(LiaSubmitAnswerStatus.Ok, SampleAnswerResult()),
        };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/answer", writer: writer,
            body: JsonBody(new { question_id = "q1" }));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(writer.LastAnswer);
        Assert.Equal(0, writer.LastTimeSpentMs);
    }

    [Fact]
    public async Task SubmitAnswer_negative_time_spent_floors_to_zero()
    {
        var writer = new FakeLiaSessionWriter
        {
            SubmitAnswerOutcome = new(LiaSubmitAnswerStatus.Ok, SampleAnswerResult()),
        };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/answer", writer: writer,
            body: JsonBody(new { question_id = "q1", time_spent_ms = -500 }));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(0, writer.LastTimeSpentMs);
    }

    [Fact]
    public async Task SubmitAnswer_not_in_progress_returns_400()
    {
        var writer = new FakeLiaSessionWriter
        {
            SubmitAnswerOutcome = new(LiaSubmitAnswerStatus.NotInProgress, null),
        };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/answer", writer: writer, body: JsonBody(new { question_id = "q1" }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var document = await ParseBody(response);
        Assert.Equal("not_in_progress", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task SubmitAnswer_question_not_found_maps_to_the_uniform_404()
    {
        var writer = new FakeLiaSessionWriter
        {
            SubmitAnswerOutcome = new(LiaSubmitAnswerStatus.QuestionNotFound, null),
        };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/answer", writer: writer, body: JsonBody(new { question_id = "q1" }));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var document = await ParseBody(response);
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    // ---------------------------------------------------------------------------------------------
    // POST /session/{id}/subtest/start
    // ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task StartSubtest_returns_200_with_the_result()
    {
        var writer = new FakeLiaSessionWriter { StartSubtestOutcome = new(LiaSubtestStartStatus.Started, SampleSubtestResult()) };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/subtest/start", writer: writer,
            body: JsonBody(new { subtest = "pattern_recognition" }));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("pattern_recognition", writer.LastSubtest);
    }

    [Fact]
    public async Task StartSubtest_invalid_subtest_returns_400()
    {
        var writer = new FakeLiaSessionWriter();
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/subtest/start", writer: writer,
            body: JsonBody(new { subtest = "not_a_real_subtest" }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var document = await ParseBody(response);
        Assert.Equal("Invalid subtest", document.RootElement.GetProperty("message").GetString());
        Assert.Equal(0, writer.StartSubtestCalls);
    }

    [Fact]
    public async Task StartSubtest_practice_incomplete_returns_400()
    {
        var writer = new FakeLiaSessionWriter { StartSubtestOutcome = new(LiaSubtestStartStatus.PracticeIncomplete, null) };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/subtest/start", writer: writer,
            body: JsonBody(new { subtest = "pattern_recognition" }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var document = await ParseBody(response);
        Assert.Equal("practice_incomplete", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Subtest_already_started_returns_409_with_the_subtest_already_started_error_code()
    {
        var writer = new FakeLiaSessionWriter { StartSubtestOutcome = new(LiaSubtestStartStatus.AlreadyStarted, null) };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/subtest/start", writer: writer,
            body: JsonBody(new { subtest = "pattern_recognition" }));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var document = await ParseBody(response);
        Assert.False(document.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("subtest_already_started", document.RootElement.GetProperty("error").GetString());
        Assert.Equal("Subtest already started", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task StartSubtest_not_found_maps_to_the_uniform_404()
    {
        var writer = new FakeLiaSessionWriter { StartSubtestOutcome = new(LiaSubtestStartStatus.NotFound, null) };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/subtest/start", writer: writer,
            body: JsonBody(new { subtest = "pattern_recognition" }));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---------------------------------------------------------------------------------------------
    // POST /session/{id}/timeout
    // ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task HandleTimeout_returns_200_and_never_reads_unanswered_question_ids()
    {
        var writer = new FakeLiaSessionWriter { HandleTimeoutOutcome = new(LiaSubmitAnswerStatus.Ok, SampleAnswerResult()) };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/timeout", writer: writer,
            body: JsonBody(new { subtest = "pattern_recognition", unanswered_question_ids = new[] { "a", "b" } }));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("pattern_recognition", writer.LastSubtest);
    }

    [Fact]
    public async Task HandleTimeout_invalid_subtest_returns_400()
    {
        var writer = new FakeLiaSessionWriter();
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/timeout", writer: writer,
            body: JsonBody(new { subtest = "bogus" }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var document = await ParseBody(response);
        Assert.Equal("Invalid subtest", document.RootElement.GetProperty("message").GetString());
        Assert.Equal(0, writer.HandleTimeoutCalls);
    }

    [Fact]
    public async Task HandleTimeout_not_in_progress_returns_400()
    {
        var writer = new FakeLiaSessionWriter { HandleTimeoutOutcome = new(LiaSubmitAnswerStatus.NotInProgress, null) };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/timeout", writer: writer,
            body: JsonBody(new { subtest = "pattern_recognition" }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var document = await ParseBody(response);
        Assert.Equal("not_in_progress", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task HandleTimeout_not_found_maps_to_the_uniform_404()
    {
        var writer = new FakeLiaSessionWriter { HandleTimeoutOutcome = new(LiaSubmitAnswerStatus.NotFound, null) };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/timeout", writer: writer,
            body: JsonBody(new { subtest = "pattern_recognition" }));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---------------------------------------------------------------------------------------------
    // POST /session/{id}/violations
    // ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task SaveViolations_returns_200_with_lowercase_saved_key()
    {
        var writer = new FakeLiaSessionWriter { SaveViolationsOutcome = new(LiaSaveViolationsStatus.Ok, 2) };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/violations", writer: writer,
            body: JsonBody(new { violations = new[] { new { type = "blur", timestamp = "2026-07-29T00:00:00.000Z", details = "x" } } }));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = await ParseBody(response);
        Assert.Equal(2, document.RootElement.GetProperty("data").GetProperty("saved").GetInt32());
        Assert.False(document.RootElement.GetProperty("data").TryGetProperty("saved_count", out _));
        Assert.Single(writer.LastViolations!);
        Assert.Equal("blur", writer.LastViolations![0].Type);
    }

    [Fact]
    public async Task SaveViolations_caps_an_oversized_array_at_200_per_request()
    {
        var writer = new FakeLiaSessionWriter { SaveViolationsOutcome = new(LiaSaveViolationsStatus.Ok, 200) };
        var items = Enumerable.Range(0, 250).Select(i => new { type = $"t{i}", timestamp = "2026-07-29T00:00:00.000Z", details = "d" });
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/violations", writer: writer,
            body: JsonBody(new { violations = items }));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(200, writer.LastViolations!.Count);
    }

    [Fact]
    public async Task SaveViolations_defaults_missing_type_timestamp_and_details_fields()
    {
        var writer = new FakeLiaSessionWriter { SaveViolationsOutcome = new(LiaSaveViolationsStatus.Ok, 1) };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/violations", writer: writer,
            body: JsonBody(new { violations = new object[] { new { } } }));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var saved = Assert.Single(writer.LastViolations!);
        Assert.Equal("unknown", saved.Type);
        Assert.Equal(string.Empty, saved.Details);
        Assert.False(string.IsNullOrEmpty(saved.Timestamp));
    }

    [Fact]
    public async Task SaveViolations_non_array_body_normalizes_to_empty()
    {
        var writer = new FakeLiaSessionWriter { SaveViolationsOutcome = new(LiaSaveViolationsStatus.Ok, 0) };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/violations", writer: writer, body: JsonBody(new { }));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(writer.LastViolations!);
    }

    [Fact]
    public async Task SaveViolations_not_found_maps_to_the_uniform_404()
    {
        var writer = new FakeLiaSessionWriter { SaveViolationsOutcome = new(LiaSaveViolationsStatus.NotFound, 0) };
        var response = await Send(
            HttpMethod.Post, $"/session/{SessionId}/violations", writer: writer, body: JsonBody(new { violations = Array.Empty<object>() }));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---------------------------------------------------------------------------------------------
    // Shared subscription-guard-skips-the-write spot check (one representative write route)
    // ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task Subscription_required_skips_the_write_on_start()
    {
        var writer = new FakeLiaSessionWriter();
        var subscription = new FakeSubscriptionGuard(GuardDecision.Deny(403, "SUBSCRIPTION_REQUIRED", "Active subscription required"));
        using var factory = new LiaApiFactory(subscription, writer, new FakeLiaSessionReader());
        using var client = factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Post, $"{Base}/start") { Content = JsonBody(new { }) };
        AddAuthHeaders(request);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, writer.StartCalls);
    }

    // ---------------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------------

    private static async Task<HttpResponseMessage> Send(
        HttpMethod method,
        string relativePath,
        FakeLiaSessionWriter? writer = null,
        FakeLiaSessionReader? reader = null,
        HttpContent? body = null,
        string role = "student")
    {
        writer ??= new FakeLiaSessionWriter();
        reader ??= new FakeLiaSessionReader();
        using var factory = new LiaApiFactory(new FakeSubscriptionGuard(allow: true), writer, reader);
        using var client = factory.CreateClient();
        var request = new HttpRequestMessage(method, $"{Base}{relativePath}") { Content = body };
        AddAuthHeaders(request, role);
        return await client.SendAsync(request);
    }

    private static void AddAuthHeaders(HttpRequestMessage request, string role = "student", string? schoolId = null)
    {
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, CallerUserId);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "user@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Test User");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.ProfileRead);
        if (!string.IsNullOrWhiteSpace(schoolId))
        {
            request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, schoolId);
        }
    }

    private static StringContent JsonBody(object value)
    {
        var content = new StringContent(JsonSerializer.Serialize(value), Encoding.UTF8);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        return content;
    }

    private static async Task<JsonDocument> ParseBody(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync());

    private static ClientQuestion SampleClientQuestion() => new(
        // A uuid, matching the real lia_questions.id shape the resolver now serves — NOT the old
        // synthesized "{subtest}:{item}:{kind}" string, so this fixture cannot mislead a reader into
        // thinking question ids are derivable from the natural key.
        Id: "3f9a5c21-0b4e-4d7a-9c18-2e6b8d4f1a07",
        Subtest: "pattern_recognition",
        ItemNumber: 1,
        QuestionData: JsonDocument.Parse("{}").RootElement,
        IsPractice: true);

    private static LiaSessionStartPayload SampleStartPayload() => new(
        SessionId: SessionId,
        CurrentSubtest: "pattern_recognition",
        PracticeQuestions: new List<ClientQuestion> { SampleClientQuestion() },
        ResumeMode: null,
        CurrentItem: null,
        StartedAt: "2026-07-29T10:00:00.000Z",
        TimeLimitSeconds: 180,
        Questions: null);

    private static SubtestStartResult SampleSubtestResult() => new(
        SessionId: SessionId,
        Subtest: "pattern_recognition",
        Questions: new List<ClientQuestion> { SampleClientQuestion() },
        TimeLimitSeconds: 180,
        StartedAt: "2026-07-29T10:00:00.000Z");

    private static LiaAnswerResult SampleAnswerResult() => new(
        SessionId: SessionId,
        ItemsCompleted: 1,
        TotalItems: 20,
        TimeRemainingSeconds: 170,
        SubtestComplete: false,
        NextSubtest: null,
        AssessmentComplete: false);

    private static PracticeAnswerResult SamplePracticeResult() => new(
        IsCorrect: true,
        CorrectAnswer: "b",
        PracticeComplete: false,
        NextQuestion: null);

    private static SessionDetail SampleSessionDetail() => new(
        Id: SessionId,
        Status: "in_progress",
        CurrentSubtest: "pattern_recognition",
        CurrentItem: 1,
        PracticeCompleted: JsonDocument.Parse("{}").RootElement,
        SubtestTimes: JsonDocument.Parse("{}").RootElement,
        Language: "es",
        StartedAt: "2026-07-29T10:00:00.000Z",
        CompletedAt: null);

    private sealed class LiaApiFactory(FakeSubscriptionGuard subscription, FakeLiaSessionWriter writer, FakeLiaSessionReader reader)
        : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISubscriptionGuard>();
                services.AddSingleton<ISubscriptionGuard>(subscription);
                services.RemoveAll<ILiaSessionWriter>();
                services.AddSingleton<ILiaSessionWriter>(writer);
                services.RemoveAll<ILiaSessionReader>();
                services.AddSingleton<ILiaSessionReader>(reader);
            });
        }
    }

    private sealed class FakeSubscriptionGuard : ISubscriptionGuard
    {
        private readonly GuardDecision _decision;

        public FakeSubscriptionGuard(bool allow) : this(allow ? GuardDecision.Allow() : GuardDecision.Deny(403, "SUBSCRIPTION_REQUIRED", "denied")) { }

        public FakeSubscriptionGuard(GuardDecision decision) => _decision = decision;

        public Task<GuardDecision> RequireSubscriptionAsync(RequestContext context, CancellationToken cancellationToken = default) =>
            Task.FromResult(_decision);
    }

    private sealed class FakeLiaSessionWriter : ILiaSessionWriter
    {
        public int StartCalls { get; private set; }

        public int StartSubtestCalls { get; private set; }

        public int SubmitAnswerCalls { get; private set; }

        public int SubmitPracticeAnswerCalls { get; private set; }

        public int HandleTimeoutCalls { get; private set; }

        public int SaveViolationsCalls { get; private set; }

        public string? LastOwnerUserId { get; private set; }

        public string? LastSessionId { get; private set; }

        public string? LastLanguage { get; private set; }

        public string? LastSubtest { get; private set; }

        public string? LastQuestionId { get; private set; }

        public string? LastAnswer { get; private set; }

        public int LastTimeSpentMs { get; private set; }

        public IReadOnlyList<ViolationEntry>? LastViolations { get; private set; }

        public LiaStartOutcome StartOutcome { get; set; } = new(LiaStartStatus.Started, null);

        public LiaSubtestStartOutcome StartSubtestOutcome { get; set; } = new(LiaSubtestStartStatus.Started, null);

        public LiaSubmitAnswerOutcome SubmitAnswerOutcome { get; set; } = new(LiaSubmitAnswerStatus.Ok, null);

        public LiaPracticeAnswerOutcome SubmitPracticeAnswerOutcome { get; set; } = new(LiaPracticeAnswerStatus.Ok, null);

        public LiaSubmitAnswerOutcome HandleTimeoutOutcome { get; set; } = new(LiaSubmitAnswerStatus.Ok, null);

        public LiaSaveViolationsOutcome SaveViolationsOutcome { get; set; } = new(LiaSaveViolationsStatus.Ok, 0);

        public Task<LiaStartOutcome> StartAsync(
            RequestContext context, string userId, string language, CancellationToken cancellationToken = default)
        {
            StartCalls++;
            LastOwnerUserId = userId;
            LastLanguage = language;
            return Task.FromResult(StartOutcome);
        }

        public Task<LiaSubtestStartOutcome> StartSubtestAsync(
            RequestContext context, string sessionId, string ownerUserId, string subtest, CancellationToken cancellationToken = default)
        {
            StartSubtestCalls++;
            LastSessionId = sessionId;
            LastOwnerUserId = ownerUserId;
            LastSubtest = subtest;
            return Task.FromResult(StartSubtestOutcome);
        }

        public Task<LiaSubmitAnswerOutcome> SubmitAnswerAsync(
            RequestContext context, string sessionId, string ownerUserId, string questionId, string? answer,
            int timeSpentMs, CancellationToken cancellationToken = default)
        {
            SubmitAnswerCalls++;
            LastSessionId = sessionId;
            LastOwnerUserId = ownerUserId;
            LastQuestionId = questionId;
            LastAnswer = answer;
            LastTimeSpentMs = timeSpentMs;
            return Task.FromResult(SubmitAnswerOutcome);
        }

        public Task<LiaPracticeAnswerOutcome> SubmitPracticeAnswerAsync(
            RequestContext context, string sessionId, string ownerUserId, string questionId, string answer,
            CancellationToken cancellationToken = default)
        {
            SubmitPracticeAnswerCalls++;
            LastSessionId = sessionId;
            LastOwnerUserId = ownerUserId;
            LastQuestionId = questionId;
            LastAnswer = answer;
            return Task.FromResult(SubmitPracticeAnswerOutcome);
        }

        public Task<LiaSubmitAnswerOutcome> HandleTimeoutAsync(
            RequestContext context, string sessionId, string ownerUserId, string subtest, CancellationToken cancellationToken = default)
        {
            HandleTimeoutCalls++;
            LastSessionId = sessionId;
            LastOwnerUserId = ownerUserId;
            LastSubtest = subtest;
            return Task.FromResult(HandleTimeoutOutcome);
        }

        public Task<LiaSaveViolationsOutcome> SaveViolationsAsync(
            RequestContext context, string sessionId, string ownerUserId, IReadOnlyList<ViolationEntry> violations,
            CancellationToken cancellationToken = default)
        {
            SaveViolationsCalls++;
            LastSessionId = sessionId;
            LastOwnerUserId = ownerUserId;
            LastViolations = violations;
            return Task.FromResult(SaveViolationsOutcome);
        }

        public Task<LiaCompleteOutcome> CompleteAsync(
            RequestContext context, string sessionId, string ownerUserId, CancellationToken cancellationToken = default) =>
            Task.FromResult(new LiaCompleteOutcome(LiaCompleteStatus.NotFound, null));

        public Task<SessionDetail?> ReadWithLazyExpiryAsync(
            RequestContext context, string sessionId, string ownerUserId, CancellationToken cancellationToken = default) =>
            Task.FromResult<SessionDetail?>(null);
    }

    private sealed class FakeLiaSessionReader : ILiaSessionReader
    {
        public int AccessCalls { get; private set; }

        public int GetSessionCalls { get; private set; }

        public int GetPracticeCalls { get; private set; }

        public string? LastOwnerUserId { get; private set; }

        public string? LastSessionId { get; private set; }

        public LiaCheckAccessResult AccessResult { get; set; } = new(HasAccess: true, HasCompleted: false);

        public SessionDetail? SessionDetailResult { get; set; }

        public IReadOnlyList<ClientQuestion>? PracticeQuestionsResult { get; set; } = new List<ClientQuestion>();

        public Task<LiaCheckAccessResult> GetAccessAsync(
            RequestContext context, string userId, CancellationToken cancellationToken = default)
        {
            AccessCalls++;
            LastOwnerUserId = userId;
            return Task.FromResult(AccessResult);
        }

        public Task<SessionDetail?> GetSessionAsync(
            RequestContext context, string sessionId, string ownerUserId, CancellationToken cancellationToken = default)
        {
            GetSessionCalls++;
            LastSessionId = sessionId;
            LastOwnerUserId = ownerUserId;
            return Task.FromResult(SessionDetailResult);
        }

        public Task<IReadOnlyList<ClientQuestion>?> GetPracticeQuestionsAsync(
            RequestContext context, string sessionId, string ownerUserId, CancellationToken cancellationToken = default)
        {
            GetPracticeCalls++;
            LastSessionId = sessionId;
            LastOwnerUserId = ownerUserId;
            return Task.FromResult(PracticeQuestionsResult);
        }
    }
}
