using System.Net;
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
/// Guard chain + HTTP status/body mapping for the test-scores write + list endpoints. The writer/reader are
/// faked (DB behavior is proven by TestScoreWriterTests). Pins: anon -> 401 on GET/POST/PUT/DELETE; POST
/// Created -> 201 data; validation -> 400 message; PUT Ok -> 200 / NotFound -> 404 "Test score not found";
/// DELETE deleted -> 200 "Test score deleted successfully" / not -> 404; and the list forwards the caller id.
/// </summary>
public class TestScoreWriteEndpointsTests
{
    private const string Caller = "user-123";

    [Theory]
    [InlineData("GET", "/api/v1/test-scores")]
    [InlineData("POST", "/api/v1/test-scores")]
    [InlineData("PUT", "/api/v1/test-scores/abc")]
    [InlineData("DELETE", "/api/v1/test-scores/abc")]
    public async Task Anonymous_is_401(string method, string path)
    {
        using var factory = new Factory(new FakeWriter(), new FakeReader());
        using var client = factory.CreateClient();

        var response = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Create_returns_201_with_the_row()
    {
        var writer = new FakeWriter { CreateOutcome = new TestScoreWriteOutcome(TestScoreWriteStatus.Created, Row("ts-1"), null) };
        using var factory = new Factory(writer, new FakeReader());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/test-scores", FormMapsRoles.Student, """{"testType":"SAT"}""");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("ts-1", doc.RootElement.GetProperty("data").GetProperty("id").GetString());
        Assert.Equal(Caller, writer.CreatedUserId);
    }

    [Fact]
    public async Task Create_validation_error_is_400_with_message()
    {
        var writer = new FakeWriter { CreateOutcome = new TestScoreWriteOutcome(TestScoreWriteStatus.ValidationError, null, "Required") };
        using var factory = new Factory(writer, new FakeReader());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/test-scores", FormMapsRoles.Student, "{}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "Required");
    }

    [Fact]
    public async Task Update_ok_is_200_and_notfound_is_404()
    {
        var okWriter = new FakeWriter { UpdateOutcome = new TestScoreWriteOutcome(TestScoreWriteStatus.Ok, Row("ts-9"), null) };
        using (var factory = new Factory(okWriter, new FakeReader()))
        using (var client = factory.CreateClient())
        {
            var response = await Send(client, HttpMethod.Put, "/api/v1/test-scores/ts-9", FormMapsRoles.Student, """{"satMath":800}""");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal("ts-9", okWriter.UpdatedId);
        }

        var missingWriter = new FakeWriter { UpdateOutcome = new TestScoreWriteOutcome(TestScoreWriteStatus.NotFound, null, null) };
        using (var factory = new Factory(missingWriter, new FakeReader()))
        using (var client = factory.CreateClient())
        {
            var response = await Send(client, HttpMethod.Put, "/api/v1/test-scores/ts-9", FormMapsRoles.Student, "{}");
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            await AssertMessage(response, "Test score not found");
        }
    }

    [Fact]
    public async Task Update_validation_error_is_400()
    {
        var writer = new FakeWriter { UpdateOutcome = new TestScoreWriteOutcome(TestScoreWriteStatus.ValidationError, null, "Number must be greater than or equal to 200") };
        using var factory = new Factory(writer, new FakeReader());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, "/api/v1/test-scores/ts-1", FormMapsRoles.Student, """{"satMath":1}""");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "Number must be greater than or equal to 200");
    }

    [Fact]
    public async Task Delete_ok_is_200_message_and_missing_is_404()
    {
        using (var factory = new Factory(new FakeWriter { DeleteResult = true }, new FakeReader()))
        using (var client = factory.CreateClient())
        {
            var response = await Send(client, HttpMethod.Delete, "/api/v1/test-scores/ts-1", FormMapsRoles.Student);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
            Assert.Equal("Test score deleted successfully", doc.RootElement.GetProperty("message").GetString());
        }

        using (var factory = new Factory(new FakeWriter { DeleteResult = false }, new FakeReader()))
        using (var client = factory.CreateClient())
        {
            var response = await Send(client, HttpMethod.Delete, "/api/v1/test-scores/ts-1", FormMapsRoles.Student);
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            await AssertMessage(response, "Test score not found");
        }
    }

    [Fact]
    public async Task List_forwards_caller_id_and_testType_filter()
    {
        var reader = new FakeReader { Rows = [Row("ts-1")] };
        using var factory = new Factory(new FakeWriter(), reader);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, "/api/v1/test-scores?testType=SAT", FormMapsRoles.Student);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(Caller, reader.ListedUserId);
        Assert.Equal("SAT", reader.ListedTestType);
    }

    [Fact]
    public async Task Endpoint_forwards_a_non_object_body_kind_to_the_writer()
    {
        // Proves ReadBodyAsync preserves the real top-level kind (does not collapse `[]` to `{}`), so the
        // validator can reject it. The fake writer ignores the body, so status here is its canned outcome —
        // the assertion is on the forwarded kind.
        var writer = new FakeWriter { CreateOutcome = new TestScoreWriteOutcome(TestScoreWriteStatus.Created, Row("x"), null) };
        using var factory = new Factory(writer, new FakeReader());
        using var client = factory.CreateClient();

        await Send(client, HttpMethod.Post, "/api/v1/test-scores", FormMapsRoles.Student, "[]");
        Assert.Equal(JsonValueKind.Array, writer.LastBodyKind);

        await Send(client, HttpMethod.Put, "/api/v1/test-scores/x", FormMapsRoles.Student, "42");
        Assert.Equal(JsonValueKind.Number, writer.LastBodyKind);
    }

    [Fact]
    public async Task Endpoint_normalizes_an_empty_body_to_an_object()
    {
        var writer = new FakeWriter { CreateOutcome = new TestScoreWriteOutcome(TestScoreWriteStatus.ValidationError, null, "Required") };
        using var factory = new Factory(writer, new FakeReader());
        using var client = factory.CreateClient();

        await Send(client, HttpMethod.Post, "/api/v1/test-scores", FormMapsRoles.Student); // no body
        Assert.Equal(JsonValueKind.Object, writer.LastBodyKind); // absent body -> {} (not Undefined/Array)
    }

    // ---- helpers ----

    private static TestScoreRow Row(string id) => new(
        Id: id, UserId: Caller, TestType: "SAT", TestDate: null,
        SatTotal: null, SatMath: null, SatReading: null, ActComposite: null, ActEnglish: null, ActMath: null,
        ActReading: null, ActScience: null, ApSubject: null, ApScore: null, TotalScore: null,
        SubScores: JsonDocument.Parse("null").RootElement.Clone(),
        IsSuperScore: false, IsOfficial: true, IsActive: true,
        CreatedBy: null, CreatedDate: "2025-01-01T00:00:00.000Z", UpdatedBy: null, UpdatedAt: "2025-01-01T00:00:00.000Z");

    private static async Task AssertMessage(HttpResponseMessage response, string expected)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(expected, doc.RootElement.GetProperty("message").GetString());
    }

    private static Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, string role, string? body = null)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, Caller);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "user@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Test User");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.ProfileRead);
        if (body is not null)
        {
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        }

        return client.SendAsync(request);
    }

    private sealed class Factory(FakeWriter writer, FakeReader reader) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ITestScoreWriter>();
                services.AddSingleton<ITestScoreWriter>(writer);
                services.RemoveAll<ITestScoreReader>();
                services.AddSingleton<ITestScoreReader>(reader);
            });
        }
    }

    private sealed class FakeWriter : ITestScoreWriter
    {
        public TestScoreWriteOutcome CreateOutcome { get; init; } = new(TestScoreWriteStatus.Created, null, null);

        public TestScoreWriteOutcome UpdateOutcome { get; init; } = new(TestScoreWriteStatus.Ok, null, null);

        public bool DeleteResult { get; init; }

        public string? CreatedUserId { get; private set; }

        public string? UpdatedId { get; private set; }

        public JsonValueKind LastBodyKind { get; private set; }

        public Task<TestScoreWriteOutcome> CreateAsync(RequestContext context, string userId, JsonElement body, CancellationToken cancellationToken = default)
        {
            CreatedUserId = userId;
            LastBodyKind = body.ValueKind;
            return Task.FromResult(CreateOutcome);
        }

        public Task<TestScoreWriteOutcome> UpdateAsync(RequestContext context, string userId, string id, JsonElement body, CancellationToken cancellationToken = default)
        {
            UpdatedId = id;
            LastBodyKind = body.ValueKind;
            return Task.FromResult(UpdateOutcome);
        }

        public Task<bool> DeleteAsync(RequestContext context, string userId, string id, CancellationToken cancellationToken = default) =>
            Task.FromResult(DeleteResult);
    }

    private sealed class FakeReader : ITestScoreReader
    {
        public IReadOnlyList<TestScoreRow> Rows { get; init; } = [];

        public string? ListedUserId { get; private set; }

        public string? ListedTestType { get; private set; }

        public Task<SuperscoreResult> GetSuperscoreAsync(RequestContext context, CancellationToken cancellationToken = default) =>
            Task.FromResult(new SuperscoreResult(null, null));

        public Task<CollegeFitResult> GetCollegeFitAsync(RequestContext context, CancellationToken cancellationToken = default) =>
            Task.FromResult(new CollegeFitResult(null, []));

        public Task<bool> HasActiveCounselorAssignmentAsync(RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(false);

        public Task<bool> HasActiveParentLinkAsync(RequestContext context, string studentId, string parentEmail, CancellationToken cancellationToken = default) =>
            Task.FromResult(false);

        public Task<IReadOnlyList<TestScoreRow>> ListActiveScoresAsync(RequestContext context, string userId, string? testType, CancellationToken cancellationToken = default)
        {
            ListedUserId = userId;
            ListedTestType = testType;
            return Task.FromResult(Rows);
        }
    }
}
