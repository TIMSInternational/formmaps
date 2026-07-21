using System.Net;
using System.Text;
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
/// Guard chain + HTTP status/body mapping for the calendar WRITES (writer + scope faked; DB behavior is proven
/// by CalendarWriterTests). Pins: anon -> 401; missing calendar:manage -> 403 (school:manage does NOT
/// substitute); no school -> 400; malformed body -> 400; the exact create statuses (201 year/period, 200
/// holidays, 204 holiday delete, 200 others) and the exact IDOR/not-found 404 messages; up-front validation 400s.
/// </summary>
public class CalendarWriteEndpointTests
{
    private const string Years = "/api/v1/school-admin/calendar/academic-years";
    private const string Periods = "/api/v1/school-admin/calendar/assessment-periods";
    private const string Holidays = "/api/v1/school-admin/calendar/holidays";
    private const string School = "school-1";

    // ---- guard chain ----

    [Fact]
    public async Task Anonymous_is_401()
    {
        using var client = Client(new FakeWriter(), new FakeScope(School));
        var response = await client.SendAsync(Anon(HttpMethod.Post, Years, "{}"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Missing_calendar_manage_is_403_even_with_school_manage()
    {
        using var client = Client(new FakeWriter(), new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, Years, "{}", FormMapsPermissions.SchoolManage));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task No_school_is_400()
    {
        using var client = Client(new FakeWriter(), new FakeScope(null));
        var response = await client.SendAsync(Auth(HttpMethod.Post, Years, "{}"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("No school", await MessageAsync(response));
    }

    [Fact]
    public async Task Malformed_body_is_400_invalid_request_body()
    {
        using var client = Client(new FakeWriter(), new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, Years, "{not json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Invalid request body", await MessageAsync(response));
    }

    // ---- academic years ----

    [Fact]
    public async Task Post_academic_year_returns_201_with_id_and_name()
    {
        using var client = Client(new FakeWriter { CreatedYear = new CalendarCreatedRow("y-new", "2025-2026") }, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, Years,
            """{"name":"2025-2026","startDate":"2025-08-01","endDate":"2026-06-15"}"""));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("y-new", doc.RootElement.GetProperty("data").GetProperty("id").GetString());
        Assert.Equal("2025-2026", doc.RootElement.GetProperty("data").GetProperty("name").GetString());
    }

    [Fact]
    public async Task Post_academic_year_missing_name_is_400_and_writer_not_called()
    {
        var writer = new FakeWriter();
        using var client = Client(writer, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, Years,
            """{"startDate":"2025-08-01","endDate":"2026-06-15"}"""));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(writer.CreateYearCalled);
    }

    [Fact]
    public async Task Post_academic_year_bad_startDate_is_400()
    {
        using var client = Client(new FakeWriter(), new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, Years,
            """{"name":"x","startDate":"nope","endDate":"2026-06-15"}"""));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Post_academic_year_bad_term_date_is_400()
    {
        var writer = new FakeWriter();
        using var client = Client(writer, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, Years,
            """{"name":"x","startDate":"2025-08-01","endDate":"2026-06-15","terms":[{"name":"Fall","startDate":"bad","endDate":"2025-12-01"}]}"""));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(writer.CreateYearCalled);
    }

    [Fact]
    public async Task Put_set_current_found_is_200_notfound_is_404()
    {
        using (var client = Client(new FakeWriter { SetCurrentResult = true }, new FakeScope(School)))
        {
            var ok = await client.SendAsync(Auth(HttpMethod.Put, $"{Years}/y-1/set-current", "{}"));
            Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
            using var doc = JsonDocument.Parse(await ok.Content.ReadAsStringAsync());
            Assert.Equal("y-1", doc.RootElement.GetProperty("data").GetProperty("id").GetString());
            Assert.True(doc.RootElement.GetProperty("data").GetProperty("isCurrent").GetBoolean());
        }

        using (var client = Client(new FakeWriter { SetCurrentResult = false }, new FakeScope(School)))
        {
            var nf = await client.SendAsync(Auth(HttpMethod.Put, $"{Years}/ghost/set-current", "{}"));
            Assert.Equal(HttpStatusCode.NotFound, nf.StatusCode);
            Assert.Equal("Not found", await MessageAsync(nf));
        }
    }

    [Fact]
    public async Task Delete_academic_year_found_is_200_notfound_is_404()
    {
        using (var client = Client(new FakeWriter { DeleteYearResult = true }, new FakeScope(School)))
        {
            var ok = await client.SendAsync(Auth(HttpMethod.Delete, $"{Years}/y-1", null));
            Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
            using var doc = JsonDocument.Parse(await ok.Content.ReadAsStringAsync());
            Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
            Assert.False(doc.RootElement.TryGetProperty("data", out _)); // NO data key on delete
        }

        using (var client = Client(new FakeWriter { DeleteYearResult = false }, new FakeScope(School)))
        {
            var nf = await client.SendAsync(Auth(HttpMethod.Delete, $"{Years}/ghost", null));
            Assert.Equal(HttpStatusCode.NotFound, nf.StatusCode);
            Assert.Equal("Not found", await MessageAsync(nf));
        }
    }

    [Fact]
    public async Task Put_academic_year_found_is_200_notfound_is_404_with_specific_message()
    {
        using (var client = Client(new FakeWriter { UpdateYearResult = true }, new FakeScope(School)))
        {
            var ok = await client.SendAsync(Auth(HttpMethod.Put, $"{Years}/y-1", """{"name":"New"}"""));
            Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
            using var doc = JsonDocument.Parse(await ok.Content.ReadAsStringAsync());
            Assert.Equal("y-1", doc.RootElement.GetProperty("data").GetProperty("id").GetString());
        }

        using (var client = Client(new FakeWriter { UpdateYearResult = false }, new FakeScope(School)))
        {
            var nf = await client.SendAsync(Auth(HttpMethod.Put, $"{Years}/ghost", "{}"));
            Assert.Equal(HttpStatusCode.NotFound, nf.StatusCode);
            Assert.Equal("Academic year not found", await MessageAsync(nf));
        }
    }

    // ---- assessment periods ----

    [Fact]
    public async Task Post_assessment_period_returns_201_and_no_term_is_400()
    {
        using (var client = Client(new FakeWriter { CreatedPeriod = new CalendarCreatedRow("p-1", "Window") }, new FakeScope(School)))
        {
            var ok = await client.SendAsync(Auth(HttpMethod.Post, Periods,
                """{"startDate":"2025-01-01","endDate":"2025-02-01"}"""));
            Assert.Equal(HttpStatusCode.Created, ok.StatusCode);
            using var doc = JsonDocument.Parse(await ok.Content.ReadAsStringAsync());
            Assert.Equal("p-1", doc.RootElement.GetProperty("data").GetProperty("id").GetString());
        }

        using (var client = Client(new FakeWriter { CreatedPeriod = null }, new FakeScope(School)))
        {
            var bad = await client.SendAsync(Auth(HttpMethod.Post, Periods,
                """{"startDate":"2025-01-01","endDate":"2025-02-01"}"""));
            Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
            Assert.Equal("No term available. Create an academic year with terms first.", await MessageAsync(bad));
        }
    }

    [Fact]
    public async Task Post_assessment_period_bad_date_is_400()
    {
        using var client = Client(new FakeWriter(), new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, Periods, """{"startDate":"bad","endDate":"2025-02-01"}"""));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Delete_assessment_period_notfound_is_404()
    {
        using var client = Client(new FakeWriter { DeletePeriodResult = false }, new FakeScope(School));
        var nf = await client.SendAsync(Auth(HttpMethod.Delete, $"{Periods}/ghost", null));
        Assert.Equal(HttpStatusCode.NotFound, nf.StatusCode);
        Assert.Equal("Not found", await MessageAsync(nf));
    }

    [Fact]
    public async Task Put_assessment_period_notfound_is_404_with_specific_message()
    {
        using var client = Client(new FakeWriter { UpdatePeriodResult = false }, new FakeScope(School));
        var nf = await client.SendAsync(Auth(HttpMethod.Put, $"{Periods}/ghost", "{}"));
        Assert.Equal(HttpStatusCode.NotFound, nf.StatusCode);
        Assert.Equal("Assessment period not found", await MessageAsync(nf));
    }

    // ---- holidays ----

    [Fact]
    public async Task Post_holidays_returns_200_with_count_and_no_ay_is_400()
    {
        using (var client = Client(new FakeWriter { HolidaysCount = 3 }, new FakeScope(School)))
        {
            var ok = await client.SendAsync(Auth(HttpMethod.Post, Holidays,
                """{"holidays":[{"name":"Xmas","date":"2025-12-25"}]}"""));
            Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
            using var doc = JsonDocument.Parse(await ok.Content.ReadAsStringAsync());
            Assert.Equal(3, doc.RootElement.GetProperty("data").GetProperty("count").GetInt32());
        }

        using (var client = Client(new FakeWriter { HolidaysCount = null }, new FakeScope(School)))
        {
            var bad = await client.SendAsync(Auth(HttpMethod.Post, Holidays, "{}"));
            Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
            Assert.Equal("No academic year. Create one first.", await MessageAsync(bad));
        }
    }

    [Fact]
    public async Task Delete_holiday_found_is_204_notfound_is_404()
    {
        using (var client = Client(new FakeWriter { DeleteHolidayResult = true }, new FakeScope(School)))
        {
            var ok = await client.SendAsync(Auth(HttpMethod.Delete, $"{Holidays}/h-1", null));
            Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);
        }

        using (var client = Client(new FakeWriter { DeleteHolidayResult = false }, new FakeScope(School)))
        {
            var nf = await client.SendAsync(Auth(HttpMethod.Delete, $"{Holidays}/ghost", null));
            Assert.Equal(HttpStatusCode.NotFound, nf.StatusCode);
            Assert.Equal("Not found", await MessageAsync(nf));
        }
    }

    // ---- FM-048 gate folds: wrong-typed -> 400; falsy-coalescing / empty-string honored ----

    [Fact]
    public async Task Post_academic_year_empty_name_is_201() // fold 6: "" accepted (legacy creates name="")
    {
        using var client = Client(new FakeWriter { CreatedYear = new CalendarCreatedRow("y", "") }, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, Years,
            """{"name":"","startDate":"2025-08-01","endDate":"2026-06-15"}"""));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Post_academic_year_falsy_terms_is_201_no_terms() // fold 5: terms:false -> [] -> 201
    {
        var writer = new FakeWriter();
        using var client = Client(writer, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, Years,
            """{"name":"x","startDate":"2025-08-01","endDate":"2026-06-15","terms":false}"""));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.True(writer.CreateYearCalled);
    }

    [Fact]
    public async Task Post_academic_year_truthy_nonarray_terms_is_400() // fold 5: terms:"x" -> 400
    {
        var writer = new FakeWriter();
        using var client = Client(writer, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, Years,
            """{"name":"x","startDate":"2025-08-01","endDate":"2026-06-15","terms":"x"}"""));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("terms must be an array", await MessageAsync(response));
        Assert.False(writer.CreateYearCalled);
    }

    [Fact]
    public async Task Post_assessment_period_nonstring_termId_is_400() // fold 1: termId:123 -> 400
    {
        var writer = new FakeWriter { CreatedPeriod = new CalendarCreatedRow("p", "P") };
        using var client = Client(writer, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, Periods,
            """{"startDate":"2025-01-01","endDate":"2025-02-01","termId":123}"""));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("termId must be a string", await MessageAsync(response));
    }

    [Fact]
    public async Task Post_assessment_period_truthy_nonarray_assessmentTypes_is_400() // fold 3: "x" -> 400
    {
        using var client = Client(new FakeWriter { CreatedPeriod = new CalendarCreatedRow("p", "P") }, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, Periods,
            """{"startDate":"2025-01-01","endDate":"2025-02-01","assessmentTypes":"x"}"""));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("assessmentTypes must be an array", await MessageAsync(response));
    }

    [Fact]
    public async Task Post_assessment_period_falsy_assessmentTypes_is_201() // fold 3: false -> [] -> 201
    {
        using var client = Client(new FakeWriter { CreatedPeriod = new CalendarCreatedRow("p", "P") }, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, Periods,
            """{"startDate":"2025-01-01","endDate":"2025-02-01","assessmentTypes":false}"""));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Post_holidays_truthy_nonarray_is_400() // fold 4: holidays:"x" -> 400
    {
        using var client = Client(new FakeWriter { HolidaysCount = 0 }, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, Holidays, """{"holidays":"x"}"""));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("holidays must be an array", await MessageAsync(response));
    }

    [Fact]
    public async Task Post_holidays_nonstring_type_is_400() // fold 2: type:123 -> 400
    {
        using var client = Client(new FakeWriter { HolidaysCount = 1 }, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, Holidays,
            """{"holidays":[{"name":"Xmas","date":"2025-12-25","type":123}]}"""));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Invalid holiday", await MessageAsync(response));
    }

    [Fact]
    public async Task Post_holidays_nonstring_name_is_400() // fold 2: name:123 -> 400
    {
        using var client = Client(new FakeWriter { HolidaysCount = 1 }, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, Holidays,
            """{"holidays":[{"name":123,"date":"2025-12-25"}]}"""));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Invalid holiday", await MessageAsync(response));
    }

    [Fact]
    public async Task Post_holidays_falsy_body_is_200() // fold 4: holidays:false -> [] -> writer runs (AY gate)
    {
        var writer = new FakeWriter { HolidaysCount = 0 };
        using var client = Client(writer, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, Holidays, """{"holidays":false}"""));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    // ---- helpers ----

    private static HttpClient Client(FakeWriter writer, FakeScope scope) =>
        new Factory(writer, scope).CreateClient();

    private static HttpRequestMessage Auth(HttpMethod method, string path, string? body, string permission = FormMapsPermissions.CalendarManage)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "admin-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.SchoolAdmin);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "admin@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Admin");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permission);
        if (body is not null)
        {
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        }

        return request;
    }

    private static HttpRequestMessage Anon(HttpMethod method, string path, string? body)
    {
        var request = new HttpRequestMessage(method, path);
        if (body is not null)
        {
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        }

        return request;
    }

    private static async Task<string?> MessageAsync(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("message").GetString();
    }

    private sealed class Factory(FakeWriter writer, FakeScope scope) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ICalendarWriter>();
                services.AddSingleton<ICalendarWriter>(writer);
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

    private sealed class FakeWriter : ICalendarWriter
    {
        public CalendarCreatedRow CreatedYear { get; init; } = new("y-new", "Year");
        public bool SetCurrentResult { get; init; }
        public bool DeleteYearResult { get; init; }
        public bool UpdateYearResult { get; init; }
        public CalendarCreatedRow? CreatedPeriod { get; init; } = new("p-new", "Period");
        public bool DeletePeriodResult { get; init; }
        public bool UpdatePeriodResult { get; init; }
        public int? HolidaysCount { get; init; }
        public bool DeleteHolidayResult { get; init; }

        public bool CreateYearCalled { get; private set; }

        public Task<CalendarCreatedRow> CreateAcademicYearAsync(
            RequestContext context, string schoolId, CreateAcademicYearInput input, CancellationToken cancellationToken = default)
        {
            CreateYearCalled = true;
            return Task.FromResult(CreatedYear);
        }

        public Task<bool> SetCurrentAcademicYearAsync(
            RequestContext context, string schoolId, string yearId, CancellationToken cancellationToken = default) =>
            Task.FromResult(SetCurrentResult);

        public Task<bool> DeleteAcademicYearAsync(
            RequestContext context, string schoolId, string yearId, CancellationToken cancellationToken = default) =>
            Task.FromResult(DeleteYearResult);

        public Task<bool> UpdateAcademicYearAsync(
            RequestContext context, string schoolId, string yearId, UpdateAcademicYearInput input, CancellationToken cancellationToken = default) =>
            Task.FromResult(UpdateYearResult);

        public Task<CalendarCreatedRow?> CreateAssessmentPeriodAsync(
            RequestContext context, string schoolId, CreateAssessmentPeriodInput input, CancellationToken cancellationToken = default) =>
            Task.FromResult(CreatedPeriod);

        public Task<bool> DeleteAssessmentPeriodAsync(
            RequestContext context, string schoolId, string periodId, CancellationToken cancellationToken = default) =>
            Task.FromResult(DeletePeriodResult);

        public Task<bool> UpdateAssessmentPeriodAsync(
            RequestContext context, string schoolId, string periodId, UpdateAssessmentPeriodInput input, CancellationToken cancellationToken = default) =>
            Task.FromResult(UpdatePeriodResult);

        public Task<int?> CreateHolidaysAsync(
            RequestContext context, string schoolId, IReadOnlyList<HolidayInputDto> holidays, CancellationToken cancellationToken = default) =>
            Task.FromResult(HolidaysCount);

        public Task<bool> DeleteHolidayAsync(
            RequestContext context, string schoolId, string holidayId, CancellationToken cancellationToken = default) =>
            Task.FromResult(DeleteHolidayResult);
    }
}
