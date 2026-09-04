using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Graduation;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Graduation;

/// <summary>
/// Guard chain, envelopes, query coercion and body parity for the six /graduation/* endpoints (issue #55). The
/// DB behaviour is proven by <see cref="GraduationRulesReaderTests"/>; the reader/writer/scope resolver are
/// fakes here.
///
/// The permission assertion is the one that most needs pinning: these routes gate on <c>graduation:manage</c>,
/// NOT the <c>school:manage</c> most of /api/v1/school-admin uses and NOT the <c>calendar:manage</c> the OTHER
/// half of the same legacy file uses. Getting it wrong would silently widen or narrow access on flip.
/// </summary>
public class GraduationRulesEndpointsTests
{
    private const string School = "school-1";
    private const string Base = "/api/v1/school-admin/graduation";

    // ---------------------------------------------------------------- guard chain

    [Theory]
    [InlineData("GET", Base + "/rules")]
    [InlineData("POST", Base + "/rules")]
    [InlineData("PUT", Base + "/rules/rs-1")]
    [InlineData("GET", Base + "/progress")]
    [InlineData("GET", Base + "/progress/stu-1")]
    [InlineData("GET", Base + "/gap-analysis/stu-1")]
    public async Task Every_route_is_401_for_anonymous(string method, string path)
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(FormMapsPermissions.SchoolManage)]
    [InlineData(FormMapsPermissions.CalendarManage)]
    [InlineData(FormMapsPermissions.CoursesRead)]
    public async Task Routes_are_403_without_graduation_manage(string permission)
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Base + "/rules", permission: permission);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = await Json(response);
        Assert.Equal("missing_permission", doc.RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Unresolvable_school_is_400_no_school()
    {
        using var factory = new Factory { Scope = new FakeScope(null) };
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Base + "/rules");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "No school");
    }

    // ---------------------------------------------------------------- rules

    [Fact]
    public async Task Rules_read_is_single_wrapped_and_null_when_absent()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Base + "/rules");

        using var doc = await Json(response);
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("data").ValueKind);
    }

    /// <summary>
    /// Every Decimal on the rule-set tree is a JSON STRING, because legacy never coerces them on this route.
    /// DIVERGENCE NOT MADE — pinned so a later "these should obviously be numbers" cleanup is a deliberate
    /// behaviour change rather than an accident on flip.
    /// </summary>
    [Fact]
    public async Task Rules_read_emits_every_decimal_as_a_string()
    {
        using var factory = new Factory { Reader = { RuleSet = SampleRuleSet() } };
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Base + "/rules?academicYearId=ay-9");

        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(JsonValueKind.String, data.GetProperty("totalCreditsRequired").ValueKind);
        Assert.Equal("24.5", data.GetProperty("totalCreditsRequired").GetString());
        var category = data.GetProperty("categoryRequirements")[0];
        Assert.Equal("4", category.GetProperty("minCredits").GetString());
        Assert.Equal("ENG-9", category.GetProperty("requiredCourses")[0].GetString());
        Assert.Equal("40", data.GetProperty("specialRequirements")[0].GetProperty("value").GetString());
        Assert.Equal("ay-9", factory.Reader.SeenAcademicYearId);
    }

    [Fact]
    public async Task Rules_read_treats_an_empty_academicYearId_as_absent()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        await Send(client, HttpMethod.Get, Base + "/rules?academicYearId=");

        Assert.Null(factory.Reader.SeenAcademicYearId);
    }

    [Fact]
    public async Task Rules_create_is_201_with_only_the_id()
    {
        using var factory = new Factory { Writer = { CreatedId = "rs-new" } };
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, Base + "/rules",
            body: """{"totalCreditsRequired":24,"categoryRequirements":[{"category":"English","minCredits":4}]}""");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("rs-new", data.GetProperty("id").GetString());
        Assert.Single(data.EnumerateObject()); // { id } and nothing else

        var category = Assert.Single(factory.Writer.LastCreate!.CategoryRequirements);
        Assert.Equal(4d, category.MinCredits);
        Assert.True(category.ElectivesAllowed); // `?? true` when absent
        Assert.Empty(category.RequiredCourses);
    }

    [Theory]
    [InlineData("""{}""")]
    [InlineData("""{"totalCreditsRequired":"24"}""")]
    [InlineData("""{"totalCreditsRequired":null}""")]
    public async Task Rules_create_rejects_a_missing_or_wrong_typed_total(string body)
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, Base + "/rules", body: body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "totalCreditsRequired must be a number");
    }

    [Fact]
    public async Task Rules_create_rejects_a_category_without_a_name()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, Base + "/rules",
            body: """{"totalCreditsRequired":24,"categoryRequirements":[{"minCredits":4}]}""");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "each categoryRequirement needs a category string");
    }

    /// <summary>
    /// The PUT is deliberately NOT tightened the way the POST is: legacy normalizes almost everything there
    /// (missing name -> "", missing type -> "custom", Number(x) || 0, length caps), so those defaults are
    /// reproduced rather than rejected. A 400 here would be the behaviour change, not the leniency.
    /// </summary>
    [Fact]
    public async Task Rules_update_normalizes_instead_of_rejecting()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var longName = new string('x', 250);
        var response = await Send(client, HttpMethod.Put, Base + "/rules/rs-1", body: $$"""
            {
              "categoryRequirements": [{ "minCredits": "nonsense" }],
              "specialRequirements": [{ "name": "{{longName}}", "value": null }]
            }
            """);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var input = factory.Writer.LastUpdate!;
        Assert.Null(input.TotalCreditsRequired);
        var category = Assert.Single(input.CategoryRequirements!);
        Assert.Equal(string.Empty, category.Category);
        Assert.Equal(0d, category.MinCredits);
        Assert.True(category.ElectivesAllowed);
        var special = Assert.Single(input.SpecialRequirements!);
        Assert.Equal(200, special.Name.Length); // slice(0, 200)
        Assert.Equal("custom", special.Type);
        Assert.Equal(0d, special.Value);
    }

    /// <summary>
    /// The null-vs-empty distinction, at the HTTP layer. An absent key (or a non-array) must reach the writer as
    /// NULL — "leave the rows alone" — while <c>[]</c> must reach it as an empty list, which deletes them. These
    /// are the two requests that look identical from a status code and are not.
    /// </summary>
    [Fact]
    public async Task Rules_update_distinguishes_an_absent_child_list_from_an_empty_one()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        await Send(client, HttpMethod.Put, Base + "/rules/rs-1", body: """{"totalCreditsRequired":30}""");
        Assert.Null(factory.Writer.LastUpdate!.CategoryRequirements);
        Assert.Null(factory.Writer.LastUpdate.SpecialRequirements);

        await Send(client, HttpMethod.Put, Base + "/rules/rs-1", body: """{"categoryRequirements":[]}""");
        Assert.NotNull(factory.Writer.LastUpdate!.CategoryRequirements);
        Assert.Empty(factory.Writer.LastUpdate.CategoryRequirements!);
        Assert.Null(factory.Writer.LastUpdate.SpecialRequirements);

        // A present NON-array is also "leave alone" — legacy's Array.isArray guard, not an error.
        await Send(client, HttpMethod.Put, Base + "/rules/rs-1", body: """{"categoryRequirements":"nope"}""");
        Assert.Null(factory.Writer.LastUpdate!.CategoryRequirements);
    }

    [Fact]
    public async Task Rules_update_of_a_missing_rule_set_is_404()
    {
        using var factory = new Factory { Writer = { UpdateResult = false } };
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, Base + "/rules/rs-1", body: "{}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Rule set not found");
    }

    // ---------------------------------------------------------------- progress

    /// <summary>
    /// <c>Math.max(1, parseInt(qs(page)) || 1)</c> / <c>Math.min(100, Math.max(1, parseInt(qs(limit)) || 20))</c>.
    /// The `||` is the subtle part: parseInt("0") is 0, which is FALSY, so limit=0 becomes 20 rather than being
    /// clamped to 1 — a clamp-first implementation would give 1 and silently change every such page.
    /// </summary>
    [Theory]
    [InlineData("", 1, 20)]
    [InlineData("?page=3&limit=50", 3, 50)]
    [InlineData("?page=0&limit=0", 1, 20)]
    [InlineData("?page=-4&limit=-4", 1, 1)]
    [InlineData("?page=abc&limit=abc", 1, 20)]
    [InlineData("?page=2x&limit=7x", 2, 7)]
    [InlineData("?page=1&limit=500", 1, 100)]
    [InlineData("?page=3.9&limit=4.9", 3, 4)]
    public async Task Progress_paging_matches_the_legacy_parseInt_coercion(string query, int page, int limit)
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        await Send(client, HttpMethod.Get, Base + "/progress" + query);

        Assert.Equal(page, factory.Reader.SeenPage);
        Assert.Equal(limit, factory.Reader.SeenLimit);
    }

    [Fact]
    public async Task Progress_list_is_double_wrapped_under_data_data()
    {
        using var factory = new Factory
        {
            Reader =
            {
                Page = new GraduationProgressPage(
                    [new GraduationProgressListRow("stu-1", "Ada", 12, 6d, 20d, 30, "off_track")], 1, 1, 20, 1)
            }
        };
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Base + "/progress");

        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(1, data.GetProperty("total").GetInt32());
        Assert.Equal(20, data.GetProperty("limit").GetInt32());
        var row = data.GetProperty("data")[0];
        Assert.Equal("Ada", row.GetProperty("studentName").GetString());
        Assert.Equal(12, row.GetProperty("gradeLevel").GetInt32());
        Assert.Equal("off_track", row.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Student_progress_404s_and_emits_the_two_key_message_shape()
    {
        using var factory = new Factory
        {
            Reader = { StudentProgress = new StudentGraduationProgress(
                GraduationProgressOutcome.NotFound, null, null, null, null, 0, 0, 0, false, [], []) }
        };
        using var client = factory.CreateClient();

        var missing = await Send(client, HttpMethod.Get, Base + "/progress/stu-1");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        await AssertMessage(missing, "Student not found");

        factory.Reader.StudentProgress = new StudentGraduationProgress(
            GraduationProgressOutcome.Message, "stu-1", "No graduation rules", null, null, 0, 0, 0, false, [], []);

        var message = await Send(client, HttpMethod.Get, Base + "/progress/stu-1");
        using var doc = await Json(message);
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(2, data.EnumerateObject().Count()); // ONLY studentId + message
        Assert.Equal("No graduation rules", data.GetProperty("message").GetString());
    }

    // ---------------------------------------------------------------- gap analysis

    /// <summary>
    /// The empty branch is a THREE-key object — no studentName, no ruleSetId, no summary. It is a different
    /// object from the Ok shape with nulls in it, and a client reading <c>summary</c> can tell the difference.
    /// </summary>
    [Fact]
    public async Task Gap_analysis_empty_branch_omits_name_ruleSetId_and_summary()
    {
        using var factory = new Factory
        {
            Reader = { Gap = new GapAnalysis(GapAnalysisOutcome.Empty, "stu-1", null, null, [], [], null) }
        };
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Base + "/gap-analysis/stu-1");

        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(3, data.EnumerateObject().Count());
        Assert.False(data.TryGetProperty("summary", out _));
        Assert.False(data.TryGetProperty("studentName", out _));
        Assert.Empty(data.GetProperty("gaps").EnumerateArray());
    }

    [Fact]
    public async Task Gap_analysis_ok_branch_carries_gaps_recommendations_and_summary()
    {
        using var factory = new Factory
        {
            Reader = { Gap = new GapAnalysis(
                GapAnalysisOutcome.Ok, "stu-1", "Ada", "rs-1",
                [new CategoryGap("Mathematics", 1d, 4d, 3d, "high")],
                [new GapRecommendation("Mathematics", 3d, [new SuggestedCourse("c-1", "GEO-1", "Geometry", 3d, "Mathematics")])],
                "Needs attention in 1 category") }
        };
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Base + "/gap-analysis/stu-1");

        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("Needs attention in 1 category", data.GetProperty("summary").GetString());
        Assert.Equal("high", data.GetProperty("gaps")[0].GetProperty("severity").GetString());
        var course = data.GetProperty("recommendations")[0].GetProperty("suggestedCourses")[0];
        Assert.Equal("GEO-1", course.GetProperty("code").GetString());
        Assert.Equal(3d, course.GetProperty("credits").GetDouble());
    }

    // ---------------------------------------------------------------- helpers

    private static GraduationRuleSetRow SampleRuleSet() => new(
        "rs-1", School, "ay-9", "24.5", true, null, "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z",
        [new CategoryRequirementRow("cat-1", "rs-1", "English", "4", ["ENG-9"], true, 0, true, null,
            "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z")],
        [new SpecialRequirementRow("sp-1", "rs-1", "Service", "hours", "40", "hours", null, true, null,
            "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z")]);

    private static Task<HttpResponseMessage> Send(
        HttpClient client, HttpMethod method, string path,
        string permission = FormMapsPermissions.GraduationManage, string? body = null)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "admin-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.SchoolAdmin);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "admin@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Admin");
        request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, School);
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permission);
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

        public ISchoolAdminScopeResolver Scope { get; init; } = new FakeScope(School);

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IGraduationRulesReader>();
                services.AddSingleton<IGraduationRulesReader>(Reader);
                services.RemoveAll<IGraduationRulesWriter>();
                services.AddSingleton<IGraduationRulesWriter>(Writer);
                services.RemoveAll<ISchoolAdminScopeResolver>();
                services.AddSingleton(Scope);
            });
        }
    }

    private sealed class FakeScope(string? schoolId) : ISchoolAdminScopeResolver
    {
        public Task<string?> ResolveSchoolIdAsync(RequestContext context, CancellationToken cancellationToken = default) =>
            Task.FromResult(schoolId);
    }

    private sealed class FakeReader : IGraduationRulesReader
    {
        public GraduationRuleSetRow? RuleSet { get; set; }

        public GraduationProgressPage Page { get; set; } = new([], 0, 1, 20, 0);

        public StudentGraduationProgress StudentProgress { get; set; } =
            new(GraduationProgressOutcome.Message, "stu-1", "No graduation rules", null, null, 0, 0, 0, false, [], []);

        public GapAnalysis Gap { get; set; } = new(GapAnalysisOutcome.Empty, "stu-1", null, null, [], [], null);

        public string? SeenAcademicYearId { get; private set; }

        public int SeenPage { get; private set; }

        public int SeenLimit { get; private set; }

        public Task<GraduationRuleSetRow?> GetRulesAsync(
            RequestContext context, string schoolId, string? academicYearId, CancellationToken cancellationToken = default)
        {
            SeenAcademicYearId = academicYearId;
            return Task.FromResult(RuleSet);
        }

        public Task<GraduationProgressPage> GetProgressListAsync(
            RequestContext context, string schoolId, int page, int limit, string? status, string? sortBy,
            CancellationToken cancellationToken = default)
        {
            SeenPage = page;
            SeenLimit = limit;
            return Task.FromResult(Page);
        }

        public Task<StudentGraduationProgress> GetStudentProgressAsync(
            RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(StudentProgress);

        public Task<GapAnalysis> GetGapAnalysisAsync(
            RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Gap);
    }

    private sealed class FakeWriter : IGraduationRulesWriter
    {
        public string CreatedId { get; set; } = "rs-1";

        public bool UpdateResult { get; set; } = true;

        public CreateGraduationRulesInput? LastCreate { get; private set; }

        public UpdateGraduationRulesInput? LastUpdate { get; private set; }

        public Task<string> CreateRulesAsync(
            RequestContext context, string schoolId, CreateGraduationRulesInput input, CancellationToken cancellationToken = default)
        {
            LastCreate = input;
            return Task.FromResult(CreatedId);
        }

        public Task<bool> UpdateRulesAsync(
            RequestContext context, string schoolId, string actorId, string ruleSetId, UpdateGraduationRulesInput input,
            CancellationToken cancellationToken = default)
        {
            LastUpdate = input;
            return Task.FromResult(UpdateResult);
        }
    }
}
