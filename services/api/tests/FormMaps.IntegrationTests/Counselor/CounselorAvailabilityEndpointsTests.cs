using System.Net;
using System.Net.Http.Json;
using System.Text;
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
/// Guard + shape + body-extraction for the counselor availability GET/PUT (FM-DOTNET-069; repo faked). Pins:
/// anonymous → 401; missing counselor:sessions → 403; GET no-row → minimal { timezone:"UTC", weeklySchedule:[] };
/// GET/PUT full-row shape; the JS-|| body resolution (timezone default; weeklySchedule || slots || []); and a
/// primitive/malformed body → 500.
/// </summary>
public class CounselorAvailabilityEndpointsTests
{
    private const string Path = "/api/v1/counselor/me/availability";

    [Fact]
    public async Task Anonymous_is_401()
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(Path)).StatusCode);
    }

    [Fact]
    public async Task Missing_permission_is_403()
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, Path, permission: FormMapsPermissions.ReportsRead);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Get_no_row_returns_minimal_default()
    {
        using var factory = new Factory(new FakeRepo { Row = null });
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Path);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("UTC", data.GetProperty("timezone").GetString());
        Assert.Empty(data.GetProperty("weeklySchedule").EnumerateArray());
        Assert.False(data.TryGetProperty("id", out _)); // minimal shape has no id
    }

    [Fact]
    public async Task Get_existing_row_returns_full_shape_with_jsonb_verbatim()
    {
        using var factory = new Factory(new FakeRepo { Row = SampleRow("""[{"Day":"Monday","Enabled":true}]""") });
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Path);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("av1", data.GetProperty("id").GetString());
        Assert.Equal("America/New_York", data.GetProperty("timezone").GetString());
        Assert.Equal("Monday", data.GetProperty("weeklySchedule")[0].GetProperty("Day").GetString());
    }

    [Fact]
    public async Task Put_resolves_timezone_and_weeklySchedule_and_returns_row()
    {
        var repo = new FakeRepo { Row = SampleRow("[]") };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, Path, body: """{"timezone":"America/Chicago","weeklySchedule":[{"Day":"Tue"}]}""");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("America/Chicago", repo.LastTimezone);
        Assert.Equal("""[{"Day":"Tue"}]""", Compact(repo.LastWeeklyScheduleJson!));
    }

    [Theory]
    // timezone defaults
    [InlineData("""{"weeklySchedule":[]}""", "UTC", "[]")]
    [InlineData("""{"timezone":"","weeklySchedule":[]}""", "UTC", "[]")]
    // weeklySchedule || slots || []
    [InlineData("""{"slots":[{"a":1}]}""", "UTC", """[{"a":1}]""")]
    [InlineData("""{"weeklySchedule":[{"w":1}],"slots":[{"s":1}]}""", "UTC", """[{"w":1}]""")] // weeklySchedule wins
    [InlineData("""{}""", "UTC", "[]")]
    // empty array weeklySchedule is JS-truthy → wins over slots
    [InlineData("""{"weeklySchedule":[],"slots":[{"s":1}]}""", "UTC", "[]")]
    // weeklySchedule null / "" are FALSY → fall through to slots
    [InlineData("""{"weeklySchedule":null,"slots":[{"s":1}]}""", "UTC", """[{"s":1}]""")]
    [InlineData("""{"weeklySchedule":"","slots":[{"s":1}]}""", "UTC", """[{"s":1}]""")]
    // timezone non-string (pathological) → documented divergence → "UTC" (TS would 500)
    [InlineData("""{"timezone":5,"weeklySchedule":[]}""", "UTC", "[]")]
    public async Task Put_body_resolution_parity(string body, string expectedTz, string expectedSchedule)
    {
        var repo = new FakeRepo { Row = SampleRow("[]") };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        await Send(client, HttpMethod.Put, Path, body: body);
        Assert.Equal(expectedTz, repo.LastTimezone);
        Assert.Equal(expectedSchedule, Compact(repo.LastWeeklyScheduleJson!));
    }

    [Theory]
    [InlineData("5")]        // primitive number
    [InlineData("\"str\"")]  // primitive string
    [InlineData("{\"a\":")]  // malformed (non-primitive) → JsonException branch
    public async Task Put_primitive_or_malformed_body_is_500(string body)
    {
        using var factory = new Factory(new FakeRepo { Row = SampleRow("[]") });
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, Path, body: body);
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Theory]
    [InlineData("")]    // empty body → {} → defaults
    [InlineData("[]")]  // array body → {} → defaults (no named props)
    public async Task Put_empty_or_array_body_uses_defaults(string body)
    {
        var repo = new FakeRepo { Row = SampleRow("[]") };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, Path, body: body);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("UTC", repo.LastTimezone);
        Assert.Equal("[]", Compact(repo.LastWeeklyScheduleJson!));
    }

    // ---- helpers ----

    private static string Compact(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return JsonSerializer.Serialize(doc.RootElement);
    }

    private static AvailabilityRow SampleRow(string weeklyScheduleJson)
    {
        using var doc = JsonDocument.Parse(weeklyScheduleJson);
        return new AvailabilityRow("av1", "counselor-1", "America/New_York", doc.RootElement.Clone(),
            true, null, "2026-01-01T00:00:00.000Z", null, "2026-01-02T00:00:00.000Z");
    }

    private static Task<HttpResponseMessage> Send(
        HttpClient client, HttpMethod method, string path, string? body = null,
        string permission = FormMapsPermissions.CounselorSessions, string role = FormMapsRoles.Counselor)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "counselor-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "c@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Counselor");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permission);
        if (body is not null)
        {
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        }

        return client.SendAsync(request);
    }

    private sealed class Factory(FakeRepo repo) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ICounselorAvailabilityRepository>();
                services.AddSingleton<ICounselorAvailabilityRepository>(repo);
            });
        }
    }

    private sealed class FakeRepo : ICounselorAvailabilityRepository
    {
        public AvailabilityRow? Row { get; init; }
        public string? LastTimezone { get; private set; }
        public string? LastWeeklyScheduleJson { get; private set; }

        public Task<AvailabilityRow?> GetAsync(RequestContext context, string userId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Row);

        public Task<AvailabilityRow> UpsertAsync(
            RequestContext context, string userId, string timezone, string weeklyScheduleJson, CancellationToken cancellationToken = default)
        {
            LastTimezone = timezone;
            LastWeeklyScheduleJson = weeklyScheduleJson;
            return Task.FromResult(Row!);
        }
    }
}
