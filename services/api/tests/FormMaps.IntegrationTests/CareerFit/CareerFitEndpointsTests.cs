using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.CareerFit;

/// <summary>
/// FM-CF-012: the guard chain, the tenant scoping and the wire shape of all SEVEN CareerFit routes. The
/// evaluator and the run reader are faked — the engine's numbers are proven by CareerFitParityTests and the
/// database behaviour by CareerFitEvaluatorDatabaseTests / CareerFitRlsTests; what is under test here is the
/// HTTP layer alone: who is let in, what a denial looks like, which collaborator is reached (and which is
/// NOT), and what comes out.
///
/// Three claims this file exists to pin, each of which was proven RED against a naive endpoint first:
///   1. a READ never scores — GET /results/{userId} must reach the run READER and never the evaluator, or a
///      dashboard that mounts it writes an immutable run per page view;
///   2. no fit scalar reaches the wire — no careerfit_absolute / careerfit_relative / pca_index / mil_fit and
///      nothing matching *percent* / *probability* on any of the seven responses (manifest guardrail 3);
///   3. a run fetched BY ID re-runs the per-user gate on the run's OWNER — RLS admits every caller in the
///      row's tenant, so without that second gate a same-school stranger reads the run by id.
/// </summary>
public class CareerFitEndpointsTests
{
    private const string CallerUserId = "caller-1";
    private const string TargetUserId = "student-7";
    private const string OtherUserId = "student-9";
    private static readonly Guid RunId = new("3f2504e0-4f89-11d3-9a0c-0305e82c3301");

    private static readonly string[] AllSevenGets =
    [
        "/api/v1/careerfit/families",
        $"/api/v1/careerfit/results/{TargetUserId}",
        $"/api/v1/careerfit/results/{TargetUserId}/explanation",
        $"/api/v1/careerfit/results/{TargetUserId}/runs",
        $"/api/v1/careerfit/runs/{RunId}",
        $"/api/v1/careerfit/runs/{RunId}/explanation",
    ];

    // ---------------------------------------------------------------- auth

    [Theory]
    [InlineData("/api/v1/careerfit/families")]
    [InlineData("/api/v1/careerfit/results/student-7")]
    [InlineData("/api/v1/careerfit/results/student-7/explanation")]
    [InlineData("/api/v1/careerfit/results/student-7/runs")]
    [InlineData("/api/v1/careerfit/runs/3f2504e0-4f89-11d3-9a0c-0305e82c3301")]
    [InlineData("/api/v1/careerfit/runs/3f2504e0-4f89-11d3-9a0c-0305e82c3301/explanation")]
    public async Task Anonymous_is_401_on_every_read_before_any_guard_or_collaborator(string path)
    {
        var harness = new Harness();
        using var factory = harness.Factory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, harness.Subscription.CallCount);
        Assert.Equal(0, harness.Access.CallCount);
        Assert.Equal(0, harness.Reader.CallCount);
        Assert.Equal(0, harness.Evaluator.CallCount);
    }

    [Fact]
    public async Task Anonymous_is_401_on_the_evaluate_write_and_nothing_is_scored()
    {
        var harness = new Harness();
        using var factory = harness.Factory();
        using var client = factory.CreateClient();

        var response = await client.PostAsync($"/api/v1/careerfit/evaluate/{TargetUserId}", content: null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, harness.Evaluator.CallCount);
    }

    /// <summary>
    /// REVIEW FINDING: this covered <c>/results/{userId}</c> only. The decision log calls the subscription
    /// guard deliberate for all SIX per-user routes, and nothing held that claim for the two per-RUN ones —
    /// deleting the RequireSubscriptionAsync block from <c>AuthorizeRunAsync</c> left the endpoint suite
    /// 36/36 green, while every other guard mutation the reviewer applied went red. It is now a Theory over
    /// every route that names a student or a run, each asserting that the 403 arrives BEFORE the student is
    /// read, scored or access-checked.
    /// </summary>
    [Theory]
    [InlineData("GET", "/api/v1/careerfit/results/student-7")]
    [InlineData("GET", "/api/v1/careerfit/results/student-7/explanation")]
    [InlineData("GET", "/api/v1/careerfit/results/student-7/runs")]
    [InlineData("GET", "/api/v1/careerfit/runs/3f2504e0-4f89-11d3-9a0c-0305e82c3301")]
    [InlineData("GET", "/api/v1/careerfit/runs/3f2504e0-4f89-11d3-9a0c-0305e82c3301/explanation")]
    [InlineData("POST", "/api/v1/careerfit/evaluate/student-7")]
    public async Task Missing_subscription_is_403_and_the_student_is_never_read_or_scored(string method, string path)
    {
        var harness = new Harness
        {
            Subscription = new FakeSubscriptionGuard(GuardDecision.Deny(
                403, "SUBSCRIPTION_REQUIRED", "Active subscription required to access this feature")),
        };
        using var factory = harness.Factory();
        using var client = factory.CreateClient();

        var response = await client.SendAsync(
            method == "POST" ? Post(path) : Get(path));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(1, harness.Subscription.CallCount);
        Assert.Equal(0, harness.Access.CallCount);
        Assert.Equal(0, harness.Reader.CallCount);      // a run fetched BY ID is not read before the guard either
        Assert.Equal(0, harness.Evaluator.CallCount);
    }

    [Fact]
    public async Task The_families_catalogue_needs_identity_only_and_no_subscription()
    {
        var harness = new Harness { Subscription = new FakeSubscriptionGuard(allow: false) };
        using var factory = harness.Factory();
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Get("/api/v1/careerfit/families"));

        // Catalogue metadata about the rule set, no student in it — the treatment /vocational360/instrument gets.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(0, harness.Subscription.CallCount);
        Assert.Equal(0, harness.Access.CallCount);
    }

    // ---------------------------------------------------------------- tenant scoping

    [Theory]
    [InlineData("/api/v1/careerfit/results/student-7")]
    [InlineData("/api/v1/careerfit/results/student-7/explanation")]
    [InlineData("/api/v1/careerfit/results/student-7/runs")]
    public async Task Access_denied_on_the_path_user_is_the_uniform_404_and_nothing_is_read(string path)
    {
        var harness = new Harness { Access = new FakeUserAccessGuard(allow: false) };
        using var factory = harness.Factory();
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Get(path));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(TargetUserId, harness.Access.LastTargetUserId);
        Assert.Equal(0, harness.Reader.CallCount);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Access_denied_blocks_the_evaluate_write_with_a_404_and_scores_nothing()
    {
        var harness = new Harness { Access = new FakeUserAccessGuard(allow: false) };
        using var factory = harness.Factory();
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Post($"/api/v1/careerfit/evaluate/{TargetUserId}"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(0, harness.Evaluator.CallCount);
    }

    /// <summary>
    /// RED FIRST against the naive per-run endpoint, which authorised on RLS alone. careerfit_runs' policy
    /// admits EVERY caller in the row's tenant — the schema's own header says so, and
    /// CareerFitRlsTests.Same_school_caller_is_admitted_by_the_policy_so_the_endpoint_gate_is_not_optional
    /// names it — so a same-school caller with no relationship to the student would read the run by id. The
    /// endpoint must run the SAME CanAccessUser gate on the run's OWNER, and answer the uniform 404.
    /// </summary>
    [Theory]
    [InlineData("/api/v1/careerfit/runs/3f2504e0-4f89-11d3-9a0c-0305e82c3301")]
    [InlineData("/api/v1/careerfit/runs/3f2504e0-4f89-11d3-9a0c-0305e82c3301/explanation")]
    public async Task A_run_fetched_by_id_still_runs_the_gate_on_the_runs_owner(string path)
    {
        var harness = new Harness { Access = new FakeUserAccessGuard(allow: false) };
        harness.Reader.Run = SampleRun(ownerUserId: OtherUserId);
        using var factory = harness.Factory();
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Get(path));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        // The gate was asked about the RUN's owner, not about the caller and not about a path id.
        Assert.Equal(OtherUserId, harness.Access.LastTargetUserId);
    }

    [Fact]
    public async Task An_unparseable_run_id_is_the_same_404_and_never_reaches_the_reader()
    {
        var harness = new Harness();
        using var factory = harness.Factory();
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Get("/api/v1/careerfit/runs/not-a-guid"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(0, harness.Reader.CallCount);
    }

    [Fact]
    public async Task A_student_who_has_never_been_evaluated_is_a_404_not_an_empty_ranking()
    {
        var harness = new Harness();
        harness.Reader.Run = null;
        using var factory = harness.Factory();
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Get($"/api/v1/careerfit/results/{TargetUserId}"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---------------------------------------------------------------- shape

    /// <summary>
    /// RED FIRST against a read endpoint wired to the evaluator (the obvious port of legacy POST
    /// /careers/score, which both scores and returns). A CareerFit run is immutable and a re-evaluation is a
    /// NEW run, so a GET that scored would write one row per dashboard render and make "which run produced
    /// the advice this student was shown" unanswerable.
    /// </summary>
    [Theory]
    [InlineData("/api/v1/careerfit/results/student-7")]
    [InlineData("/api/v1/careerfit/results/student-7/explanation")]
    [InlineData("/api/v1/careerfit/results/student-7/runs")]
    [InlineData("/api/v1/careerfit/runs/3f2504e0-4f89-11d3-9a0c-0305e82c3301")]
    [InlineData("/api/v1/careerfit/runs/3f2504e0-4f89-11d3-9a0c-0305e82c3301/explanation")]
    public async Task A_read_never_scores(string path)
    {
        var harness = new Harness();
        using var factory = harness.Factory();
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Get(path));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(0, harness.Evaluator.CallCount);
    }

    [Fact]
    public async Task The_ranking_carries_the_ordinal_rank_and_the_categorical_labels()
    {
        var harness = new Harness();
        using var factory = harness.Factory();
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Get($"/api/v1/careerfit/results/{TargetUserId}"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(document.RootElement.GetProperty("success").GetBoolean());

        var data = document.RootElement.GetProperty("data");
        Assert.Equal(RunId, data.GetProperty("run_id").GetGuid());
        Assert.Equal("1.0.0-test", data.GetProperty("rules_version").GetString());

        var families = data.GetProperty("families");
        Assert.Equal(2, families.GetArrayLength());
        Assert.Equal(1, families[0].GetProperty("family_id").GetInt32());
        Assert.Equal(1, families[0].GetProperty("rank").GetInt32());
        Assert.Equal("SATISFIED", families[0].GetProperty("final_gate").GetString());
        Assert.Equal("SOLID", families[0].GetProperty("convergence").GetString());
        Assert.Equal("NOT_DETERMINABLE", families[0].GetProperty("v360_confidence").GetString());
        // The family NAME comes from the loaded rule set, so a ranking is readable without a second call.
        Assert.Equal(JsonValueKind.String, families[0].GetProperty("family_name").ValueKind);
    }

    [Fact]
    public async Task The_evaluate_write_scores_once_and_returns_the_same_ranking_shape()
    {
        var harness = new Harness();
        using var factory = harness.Factory();
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Post($"/api/v1/careerfit/evaluate/{TargetUserId}"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, harness.Evaluator.CallCount);
        Assert.Equal(TargetUserId, harness.Evaluator.LastUserId);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(RunId, document.RootElement.GetProperty("data").GetProperty("run_id").GetGuid());
    }

    /// <summary>A student who has not finished an instrument is a state of the world, not a fault: 409 naming the instrument and the stable code.</summary>
    [Fact]
    public async Task An_unfinished_instrument_is_a_409_naming_the_instrument()
    {
        var harness = new Harness();
        harness.Evaluator.Throw = new CareerFitInputException(
            InputInstruments.Mil, InputWarningCodes.MilPercentilesMissing, "No completed LIA session is visible for this student.");
        using var factory = harness.Factory();
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Post($"/api/v1/careerfit/evaluate/{TargetUserId}"));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(document.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(InputInstruments.Mil, document.RootElement.GetProperty("instrument").GetString());
        Assert.Equal(InputWarningCodes.MilPercentilesMissing, document.RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task The_explanation_route_serves_the_FM_CF_011_payload_unchanged()
    {
        var harness = new Harness();
        using var factory = harness.Factory();
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Get($"/api/v1/careerfit/results/{TargetUserId}/explanation"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = document.RootElement.GetProperty("data");

        Assert.Equal(RunId, data.GetProperty("run_id").GetGuid());
        Assert.Equal("1.0.0-test", data.GetProperty("rules_version").GetString());
        var family = data.GetProperty("families")[0];
        Assert.Equal(1, family.GetProperty("family_id").GetInt32());
        Assert.Equal("SATISFIED", family.GetProperty("gates").GetProperty("final").GetString());
        // 360 states its own absence in words rather than leaving a consumer to infer it from an empty list.
        var v360 = family.GetProperty("v360");
        Assert.False(v360.GetProperty("determinable").GetBoolean());
        Assert.Equal(V360Sources.NoData, v360.GetProperty("source").GetString());
        Assert.Equal(Api.Contracts.CareerFit.V360Explanation.NoEvidenceReason, v360.GetProperty("reason").GetString());
    }

    [Fact]
    public async Task The_history_route_lists_runs_newest_first_and_200s_on_an_empty_history()
    {
        var harness = new Harness();
        harness.Reader.Summaries =
        [
            new CareerFitRunSummary(RunId, new DateTimeOffset(2026, 9, 3, 10, 0, 0, TimeSpan.Zero), "1.0.0-test", 1),
        ];
        using var factory = harness.Factory();
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Get($"/api/v1/careerfit/results/{TargetUserId}/runs"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var runs = document.RootElement.GetProperty("data").GetProperty("runs");
        Assert.Equal(1, runs.GetArrayLength());
        Assert.Equal(RunId, runs[0].GetProperty("run_id").GetGuid());
        Assert.Equal(1, runs[0].GetProperty("top_family_id").GetInt32());

        harness.Reader.Summaries = [];
        var empty = await client.SendAsync(Get($"/api/v1/careerfit/results/{TargetUserId}/runs"));
        Assert.Equal(HttpStatusCode.OK, empty.StatusCode);
        using var emptyDocument = JsonDocument.Parse(await empty.Content.ReadAsStringAsync());
        Assert.Equal(0, emptyDocument.RootElement.GetProperty("data").GetProperty("runs").GetArrayLength());
    }

    [Fact]
    public async Task The_families_route_serves_the_loaded_rule_sets_families_with_its_version_and_status()
    {
        var harness = new Harness();
        using var factory = harness.Factory();
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Get("/api/v1/careerfit/families"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = document.RootElement.GetProperty("data");
        Assert.Equal(JsonValueKind.String, data.GetProperty("rules_version").ValueKind);
        Assert.Equal(JsonValueKind.String, data.GetProperty("status").ValueKind);

        var families = data.GetProperty("families");
        Assert.True(families.GetArrayLength() >= 14);
        // Non-scorable families are LISTED, not hidden: a client that dropped them would show thirteen and no reason.
        Assert.Contains(families.EnumerateArray(), f => !f.GetProperty("scorable").GetBoolean());
    }

    /// <summary>
    /// RED FIRST against a ranking that carried the engine's scalars, which is what a straight projection of
    /// OwnerEvaluation produces. Manifest guardrail 3: CareerFitAbsolute is never presented as a percentage,
    /// and the reason generalises — a 0–100 number beside a career family is read as a likelihood whatever it
    /// is called. Asserted over the raw JSON of every route so a nested block cannot smuggle one in.
    /// </summary>
    [Theory]
    [InlineData("/api/v1/careerfit/families")]
    [InlineData("/api/v1/careerfit/results/student-7")]
    [InlineData("/api/v1/careerfit/results/student-7/explanation")]
    [InlineData("/api/v1/careerfit/results/student-7/runs")]
    [InlineData("/api/v1/careerfit/runs/3f2504e0-4f89-11d3-9a0c-0305e82c3301")]
    [InlineData("/api/v1/careerfit/runs/3f2504e0-4f89-11d3-9a0c-0305e82c3301/explanation")]
    public async Task No_route_puts_a_fit_scalar_or_a_percentage_on_the_wire(string path)
    {
        var harness = new Harness();
        using var factory = harness.Factory();
        using var client = factory.CreateClient();

        var body = await (await client.SendAsync(Get(path))).Content.ReadAsStringAsync();

        // Both spellings of every scalar: the persisted column name and what SnakeCaseLower makes of the
        // C# property (CareerFitAbsolute -> career_fit_absolute). The first draft of this list carried only
        // the column spellings and stayed GREEN when the scalar was deliberately put back on the ranking —
        // which is why the property spellings are here.
        foreach (var banned in new[]
        {
            "careerfit_absolute", "career_fit_absolute", "careerfit_relative", "career_fit_relative",
            "pca_index", "mil_fit", "competency_fit", "personality_fit", "pca_route_fit",
            "percent", "probability",
        })
        {
            Assert.DoesNotContain(banned, body, StringComparison.OrdinalIgnoreCase);
        }

        // And the structural half, so a scalar under a name nobody thought to list is still caught: no
        // property name on any of the seven responses ends in "_fit".
        using var document = JsonDocument.Parse(body);
        Assert.All(PropertyNames(document.RootElement), name =>
            Assert.False(name.EndsWith("_fit", StringComparison.OrdinalIgnoreCase), $"'{name}' is a fit scalar on the wire"));
    }

    private static IEnumerable<string> PropertyNames(JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var property in element.EnumerateObject())
                {
                    yield return property.Name;
                    foreach (var nested in PropertyNames(property.Value))
                    {
                        yield return nested;
                    }
                }

                break;
            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray())
                {
                    foreach (var nested in PropertyNames(item))
                    {
                        yield return nested;
                    }
                }

                break;
        }
    }

    [Fact]
    public async Task The_evaluate_response_carries_no_fit_scalar_either()
    {
        var harness = new Harness();
        using var factory = harness.Factory();
        using var client = factory.CreateClient();

        var body = await (await client.SendAsync(Post($"/api/v1/careerfit/evaluate/{TargetUserId}"))).Content.ReadAsStringAsync();

        Assert.DoesNotContain("careerfit_absolute", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("percent", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Every_route_is_mapped()
    {
        var harness = new Harness();
        using var factory = harness.Factory();
        using var client = factory.CreateClient();

        foreach (var path in AllSevenGets)
        {
            var response = await client.SendAsync(Get(path));
            Assert.True(response.IsSuccessStatusCode, $"{path} -> {(int)response.StatusCode}");
        }

        var evaluate = await client.SendAsync(Post($"/api/v1/careerfit/evaluate/{TargetUserId}"));
        Assert.True(evaluate.IsSuccessStatusCode);
    }

    // ---------------------------------------------------------------- helpers

    private static HttpRequestMessage Get(string path) => Build(HttpMethod.Get, path);

    private static HttpRequestMessage Post(string path) => Build(HttpMethod.Post, path);

    private static HttpRequestMessage Build(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, CallerUserId);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.Counselor);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "counselor@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Counselor");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.ProfileRead);
        request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, "school-1");
        return request;
    }

    /// <summary>
    /// Two ranked families, enough to exercise every projection. The 360 block is deliberately the NO_DATA
    /// shape — every student until FM-CF-006 seeds the 40 items — so the explanation route's "absence is not
    /// weakness" branch is the one under test.
    /// </summary>
    private static CareerFitRun SampleRun(string ownerUserId = TargetUserId) => new(
        Id: RunId,
        CreatedAt: new DateTimeOffset(2026, 9, 3, 10, 0, 0, TimeSpan.Zero),
        UserId: ownerUserId,
        SchoolId: "school-1",
        RulesVersion: "1.0.0-test",
        DiscGraph: DiscGraphChoice.WorkAdaptation,
        Inputs: new CareerFitAssessment(
            new PcaInput(89, 40, 30, 55),
            new Dictionary<int, int> { [1] = 3 },
            new MilInput(72, 60, 55, 50, 45),
            new PersonalityInput(60, 40, 55, 45, 70, 30, 65, 35),
            new Dictionary<string, V360Aggregate>()),
        Quality: new InputQuality(
            DiscGraphChoice.WorkAdaptation,
            [],
            [],
            new Dictionary<string, PersonalityPoleDerivation>(),
            V360Sources.NoData,
            [new InputWarning(InputInstruments.V360, InputWarningCodes.V360NoData, "No 360 responses carried a rule-set variable code.")]),
        Sources: new CareerFitInputSources("pca-1", "lia-1", "pers-1"),
        Families: [Family(1, rank: 1), Family(2, rank: 2)]);

    private static OwnerEvaluation Family(int familyId, int rank) => new(
        OwnerType: ResolvedFamilyRules.FamilyOwnerType,
        OwnerId: familyId,
        PcaRouteFit: 71.5,
        PcaWinningRoute: "DIRECTOR",
        CompetencyFit: 80,
        CompetencyGate: Gate.Satisfied,
        PcaIndex: 75,
        MilFit: 63,
        MilGate: Gate.Satisfied,
        MilRelativeStrengths: new Dictionary<string, double> { ["DC"] = 8.4, ["RZ"] = -3.6 },
        PersonalityFit: 66,
        PersonalityWinningRoute: "ENTJ",
        CareerFit360: 0,
        CareerFit360Consensus: null,
        CareerFit360Confidence: Confidence.NotDeterminable,
        FinalGate: Gate.Satisfied,
        ConvergenceLevel: Convergence.Solid,
        ConvergenceDetail: new ConvergenceResult(Convergence.Solid, 3, new Dictionary<string, Support>
        {
            [InputInstruments.Pca] = Support.Strong,
            [InputInstruments.Mil] = Support.Strong,
            [InputInstruments.Personality] = Support.Strong,
            [InputInstruments.V360] = Support.Divergent,
        }),
        CareerFitAbsolute: 68.2,
        CriticalGaps: [new CriticalGap(3, 1, 3)],
        AuditInputs: new AuditInputs(
            PcaRoutes: [new RouteScore("DIRECTOR", 71.5, new Dictionary<string, double> { ["D"] = 89 })],
            Mil: new MilResult(63, Gate.Satisfied,
                new Dictionary<string, MilComponent> { ["DC"] = new(72, "EXCEEDS", "CRITICAL", 0.4) },
                new Dictionary<string, double> { ["DC"] = 8.4 },
                "EXCEEDS"),
            Personality: new PersonalityResult(66, "ENTJ",
                [new RouteScore("ENTJ", 66, new Dictionary<string, double> { ["E"] = 60 })]),
            V360: new CareerFit360Result(0, new Dictionary<string, V360VariableEvidence>(), null, null)))
    {
        RankPosition = rank,
        CareerFitRelative = rank == 1 ? 100 : 0,
    };

    private sealed class Harness
    {
        public FakeSubscriptionGuard Subscription { get; init; } = new(allow: true);

        public FakeUserAccessGuard Access { get; init; } = new(allow: true);

        public FakeRunReader Reader { get; } = new() { Run = SampleRun() };

        public FakeEvaluator Evaluator { get; } = new() { Run = SampleRun() };

        public WebApplicationFactory<Program> Factory() => new CareerFitApiFactory(this);
    }

    private sealed class CareerFitApiFactory(Harness harness) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISubscriptionGuard>();
                services.AddSingleton<ISubscriptionGuard>(harness.Subscription);
                services.RemoveAll<IUserAccessGuard>();
                services.AddSingleton<IUserAccessGuard>(harness.Access);
                services.RemoveAll<ICareerFitRunReader>();
                services.AddSingleton<ICareerFitRunReader>(harness.Reader);
                services.RemoveAll<ICareerFitEvaluator>();
                services.AddSingleton<ICareerFitEvaluator>(harness.Evaluator);
            });
        }
    }

    private sealed class FakeSubscriptionGuard : ISubscriptionGuard
    {
        private readonly GuardDecision _decision;

        public FakeSubscriptionGuard(bool allow)
            : this(allow ? GuardDecision.Allow() : GuardDecision.Deny(403, "SUBSCRIPTION_REQUIRED", "denied")) { }

        public FakeSubscriptionGuard(GuardDecision decision) => _decision = decision;

        public int CallCount { get; private set; }

        public Task<GuardDecision> RequireSubscriptionAsync(RequestContext context, CancellationToken cancellationToken = default)
        {
            CallCount++;
            return Task.FromResult(_decision);
        }
    }

    private sealed class FakeUserAccessGuard(bool allow) : IUserAccessGuard
    {
        public int CallCount { get; private set; }

        public string? LastTargetUserId { get; private set; }

        public Task<bool> CanAccessUserAsync(RequestContext caller, string targetUserId, CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastTargetUserId = targetUserId;
            return Task.FromResult(allow);
        }
    }

    private sealed class FakeRunReader : ICareerFitRunReader
    {
        public int CallCount { get; private set; }

        public CareerFitRun? Run { get; set; }

        public IReadOnlyList<CareerFitRunSummary> Summaries { get; set; } = [];

        public Task<CareerFitRun?> ReadNewestForUserAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
        {
            CallCount++;
            return Task.FromResult(Run);
        }

        public Task<CareerFitRun?> ReadAsync(RequestContext context, Guid runId, CancellationToken cancellationToken = default)
        {
            CallCount++;
            return Task.FromResult(Run);
        }

        public Task<IReadOnlyList<CareerFitRunSummary>> ListForUserAsync(
            RequestContext context, string userId, int limit, CancellationToken cancellationToken = default)
        {
            CallCount++;
            return Task.FromResult(Summaries);
        }
    }

    private sealed class FakeEvaluator : ICareerFitEvaluator
    {
        public int CallCount { get; private set; }

        public string? LastUserId { get; private set; }

        public CareerFitRun? Run { get; set; }

        public CareerFitInputException? Throw { get; set; }

        public Task<CareerFitRun> EvaluateAsync(
            RequestContext context, string userId, DiscGraphChoice? graphOverride = null, CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastUserId = userId;
            return Throw is not null ? Task.FromException<CareerFitRun>(Throw) : Task.FromResult(Run!);
        }
    }
}
