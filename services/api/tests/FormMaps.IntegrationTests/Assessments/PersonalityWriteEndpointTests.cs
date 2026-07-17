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
/// Guard chain + HTTP status/body mapping for the three personality write endpoints (POST /start,
/// /session/{id}/answer, /session/{id}/complete). The writer is faked (its DB behavior is proven by
/// PersonalitySessionWriterTests); this pins the thin endpoint layer: anon -> 401 before work,
/// subscription-required -> 403 skips the write, the lenient itemNumber body validation, self-ownership
/// (caller's id handed to the writer), and each PersonalityWriteStatus -> the exact legacy handleError body.
/// </summary>
public class PersonalityWriteEndpointTests
{
    private const string CallerUserId = "user-123";
    private const string SessionId = "session-1";

    // ---- /start ----

    [Fact]
    public async Task Start_denies_anonymous_before_the_write()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(new FakeSubscriptionGuard(allow: true), writer);
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/personality/start", new { });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, writer.StartCalls);
    }

    [Fact]
    public async Task Start_ok_returns_200_and_passes_self_id_and_defaulted_variant()
    {
        var writer = new FakeWriter
        {
            StartOutcome = new PersonalityStartOutcome(
                PersonalityWriteStatus.Ok,
                new SessionStartPayload(SessionId, "in_progress", "estudiantil", "es", [], [])),
        };
        using var factory = new Factory(new FakeSubscriptionGuard(allow: true), writer);
        using var client = factory.CreateClient();

        // No variant in the body -> defaults to estudiantil; a privileged role still starts its OWN session.
        var response = await Send(client, HttpMethod.Post, "/api/v1/personality/start", "{}", FormMapsRoles.SchoolAdmin, "school-1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(CallerUserId, writer.LastStartUserId);
        Assert.Equal("estudiantil", writer.LastStartVariant);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("in_progress", doc.RootElement.GetProperty("data").GetProperty("status").GetString());
    }

    [Fact]
    public async Task Start_retake_maps_to_409()
    {
        var writer = new FakeWriter { StartOutcome = new PersonalityStartOutcome(PersonalityWriteStatus.AlreadyCompleted, null) };
        using var factory = new Factory(new FakeSubscriptionGuard(allow: true), writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/personality/start", "{}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        await AssertMessage(response, "Assessment already completed");
    }

    // ---- /answer ----

    [Fact]
    public async Task Answer_missing_itemNumber_is_400_before_the_write()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(new FakeSubscriptionGuard(allow: true), writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, $"/api/v1/personality/session/{SessionId}/answer", """{"choice":"A"}""");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "itemNumber is required");
        Assert.Equal(0, writer.AnswerCalls); // rejected before the writer
    }

    [Fact]
    public async Task Answer_ok_returns_200_with_self_ownership()
    {
        var writer = new FakeWriter
        {
            AnswerOutcome = new PersonalityAnswerOutcome(PersonalityWriteStatus.Ok, new AnswerResult(SessionId, 1, 40, false)),
        };
        using var factory = new Factory(new FakeSubscriptionGuard(allow: true), writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, $"/api/v1/personality/session/{SessionId}/answer", """{"itemNumber":5,"choice":"A"}""");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(CallerUserId, writer.LastAnswerUserId);
        Assert.Equal(5, writer.LastItemNumber);
        Assert.Equal("A", writer.LastChoice);
    }

    [Fact]
    public async Task Answer_invalid_choice_maps_to_400_invalid_answer()
    {
        var response = await SendAnswerOutcome(PersonalityWriteStatus.InvalidChoice, """{"itemNumber":5,"choice":"BLAH"}""");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "Invalid answer");
    }

    [Fact]
    public async Task Answer_not_in_progress_maps_to_400_with_the_exact_body()
    {
        var response = await SendAnswerOutcome(PersonalityWriteStatus.NotInProgress, """{"itemNumber":5,"choice":"A"}""");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "Assessment is not in progress");
    }

    [Fact]
    public async Task Answer_item_not_found_maps_to_404()
    {
        var response = await SendAnswerOutcome(PersonalityWriteStatus.ItemNotFound, """{"itemNumber":999,"choice":"A"}""");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Not found");
    }

    // ---- /complete ----

    [Fact]
    public async Task Complete_incomplete_coverage_maps_to_400_with_the_exact_body()
    {
        var writer = new FakeWriter { CompleteOutcome = new PersonalityCompleteOutcome(PersonalityWriteStatus.IncompleteCoverage, null) };
        using var factory = new Factory(new FakeSubscriptionGuard(allow: true), writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, $"/api/v1/personality/session/{SessionId}/complete", "");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "Please answer every item before finishing");
    }

    [Fact]
    public async Task Complete_session_not_found_maps_to_404()
    {
        var writer = new FakeWriter { CompleteOutcome = new PersonalityCompleteOutcome(PersonalityWriteStatus.SessionNotFound, null) };
        using var factory = new Factory(new FakeSubscriptionGuard(allow: true), writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, $"/api/v1/personality/session/{SessionId}/complete", "");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Not found");
    }

    [Fact]
    public async Task Complete_subscription_required_skips_the_write()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(
            new FakeSubscriptionGuard(GuardDecision.Deny(403, "SUBSCRIPTION_REQUIRED", "denied")), writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, $"/api/v1/personality/session/{SessionId}/complete", "");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, writer.CompleteCalls);
    }

    // ---- helpers ----

    private async Task<HttpResponseMessage> SendAnswerOutcome(PersonalityWriteStatus status, string body)
    {
        var writer = new FakeWriter { AnswerOutcome = new PersonalityAnswerOutcome(status, null) };
        using var factory = new Factory(new FakeSubscriptionGuard(allow: true), writer);
        using var client = factory.CreateClient();
        return await Send(client, HttpMethod.Post, $"/api/v1/personality/session/{SessionId}/answer", body);
    }

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

    private sealed class Factory(FakeSubscriptionGuard subscription, FakeWriter writer) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISubscriptionGuard>();
                services.AddSingleton<ISubscriptionGuard>(subscription);
                services.RemoveAll<IPersonalitySessionWriter>();
                services.AddSingleton<IPersonalitySessionWriter>(writer);
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

    private sealed class FakeWriter : IPersonalitySessionWriter
    {
        public PersonalityStartOutcome StartOutcome { get; init; } = new(PersonalityWriteStatus.Ok,
            new SessionStartPayload("s", "in_progress", "estudiantil", "es", [], []));

        public PersonalityAnswerOutcome AnswerOutcome { get; init; } = new(PersonalityWriteStatus.Ok, new AnswerResult("s", 1, 40, false));

        public PersonalityCompleteOutcome CompleteOutcome { get; init; } = new(PersonalityWriteStatus.SessionNotFound, null);

        public int StartCalls { get; private set; }

        public int AnswerCalls { get; private set; }

        public int CompleteCalls { get; private set; }

        public string? LastStartUserId { get; private set; }

        public string? LastStartVariant { get; private set; }

        public string? LastAnswerUserId { get; private set; }

        public int LastItemNumber { get; private set; }

        public string? LastChoice { get; private set; }

        public Task<PersonalityStartOutcome> StartAsync(
            RequestContext context, string userId, string variant, string language, CancellationToken cancellationToken = default)
        {
            StartCalls++;
            LastStartUserId = userId;
            LastStartVariant = variant;
            return Task.FromResult(StartOutcome);
        }

        public Task<PersonalityAnswerOutcome> SaveAnswerAsync(
            RequestContext context, string sessionId, string userId, int itemNumber, string choice, CancellationToken cancellationToken = default)
        {
            AnswerCalls++;
            LastAnswerUserId = userId;
            LastItemNumber = itemNumber;
            LastChoice = choice;
            return Task.FromResult(AnswerOutcome);
        }

        public Task<PersonalityCompleteOutcome> CompleteAsync(
            RequestContext context, string sessionId, string userId, CancellationToken cancellationToken = default)
        {
            CompleteCalls++;
            return Task.FromResult(CompleteOutcome);
        }
    }
}
