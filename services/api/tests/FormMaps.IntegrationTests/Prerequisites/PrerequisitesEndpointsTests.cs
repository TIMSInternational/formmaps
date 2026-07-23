using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Prerequisites;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Prerequisites;

/// <summary>
/// Guard chain + HTTP mapping for the 5 prerequisites endpoints (FM-DOTNET-057); reader/writer faked (DB behavior is
/// proven by the reader/writer tests). Pins: anon→401 + wrong-permission→403 + no-school→400 on all; the chain
/// heterogeneous-credits WIRE shape (catalog=JSON string, non-catalog=JSON number); the eligible DOUBLE-NESTED
/// { data:{ data, total } } envelope + gradeLevel/department filters; the missing endpoint OMITS `eligible`; and the
/// exact 404 messages ("Student not found" / "Course not found").
/// </summary>
public class PrerequisitesEndpointsTests
{
    private const string School = "school-1";
    private const string ChainPath = "/api/v1/school-admin/courses/c1/prerequisite-chain";
    private const string PutPath = "/api/v1/school-admin/courses/c1/prerequisites";
    private const string CheckPath = "/api/v1/school-admin/prerequisites/check/s1/c1";
    private const string EligiblePath = "/api/v1/school-admin/prerequisites/eligible/s1";
    private const string MissingPath = "/api/v1/school-admin/prerequisites/missing/s1/c1";

    // ---- auth: anon 401 on all 5 ----

    [Theory]
    [InlineData("GET", ChainPath)]
    [InlineData("PUT", PutPath)]
    [InlineData("GET", CheckPath)]
    [InlineData("GET", EligiblePath)]
    [InlineData("GET", MissingPath)]
    public async Task Anonymous_is_401(string method, string path)
    {
        using var factory = Factory();
        using var client = factory.CreateClient();
        var response = await Anon(client, new HttpMethod(method), path);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("GET", ChainPath)]
    [InlineData("PUT", PutPath)]
    [InlineData("GET", CheckPath)]
    public async Task Wrong_permission_is_403(string method, string path)
    {
        using var factory = Factory();
        using var client = factory.CreateClient();
        // Give a permission NONE of the routes accept.
        var response = await Send(client, new HttpMethod(method), path, method == "PUT" ? "{}" : null, FormMapsPermissions.SchoolManage);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [InlineData("GET", ChainPath, FormMapsPermissions.CoursesRead, null)]
    [InlineData("PUT", PutPath, FormMapsPermissions.CoursesWrite, "{}")]
    [InlineData("GET", CheckPath, FormMapsPermissions.CurriculumManage, null)]
    [InlineData("GET", EligiblePath, FormMapsPermissions.CurriculumManage, null)]
    [InlineData("GET", MissingPath, FormMapsPermissions.CurriculumManage, null)]
    public async Task No_school_is_400(string method, string path, string permission, string? body)
    {
        using var factory = Factory(scope: new FakeScope(null));
        using var client = factory.CreateClient();
        var response = await Send(client, new HttpMethod(method), path, body, permission);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("No school", doc.RootElement.GetProperty("message").GetString());
    }

    // ---- chain: heterogeneous-credits wire shape + 404 ----

    [Fact]
    public async Task Chain_credits_wire_shape_is_string_for_catalog_number_for_noncatalog()
    {
        var reader = new FakeReader
        {
            Chain = new PrerequisiteChainResult("c1", "TARGET",
            [
                new PrerequisiteChainEntry("B", "B", "Dept", "0.5", 2, null, false), // catalog → STRING
                new PrerequisiteChainEntry("GHOST", "GHOST", "", 0, 1, null, false), // non-catalog → NUMBER 0
            ], 2)
        };
        using var factory = Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, ChainPath, null, FormMapsPermissions.CoursesRead);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var chain = doc.RootElement.GetProperty("data").GetProperty("chain");
        Assert.Equal(JsonValueKind.String, chain[0].GetProperty("credits").ValueKind); // catalog credits = STRING
        Assert.Equal("0.5", chain[0].GetProperty("credits").GetString());
        Assert.Equal(JsonValueKind.Number, chain[1].GetProperty("credits").ValueKind); // non-catalog credits = NUMBER
        Assert.Equal(0, chain[1].GetProperty("credits").GetInt32());
    }

    [Fact]
    public async Task Chain_null_is_404_course_not_found()
    {
        using var factory = Factory(new FakeReader { Chain = null });
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, ChainPath, null, FormMapsPermissions.CoursesRead);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Course not found", doc.RootElement.GetProperty("message").GetString());
    }

    // ---- eligible: double-nested envelope + filters ----

    [Fact]
    public async Task Eligible_double_nested_envelope_and_filters()
    {
        var reader = new FakeReader
        {
            Eligible = new EligibleMapResult(PrerequisiteLookupOutcome.Ok,
            [
                new EligibleCandidate("id-eng9", "ENG9", "English 9", "English", "1", [9], Eligible: true),
                new EligibleCandidate("id-math10", "MATH10", "Math 10", "Mathematics", "1", [10], Eligible: true),
                new EligibleCandidate("id-locked", "LOCK", "Locked", "English", "1", [9], Eligible: false), // filtered by eligible
            ])
        };
        using var factory = Factory(reader);
        using var client = factory.CreateClient();

        // No filters → both eligible (locked dropped). Envelope is data:{ data:[...], total }.
        var all = await Send(client, HttpMethod.Get, EligiblePath, null, FormMapsPermissions.CurriculumManage);
        using (var doc = JsonDocument.Parse(await all.Content.ReadAsStringAsync()))
        {
            var data = doc.RootElement.GetProperty("data");
            Assert.Equal(2, data.GetProperty("total").GetInt32());
            Assert.Equal(2, data.GetProperty("data").GetArrayLength());
            Assert.Equal("id-eng9", data.GetProperty("data")[0].GetProperty("id").GetString()); // projected {id,...}
        }

        // gradeLevel=9 → only ENG9.
        var grade = await Send(client, HttpMethod.Get, EligiblePath + "?gradeLevel=9", null, FormMapsPermissions.CurriculumManage);
        using (var doc = JsonDocument.Parse(await grade.Content.ReadAsStringAsync()))
        {
            Assert.Equal(1, doc.RootElement.GetProperty("data").GetProperty("total").GetInt32());
            Assert.Equal("ENG9", doc.RootElement.GetProperty("data").GetProperty("data")[0].GetProperty("code").GetString());
        }

        // department=math (case-insensitive substring) → only MATH10.
        var dept = await Send(client, HttpMethod.Get, EligiblePath + "?department=math", null, FormMapsPermissions.CurriculumManage);
        using (var doc = JsonDocument.Parse(await dept.Content.ReadAsStringAsync()))
        {
            Assert.Equal(1, doc.RootElement.GetProperty("data").GetProperty("total").GetInt32());
            Assert.Equal("MATH10", doc.RootElement.GetProperty("data").GetProperty("data")[0].GetProperty("code").GetString());
        }

        // gradeLevel=abc → NaN → excludes everything.
        var nan = await Send(client, HttpMethod.Get, EligiblePath + "?gradeLevel=abc", null, FormMapsPermissions.CurriculumManage);
        using (var doc = JsonDocument.Parse(await nan.Content.ReadAsStringAsync()))
        {
            Assert.Equal(0, doc.RootElement.GetProperty("data").GetProperty("total").GetInt32());
        }
    }

    [Fact]
    public async Task Eligible_student_not_found_is_404()
    {
        using var factory = Factory(new FakeReader { Eligible = EligibleMapResult.StudentNotFound() });
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, EligiblePath, null, FormMapsPermissions.CurriculumManage);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Student not found", doc.RootElement.GetProperty("message").GetString());
    }

    // ---- check vs missing shape ----

    [Fact]
    public async Task Check_includes_eligible_missing_omits_it()
    {
        var ok = new EligibilityResult(PrerequisiteLookupOutcome.Ok, "s1", "c1", "CODE", "Name",
            Eligible: false, ["Missing: X"], [new MissingPrerequisite("X", "Not in catalog")]);
        using var factory = Factory(new FakeReader { Eligibility = ok });
        using var client = factory.CreateClient();

        var check = await Send(client, HttpMethod.Get, CheckPath, null, FormMapsPermissions.CurriculumManage);
        using (var doc = JsonDocument.Parse(await check.Content.ReadAsStringAsync()))
        {
            var data = doc.RootElement.GetProperty("data");
            Assert.False(data.GetProperty("eligible").GetBoolean());
            Assert.Equal("X", data.GetProperty("missingPrerequisites")[0].GetProperty("code").GetString());
        }

        var missing = await Send(client, HttpMethod.Get, MissingPath, null, FormMapsPermissions.CurriculumManage);
        using (var doc = JsonDocument.Parse(await missing.Content.ReadAsStringAsync()))
        {
            var data = doc.RootElement.GetProperty("data");
            Assert.False(data.TryGetProperty("eligible", out _)); // missing endpoint OMITS eligible
            Assert.Equal("X", data.GetProperty("missingPrerequisites")[0].GetProperty("code").GetString());
        }
    }

    [Theory]
    [InlineData(PrerequisiteLookupOutcome.StudentNotFound, "Student not found")]
    [InlineData(PrerequisiteLookupOutcome.CourseNotFound, "Course not found")]
    public async Task Check_404_messages(PrerequisiteLookupOutcome outcome, string message)
    {
        var result = outcome == PrerequisiteLookupOutcome.StudentNotFound
            ? EligibilityResult.StudentNotFound()
            : EligibilityResult.CourseNotFound();
        using var factory = Factory(new FakeReader { Eligibility = result });
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, CheckPath, null, FormMapsPermissions.CurriculumManage);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(message, doc.RootElement.GetProperty("message").GetString());
    }

    // ---- PUT ----

    [Fact]
    public async Task Put_success_is_200_and_false_is_404()
    {
        using (var factory = Factory(writer: new FakeWriter { Result = true }))
        using (var client = factory.CreateClient())
        {
            var ok = await Send(client, HttpMethod.Put, PutPath, "{}", FormMapsPermissions.CoursesWrite);
            Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
            using var doc = JsonDocument.Parse(await ok.Content.ReadAsStringAsync());
            Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        }

        using (var factory = Factory(writer: new FakeWriter { Result = false }))
        using (var client = factory.CreateClient())
        {
            var nf = await Send(client, HttpMethod.Put, PutPath, "{}", FormMapsPermissions.CoursesWrite);
            Assert.Equal(HttpStatusCode.NotFound, nf.StatusCode);
            using var doc = JsonDocument.Parse(await nf.Content.ReadAsStringAsync());
            Assert.Equal("Course not found", doc.RootElement.GetProperty("message").GetString());
        }
    }

    [Fact]
    public async Task Put_malformed_body_is_400()
    {
        using var factory = Factory(writer: new FakeWriter { Result = true });
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, PutPath, "{ not json", FormMapsPermissions.CoursesWrite);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invalid request body", doc.RootElement.GetProperty("message").GetString());
    }

    // ---- helpers ----

    private static Factory_ Factory(FakeReader? reader = null, FakeWriter? writer = null, FakeScope? scope = null) =>
        new(reader ?? new FakeReader(), writer ?? new FakeWriter(), scope ?? new FakeScope(School));

    private static Task<HttpResponseMessage> Anon(HttpClient client, HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        if (method == HttpMethod.Put)
        {
            request.Content = new StringContent("{}", Encoding.UTF8, "application/json");
        }

        return client.SendAsync(request);
    }

    private static Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, string? body, string permission)
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

        return client.SendAsync(request);
    }

    private sealed class Factory_(FakeReader reader, FakeWriter writer, FakeScope scope) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IPrerequisitesReader>();
                services.AddSingleton<IPrerequisitesReader>(reader);
                services.RemoveAll<IPrerequisitesWriter>();
                services.AddSingleton<IPrerequisitesWriter>(writer);
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

    private sealed class FakeReader : IPrerequisitesReader
    {
        public PrerequisiteChainResult? Chain { get; set; } = new("c1", "C1", [], 0);
        public EligibilityResult Eligibility { get; set; } =
            new(PrerequisiteLookupOutcome.Ok, "s1", "c1", "C1", "Name", true, [], []);
        public EligibleMapResult Eligible { get; set; } = new(PrerequisiteLookupOutcome.Ok, []);

        public Task<PrerequisiteChainResult?> GetPrerequisiteChainAsync(
            RequestContext context, string schoolId, string courseId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Chain);

        public Task<EligibilityResult> CheckEligibilityAsync(
            RequestContext context, string schoolId, string studentId, string courseIdOrCode,
            CancellationToken cancellationToken = default) => Task.FromResult(Eligibility);

        public Task<EligibleMapResult> ComputeEligibleAsync(
            RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Eligible);
    }

    private sealed class FakeWriter : IPrerequisitesWriter
    {
        public bool Result { get; set; } = true;

        public Task<bool> UpdatePrerequisitesAsync(
            RequestContext context, string schoolId, string courseId, string userId, JsonElement body,
            CancellationToken cancellationToken = default) => Task.FromResult(Result);
    }
}
