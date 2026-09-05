using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Graduation;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Graduation;

/// <summary>
/// Guard chain, envelopes and body parity for the six /api/v1/student/graduation-plan* endpoints (issue #55
/// remainder). DB behaviour is proven by <see cref="GraduationPlanRepositoryTests"/>; the repository is a fake
/// here.
///
/// <para>The two assertions that most need pinning are shape, not status: the target read returns a NINE-key
/// object when saved and a FOUR-key object when suggested — never one with nulls — and DELETE answers
/// <c>{ success: true }</c> with no <c>data</c> key at all. Both are what the web client destructures.</para>
///
/// <para>There is also a NEGATIVE assertion worth its own test: POST /graduation-plan/generate must NOT be
/// mapped by this service. DECISION D1 keeps it on Node, next.config.ts carves it out unconditionally, and if
/// .NET ever answered it the carve-out would be the only thing standing between a user and a 404-shaped
/// regression that no flag controls.</para>
/// </summary>
public class GraduationPlanEndpointsTests
{
    private const string Student = "stu-1";
    private const string School = "school-1";
    private const string Base = "/api/v1/student/graduation-plan";

    // ---------------------------------------------------------------- guard chain

    [Theory]
    [InlineData("GET", Base)]
    [InlineData("GET", Base + "/target")]
    [InlineData("PUT", Base + "/target")]
    [InlineData("POST", Base + "/submit")]
    [InlineData("DELETE", Base)]
    [InlineData("GET", Base + "/supplemental")]
    public async Task Every_route_is_401_for_anonymous(string method, string path)
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    /// <summary>
    /// Legacy declares NO requirePermission and NO role check on any of these six — they are self-scoped by
    /// passing req.userId into the service. Pinned so nobody "hardens" the port into a 403 that legacy would
    /// have answered 200, which is exactly the kind of tightening #40 and #151 were reverted for.
    /// </summary>
    [Fact]
    public async Task No_permission_is_required_beyond_being_authenticated()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Base, permissions: null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    /// <summary>DECISION D1: the AI generator is Node's, permanently. This service must not answer it.</summary>
    [Fact]
    public async Task Generate_is_not_mapped_by_this_service()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, Base + "/generate");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---------------------------------------------------------------- GET /target

    [Fact]
    public async Task Target_read_is_null_when_there_is_neither_a_target_nor_a_suggestion()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Base + "/target");

        using var doc = await Json(response);
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("data").ValueKind);
    }

    [Fact]
    public async Task Saved_target_is_the_nine_key_dto_with_a_resolved_template_label()
    {
        using var factory = new Factory();
        factory.Repository.Target = new TargetOrSuggestion(
            new SavedTargetRow("t-1", "u-1", "MIT", "Computer Science", "computer-science", "most-selective",
                "computer-science:most-selective"),
            null);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Base + "/target");

        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(9, data.EnumerateObject().Count());
        Assert.Equal("t-1", data.GetProperty("id").GetString());
        Assert.Equal("computer-science:most-selective", data.GetProperty("templateKey").GetString());
        Assert.Equal("Computer Science — Most Selective", data.GetProperty("templateLabel").GetString());
        Assert.False(data.GetProperty("suggested").GetBoolean());
    }

    /// <summary>
    /// The suggestion is a DIFFERENT object, not the saved one with nulls: legacy builds a four-key literal and
    /// JSON.stringify has no id / fieldKey / selectivityTier / templateKey / templateLabel to drop. A client
    /// that checks `"templateKey" in data` would break if this became five or nine keys.
    /// </summary>
    [Fact]
    public async Task Suggested_target_is_a_four_key_object_with_no_template_fields()
    {
        using var factory = new Factory();
        factory.Repository.Target = new TargetOrSuggestion(
            null, new SuggestedTarget("u-9", "Stanford", "Data Science"));
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Base + "/target");

        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(4, data.EnumerateObject().Count());
        Assert.True(data.GetProperty("suggested").GetBoolean());
        Assert.False(data.TryGetProperty("templateKey", out _));
        Assert.False(data.TryGetProperty("id", out _));
    }

    // ---------------------------------------------------------------- PUT /target

    [Theory]
    [InlineData("""{}""")]
    [InlineData("""{"major":null}""")]
    [InlineData("""{"major":42}""")]
    [InlineData("""{"major":"   "}""")]
    public async Task Put_target_requires_a_non_blank_string_major(string body)
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, Base + "/target", body: body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "major required");
    }

    /// <summary>
    /// The major is TRIMMED before it reaches setTarget, and a non-string universityId is DROPPED rather than
    /// coerced — so a numeric universityId produces a "manual" target with no university lookup at all.
    /// </summary>
    [Fact]
    public async Task Put_target_trims_the_major_and_drops_a_non_string_universityId()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        await Send(client, HttpMethod.Put, Base + "/target",
            body: """{"major":"  Nursing  ","universityId":7,"universityName":"Elsewhere"}""");

        var input = factory.Repository.LastSetTarget!;
        Assert.Equal("Nursing", input.Major);
        Assert.Null(input.UniversityId);
        Assert.Equal("Elsewhere", input.UniversityName);
    }

    /// <summary>The schoolId handed to setTarget is the TOKEN claim (req.schoolId), never a users read.</summary>
    [Fact]
    public async Task Put_target_passes_the_token_school_claim_through()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        await Send(client, HttpMethod.Put, Base + "/target", body: """{"major":"Physics"}""");

        Assert.Equal(School, factory.Repository.LastSetTargetSchoolId);
    }

    // ---------------------------------------------------------------- GET / POST / DELETE plan

    [Fact]
    public async Task Plan_read_is_null_when_there_is_no_current_plan()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Base);

        using var doc = await Json(response);
        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("data").ValueKind);
    }

    /// <summary>
    /// gapReport and warnings are raw jsonb passed through, while totalPlannedCredits and item credits are
    /// NUMBERS — legacy coerces those two with Number(), unlike the Decimal strings the rule-set tree emits.
    /// The split is the thing to pin: getting it backwards changes the wire type on flip.
    /// </summary>
    [Fact]
    public async Task Plan_read_emits_numeric_credits_and_passes_jsonb_through()
    {
        using var factory = new Factory { };
        factory.Repository.Plan = SamplePlan();
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Base);

        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(JsonValueKind.Number, data.GetProperty("totalPlannedCredits").ValueKind);
        Assert.Equal(24.5d, data.GetProperty("totalPlannedCredits").GetDouble());
        Assert.Equal("Engineering — Selective", data.GetProperty("templateLabel").GetString());
        Assert.Equal("Science", data.GetProperty("gapReport")[0].GetProperty("category").GetString());
        Assert.Equal(JsonValueKind.Array, data.GetProperty("warnings").ValueKind);

        var item = data.GetProperty("items")[0];
        Assert.Equal(JsonValueKind.Number, item.GetProperty("credits").ValueKind);
        Assert.Equal(1.0d, item.GetProperty("credits").GetDouble());
        Assert.Equal(10, item.GetProperty("gradeLevel").GetInt32());
        Assert.Equal(JsonValueKind.Null, item.GetProperty("term").ValueKind);
    }

    [Fact]
    public async Task Submit_without_a_draft_is_400_with_the_NO_DRAFT_code()
    {
        using var factory = new Factory();
        factory.Repository.Submit = new SubmitPlanResult(false, null);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, Base + "/submit");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = await Json(response);
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("NO_DRAFT", doc.RootElement.GetProperty("code").GetString());
        Assert.Equal("Plan request cannot be fulfilled", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Submit_returns_the_refreshed_plan()
    {
        using var factory = new Factory();
        factory.Repository.Submit = new SubmitPlanResult(true, SamplePlan());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, Base + "/submit");

        using var doc = await Json(response);
        Assert.Equal("plan-1", doc.RootElement.GetProperty("data").GetProperty("id").GetString());
    }

    /// <summary>Success is <c>{ success: true }</c> and NOTHING else — no data key, not even a null one.</summary>
    [Fact]
    public async Task Discard_success_has_no_data_key()
    {
        using var factory = new Factory();
        factory.Repository.Discarded = true;
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Delete, Base);

        using var doc = await Json(response);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Single(doc.RootElement.EnumerateObject());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
    }

    [Fact]
    public async Task Discard_without_a_draft_is_404()
    {
        using var factory = new Factory();
        factory.Repository.Discarded = false;
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Delete, Base);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "No draft to discard");
    }

    // ---------------------------------------------------------------- supplemental

    [Fact]
    public async Task Supplemental_is_a_bare_array_under_data()
    {
        using var factory = new Factory();
        factory.Repository.Supplemental =
        [
            new SupplementalCourseDto("c-1", "Organic Chemistry", "Coursera", "Science", 4.5d, 33, "science",
                "Your school can't fully cover this area — this course fills the science gap."),
        ];
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Base + "/supplemental");

        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(JsonValueKind.Array, data.ValueKind);
        var course = data[0];
        Assert.Equal(8, course.EnumerateObject().Count());
        Assert.Equal(33, course.GetProperty("matchScore").GetInt32());
        Assert.Equal("science", course.GetProperty("fillsGap").GetString());
    }

    [Fact]
    public async Task Supplemental_is_an_empty_array_not_null_when_there_is_no_target()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Base + "/supplemental");

        using var doc = await Json(response);
        Assert.Equal(JsonValueKind.Array, doc.RootElement.GetProperty("data").ValueKind);
        Assert.Equal(0, doc.RootElement.GetProperty("data").GetArrayLength());
    }

    // ---------------------------------------------------------------- harness

    internal static GraduationPlanDto SamplePlan()
    {
        using var gaps = JsonDocument.Parse("""[{"category":"Science","reason":"no catalog course"}]""");
        using var warnings = JsonDocument.Parse("[]");
        return new GraduationPlanDto(
            Id: "plan-1",
            Status: "draft",
            TemplateKey: "engineering:selective",
            TemplateLabel: "Engineering — Selective",
            GapReport: gaps.RootElement.Clone(),
            Warnings: warnings.RootElement.Clone(),
            Rationale: null,
            TotalPlannedCredits: 24.5d,
            SubmittedAt: null,
            ReviewNote: null,
            CreatedDate: "2026-01-02T03:04:05.000Z",
            Items:
            [
                new GraduationPlanItemDto("c-1", "SCI-10", "Biology", 1.0d, 10, null, "Science", "depth", "engine", 0),
            ]);
    }

    private static Task<HttpResponseMessage> Send(
        HttpClient client, HttpMethod method, string path, string? permissions = FormMapsPermissions.CounselorDashboard,
        string? body = null)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, Student);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.Student);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "stu@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Student");
        request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, School);
        if (permissions is not null)
        {
            request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permissions);
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
        public FakeRepository Repository { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IGraduationPlanRepository>();
                services.AddSingleton<IGraduationPlanRepository>(Repository);
            });
        }
    }

    private sealed class FakeRepository : IGraduationPlanRepository
    {
        public TargetOrSuggestion Target { get; set; } = new(null, null);

        public GraduationPlanDto? Plan { get; set; }

        public SubmitPlanResult Submit { get; set; } = new(true, null);

        public bool Discarded { get; set; }

        public IReadOnlyList<SupplementalCourseDto> Supplemental { get; set; } = [];

        public SetTargetInput? LastSetTarget { get; private set; }

        public string? LastSetTargetSchoolId { get; private set; }

        public Task<TargetOrSuggestion> GetTargetOrSuggestionAsync(
            RequestContext context, string userId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Target);

        public Task<SavedTargetRow> SetTargetAsync(
            RequestContext context, string userId, string? schoolId, SetTargetInput input,
            CancellationToken cancellationToken = default)
        {
            LastSetTarget = input;
            LastSetTargetSchoolId = schoolId;
            return Task.FromResult(new SavedTargetRow(
                "t-1", input.UniversityId, input.UniversityName, input.Major, "undecided-general", "open",
                "undecided-general:open"));
        }

        public Task<GraduationPlanDto?> GetCurrentPlanAsync(
            RequestContext context, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Plan);

        public Task<SubmitPlanResult> SubmitPlanAsync(
            RequestContext context, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Submit);

        public Task<bool> DiscardDraftAsync(
            RequestContext context, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Discarded);

        public Task<IReadOnlyList<SupplementalCourseDto>> GetSupplementalRecommendationsAsync(
            RequestContext context, string userId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Supplemental);
    }
}
