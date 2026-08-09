using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolUsers;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.SchoolUsers;

/// <summary>
/// Guard chain + HTTP status/body mapping for the five school:users routes (reader/writer + scope faked; DB behavior
/// is proven by the reader/writer tests). Pins: anon → 401 all five; missing school:users → 403 (school:manage does
/// NOT substitute); the per-route no-school behavior (GET /users + GET /counselors/:id/students → 200 { data:[],
/// total:0 } with NO page/limit; POST/DELETE assign → 400 "No school"); grade-level raw echo (number/string/"0"),
/// absent-key omission, and cross-school 403; studentIds[] array-check 400; the { assigned } / nested { success:true }
/// envelopes; and the page/limit clamp (cap 50).
/// </summary>
public class SchoolUsersEndpointsTests
{
    private const string UsersPath = "/api/v1/school-admin/users";
    private const string GradePath = "/api/v1/school-admin/users/u-1/grade-level";
    private const string RolePath = "/api/v1/school-admin/users/u-1/role";
    private const string AssignPath = "/api/v1/school-admin/counselors/c-1/assign-students";
    private const string StudentsPath = "/api/v1/school-admin/counselors/c-1/students";
    private const string School = "school-1";

    // ---- guard chain ----

    public static IEnumerable<object[]> AllRoutes() => new[]
    {
        new object[] { "GET", UsersPath },
        new object[] { "PUT", GradePath },
        // formmaps#114 review: the role route was MISSING from this list, so its 401 and its
        // school:users 403 were asserted nowhere — the guard existed only in prose. One line here
        // buys both gates for it, via the two [MemberData(nameof(AllRoutes))] theories below.
        new object[] { "PUT", RolePath },
        new object[] { "POST", AssignPath },
        new object[] { "DELETE", AssignPath },
        new object[] { "GET", StudentsPath },
    };

    [Theory]
    [MemberData(nameof(AllRoutes))]
    public async Task Anonymous_is_401(string method, string path)
    {
        using var client = Client(new FakeReader(), new FakeWriter(), new FakeScope(School));
        var response = await client.SendAsync(Anon(new HttpMethod(method), path, "{}"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [MemberData(nameof(AllRoutes))]
    public async Task Missing_school_users_is_403_even_with_school_manage(string method, string path)
    {
        using var client = Client(new FakeReader(), new FakeWriter(), new FakeScope(School));
        var response = await client.SendAsync(Auth(new HttpMethod(method), path, "{}", FormMapsPermissions.SchoolManage));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("missing_permission", doc.RootElement.GetProperty("code").GetString());
    }

    // ---- GET /users ----

    [Fact]
    public async Task Users_no_school_returns_data_and_total_only_no_page_limit()
    {
        using var client = Client(new FakeReader(), new FakeWriter(), new FakeScope(null));
        var response = await client.SendAsync(Auth(HttpMethod.Get, UsersPath));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(2, data.EnumerateObject().Count());
        Assert.Empty(data.GetProperty("data").EnumerateArray());
        Assert.Equal(0, data.GetProperty("total").GetInt32());
        Assert.False(data.TryGetProperty("page", out _));
        Assert.False(data.TryGetProperty("limit", out _));
        Assert.False(data.TryGetProperty("totalPages", out _));
    }

    [Fact]
    public async Task Users_happy_path_returns_rows_with_status_joinedAt_and_page_envelope()
    {
        var reader = new FakeReader
        {
            Users = new SchoolUsersPage(
                [new SchoolUserRow("u1", "Ada", "ada@e.st", "student", 11, true, "2026-01-02T03:04:05.006Z")],
                1, 2, 25, 1),
        };
        using var client = Client(reader, new FakeWriter(), new FakeScope(School));

        var response = await client.SendAsync(Auth(HttpMethod.Get, UsersPath + "?page=2&limit=25"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(1, data.GetProperty("total").GetInt32());
        Assert.Equal(2, data.GetProperty("page").GetInt32());
        Assert.Equal(25, data.GetProperty("limit").GetInt32());
        Assert.Equal(1, data.GetProperty("totalPages").GetInt32());
        var row = data.GetProperty("data")[0];
        Assert.Equal(11, row.GetProperty("gradeLevel").GetInt32());
        Assert.Equal("active", row.GetProperty("status").GetString());
        Assert.Equal("2026-01-02T03:04:05.006Z", row.GetProperty("createdDate").GetString());
        Assert.Equal("2026-01-02T03:04:05.006Z", row.GetProperty("joinedAt").GetString());
        Assert.Equal(2, reader.LastQuery!.Page);
        Assert.Equal(25, reader.LastQuery.Limit);
    }

    [Theory]
    [InlineData("", 1, 20, null, null)]
    [InlineData("?limit=0", 1, 20, null, null)]          // 0 falsy → 20
    [InlineData("?limit=999", 1, 50, null, null)]        // clamped to 50 (NOT 100)
    [InlineData("?limit=-3", 1, 1, null, null)]          // clamped up to 1
    [InlineData("?page=0", 1, 20, null, null)]           // page 0 → 1
    [InlineData("?role=&search=", 1, 20, null, null)]    // empty strings → null filters
    [InlineData("?role=Counselor&search=ada", 1, 20, "Counselor", "ada")]
    public async Task Users_query_is_clamped_and_falsy_collapsed(
        string query, int expPage, int expLimit, string? expRole, string? expSearch)
    {
        var reader = new FakeReader();
        using var client = Client(reader, new FakeWriter(), new FakeScope(School));
        await client.SendAsync(Auth(HttpMethod.Get, UsersPath + query));
        Assert.Equal(expPage, reader.LastQuery!.Page);
        Assert.Equal(expLimit, reader.LastQuery.Limit);
        Assert.Equal(expRole, reader.LastQuery.Role);
        Assert.Equal(expSearch, reader.LastQuery.Search);
    }

    // ---- PUT grade-level ----

    [Fact]
    public async Task GradeLevel_number_echoes_number_and_passes_parsed_value_to_writer()
    {
        var writer = new FakeWriter { GradeStatus = GradeLevelUpdateStatus.Updated };
        using var client = Client(new FakeReader(), writer, new FakeScope(School));

        var response = await client.SendAsync(Auth(HttpMethod.Put, GradePath, """{"gradeLevel":11}"""));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("u-1", data.GetProperty("userId").GetString());
        Assert.Equal(JsonValueKind.Number, data.GetProperty("gradeLevel").ValueKind);
        Assert.Equal(11, data.GetProperty("gradeLevel").GetInt32());
        Assert.Equal(11, writer.LastGradeLevel);
    }

    [Fact]
    public async Task GradeLevel_string_echoes_string_verbatim()
    {
        var writer = new FakeWriter { GradeStatus = GradeLevelUpdateStatus.Updated };
        using var client = Client(new FakeReader(), writer, new FakeScope(School));

        var response = await client.SendAsync(Auth(HttpMethod.Put, GradePath, """{"gradeLevel":"11"}"""));

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var grade = doc.RootElement.GetProperty("data").GetProperty("gradeLevel");
        Assert.Equal(JsonValueKind.String, grade.ValueKind);
        Assert.Equal("11", grade.GetString());
        Assert.Equal(11, writer.LastGradeLevel);
    }

    [Fact]
    public async Task GradeLevel_zero_string_echoes_raw_but_writes_null()
    {
        var writer = new FakeWriter { GradeStatus = GradeLevelUpdateStatus.Updated };
        using var client = Client(new FakeReader(), writer, new FakeScope(School));

        var response = await client.SendAsync(Auth(HttpMethod.Put, GradePath, """{"gradeLevel":"0"}"""));

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var grade = doc.RootElement.GetProperty("data").GetProperty("gradeLevel");
        Assert.Equal("0", grade.GetString());       // raw echo
        Assert.Null(writer.LastGradeLevel);          // parseInt("0")||null → NULL written
    }

    [Fact]
    public async Task GradeLevel_absent_key_is_omitted_from_response_and_writes_null()
    {
        var writer = new FakeWriter { GradeStatus = GradeLevelUpdateStatus.Updated };
        using var client = Client(new FakeReader(), writer, new FakeScope(School));

        var response = await client.SendAsync(Auth(HttpMethod.Put, GradePath, "{}"));

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("u-1", data.GetProperty("userId").GetString());
        Assert.False(data.TryGetProperty("gradeLevel", out _)); // omitted
        Assert.Null(writer.LastGradeLevel);
        Assert.True(writer.GradeCalled);
    }

    [Fact]
    public async Task GradeLevel_cross_school_is_403_with_exact_message()
    {
        var writer = new FakeWriter { GradeStatus = GradeLevelUpdateStatus.CrossSchool };
        using var client = Client(new FakeReader(), writer, new FakeScope(School));

        var response = await client.SendAsync(Auth(HttpMethod.Put, GradePath, """{"gradeLevel":11}"""));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("Cannot modify users from another school", await MessageAsync(response));
    }

    // ---- PUT role (formmaps#114) ----
    //
    // WHY THESE EXIST. Before this block, all 58 of #114's .NET tests targeted two PURE FUNCTIONS
    // (RoleChangeGuard, RoleChangeRequest). Nothing exercised PutRoleAsync, so its status/message
    // mapping — where every refusal actually becomes an HTTP response — was untested. A review
    // rewrote `RoleUpdateStatus.CrossSchool => Forbidden(...)` to `Results.Ok(new { success = true })`,
    // turning a cross-tenant refusal into a reported SUCCESS, and FormMaps.UnitTests stayed
    // 1040/1040 and this file stayed 36/36 GREEN. A guard nothing can observe failing is not a guard.
    //
    // Each test below therefore asserts on the RESPONSE, not on the pure function, and the whole
    // block is designed so that making any refusal return 200 reds it.

    [Theory]
    [InlineData(RoleUpdateStatus.CrossSchool, HttpStatusCode.Forbidden, "Cannot modify users from another school")]
    [InlineData(RoleUpdateStatus.SelfChange, HttpStatusCode.Forbidden, "Cannot change your own role")]
    [InlineData(RoleUpdateStatus.ProtectedAdminTarget, HttpStatusCode.Forbidden, "Cannot change an administrator's role")]
    [InlineData(RoleUpdateStatus.ProtectedStudentTarget, HttpStatusCode.Forbidden, "Cannot change a student's role")]
    [InlineData(RoleUpdateStatus.TargetNotFound, HttpStatusCode.NotFound, "User not found")]
    [InlineData(RoleUpdateStatus.RoleNotFound, HttpStatusCode.BadRequest, "Role not found")]
    [InlineData(RoleUpdateStatus.NoChange, HttpStatusCode.BadRequest, "User already has this role")]
    public async Task Role_every_refusal_is_reported_as_a_refusal(
        RoleUpdateStatus status, HttpStatusCode expectedCode, string expectedMessage)
    {
        var writer = new FakeWriter { RoleResult = new RoleUpdateResult(status, null, null) };
        using var client = Client(new FakeReader(), writer, new FakeScope(School));

        var response = await client.SendAsync(Auth(HttpMethod.Put, RolePath, """{"roleName":"counselor"}"""));

        Assert.Equal(expectedCode, response.StatusCode);
        Assert.Equal(expectedMessage, await MessageAsync(response));
        // The refusal must not also be reported as a success in the envelope.
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
    }

    [Fact]
    public async Task Role_happy_path_is_200_and_forwards_the_normalized_role_to_the_writer()
    {
        var writer = new FakeWriter { RoleResult = new RoleUpdateResult(RoleUpdateStatus.Updated, "counselor", "teacher") };
        using var client = Client(new FakeReader(), writer, new FakeScope(School));

        var response = await client.SendAsync(Auth(HttpMethod.Put, RolePath, """{"roleName":"Counselor"}"""));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(writer.RoleCalled);
        Assert.Equal("u-1", writer.LastRoleTargetUserId);
        // Case-folded by RoleChangeRequest before it ever reaches the writer.
        Assert.Equal("counselor", writer.LastRoleName);
    }

    [Theory]
    [InlineData("""{"roleName":"school_admin"}""")]   // THE escalation this endpoint exists to prevent
    [InlineData("""{"roleName":"student"}""")]
    [InlineData("""{"roleName":"  coach  "}""")]      // padded: rejected, and must not reach the writer
    [InlineData("""{"roleName":"counselor","role":"school_admin"}""")]   // .strict() smuggle
    [InlineData("""{"role":"counselor"}""")]          // the historical frontend payload
    public async Task Role_rejected_bodies_never_reach_the_writer(string body)
    {
        var writer = new FakeWriter();
        using var client = Client(new FakeReader(), writer, new FakeScope(School));

        var response = await client.SendAsync(Auth(HttpMethod.Put, RolePath, body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        // The point: a 400 that still wrote would be a silent privilege change.
        Assert.False(writer.RoleCalled);
    }

    // ---- POST/DELETE assign ----

    [Fact]
    public async Task Assign_no_school_is_400()
    {
        using var client = Client(new FakeReader(), new FakeWriter(), new FakeScope(null));
        var response = await client.SendAsync(Auth(HttpMethod.Post, AssignPath, """{"studentIds":["s1"]}"""));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("No school", await MessageAsync(response));
    }

    [Fact]
    public async Task Unassign_no_school_is_400()
    {
        using var client = Client(new FakeReader(), new FakeWriter(), new FakeScope(null));
        var response = await client.SendAsync(Auth(HttpMethod.Delete, AssignPath, """{"studentIds":["s1"]}"""));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("No school", await MessageAsync(response));
    }

    [Theory]
    [InlineData("POST")]
    [InlineData("DELETE")]
    public async Task Assign_non_array_studentIds_is_400_and_writer_not_called(string method)
    {
        var writer = new FakeWriter();
        using var client = Client(new FakeReader(), writer, new FakeScope(School));
        var response = await client.SendAsync(Auth(new HttpMethod(method), AssignPath, """{"studentIds":"nope"}"""));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("studentIds[] required", await MessageAsync(response));
        Assert.False(writer.AssignCalled);
        Assert.False(writer.UnassignCalled);
    }

    [Fact]
    public async Task Assign_missing_studentIds_is_400()
    {
        using var client = Client(new FakeReader(), new FakeWriter(), new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, AssignPath, "{}"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("studentIds[] required", await MessageAsync(response));
    }

    [Fact]
    public async Task Assign_non_string_element_is_400_from_normalizer()
    {
        using var client = Client(new FakeReader(), new FakeWriter(), new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, AssignPath, """{"studentIds":["ok",123]}"""));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("studentIds[] must contain student ids", await MessageAsync(response));
    }

    [Fact]
    public async Task Assign_service_error_is_400_with_message()
    {
        var writer = new FakeWriter { AssignResult = new AssignStudentsResult("Counselor not in your school", 0, "c-1") };
        using var client = Client(new FakeReader(), writer, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, AssignPath, """{"studentIds":["s1"]}"""));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Counselor not in your school", await MessageAsync(response));
    }

    [Fact]
    public async Task Assign_success_returns_assigned_and_counselorId()
    {
        var writer = new FakeWriter { AssignResult = new AssignStudentsResult(null, 3, "c-1") };
        using var client = Client(new FakeReader(), writer, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, AssignPath, """{"studentIds":["s1","s2","s3"]}"""));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(3, data.GetProperty("assigned").GetInt32());
        Assert.Equal("c-1", data.GetProperty("counselorId").GetString());
        // Normalized deduped ids forwarded to the writer.
        Assert.Equal(new[] { "s1", "s2", "s3" }, writer.LastIds!.ToArray());
    }

    [Fact]
    public async Task Unassign_success_returns_nested_success_true()
    {
        var writer = new FakeWriter { UnassignResult = new UnassignStudentsResult(null) };
        using var client = Client(new FakeReader(), writer, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Delete, AssignPath, """{"studentIds":["s1"]}"""));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        // Legacy result IS { success: true } → wrapped as { success: true, data: { success: true } }.
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.True(doc.RootElement.GetProperty("data").GetProperty("success").GetBoolean());
    }

    // ---- GET counselor students ----

    [Fact]
    public async Task Students_no_school_returns_data_and_total_only_no_page_limit()
    {
        using var client = Client(new FakeReader(), new FakeWriter(), new FakeScope(null));
        var response = await client.SendAsync(Auth(HttpMethod.Get, StudentsPath));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(2, data.EnumerateObject().Count());
        Assert.Empty(data.GetProperty("data").EnumerateArray());
        Assert.Equal(0, data.GetProperty("total").GetInt32());
        Assert.False(data.TryGetProperty("page", out _));
    }

    [Fact]
    public async Task Students_counselor_not_in_school_is_403()
    {
        var reader = new FakeReader
        {
            CounselorStudents = new CounselorStudentsResult("Counselor not in your school", [], 0, 1, 20, 0),
        };
        using var client = Client(reader, new FakeWriter(), new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Get, StudentsPath));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("Counselor not in your school", await MessageAsync(response));
    }

    [Fact]
    public async Task Students_happy_path_returns_student_shape_and_page_envelope()
    {
        var reader = new FakeReader
        {
            CounselorStudents = new CounselorStudentsResult(
                null,
                [new CounselorStudentRow("s1", "Ada", "ada@e.st", 9, "2026-02-02T03:04:05.006Z")],
                1, 3, 25, 1),
        };
        using var client = Client(reader, new FakeWriter(), new FakeScope(School));

        var response = await client.SendAsync(Auth(HttpMethod.Get, StudentsPath + "?page=3&limit=25"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(1, data.GetProperty("total").GetInt32());
        Assert.Equal(3, data.GetProperty("page").GetInt32());
        Assert.Equal(25, data.GetProperty("limit").GetInt32());
        Assert.Equal(1, data.GetProperty("totalPages").GetInt32());
        var student = data.GetProperty("data")[0];
        Assert.Equal("s1", student.GetProperty("id").GetString());
        Assert.Equal("Ada", student.GetProperty("name").GetString());
        Assert.Equal(9, student.GetProperty("gradeLevel").GetInt32());
        Assert.Equal("2026-02-02T03:04:05.006Z", student.GetProperty("createdDate").GetString());
        // student JSON has ONLY these five keys.
        Assert.Equal(5, student.EnumerateObject().Count());
        Assert.Equal(3, reader.LastPage);
        Assert.Equal(25, reader.LastLimit);
    }

    // ---- helpers ----

    private static HttpClient Client(FakeReader reader, FakeWriter writer, FakeScope scope) =>
        new Factory(reader, writer, scope).CreateClient();

    private static HttpRequestMessage Auth(HttpMethod method, string path, string? body = null, string permission = FormMapsPermissions.SchoolUsers)
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

    private sealed class Factory(FakeReader reader, FakeWriter writer, FakeScope scope) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISchoolUsersReader>();
                services.AddSingleton<ISchoolUsersReader>(reader);
                services.RemoveAll<ISchoolUsersWriter>();
                services.AddSingleton<ISchoolUsersWriter>(writer);
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

    private sealed class FakeReader : ISchoolUsersReader
    {
        public SchoolUsersPage Users { get; init; } = new([], 0, 1, 20, 0);
        public CounselorStudentsResult CounselorStudents { get; init; } = new(null, [], 0, 1, 20, 0);

        public SchoolUsersQuery? LastQuery { get; private set; }
        public int LastPage { get; private set; }
        public int LastLimit { get; private set; }

        public Task<SchoolUsersPage> ListSchoolUsersAsync(
            RequestContext context, string schoolId, SchoolUsersQuery query, CancellationToken cancellationToken = default)
        {
            LastQuery = query;
            return Task.FromResult(Users);
        }

        public Task<CounselorStudentsResult> GetCounselorStudentsAsync(
            RequestContext context, string adminSchoolId, string counselorId, int page, int limit, long skip,
            CancellationToken cancellationToken = default)
        {
            LastPage = page;
            LastLimit = limit;
            return Task.FromResult(CounselorStudents);
        }
    }

    private sealed class FakeWriter : ISchoolUsersWriter
    {
        public GradeLevelUpdateStatus GradeStatus { get; init; } = GradeLevelUpdateStatus.Updated;
        public AssignStudentsResult AssignResult { get; init; } = new(null, 0, "c-1");
        public UnassignStudentsResult UnassignResult { get; init; } = new(null);
        public RoleUpdateResult RoleResult { get; init; } = new(RoleUpdateStatus.Updated, "counselor", "teacher");

        public int? LastGradeLevel { get; private set; }
        public bool GradeCalled { get; private set; }
        public bool AssignCalled { get; private set; }
        public bool UnassignCalled { get; private set; }
        public IReadOnlyList<string>? LastIds { get; private set; }
        public bool RoleCalled { get; private set; }
        public string? LastRoleName { get; private set; }
        public string? LastRoleTargetUserId { get; private set; }

        public Task<GradeLevelUpdateStatus> UpdateUserGradeLevelAsync(
            RequestContext context, string callerId, string targetUserId, int? gradeLevel, CancellationToken cancellationToken = default)
        {
            GradeCalled = true;
            LastGradeLevel = gradeLevel;
            return Task.FromResult(GradeStatus);
        }

        // formmaps#114. Added to unbreak the build: the interface gained UpdateUserRoleAsync and this
        // fake was never updated, so `dotnet build FormMaps.slnx` failed with CS0535 while
        // `dotnet build src/FormMaps.Api` + UnitTests (the gate that was actually run) could not see it.
        //
        // RoleCalled / LastRoleName exist so a route-level test can assert the endpoint DID or DID NOT
        // reach the writer. That distinction is the gap the audit found: every current .NET test for
        // #114 targets the two pure functions (RoleChangeGuard, RoleChangeRequest), so making
        // PutRoleAsync return success on a cross-tenant refusal left all 1040 unit tests green.
        public Task<RoleUpdateResult> UpdateUserRoleAsync(
            RequestContext context, string callerId, string targetUserId, string roleName,
            CancellationToken cancellationToken = default)
        {
            RoleCalled = true;
            LastRoleName = roleName;
            LastRoleTargetUserId = targetUserId;
            return Task.FromResult(RoleResult);
        }

        public Task<AssignStudentsResult> AssignStudentsAsync(
            RequestContext context, string adminSchoolId, string counselorId, IReadOnlyList<string> ids, string assignedBy,
            CancellationToken cancellationToken = default)
        {
            AssignCalled = true;
            LastIds = ids;
            return Task.FromResult(AssignResult);
        }

        public Task<UnassignStudentsResult> UnassignStudentsAsync(
            RequestContext context, string adminSchoolId, string counselorId, IReadOnlyList<string> ids,
            CancellationToken cancellationToken = default)
        {
            UnassignCalled = true;
            LastIds = ids;
            return Task.FromResult(UnassignResult);
        }
    }
}
