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
/// Guard chain + HTTP mapping for the test-scores read endpoints. The reader is faked (its DB behavior is
/// proven by TestScoreReaderTests). Pins: anon -> 401 on all three; superscore/college-fit self 200 shape;
/// the student-view role auth asymmetry (counselor-miss -> 404 "Not found"; parent-miss -> 403 "Forbidden:
/// no active parent link"; any other role -> 403 "Forbidden"); and the 100-char path bound.
/// </summary>
public class TestScoreEndpointsTests
{
    private const string Caller = "user-123";
    private const string Student = "student-x";

    [Theory]
    [InlineData("/api/v1/test-scores/superscore")]
    [InlineData("/api/v1/test-scores/college-fit")]
    [InlineData("/api/v1/test-scores/students/student-x/test-scores")]
    public async Task Anonymous_is_401(string path)
    {
        using var factory = new Factory(new FakeReader());
        using var client = factory.CreateClient();

        var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Superscore_self_returns_200_shape()
    {
        var reader = new FakeReader { Superscore = new SuperscoreResult(new SatSuperscore(700, 720, 1420), null) };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/test-scores/superscore", FormMapsRoles.Student);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var sat = doc.RootElement.GetProperty("data").GetProperty("sat");
        Assert.Equal(1420, sat.GetProperty("satTotal").GetInt32());
        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("data").GetProperty("act").ValueKind);
    }

    [Fact]
    public async Task CollegeFit_self_returns_200_shape()
    {
        var reader = new FakeReader
        {
            CollegeFit = new CollegeFitResult(1420, [new CollegeFitEntry("u1", "Uni", "Town", "CA", 0.05, 1400, 1560, "reach")]),
        };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/test-scores/college-fit", FormMapsRoles.Student);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(1420, data.GetProperty("superscore").GetInt32());
        Assert.Equal("reach", data.GetProperty("colleges")[0].GetProperty("fit").GetString());
        Assert.Equal(0.05, data.GetProperty("colleges")[0].GetProperty("acceptanceRate").GetDouble());
    }

    [Fact]
    public async Task Student_view_counselor_with_assignment_returns_200()
    {
        var reader = new FakeReader { CounselorAllowed = true, Rows = [] };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/test-scores/students/{Student}/test-scores", FormMapsRoles.Counselor);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(Student, reader.ListedUserId);
    }

    [Fact]
    public async Task Student_view_counselor_without_assignment_is_404()
    {
        var reader = new FakeReader { CounselorAllowed = false };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/test-scores/students/{Student}/test-scores", FormMapsRoles.Counselor);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Not found");
        Assert.Null(reader.ListedUserId); // list skipped
    }

    [Fact]
    public async Task Student_view_parent_without_link_is_403_with_parent_message()
    {
        var reader = new FakeReader { ParentAllowed = false };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/test-scores/students/{Student}/test-scores", FormMapsRoles.Parent);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        await AssertMessage(response, "Forbidden: no active parent link");
    }

    [Fact]
    public async Task Student_view_parent_normalizes_the_caller_email_for_the_link_check()
    {
        var reader = new FakeReader { ParentAllowed = true, Rows = [] };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/test-scores/students/{Student}/test-scores", FormMapsRoles.Parent, email: "  PARENT@Example.TEST  ");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("parent@example.test", reader.ParentEmail); // trim + lowercase
    }

    [Fact]
    public async Task Student_view_other_role_is_403_forbidden()
    {
        var reader = new FakeReader();
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/test-scores/students/{Student}/test-scores", FormMapsRoles.Teacher);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        await AssertMessage(response, "Forbidden");
    }

    [Fact]
    public async Task Student_view_bounds_the_path_param_to_100_chars()
    {
        var longId = new string('a', 150);
        var reader = new FakeReader { CounselorAllowed = false };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/test-scores/students/{longId}/test-scores", FormMapsRoles.Counselor);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(100, reader.CounselorStudentId!.Length);
    }

    // ---- helpers ----

    private static async Task AssertMessage(HttpResponseMessage response, string expected)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(expected, doc.RootElement.GetProperty("message").GetString());
    }

    private static Task<HttpResponseMessage> Send(HttpClient client, string path, string role, string email = "user@example.test")
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, Caller);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, email);
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Test User");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.ProfileRead);
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeReader reader) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ITestScoreReader>();
                services.AddSingleton<ITestScoreReader>(reader);
            });
        }
    }

    private sealed class FakeReader : ITestScoreReader
    {
        public SuperscoreResult Superscore { get; init; } = new(null, null);

        public CollegeFitResult CollegeFit { get; init; } = new(null, []);

        public bool CounselorAllowed { get; init; }

        public bool ParentAllowed { get; init; }

        public IReadOnlyList<TestScoreRow> Rows { get; init; } = [];

        public string? ListedUserId { get; private set; }

        public string? CounselorStudentId { get; private set; }

        public string? ParentEmail { get; private set; }

        public Task<SuperscoreResult> GetSuperscoreAsync(RequestContext context, CancellationToken cancellationToken = default) =>
            Task.FromResult(Superscore);

        public Task<CollegeFitResult> GetCollegeFitAsync(RequestContext context, CancellationToken cancellationToken = default) =>
            Task.FromResult(CollegeFit);

        public Task<bool> HasActiveCounselorAssignmentAsync(
            RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default)
        {
            CounselorStudentId = studentId;
            return Task.FromResult(CounselorAllowed);
        }

        public Task<bool> HasActiveParentLinkAsync(
            RequestContext context, string studentId, string parentEmail, CancellationToken cancellationToken = default)
        {
            ParentEmail = parentEmail;
            return Task.FromResult(ParentAllowed);
        }

        public Task<IReadOnlyList<TestScoreRow>> ListActiveScoresAsync(
            RequestContext context, string userId, string? testType, CancellationToken cancellationToken = default)
        {
            ListedUserId = userId;
            return Task.FromResult(Rows);
        }
    }
}
