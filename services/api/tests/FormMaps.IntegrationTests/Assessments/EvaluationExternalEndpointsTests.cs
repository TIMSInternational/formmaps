using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FormMaps.Application.Assessments;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Guard-free HTTP mapping for the external 360 endpoints (the token is the credential; the DB behavior is
/// proven by EvaluationExternalServiceTests). Pins the anonymous access, the validate-token 200-wrapper (never
/// 4xx for a resolvable-but-invalid token), the submit-feedback 409/400 exact messages, and 360evolutor 404.
/// </summary>
public class EvaluationExternalEndpointsTests
{
    [Fact]
    public async Task ValidateToken_missing_token_is_400()
    {
        using var client = new Factory(new FakeService()).CreateClient();
        var response = await client.GetAsync("/evaluation/validate-token");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "Token required");
    }

    [Fact]
    public async Task ValidateToken_invalid_token_is_200_valid_false()
    {
        var fake = new FakeService { ValidateResult = new ValidateTokenResult(false, "Token expired") };
        using var client = new Factory(fake).CreateClient();
        var response = await client.GetAsync("/evaluation/validate-token?token=abc");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.False(data.GetProperty("valid").GetBoolean());
        Assert.Equal("Token expired", data.GetProperty("reason").GetString());
    }

    [Fact]
    public async Task SubmitFeedback_invalid_body_is_400()
    {
        using var client = new Factory(new FakeService()).CreateClient();
        var response = await client.PostAsync("/evaluation/submit-feedback", Json("{}"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData(FeedbackSubmitStatus.InvalidTokenOrGroup, HttpStatusCode.BadRequest, "Invalid token or group")]
    [InlineData(FeedbackSubmitStatus.VocationalInstrument, HttpStatusCode.BadRequest, "This evaluation uses the vocational instrument")]
    [InlineData(FeedbackSubmitStatus.EmailMismatch, HttpStatusCode.BadRequest, "Email mismatch")]
    [InlineData(FeedbackSubmitStatus.TokenExpiredOrUsed, HttpStatusCode.BadRequest, "Token expired or already used")]
    [InlineData(FeedbackSubmitStatus.AlreadySubmitted, HttpStatusCode.Conflict, "This evaluation has already been submitted")]
    public async Task SubmitFeedback_maps_each_error(FeedbackSubmitStatus status, HttpStatusCode expected, string message)
    {
        var fake = new FakeService { FeedbackResult = new FeedbackSubmitResult(status) };
        using var client = new Factory(fake).CreateClient();
        var response = await client.PostAsync("/evaluation/submit-feedback", ValidFeedbackBody());
        Assert.Equal(expected, response.StatusCode);
        await AssertMessage(response, message);
    }

    [Fact]
    public async Task SubmitFeedback_ok_is_200()
    {
        var fake = new FakeService { FeedbackResult = new FeedbackSubmitResult(FeedbackSubmitStatus.Ok, new { id = "f1" }) };
        using var client = new Factory(fake).CreateClient();
        var response = await client.PostAsync("/evaluation/submit-feedback", ValidFeedbackBody());
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Feedback submitted", doc.RootElement.GetProperty("message").GetString());
    }

    [Theory]
    [InlineData("mailto:<RATER@X.com>")]   // the exact shape that slipped past the old @-only check
    [InlineData("a@@b")]
    [InlineData("a@b")]                     // no dotted TLD
    [InlineData("plainstring")]
    public async Task SubmitFeedback_rejects_zod_invalid_email(string email)
    {
        using var client = new Factory(new FakeService()).CreateClient();
        var response = await client.PostAsync("/evaluation/submit-feedback", FeedbackBody(email: email));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "Invalid email");
    }

    [Theory]
    [InlineData("rater@x.com")]
    [InlineData("Andres.Tafur+tag@gmail.com")]
    public async Task SubmitFeedback_accepts_zod_valid_email(string email)
    {
        using var client = new Factory(new FakeService()).CreateClient();
        var response = await client.PostAsync("/evaluation/submit-feedback", FeedbackBody(email: email));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task SubmitFeedback_rejects_non_string_comment()
    {
        using var client = new Factory(new FakeService()).CreateClient();
        var body = Json(
            """{"evaluationGroupId":"g1","token":"t1","evaluatorEmail":"r@x.com","answers":[{"questionNumber":1,"questionText":"Q","rating":5,"comment":42}]}""");
        var response = await client.PostAsync("/evaluation/submit-feedback", body);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Get360Evolutor_null_is_404()
    {
        using var client = new Factory(new FakeService { Form = null }).CreateClient();
        var response = await client.GetAsync("/evaluation/360evolutor/tok");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Group not found");
    }

    [Fact]
    public async Task Get360Evolutor_open_returns_questions()
    {
        var form = new Evaluator360Form(false, "g1", "tok", "Rater", "s@x.com", "Stu", "r@x.com", "Teacher",
            new[] { new Evaluator360Question("q1", 1, "EN", "ES", "Cat") });
        using var client = new Factory(new FakeService { Form = form }).CreateClient();
        var response = await client.GetAsync("/evaluation/360evolutor/tok");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("g1", data.GetProperty("evolutorGroupId").GetString());
        Assert.Equal("EN", data.GetProperty("questions")[0].GetProperty("questionText").GetString());
        Assert.Equal("ES", data.GetProperty("questions")[0].GetProperty("questionTextEs").GetString());
    }

    // ---- helpers ----

    private static StringContent Json(string json) => new(json, Encoding.UTF8, "application/json");

    private static StringContent ValidFeedbackBody() => FeedbackBody("r@x.com");

    private static StringContent FeedbackBody(string email)
    {
        var escaped = JsonSerializer.Serialize(email);
        return Json($$"""{"evaluationGroupId":"g1","token":"t1","evaluatorEmail":{{escaped}},"answers":[{"questionNumber":1,"questionText":"Q","rating":5}]}""");
    }

    private static async Task AssertMessage(HttpResponseMessage response, string expected)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(expected, doc.RootElement.GetProperty("message").GetString());
    }

    private sealed class Factory(FakeService service) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IEvaluationExternalService>();
                services.AddSingleton<IEvaluationExternalService>(service);
            });
        }
    }

    private sealed class FakeService : IEvaluationExternalService
    {
        public ValidateTokenResult ValidateResult { get; init; } = new(true, null, "Rater", "r@x.com", "Teacher", "teacher", null);

        public FeedbackSubmitResult FeedbackResult { get; init; } = new(FeedbackSubmitStatus.Ok, new { id = "f" });

        public Evaluator360Form? Form { get; init; } = new(true, "g", "t", "Rater", Questions: Array.Empty<Evaluator360Question>());

        public Task<ValidateTokenResult> ValidateTokenAsync(string token, CancellationToken cancellationToken = default) =>
            Task.FromResult(ValidateResult);

        public Task<FeedbackSubmitResult> SubmitFeedbackAsync(FeedbackSubmitInput input, CancellationToken cancellationToken = default) =>
            Task.FromResult(FeedbackResult);

        public Task<Evaluator360Form?> Get360EvaluatorFormAsync(string token, CancellationToken cancellationToken = default) =>
            Task.FromResult(Form);
    }
}
