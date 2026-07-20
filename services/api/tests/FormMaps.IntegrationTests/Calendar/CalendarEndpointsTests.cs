using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Calendar;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Calendar;

/// <summary>
/// Guard chain + HTTP mapping for the calendar reads (reader + scope resolver faked; DB behavior is proven by
/// CalendarReaderTests). Pins: anon -> 401; missing calendar:manage -> 403 (school:manage does NOT substitute);
/// no school -> 400; the DOUBLE-wrap { success, data:{ data:[...] } } envelope.
/// </summary>
public class CalendarEndpointsTests
{
    private const string YearsPath = "/api/v1/school-admin/calendar/academic-years";
    private const string PeriodsPath = "/api/v1/school-admin/calendar/assessment-periods";
    private const string HolidaysPath = "/api/v1/school-admin/calendar/holidays";
    private const string School = "school-1";

    [Fact]
    public async Task Anonymous_is_401()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(School));
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(YearsPath)).StatusCode);
    }

    [Fact]
    public async Task Missing_calendar_manage_is_403_even_with_school_manage()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(School));
        using var client = factory.CreateClient();

        // school:manage must NOT substitute for calendar:manage (SuperAdmin/SchoolAdmin-only permission).
        var response = await Send(client, YearsPath, permission: FormMapsPermissions.SchoolManage);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task No_school_is_400()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, YearsPath);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("No school", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task AcademicYears_is_double_wrapped()
    {
        var year = new AcademicYearRow("y-1", School, "2025-2026", "2025-08-01T00:00:00.000Z",
            "2026-06-01T00:00:00.000Z", true, true, null, "2026-01-01T00:00:00.000Z", null,
            "2026-01-01T00:00:00.000Z", []);
        using var factory = new Factory(new FakeReader { Years = [year] }, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, YearsPath, permission: FormMapsPermissions.CalendarManage);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        // DOUBLE-wrap: data.data is the array.
        var inner = doc.RootElement.GetProperty("data").GetProperty("data");
        Assert.Equal(JsonValueKind.Array, inner.ValueKind);
        Assert.Equal("2025-2026", inner[0].GetProperty("name").GetString());
        Assert.Equal(JsonValueKind.Array, inner[0].GetProperty("terms").ValueKind);
    }

    [Fact]
    public async Task Periods_and_holidays_are_double_wrapped_arrays()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(School));
        using var client = factory.CreateClient();

        foreach (var path in new[] { PeriodsPath, HolidaysPath })
        {
            var response = await Send(client, path, permission: FormMapsPermissions.CalendarManage);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            Assert.Equal(JsonValueKind.Array, doc.RootElement.GetProperty("data").GetProperty("data").ValueKind);
        }
    }

    // ---- helpers ----

    private static Task<HttpResponseMessage> Send(HttpClient client, string path, string permission = FormMapsPermissions.CalendarManage)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "admin-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.SchoolAdmin);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "admin@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Admin");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permission);
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeReader reader, FakeScope scope) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ICalendarReader>();
                services.AddSingleton<ICalendarReader>(reader);
                services.RemoveAll<ISchoolAdminScopeResolver>();
                services.AddSingleton<ISchoolAdminScopeResolver>(scope);
            });
        }
    }

    private sealed class FakeScope(string? schoolId) : ISchoolAdminScopeResolver
    {
        public Task<string?> ResolveSchoolIdAsync(RequestContext context, CancellationToken cancellationToken = default) =>
            Task.FromResult(schoolId);
    }

    private sealed class FakeReader : ICalendarReader
    {
        public IReadOnlyList<AcademicYearRow> Years { get; init; } = [];

        public Task<IReadOnlyList<AcademicYearRow>> GetAcademicYearsAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Years);

        public Task<IReadOnlyList<AssessmentPeriodRow>> GetAssessmentPeriodsAsync(
            RequestContext context, string schoolId, string? academicYearId, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<AssessmentPeriodRow>>([]);

        public Task<IReadOnlyList<HolidayRow>> GetHolidaysAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<HolidayRow>>([]);
    }
}
