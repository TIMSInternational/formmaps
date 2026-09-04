using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Gradebook;
using FormMaps.Application.Transcript;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Transcript;

/// <summary>
/// Guard chain, envelopes and body validation for routes/transcript.ts' nine endpoints (issue #55). The DB
/// behaviour is proven by <see cref="TranscriptReaderTests"/>; here the reader/writer are fakes so the three
/// DIFFERENT authorization shapes in the file can be pinned independently of any query.
///
/// The case-SENSITIVITY of the role gates is asserted on purpose — "Student", "Counselor" and "SCHOOL_ADMIN"
/// are all rejected by legacy even though <c>FormMapsRoles.Normalize</c> would accept them, and a port that
/// normalized would silently widen access on flip.
/// </summary>
public class TranscriptEndpointsTests
{
    private const string School = "school-1";

    // ---------------------------------------------------------------- self routes

    [Theory]
    [InlineData("/api/v1/transcript")]
    [InlineData("/api/v1/transcript/gpa")]
    public async Task Self_reads_are_401_for_anonymous(string path)
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
    }

    [Theory]
    [InlineData("counselor")]
    [InlineData("school_admin")]
    [InlineData("Super Admin")]
    public async Task Self_transcript_is_403_for_any_non_student(string role)
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Get(client, "/api/v1/transcript", role);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        await AssertMessage(response, "Forbidden");
    }

    // req.userRole?.toLowerCase() — unlike the /students/:id gates, THIS one is case-insensitive.
    [Theory]
    [InlineData("student")]
    [InlineData("Student")]
    [InlineData("STUDENT")]
    public async Task Self_transcript_accepts_any_casing_of_student(string role)
    {
        using var factory = new Factory { Reader = { SchoolId = School } };
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await Get(client, "/api/v1/transcript", role)).StatusCode);
    }

    [Fact]
    public async Task Self_transcript_without_a_school_is_the_empty_envelope_not_an_error()
    {
        using var factory = new Factory { Reader = { SchoolId = null } };
        using var client = factory.CreateClient();

        var response = await Get(client, "/api/v1/transcript", "student");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.Empty(data.GetProperty("byYear").EnumerateObject());
        Assert.Equal(JsonValueKind.Null, data.GetProperty("gpaUnweighted").ValueKind);
        Assert.Equal(0d, data.GetProperty("totalCredits").GetDouble());
    }

    [Fact]
    public async Task Self_gpa_returns_json_null_when_no_row_exists()
    {
        using var factory = new Factory { Reader = { Gpa = null } };
        using var client = factory.CreateClient();

        var response = await Get(client, "/api/v1/transcript/gpa", "student");

        using var doc = await Json(response);
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("data").ValueKind);
    }

    [Fact]
    public async Task Compute_gpa_without_a_school_is_400_with_the_legacy_message()
    {
        using var factory = new Factory { Reader = { SchoolId = null } };
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/transcript/compute-gpa", "student");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "Student is not associated with a school");
    }

    // ---------------------------------------------------------------- cross-student routes

    [Theory]
    [InlineData("student")]
    [InlineData("Counselor")]   // wrong casing -> denied, as in legacy
    [InlineData("teacher")]
    public async Task Student_transcript_is_403_for_a_role_outside_the_literal_set(string role)
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Get(client, "/api/v1/transcript/students/stu-1/transcript", role);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        await AssertMessage(response, "Forbidden");
    }

    [Fact]
    public async Task Counselor_without_a_shared_school_is_403_access_denied()
    {
        using var factory = new Factory { Reader = { CounselorAllowed = false } };
        using var client = factory.CreateClient();

        var response = await Get(client, "/api/v1/transcript/students/stu-1/transcript", FormMapsRoles.Counselor);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        await AssertMessage(response, "Access denied");
    }

    [Fact]
    public async Task Parent_without_an_accepted_link_is_403_access_denied()
    {
        using var factory = new Factory { Reader = { ParentAllowed = false } };
        using var client = factory.CreateClient();

        var response = await Get(client, "/api/v1/transcript/students/stu-1/gpa", FormMapsRoles.Parent);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        await AssertMessage(response, "Access denied");
    }

    /// <summary>
    /// formmaps#121: a PASSING parent gate must widen the read to a System context, and no other role may.
    /// Asserted on the context the fake reader actually received, because the failure mode being guarded
    /// against (empty transcript for a linked parent) is invisible in the status code.
    /// </summary>
    [Fact]
    public async Task Only_a_parent_read_is_widened_to_a_system_context()
    {
        using var factory = new Factory { Reader = { SchoolId = School } };
        using var client = factory.CreateClient();

        await Get(client, "/api/v1/transcript/students/stu-1/gpa", FormMapsRoles.Parent);
        Assert.True(factory.Reader.LastGpaContextWasSystem);

        await Get(client, "/api/v1/transcript/students/stu-1/gpa", FormMapsRoles.Counselor);
        Assert.False(factory.Reader.LastGpaContextWasSystem);

        await Get(client, "/api/v1/transcript/students/stu-1/gpa", FormMapsRoles.SchoolAdmin);
        Assert.False(factory.Reader.LastGpaContextWasSystem);
    }

    [Fact]
    public async Task Super_admin_and_school_admin_skip_the_per_student_check_entirely()
    {
        using var factory = new Factory { Reader = { CounselorAllowed = false, ParentAllowed = false, SchoolId = School } };
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK,
            (await Get(client, "/api/v1/transcript/students/stu-1/transcript", FormMapsRoles.SuperAdmin)).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await Get(client, "/api/v1/transcript/students/stu-1/transcript", FormMapsRoles.SchoolAdmin)).StatusCode);
    }

    // ---------------------------------------------------------------- school-admin routes

    [Theory]
    [InlineData("counselor")]
    [InlineData("student")]
    [InlineData("SCHOOL_ADMIN")] // wrong casing -> denied
    public async Task School_admin_routes_are_403_for_other_roles(string role)
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Get(client, "/api/v1/transcript/school-admin/gpa-config", role);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // The school comes from the TOKEN claim on these four, not from a users read — so an empty header is the
    // "no school" case, and the reader is never consulted.
    [Fact]
    public async Task Gpa_config_without_a_school_claim_is_400_with_the_long_message()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Get(client, "/api/v1/transcript/school-admin/gpa-config", FormMapsRoles.SchoolAdmin, schoolId: null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "No school associated with this account");
    }

    // ...except GET /class-ranks, which says just "No school". A legacy inconsistency, ported as written.
    [Fact]
    public async Task Class_ranks_read_without_a_school_claim_says_only_no_school()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Get(client, "/api/v1/transcript/school-admin/class-ranks", FormMapsRoles.SchoolAdmin, schoolId: null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "No school");
    }

    [Fact]
    public async Task Gpa_config_fallback_emits_the_defaults_with_a_numeric_scale()
    {
        using var factory = new Factory { Reader = { Config = null } };
        using var client = factory.CreateClient();

        var response = await Get(client, "/api/v1/transcript/school-admin/gpa-config", FormMapsRoles.SchoolAdmin);

        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(School, data.GetProperty("schoolId").GetString());
        Assert.Equal(JsonValueKind.Number, data.GetProperty("scale").ValueKind);
        Assert.Equal(4d, data.GetProperty("scale").GetDouble());
        Assert.Equal(3.7d, data.GetProperty("unweightedMap").GetProperty("A-").GetDouble());
        Assert.Equal(1d, data.GetProperty("weightBonuses").GetProperty("ap").GetDouble());
        Assert.False(data.TryGetProperty("id", out _)); // the fallback is a 4-key object, not a row
    }

    /// <summary>
    /// The stored-row branch emits <c>scale</c> as a STRING while the fallback emits a NUMBER, because legacy
    /// coerces the student_gpas Decimals and not this one. DIVERGENCE NOT MADE — pinned so the inconsistency
    /// cannot be "tidied up" without someone deciding to change behaviour on purpose.
    /// </summary>
    [Fact]
    public async Task Stored_gpa_config_emits_scale_as_a_string_unlike_the_fallback()
    {
        using var factory = new Factory { Reader = { Config = SampleConfig() } };
        using var client = factory.CreateClient();

        var response = await Get(client, "/api/v1/transcript/school-admin/gpa-config", FormMapsRoles.SchoolAdmin);

        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(JsonValueKind.String, data.GetProperty("scale").ValueKind);
        Assert.Equal("4.5", data.GetProperty("scale").GetString());
    }

    // ---------------------------------------------------------------- gpa-config body validation (zod parity)

    [Theory]
    [InlineData("""{"scale":"4"}""", "Expected number, received string")]
    [InlineData("""{"scale":null}""", "Expected number, received null")]
    [InlineData("""{"scale":0}""", "Number must be greater than 0")]
    [InlineData("""{"scale":-1}""", "Number must be greater than 0")]
    [InlineData("""{"unweightedMap":[]}""", "Expected object, received array")]
    [InlineData("""{"unweightedMap":{"A":"x"}}""", "Expected number, received string")]
    [InlineData("""{"weightBonuses":{"ap":true}}""", "Expected number, received boolean")]
    [InlineData("""[]""", "Expected object, received array")]
    // scale is checked before the maps (shape-declaration order), so this reports the SCALE issue.
    [InlineData("""{"unweightedMap":{"A":"x"},"scale":"4"}""", "Expected number, received string")]
    public async Task Gpa_config_body_errors_match_the_zod_message(string body, string expected)
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, "/api/v1/transcript/school-admin/gpa-config",
            FormMapsRoles.SchoolAdmin, body: body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, expected);
    }

    [Fact]
    public async Task Gpa_config_accepts_an_empty_body_and_unknown_keys()
    {
        using var factory = new Factory { Writer = { Config = SampleConfig() } };
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await Send(client, HttpMethod.Put,
            "/api/v1/transcript/school-admin/gpa-config", FormMapsRoles.SchoolAdmin, body: "{}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Send(client, HttpMethod.Put,
            "/api/v1/transcript/school-admin/gpa-config", FormMapsRoles.SchoolAdmin, body: """{"nope":1}""")).StatusCode);

        // Unknown keys are STRIPPED, and an absent field must reach the writer as null (Prisma's undefined).
        Assert.Null(factory.Writer.LastInput!.Scale);
        Assert.Null(factory.Writer.LastInput.UnweightedMap);
    }

    // ---------------------------------------------------------------- class-ranks projections

    [Fact]
    public async Task Class_ranks_omit_gradeLevel_entirely_when_the_user_row_is_not_visible()
    {
        using var factory = new Factory
        {
            Reader =
            {
                Rankings =
                [
                    new ClassRankingRow("stu-a", "Ada", true, 11, 1, 3.5d, 3.9d, 12d, 2, 100, "2026-01-01T00:00:00.000Z"),
                    new ClassRankingRow("stu-b", "—", false, null, 2, 0d, 0d, 0d, 2, 0, "2026-01-01T00:00:00.000Z"),
                ]
            }
        };
        using var client = factory.CreateClient();

        var response = await Get(client, "/api/v1/transcript/school-admin/class-ranks", FormMapsRoles.SchoolAdmin);

        using var doc = await Json(response);
        var rows = doc.RootElement.GetProperty("data");
        Assert.True(rows[0].TryGetProperty("gradeLevel", out var grade));
        Assert.Equal(11, grade.GetInt32());
        Assert.False(rows[1].TryGetProperty("gradeLevel", out _), "an undefined property is dropped by JSON.stringify");
        Assert.Equal("—", rows[1].GetProperty("studentName").GetString());
    }

    [Fact]
    public async Task Compute_class_ranks_echoes_ranked_and_class_size()
    {
        using var factory = new Factory { Writer = { Ranks = new ClassRankComputation(7, 7) } };
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/transcript/school-admin/class-ranks", FormMapsRoles.SchoolAdmin);

        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(7, data.GetProperty("ranked").GetInt32());
        Assert.Equal(7, data.GetProperty("classSize").GetInt32());
    }

    // ---------------------------------------------------------------- helpers

    private static GpaConfigurationRow SampleConfig() => new(
        "cfg-1", School, "4.5",
        JsonDocument.Parse("""{"A":4.0}""").RootElement.Clone(),
        JsonDocument.Parse("""{"ap":1.0}""").RootElement.Clone(),
        true, "admin-1", "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z");

    private static Task<HttpResponseMessage> Get(HttpClient client, string path, string role, string? schoolId = School) =>
        Send(client, HttpMethod.Get, path, role, schoolId);

    private static Task<HttpResponseMessage> Send(
        HttpClient client, HttpMethod method, string path, string role, string? schoolId = School, string? body = null)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "caller-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "caller@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Caller");
        if (schoolId is not null)
        {
            request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, schoolId);
        }

        if (body is not null)
        {
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        }

        return client.SendAsync(request);
    }

    private static async Task<JsonDocument> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync());

    private static async Task AssertMessage(HttpResponseMessage response, string expected)
    {
        using var doc = await Json(response);
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(expected, doc.RootElement.GetProperty("message").GetString());
    }

    private sealed class Factory : WebApplicationFactory<Program>
    {
        public FakeReader Reader { get; } = new();

        public FakeWriter Writer { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ITranscriptReader>();
                services.AddSingleton<ITranscriptReader>(Reader);
                services.RemoveAll<ITranscriptWriter>();
                services.AddSingleton<ITranscriptWriter>(Writer);
            });
        }
    }

    private sealed class FakeReader : ITranscriptReader
    {
        public string? SchoolId { get; set; } = School;

        public StudentGpaRow? Gpa { get; set; }

        public GpaConfigurationRow? Config { get; set; }

        public bool CounselorAllowed { get; set; } = true;

        public bool ParentAllowed { get; set; } = true;

        public IReadOnlyList<ClassRankingRow> Rankings { get; set; } = [];

        public bool LastGpaContextWasSystem { get; private set; }

        public Task<string?> GetUserSchoolIdAsync(RequestContext context, string userId, CancellationToken cancellationToken = default) =>
            Task.FromResult(SchoolId);

        public Task<StudentTranscript> GetTranscriptDataAsync(
            RequestContext context, string studentId, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(new StudentTranscript(
                new Dictionary<string, IReadOnlyList<TranscriptGradeRow>>(), null, null, 0d));

        public Task<StudentGpaRow?> GetStudentGpaAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
        {
            LastGpaContextWasSystem = context.IsSystem;
            return Task.FromResult(Gpa);
        }

        public Task<bool> CounselorCanAccessStudentAsync(
            RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(CounselorAllowed);

        public Task<bool> ParentCanAccessStudentAsync(
            RequestContext context, string parentId, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(ParentAllowed);

        public Task<GpaConfigurationRow?> GetGpaConfigAsync(RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Config);

        public Task<IReadOnlyList<ClassRankingRow>> GetClassRankingsAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Rankings);
    }

    private sealed class FakeWriter : ITranscriptWriter
    {
        public GpaConfigurationRow? Config { get; set; }

        public ClassRankComputation Ranks { get; set; } = new(0, 0);

        public GpaConfigInput? LastInput { get; private set; }

        public Task<StudentGpaRow> ComputeAndPersistGpaAsync(
            RequestContext context, string userId, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(new StudentGpaRow(
                "gpa-1", userId, 4d, 4d, 4d, null, null, null,
                JsonDocument.Parse("{}").RootElement.Clone(),
                "2026-01-01T00:00:00.000Z", true, userId, "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z"));

        public Task<GpaConfigurationRow> UpsertGpaConfigAsync(
            RequestContext context, string schoolId, string actorId, GpaConfigInput input, CancellationToken cancellationToken = default)
        {
            LastInput = input;
            return Task.FromResult(Config ?? SampleConfig());
        }

        public Task<ClassRankComputation> ComputeClassRanksAsync(
            RequestContext context, string schoolId, string adminUserId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Ranks);
    }
}
