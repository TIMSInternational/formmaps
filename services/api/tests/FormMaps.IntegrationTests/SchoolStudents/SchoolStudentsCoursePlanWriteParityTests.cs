using System.Reflection;
using System.Text;
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
/// formmaps#107 PARITY driver. The .NET half of a two-repo pair: this class and the legacy repo's
/// <c>api/src/__tests__/school-admin-course-plan-writes.parity.test.ts</c> read the SAME contract file
/// (Data/school-admin-course-plan-writes.parity.json, duplicated byte for byte into both repos) and run every case
/// in it against their own backend.
///
/// <para>WHY THIS EXISTS AND WHY IT IS NOT REDUNDANT WITH <see cref="SchoolStudentsCoursePlanWriteEndpointsTests"/>:
/// that class asserts what .NET does, chosen by whoever wrote .NET. It would stay green if Node changed underneath
/// it. This class asserts what BOTH backends must do, from a definition that lives outside either implementation —
/// so "the .NET port matches Node" becomes a thing a test run can fail on, rather than a claim in a commit message.
/// Today there is no next.config.ts rewrite for /api/v1/school-admin/students/*, so 100% of this traffic reaches
/// Node and the .NET code is dark; the contract is what has to hold on the day someone wires the flag.</para>
///
/// <para>LIMIT, stated plainly: nothing running in this repo can see the legacy repo, so this class cannot prove
/// Node conforms — the legacy driver does that. <see cref="Contract_digest_matches_the_shared_copy"/> is the seam:
/// it reds if the contract is edited here, which is the prompt to copy the file across. It makes a one-sided edit
/// loud; it does not make it impossible.</para>
///
/// <para>Collaborators are faked exactly as the sibling class fakes them, and derived from each case's declared
/// world (which student, which caller, is there a current academic year, does the plan row exist) rather than
/// hand-wired per test — so a case added to the JSON runs on both sides with no C# change.</para>
/// </summary>
public class SchoolStudentsCoursePlanWriteParityTests
{
    private static readonly string ContractText = LoadContractText();
    private static readonly JsonDocument Contract = JsonDocument.Parse(ContractText);
    private static readonly JsonElement Root = Contract.RootElement;

    public static TheoryData<string> CaseIds
    {
        get
        {
            var data = new TheoryData<string>();
            foreach (var c in Root.GetProperty("cases").EnumerateArray())
            {
                data.Add(c.GetProperty("id").GetString()!);
            }

            return data;
        }
    }

    [Theory]
    [MemberData(nameof(CaseIds))]
    public async Task Dotnet_matches_the_shared_contract(string caseId)
    {
        var testCase = FindCase(caseId);
        var expect = testCase.GetProperty("expect");

        var student = testCase.GetProperty("student").GetString()!;
        var actor = testCase.GetProperty("actor").GetString()!;
        var studentId = StudentId(student);
        var currentAcademicYear = World(testCase, "currentAcademicYear");
        var planRowExists = World(testCase, "planRowExists");

        var reader = new FakeReader { StudentInSchool = student == "in_school" };
        var writer = new FakeWriter
        {
            CreateOutcome = student == "no_school"
                ? CoursePlanCourseCreateStatus.NoStudentSchool
                : currentAcademicYear
                    ? CoursePlanCourseCreateStatus.Created
                    : CoursePlanCourseCreateStatus.NoCurrentAcademicYear,
            RowSchoolId = student == "other_school" ? "s2" : Ids("schoolId"),
            Deleted = planRowExists,
        };

        using var factory = new Factory(reader, writer, new FakeScope(CallerSchoolId(actor)));
        using var client = factory.CreateClient();

        var response = await client.SendAsync(BuildRequest(testCase, actor, studentId));
        var payload = await response.Content.ReadAsStringAsync();

        Assert.Equal(expect.GetProperty("status").GetInt32(), (int)response.StatusCode);

        using var body = JsonDocument.Parse(payload);
        if (expect.GetProperty("message").ValueKind == JsonValueKind.String)
        {
            Assert.Equal(expect.GetProperty("message").GetString(), body.RootElement.GetProperty("message").GetString());
        }

        AssertWrite(expect, writer);
        AssertEnvelope(expect, body.RootElement);
    }

    /// <summary>
    /// The contract is duplicated into the legacy repo by hand. This pins THIS copy, so editing it here without
    /// carrying the edit across reds immediately instead of silently splitting the two backends' definition of
    /// correct. Digest recipe is spelled out in the file's own "digest.computedOver".
    /// </summary>
    [Fact]
    public void Contract_digest_matches_the_shared_copy()
    {
        var declared = Root.GetProperty("digest").GetProperty("sha256").GetString();

        Assert.Equal(declared, ComputeDigest(ContractText));
    }

    /// <summary>Every case must exercise a route this backend actually maps, under the contract's permission.</summary>
    [Fact]
    public void Contract_covers_both_write_routes_and_only_school_manage()
    {
        Assert.Equal(FormMapsPermissions.SchoolManage, Root.GetProperty("permission").GetString());

        var routes = Root.GetProperty("cases").EnumerateArray()
            .Select(c => c.GetProperty("route").GetString()!)
            .Distinct()
            .Order()
            .ToArray();

        Assert.Equal(["add", "remove"], routes);
    }

    // ---- assertions ----

    private static void AssertWrite(JsonElement expect, FakeWriter writer)
    {
        switch (expect.GetProperty("write").GetString())
        {
            case "none":
                Assert.False(writer.CreateCalled, "the contract says no create may be attempted for this case");
                Assert.False(writer.DeleteCalled, "the contract says no delete may be attempted for this case");
                break;

            case "create":
                Assert.True(writer.CreateCalled, "the contract says this case must reach the create");
                var create = expect.GetProperty("create");
                Assert.Equal(create.GetProperty("studentId").GetString(), writer.LastStudentId);
                Assert.Equal(create.GetProperty("courseId").GetString(), writer.LastCourseId);
                Assert.Equal(NullableString(create.GetProperty("term")), writer.LastTerm);
                Assert.Equal(create.GetProperty("createdBy").GetString(), writer.LastCreatedBy);
                break;

            case "delete":
                Assert.True(writer.DeleteCalled, "the contract says this case must reach the delete");
                var delete = expect.GetProperty("delete");
                // The anti-lever guard: the delete has to carry the studentId from the URL, not just the row id.
                Assert.Equal(delete.GetProperty("studentId").GetString(), writer.LastDeleteStudentId);
                Assert.Equal(delete.GetProperty("enrollmentId").GetString(), writer.LastEnrollmentId);
                break;

            case "unspecified":
                break;

            default:
                throw new InvalidOperationException($"unknown expect.write: {expect.GetProperty("write").GetString()}");
        }
    }

    private static void AssertEnvelope(JsonElement expect, JsonElement body)
    {
        if (!expect.TryGetProperty("envelope", out var envelope))
        {
            return;
        }

        switch (envelope.GetString())
        {
            case "success_true_only":
                Assert.True(body.GetProperty("success").GetBoolean());
                Assert.Single(body.EnumerateObject());
                break;

            case "success_true_with_created_row":
                Assert.True(body.GetProperty("success").GetBoolean());
                var expectedFields = Root.GetProperty("createdRowFields").EnumerateArray()
                    .Select(f => f.GetString()!).Order().ToArray();
                var actualFields = body.GetProperty("data").EnumerateObject()
                    .Select(p => p.Name).Order().ToArray();
                // Set equality, not order: an extra field is enrichment one backend does and the other does not,
                // and a missing one blanks out in the client cache that consumes this response directly.
                Assert.Equal(expectedFields, actualFields);
                break;

            default:
                throw new InvalidOperationException($"unknown expect.envelope: {envelope.GetString()}");
        }
    }

    // ---- contract plumbing ----

    private static JsonElement FindCase(string id) =>
        Root.GetProperty("cases").EnumerateArray().Single(c => c.GetProperty("id").GetString() == id);

    private static string Ids(string key) => Root.GetProperty("ids").GetProperty(key).GetString()!;

    private static string StudentId(string student) => student switch
    {
        "in_school" => Ids("studentInSchool"),
        "other_school" => Ids("studentOtherSchool"),
        "no_school" => Ids("studentNoSchool"),
        _ => throw new InvalidOperationException($"unknown student: {student}"),
    };

    private static string? CallerSchoolId(string actor) => actor switch
    {
        "admin" or "admin_no_permission" => Ids("schoolId"),
        _ => null, // super_admin has none of their own; admin_without_school is the whole point of its case
    };

    private static bool World(JsonElement testCase, string key)
    {
        if (testCase.TryGetProperty("world", out var world) && world.TryGetProperty(key, out var value))
        {
            return value.GetBoolean();
        }

        return Root.GetProperty("worldDefaults").GetProperty(key).GetBoolean();
    }

    private static string? NullableString(JsonElement el) =>
        el.ValueKind == JsonValueKind.Null ? null : el.GetString();

    private static HttpRequestMessage BuildRequest(JsonElement testCase, string actor, string studentId)
    {
        var route = testCase.GetProperty("route").GetString()!;
        var template = Root.GetProperty("routes").GetProperty(route).GetProperty("path").GetString()!;
        var method = Root.GetProperty("routes").GetProperty(route).GetProperty("method").GetString()!;

        var path = template
            .Replace("{studentId}", studentId, StringComparison.Ordinal)
            .Replace("{enrollmentId}", Ids("enrollmentId"), StringComparison.Ordinal);

        var request = new HttpRequestMessage(new HttpMethod(method), path);

        if (testCase.TryGetProperty("body", out var body) && body.ValueKind == JsonValueKind.Object)
        {
            request.Content = new StringContent(body.GetRawText(), Encoding.UTF8, "application/json");
        }

        AddIdentityHeaders(request, actor);
        return request;
    }

    private static void AddIdentityHeaders(HttpRequestMessage request, string actor)
    {
        if (actor == "anonymous")
        {
            return;
        }

        var (userId, role, permission) = actor switch
        {
            "admin" => (Ids("adminUserId"), FormMapsRoles.SchoolAdmin, FormMapsPermissions.SchoolManage),
            // Authenticated, but carrying some OTHER school-scoped permission — the 403 must come from the
            // missing school:manage, not from having no permissions at all.
            "admin_no_permission" => (Ids("adminUserId"), FormMapsRoles.SchoolAdmin, FormMapsPermissions.AnalyticsSchool),
            "admin_without_school" => (Ids("adminWithoutSchoolUserId"), FormMapsRoles.SchoolAdmin, FormMapsPermissions.SchoolManage),
            "super_admin" => (Ids("superAdminUserId"), FormMapsRoles.SuperAdmin, FormMapsPermissions.SchoolManage),
            _ => throw new InvalidOperationException($"unknown actor: {actor}"),
        };

        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, userId);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, $"{userId}@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, userId);
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permission);
    }

    private static string LoadContractText()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames()
            .Single(n => n.EndsWith("school-admin-course-plan-writes.parity.json", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    private static string ComputeDigest(string text)
    {
        var lines = text.Replace("\r", string.Empty, StringComparison.Ordinal)
            .Split('\n')
            .Where(l => !l.TrimStart().StartsWith("\"sha256\"", StringComparison.Ordinal));

        var hash = System.Security.Cryptography.SHA256.HashData(
            Encoding.UTF8.GetBytes(string.Join("\n", lines)));

        return Convert.ToHexStringLower(hash);
    }

    // ---- fakes (same seams as SchoolStudentsCoursePlanWriteEndpointsTests) ----

    private sealed class Factory(FakeReader reader, FakeWriter writer, FakeScope scope) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISchoolStudentsCoursePlanReader>();
                services.AddSingleton<ISchoolStudentsCoursePlanReader>(reader);
                services.RemoveAll<ISchoolStudentsCoursePlanWriter>();
                services.AddSingleton<ISchoolStudentsCoursePlanWriter>(writer);
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

    private sealed class FakeReader : ISchoolStudentsCoursePlanReader
    {
        public bool StudentInSchool { get; init; }

        public Task<bool> IsStudentInCallerSchoolAsync(
            RequestContext context, string callerSchoolId, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(StudentInSchool);

        public Task<StudentCoursePlanResult?> GetStudentCoursePlanAsync(
            RequestContext context, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult<StudentCoursePlanResult?>(null);

        public Task<ChangeRequestsResult> GetStudentChangeRequestsAsync(
            RequestContext context, string studentId, string? status, CancellationToken cancellationToken = default) =>
            Task.FromResult(new ChangeRequestsResult([], 0));

        public Task<string?> GetCourseRequestDeadlineAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult<string?>(null);
    }

    private sealed class FakeWriter : ISchoolStudentsCoursePlanWriter
    {
        public CoursePlanCourseCreateStatus CreateOutcome { get; init; } = CoursePlanCourseCreateStatus.Created;

        public string RowSchoolId { get; init; } = "s1";

        public bool Deleted { get; init; }

        public bool CreateCalled { get; private set; }
        public bool DeleteCalled { get; private set; }
        public string? LastStudentId { get; private set; }
        public string? LastCourseId { get; private set; }
        public string? LastTerm { get; private set; }
        // formmaps#122 added gradeLevel to the write path after this driver was first written. Captured like the
        // other arguments so the endpoint's passthrough of it is observable rather than assumed.
        public int? LastGradeLevel { get; private set; }
        public string? LastCreatedBy { get; private set; }
        public string? LastDeleteStudentId { get; private set; }
        public string? LastEnrollmentId { get; private set; }

        public Task<CoursePlanCourseCreateResult> CreateCoursePlanCourseAsync(
            RequestContext context, string studentId, string courseId, string? term, int? gradeLevel,
            string? createdBy, CancellationToken cancellationToken = default)
        {
            CreateCalled = true;
            LastStudentId = studentId;
            LastCourseId = courseId;
            LastTerm = term;
            LastGradeLevel = gradeLevel;
            LastCreatedBy = createdBy;

            // Echo the arguments back into the row so the 201 envelope check is about the ENDPOINT's passthrough,
            // not about constants baked into the fake.
            var row = CreateOutcome == CoursePlanCourseCreateStatus.Created
                ? new StudentCoursePlanRow(
                    "plan-1", studentId, RowSchoolId, "ay-1", term, gradeLevel, courseId, "planned", 0, null, true,
                    createdBy, "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z")
                : null;

            return Task.FromResult(new CoursePlanCourseCreateResult(CreateOutcome, row));
        }

        public Task<bool> DeleteCoursePlanCourseAsync(
            RequestContext context, string studentId, string enrollmentId, CancellationToken cancellationToken = default)
        {
            DeleteCalled = true;
            LastDeleteStudentId = studentId;
            LastEnrollmentId = enrollmentId;
            return Task.FromResult(Deleted);
        }
    }
}
