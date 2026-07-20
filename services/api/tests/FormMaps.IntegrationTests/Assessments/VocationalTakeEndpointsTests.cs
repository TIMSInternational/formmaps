using System.Net;
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
/// Guard-free HTTP mapping for the external vocational endpoints (token = credential; DB behavior proven by
/// VocationalTakeServiceTests). Pins the VERB-DEPENDENT expiry (GET → 410, submit → 404), the generic
/// (reason-hidden) submit messages, and the violations {saved, violation_count} / 404 shapes.
/// </summary>
public class VocationalTakeEndpointsTests
{
    [Fact]
    public async Task GetForm_ok_returns_questionnaire_envelope()
    {
        var fake = new FakeService
        {
            FormResult = new VocationalFormResult(VocationalFormStatus.Ok, "teacher", "v1", "Rater", "Stu", Array.Empty<QuestionnaireItem>()),
        };
        using var client = new Factory(fake).CreateClient();
        var response = await client.GetAsync("/evaluation/vocational/tok");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("teacher", data.GetProperty("group").GetString());
        Assert.False(data.GetProperty("isEvaluationCompleted").GetBoolean());
    }

    [Fact]
    public async Task GetForm_completed_short_circuits()
    {
        var fake = new FakeService { FormResult = new VocationalFormResult(VocationalFormStatus.Completed, EvaluatorName: "Rater") };
        using var client = new Factory(fake).CreateClient();
        var response = await client.GetAsync("/evaluation/vocational/tok");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("data").GetProperty("completed").GetBoolean());
    }

    [Theory]
    [InlineData(VocationalFormStatus.InvalidGroup, HttpStatusCode.BadRequest, "No questionnaire for this group", "invalid-group")]
    [InlineData(VocationalFormStatus.Expired, HttpStatusCode.Gone, "This evaluation link has expired.", "expired")]
    [InlineData(VocationalFormStatus.NotFound, HttpStatusCode.NotFound, "This evaluation link is no longer valid.", "not-found")]
    public async Task GetForm_maps_each_error_with_reason(VocationalFormStatus status, HttpStatusCode expected, string message, string reason)
    {
        var fake = new FakeService { FormResult = new VocationalFormResult(status) };
        using var client = new Factory(fake).CreateClient();
        var response = await client.GetAsync("/evaluation/vocational/tok");
        Assert.Equal(expected, response.StatusCode);   // GET expired → 410 (verb-dependent)
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(message, doc.RootElement.GetProperty("message").GetString());
        Assert.Equal(reason, doc.RootElement.GetProperty("reason").GetString());
    }

    [Fact]
    public async Task Submit_invalid_body_is_400_invalid_submission()
    {
        using var client = new Factory(new FakeService()).CreateClient();
        var response = await client.PostAsync("/evaluation/vocational/submit", Json("{}"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "Invalid submission");
    }

    [Fact]
    public async Task Submit_ok_returns_ok_and_count()
    {
        var fake = new FakeService { SubmitResult = new VocationalSubmitResult(VocationalSubmitStatus.Ok, 2) };
        using var client = new Factory(fake).CreateClient();
        var response = await client.PostAsync("/evaluation/vocational/submit", ValidSubmitBody());
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.True(data.GetProperty("ok").GetBoolean());
        Assert.Equal(2, data.GetProperty("count").GetInt32());
    }

    [Theory]
    [InlineData(VocationalSubmitStatus.AlreadyCompleted, HttpStatusCode.Conflict, "Already completed")]
    [InlineData(VocationalSubmitStatus.BadAnswer, HttpStatusCode.BadRequest, "Invalid submission")]
    [InlineData(VocationalSubmitStatus.Incomplete, HttpStatusCode.BadRequest, "Invalid submission")]
    [InlineData(VocationalSubmitStatus.InvalidGroup, HttpStatusCode.BadRequest, "Invalid submission")]
    [InlineData(VocationalSubmitStatus.Expired, HttpStatusCode.NotFound, "Not found")]   // submit expired → 404 (NOT 410)
    [InlineData(VocationalSubmitStatus.NotFound, HttpStatusCode.NotFound, "Not found")]
    public async Task Submit_maps_each_error(VocationalSubmitStatus status, HttpStatusCode expected, string message)
    {
        var fake = new FakeService { SubmitResult = new VocationalSubmitResult(status) };
        using var client = new Factory(fake).CreateClient();
        var response = await client.PostAsync("/evaluation/vocational/submit", ValidSubmitBody());
        Assert.Equal(expected, response.StatusCode);
        await AssertMessage(response, message);
    }

    [Fact]
    public async Task Violations_found_returns_saved_and_count()
    {
        var fake = new FakeService { ViolationsResult = new ViolationsResult(true, 2, 5) };
        using var client = new Factory(fake).CreateClient();
        var response = await client.PostAsync("/evaluation/vocational/tok/violations", Json("""{"violations":[{"type":"blur"}]}"""));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(2, data.GetProperty("saved").GetInt32());
        Assert.Equal(5, data.GetProperty("violation_count").GetInt32());
    }

    [Fact]
    public async Task Violations_not_found_is_404()
    {
        var fake = new FakeService { ViolationsResult = new ViolationsResult(false) };
        using var client = new Factory(fake).CreateClient();
        var response = await client.PostAsync("/evaluation/vocational/tok/violations", Json("""{"violations":[]}"""));
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Not found");
    }

    // ---- helpers ----

    private static StringContent Json(string json) => new(json, Encoding.UTF8, "application/json");

    private static StringContent ValidSubmitBody() =>
        Json("""{"token":"t1","answers":[{"questionNumber":1,"type":"likert","ratingValue":5}]}""");

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
                services.RemoveAll<IVocationalTakeService>();
                services.AddSingleton<IVocationalTakeService>(service);
            });
        }
    }

    private sealed class FakeService : IVocationalTakeService
    {
        public VocationalFormResult FormResult { get; init; } = new(VocationalFormStatus.NotFound);

        public VocationalSubmitResult SubmitResult { get; init; } = new(VocationalSubmitStatus.Ok, 1);

        public ViolationsResult ViolationsResult { get; init; } = new(true, 1, 1);

        public Task<VocationalFormResult> GetFormAsync(string token, CancellationToken cancellationToken = default) =>
            Task.FromResult(FormResult);

        public Task<VocationalSubmitResult> SubmitAsync(string token, IReadOnlyList<VocationalAnswerInput> answers, CancellationToken cancellationToken = default) =>
            Task.FromResult(SubmitResult);

        public Task<ViolationsResult> SaveViolationsAsync(string token, JsonElement rawViolations, CancellationToken cancellationToken = default) =>
            Task.FromResult(ViolationsResult);
    }
}
