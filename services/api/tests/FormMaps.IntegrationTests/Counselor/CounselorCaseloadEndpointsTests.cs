using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Counselor;

/// <summary>
/// Guard chain + page/limit clamp + JSON shape for GET /me/students (FM-DOTNET-068; reader faked, real computer). Pins:
/// anonymous → 401; missing counselor:dashboard → 403; the { data, total, page, limit, totalPages } envelope; the
/// limit clamp (min(50, …)/default 20 — observable via the echoed `limit`) and page default; and the enriched row
/// shape incl. creditProgress + the assessmentStatus { LIA, PCA, "360" } object.
/// </summary>
public class CounselorCaseloadEndpointsTests
{
    private const string Path = "/api/v1/counselor/me/students";

    [Fact]
    public async Task Anonymous_is_401()
    {
        using var factory = new Factory(new FakeReader(CaseloadData.Empty));
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(Path)).StatusCode);
    }

    [Fact]
    public async Task Missing_permission_is_403()
    {
        using var factory = new Factory(new FakeReader(CaseloadData.Empty));
        using var client = factory.CreateClient();
        var response = await Send(client, Path, permission: FormMapsPermissions.ReportsRead);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Happy_shape_envelope_and_enriched_row()
    {
        var data = new CaseloadData(
            Students: [new CaseloadStudent("s1", "Alice", "a@x.st", 11, true, "2026-01-01T00:00:00.000Z")],
            Grades: [new CaseloadGrade("s1", "A", 4, "c1")],
            PcaSessions: [], EvalGroups: [], PcaEvals: [], Profiles: [],
            AlertCounts: new Dictionary<string, int>(), CourseCredits: new Dictionary<string, double>(),
            CreditsRequired: 120, PersonalityCompletedUserIds: []);
        using var factory = new Factory(new FakeReader(data));
        using var client = factory.CreateClient();

        var response = await Send(client, Path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var payload = doc.RootElement.GetProperty("data");
        Assert.Equal(1, payload.GetProperty("total").GetInt32());
        Assert.Equal(1, payload.GetProperty("page").GetInt32());
        Assert.Equal(20, payload.GetProperty("limit").GetInt32());
        Assert.Equal(1, payload.GetProperty("totalPages").GetInt32());

        var row = payload.GetProperty("data")[0];
        Assert.Equal("s1", row.GetProperty("id").GetString());
        Assert.Equal(4, row.GetProperty("gpa").GetDouble());
        Assert.Equal("active", row.GetProperty("status").GetString());
        Assert.Equal(120, row.GetProperty("creditProgress").GetProperty("required").GetDouble());
        // No PCA sessions / evals / 360 groups seeded → all three badges not_started; the "360" key is present + exact.
        var badges = row.GetProperty("assessmentStatus");
        Assert.Equal("not_started", badges.GetProperty("LIA").GetString());
        Assert.Equal("not_started", badges.GetProperty("PCA").GetString());
        Assert.Equal("not_started", badges.GetProperty("360").GetString());
    }

    [Theory]
    [InlineData("?limit=999", 50)]
    [InlineData("?limit=abc", 20)]
    [InlineData("?limit=0", 20)]
    [InlineData("", 20)]
    public async Task Limit_is_clamped_and_echoed(string query, int expectedLimit)
    {
        using var factory = new Factory(new FakeReader(CaseloadData.Empty));
        using var client = factory.CreateClient();
        var response = await Send(client, Path + query);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(expectedLimit, doc.RootElement.GetProperty("data").GetProperty("limit").GetInt32());
    }

    [Fact]
    public async Task Page_defaults_to_1_on_garbage()
    {
        using var factory = new Factory(new FakeReader(CaseloadData.Empty));
        using var client = factory.CreateClient();
        var response = await Send(client, Path + "?page=abc");
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, doc.RootElement.GetProperty("data").GetProperty("page").GetInt32());
    }

    // ---- helpers ----

    private static Task<HttpResponseMessage> Send(
        HttpClient client, string path,
        string permission = FormMapsPermissions.CounselorDashboard, string role = FormMapsRoles.Counselor)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "counselor-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "c@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Counselor");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permission);
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeReader reader) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ICounselorCaseloadReader>();
                services.AddSingleton<ICounselorCaseloadReader>(reader);
            });
        }
    }

    private sealed class FakeReader(CaseloadData data) : ICounselorCaseloadReader
    {
        public Task<CaseloadData> GetCaseloadDataAsync(
            RequestContext context, string counselorId, CancellationToken cancellationToken = default) =>
            Task.FromResult(data);
    }
}
