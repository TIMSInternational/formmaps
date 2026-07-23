using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
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

namespace FormMaps.IntegrationTests.SchoolStudents;

/// <summary>
/// Guard chain + HTTP mapping for the two school:manage parent-link reads (reader + scope resolver faked). Pins:
/// anon → 401; missing school:manage → 403; /parents no-school → 200 { success, data:[], total:0, totalPages:1 }
/// (NO page/stats); /parents happy envelope { success, data, total, totalPages, page, stats } with nested grouped
/// parent + students; the search TRIM; the studentInCallerSchool gate (Super-Admin RAW-role bypass, no-caller-school
/// → 404, student-not-in-school → 404 "Not found"); and the per-student links happy shape.
/// </summary>
public class SchoolStudentsParentsEndpointsTests
{
    private const string ParentsPath = "/api/v1/school-admin/parents";
    private const string StudentParentsPath = "/api/v1/school-admin/students/s1/parents";
    private const string School = "school-1";

    [Theory]
    [InlineData(ParentsPath)]
    [InlineData(StudentParentsPath)]
    public async Task Anonymous_is_401(string path)
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(School));
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
    }

    [Theory]
    [InlineData(ParentsPath)]
    [InlineData(StudentParentsPath)]
    public async Task Missing_school_manage_is_403(string path)
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, path, permission: FormMapsPermissions.AnalyticsSchool);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("missing_permission", doc.RootElement.GetProperty("code").GetString());
    }

    // ---- GET /parents ----

    [Fact]
    public async Task Parents_no_school_returns_empty_with_total_zero_totalPages_one()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, ParentsPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Empty(root.GetProperty("data").EnumerateArray());
        Assert.Equal(0, root.GetProperty("total").GetInt32());
        Assert.Equal(1, root.GetProperty("totalPages").GetInt32());
        Assert.False(root.TryGetProperty("page", out _));
        Assert.False(root.TryGetProperty("stats", out _));
    }

    [Fact]
    public async Task Parents_happy_path_envelope_with_stats_and_grouped_parent()
    {
        var reader = new FakeReader
        {
            Parents = new ParentsListPage(
                [new ParentGroup("l1", "Pat Parent", "pat@e.st", "u9", false, null, "2026-01-02T00:00:00.000Z",
                    [new ParentStudent("s1", "Ada", "ada@e.st", 11), new ParentStudent("s2", "Bo", "bo@e.st", null)])],
                Total: 2, TotalPages: 1, Page: 3, Stats: new ParentsStats(1, 2, 2)),
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, ParentsPath + "?page=3&limit=25");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal(2, root.GetProperty("total").GetInt32());       // LINK count (data has 1 grouped parent)
        Assert.Equal(1, root.GetProperty("totalPages").GetInt32());
        Assert.Equal(3, root.GetProperty("page").GetInt32());
        var stats = root.GetProperty("stats");
        Assert.Equal(1, stats.GetProperty("totalParents").GetInt32());
        Assert.Equal(2, stats.GetProperty("linkedStudents").GetInt32());
        Assert.Equal(2, stats.GetProperty("pendingInvites").GetInt32());
        var parent = root.GetProperty("data")[0];
        Assert.Equal("l1", parent.GetProperty("id").GetString());
        Assert.Equal("pat@e.st", parent.GetProperty("parentEmail").GetString());
        Assert.Equal("u9", parent.GetProperty("parentUserId").GetString());
        Assert.False(parent.GetProperty("isAccepted").GetBoolean());
        Assert.Equal(JsonValueKind.Null, parent.GetProperty("acceptedAt").ValueKind);
        var students = parent.GetProperty("students").EnumerateArray().ToArray();
        Assert.Equal(2, students.Length);
        Assert.Equal("Ada", students[0].GetProperty("name").GetString());
        Assert.Equal(JsonValueKind.Null, students[1].GetProperty("gradeLevel").ValueKind);
        // clamp/trim forwarded.
        Assert.Equal(3, reader.LastQuery!.Page);
        Assert.Equal(25, reader.LastQuery.Limit);
    }

    [Theory]
    [InlineData("?search=%20%20", null)]        // whitespace-only → trimmed to empty → null
    [InlineData("?search=%20ab%20", "ab")]      // trimmed
    [InlineData("", null)]
    public async Task Parents_search_is_trimmed(string query, string? expSearch)
    {
        var reader = new FakeReader();
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        await Send(client, ParentsPath + query);

        Assert.Equal(expSearch, reader.LastQuery!.Search);
    }

    // ---- GET /students/{id}/parents ----

    [Fact]
    public async Task Student_parents_super_admin_bypasses_school_check()
    {
        // Scope resolves NO school, but a Super Admin bypasses studentInCallerSchool entirely.
        var reader = new FakeReader { StudentInSchool = false, StudentLinks = [Link("l1")] };
        using var factory = new Factory(reader, new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, StudentParentsPath, role: FormMapsRoles.SuperAdmin);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Single(doc.RootElement.GetProperty("data").EnumerateArray());
        Assert.False(reader.IsStudentInSchoolCalled); // bypassed — never queried
    }

    [Fact]
    public async Task Student_parents_non_admin_without_school_is_404()
    {
        var reader = new FakeReader();
        using var factory = new Factory(reader, new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, StudentParentsPath); // school_admin role, no school
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Student_parents_student_not_in_school_is_404()
    {
        var reader = new FakeReader { StudentInSchool = false };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, StudentParentsPath);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Student_parents_happy_path_returns_link_shape()
    {
        var reader = new FakeReader
        {
            StudentInSchool = true,
            StudentLinks = [new StudentParentLinkView("l1", "Pat", "pat@e.st", "father", "expired",
                "2026-01-01T00:00:00.000Z", null, "u9")],
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, StudentParentsPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var row = doc.RootElement.GetProperty("data")[0];
        Assert.Equal("l1", row.GetProperty("id").GetString());
        Assert.Equal("Pat", row.GetProperty("name").GetString());
        Assert.Equal("father", row.GetProperty("relationship").GetString());
        Assert.Equal("expired", row.GetProperty("status").GetString());
        Assert.Equal("2026-01-01T00:00:00.000Z", row.GetProperty("invitedAt").GetString());
        Assert.Equal(JsonValueKind.Null, row.GetProperty("acceptedAt").ValueKind);
        Assert.Equal("u9", row.GetProperty("parentUserId").GetString());
    }

    // ---- helpers ----

    private static StudentParentLinkView Link(string id) =>
        new(id, "Pat", "pat@e.st", "parent", "pending", "2026-01-01T00:00:00.000Z", null, null);

    private static Task<HttpResponseMessage> Send(
        HttpClient client, string path,
        string permission = FormMapsPermissions.SchoolManage, string role = FormMapsRoles.SchoolAdmin)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "admin-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
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
                services.RemoveAll<ISchoolStudentsParentsReader>();
                services.AddSingleton<ISchoolStudentsParentsReader>(reader);
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

    private sealed class FakeReader : ISchoolStudentsParentsReader
    {
        public ParentsListPage Parents { get; init; } = new([], 0, 0, 1, new ParentsStats(0, 0, 0));
        public IReadOnlyList<StudentParentLinkView> StudentLinks { get; init; } = [];
        public bool StudentInSchool { get; init; }

        public ParentsListQuery? LastQuery { get; private set; }
        public bool IsStudentInSchoolCalled { get; private set; }

        public Task<bool> IsStudentInCallerSchoolAsync(
            RequestContext context, string callerSchoolId, string studentId, CancellationToken cancellationToken = default)
        {
            IsStudentInSchoolCalled = true;
            return Task.FromResult(StudentInSchool);
        }

        public Task<IReadOnlyList<StudentParentLinkView>> ListParentsForStudentAsync(
            RequestContext context, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(StudentLinks);

        public Task<ParentsListPage> ListParentsAsync(
            RequestContext context, string schoolId, ParentsListQuery query, CancellationToken cancellationToken = default)
        {
            LastQuery = query;
            return Task.FromResult(Parents);
        }
    }
}
