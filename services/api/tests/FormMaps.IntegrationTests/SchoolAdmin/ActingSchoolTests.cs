using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.AcademicGaps;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolStudents;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.SchoolAdmin;

/// <summary>
/// Super Admin "act as a school" — X-Acting-School-Id (ActingSchool, RequestContextMiddleware). A Super Admin belongs
/// to no school, so every school-admin endpoint answered 400 "No school" or an empty list (production, 2026-10-07).
///
/// The security contract, identical to the Node twin (formmaps-platform
/// api/src/__tests__/superadmin-acting-school.route.test.ts):
///   - honoured ONLY for the Super Admin; any other role's header is ignored WITHOUT a lookup;
///   - the school must exist (400 "Unknown school") and have an id's shape (400, no lookup at all);
///   - it reaches both ways an endpoint finds "the school": Tenant.SchoolId (the JWT claim's slot) and the REAL
///     SchoolAdminScopeResolver, which returns it without touching the database.
/// </summary>
public class ActingSchoolTests
{
    private const string SchoolA = "0edde974-5257-4178-b4cf-0006a463d225";
    private const string OwnSchool = "11111111-2222-4333-8444-555555555555";
    private const string LegacySchool = "686cc04c1237a82fc74b4a6b";
    private const string SeededSchool = "test-school-1"; // production holds two seeded slugs like this
    private const string ContextPath = "/api/v1/context/current";
    private const string StudentsPath = "/api/v1/school-admin/students";
    private const string GapsSummaryPath = "/api/v1/school-admin/academic-gaps/summary";

    [Fact]
    public async Task Super_admin_opening_a_school_acts_on_it_as_the_tenant_school()
    {
        using var factory = new Factory();
        var response = await Send(factory.CreateClient(), ContextPath, FormMapsRoles.SuperAdmin, acting: SchoolA);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(SchoolA, await TenantSchoolId(response));
    }

    [Fact]
    public async Task Super_admin_school_admin_endpoints_list_that_school_through_the_real_scope_resolver()
    {
        // The REAL SchoolAdminScopeResolver is kept: it must return the acting school without opening a session.
        using var factory = new Factory();
        var response = await Send(factory.CreateClient(), StudentsPath, FormMapsRoles.SuperAdmin, acting: SchoolA);

        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        Assert.Equal(SchoolA, factory.Students.LastSchoolId);
    }

    [Fact]
    public async Task Super_admin_academic_gaps_get_the_school_wide_view_of_that_school()
    {
        // Was: 400 "No school linked", then 403 (the role check knew only school_admin/counselor).
        using var factory = new Factory();
        var response = await Send(factory.CreateClient(), GapsSummaryPath, FormMapsRoles.SuperAdmin, acting: SchoolA,
            permission: FormMapsPermissions.GradesRead);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(SchoolA, factory.Gaps.LastSchoolId);
        Assert.False(factory.Gaps.LastCounselorScoped);
        Assert.False(factory.Gaps.ScopeWasRead); // never asked "which school is the caller in"
    }

    [Theory]
    [InlineData(LegacySchool)]
    [InlineData(SeededSchool)]
    public async Task Every_id_shape_production_holds_is_accepted(string id)
    {
        using var factory = new Factory();
        var response = await Send(factory.CreateClient(), ContextPath, FormMapsRoles.SuperAdmin, acting: id);

        Assert.Equal(id, await TenantSchoolId(response));
    }

    [Fact]
    public async Task An_unknown_school_is_400_unknown_school_and_the_endpoint_never_runs()
    {
        using var factory = new Factory();
        var response = await Send(factory.CreateClient(), StudentsPath, FormMapsRoles.SuperAdmin,
            acting: "99999999-9999-4999-8999-999999999999");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Unknown school", await Message(response));
        Assert.Null(factory.Students.LastSchoolId);
    }

    [Theory]
    [InlineData("school 1")]
    [InlineData("'; drop table schools; --")]
    [InlineData("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")]
    public async Task A_malformed_id_is_400_without_a_lookup(string bad)
    {
        using var factory = new Factory();
        var response = await Send(factory.CreateClient(), StudentsPath, FormMapsRoles.SuperAdmin, acting: bad);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, factory.Checker.Calls);
    }

    [Fact]
    public async Task Looked_up_once_per_request()
    {
        using var factory = new Factory();
        await Send(factory.CreateClient(), StudentsPath, FormMapsRoles.SuperAdmin, acting: SchoolA);

        Assert.Equal(1, factory.Checker.Calls);
    }

    [Fact]
    public async Task Super_admin_without_the_header_is_unchanged_no_school()
    {
        using var factory = new Factory();
        var response = await Send(factory.CreateClient(), ContextPath, FormMapsRoles.SuperAdmin, acting: null);

        Assert.Null(await TenantSchoolId(response));
        Assert.Equal(0, factory.Checker.Calls);
    }

    [Theory]
    [InlineData(FormMapsRoles.SchoolAdmin)]
    [InlineData(FormMapsRoles.Counselor)]
    public async Task Every_other_role_keeps_its_own_school_and_the_header_is_never_looked_up(string role)
    {
        using var factory = new Factory();
        var response = await Send(factory.CreateClient(), ContextPath, role, acting: SchoolA, ownSchool: OwnSchool);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(OwnSchool, await TenantSchoolId(response));
        Assert.Equal(0, factory.Checker.Calls);
    }

    [Fact]
    public async Task A_school_admin_sending_a_malformed_id_is_not_refused_the_header_does_not_exist_for_it()
    {
        using var factory = new Factory();
        var response = await Send(factory.CreateClient(), ContextPath, FormMapsRoles.SchoolAdmin, acting: "not a school",
            ownSchool: OwnSchool);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(OwnSchool, await TenantSchoolId(response));
    }

    [Fact]
    public void Only_a_super_admin_context_can_act_as_a_school()
    {
        var schoolAdmin = RequestContext.Authenticated(
            new RequestActor("a-1", FormMapsRoles.SchoolAdmin, null, null), OwnSchool, [], TokenSource.AuthorizationBearer, false);

        Assert.Throws<InvalidOperationException>(() => schoolAdmin.WithActingSchool(SchoolA));
    }

    // ---------------------------------------------------------------- helpers

    private static Task<HttpResponseMessage> Send(
        HttpClient client, string path, string role, string? acting, string? ownSchool = null,
        string permission = FormMapsPermissions.SchoolManage)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "caller-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permission);
        if (ownSchool is not null)
        {
            request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, ownSchool);
        }

        if (acting is not null)
        {
            request.Headers.Add(ActingSchool.HeaderName, acting);
        }

        return client.SendAsync(request);
    }

    private static async Task<string?> TenantSchoolId(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var schoolId = doc.RootElement.GetProperty("data").GetProperty("tenant").GetProperty("schoolId");
        return schoolId.ValueKind == JsonValueKind.Null ? null : schoolId.GetString();
    }

    private static async Task<string?> Message(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("message").GetString();

    private sealed class Factory : WebApplicationFactory<Program>
    {
        public FakeChecker Checker { get; } = new(SchoolA, LegacySchool, SeededSchool);
        public FakeStudents Students { get; } = new();
        public FakeGaps Gaps { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            // A database that does not exist (port 1): the REAL SchoolAdminScopeResolver can be constructed, and any
            // attempt to open a session — which acting as a school must never need — fails the test.
            builder.UseSetting("ConnectionStrings:FormMaps", "Host=127.0.0.1;Port=1;Database=none;Username=none;Timeout=1");
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISchoolExistenceChecker>();
                services.AddSingleton<ISchoolExistenceChecker>(Checker);
                services.RemoveAll<ISchoolStudentsReader>();
                services.AddSingleton<ISchoolStudentsReader>(Students);
                services.RemoveAll<IAcademicGapsReader>();
                services.AddSingleton<IAcademicGapsReader>(Gaps);
            });
        }
    }

    private sealed class FakeChecker(params string[] known) : ISchoolExistenceChecker
    {
        public int Calls { get; private set; }

        public Task<bool> SchoolExistsAsync(RequestContext context, string schoolId, CancellationToken cancellationToken = default)
        {
            Calls++;
            return Task.FromResult(known.Contains(schoolId));
        }
    }

    private sealed class FakeStudents : ISchoolStudentsReader
    {
        public string? LastSchoolId { get; private set; }

        public Task<StudentListPage> ListStudentsAsync(
            RequestContext context, string schoolId, StudentListQuery query, CancellationToken cancellationToken = default)
        {
            LastSchoolId = schoolId;
            return Task.FromResult(new StudentListPage([], 0, 1, 20, 0));
        }

        public Task<StudentDetail?> GetStudentDetailAsync(
            RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<StudentCommunityService?> GetStudentCommunityServiceAsync(
            RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
    }

    private sealed class FakeGaps : IAcademicGapsReader
    {
        public string? LastSchoolId { get; private set; }
        public bool LastCounselorScoped { get; private set; }
        public bool ScopeWasRead { get; private set; }

        public Task<AcademicGapsScope> ResolveScopeAsync(
            RequestContext context, string callerId, CancellationToken cancellationToken = default)
        {
            ScopeWasRead = true;
            return Task.FromResult(new AcademicGapsScope(null, null));
        }

        public Task<SummaryLoad> GetSummaryLoadAsync(
            RequestContext context, string schoolId, bool counselorScoped, string callerId,
            CancellationToken cancellationToken = default)
        {
            LastSchoolId = schoolId;
            LastCounselorScoped = counselorScoped;
            return Task.FromResult(new SummaryLoad(false, [], [], new Dictionary<string, GapCourse>(), [], 0));
        }

        public Task<StudentGapsLoad?> GetStudentDetailLoadAsync(
            RequestContext context, string schoolId, bool counselorScoped, string callerId, string studentId,
            CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task<RecommendationsLoad?> GetRecommendationsLoadAsync(
            RequestContext context, string schoolId, bool counselorScoped, string callerId, string studentId,
            CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }
}
