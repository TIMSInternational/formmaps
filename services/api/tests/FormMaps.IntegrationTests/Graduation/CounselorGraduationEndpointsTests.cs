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
/// Guard chain, gate ORDER and body parity for the two counselor graduation-plan endpoints (issue #55
/// remainder). The database behaviour — including the #122 gradeLevel carry-through — is proven by
/// <see cref="CounselorGraduationRepositoryTests"/>.
///
/// <para>The ordering test is the one that would be easy to lose in a refactor: the assignment gate runs BEFORE
/// the body is validated, so an unassigned student with a nonsense status gets 404 "Student not found", not
/// 400. Validating first would let a counselor distinguish "not my student" from "no such student" by the
/// status code — which is exactly the enumeration the 404 exists to prevent.</para>
/// </summary>
public class CounselorGraduationEndpointsTests
{
    private const string Counselor = "cou-1";
    private const string School = "school-1";
    private const string Student = "stu-1";
    private const string Base = "/api/v1/counselor/me/students/stu-1/graduation-plan";

    // ---------------------------------------------------------------- guard chain

    [Theory]
    [InlineData("GET", Base)]
    [InlineData("PUT", Base + "/review")]
    public async Task Both_routes_are_401_for_anonymous(string method, string path)
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("GET", Base)]
    [InlineData("PUT", Base + "/review")]
    public async Task Both_routes_are_403_without_counselor_dashboard(string method, string path)
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, new HttpMethod(method), path, permission: FormMapsPermissions.SchoolManage);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = await Json(response);
        Assert.Equal("missing_permission", doc.RootElement.GetProperty("code").GetString());
    }

    [Theory]
    [InlineData("GET", Base)]
    [InlineData("PUT", Base + "/review")]
    public async Task An_unassigned_student_is_404_student_not_found(string method, string path)
    {
        using var factory = new Factory();
        factory.Repository.Assigned = false;
        using var client = factory.CreateClient();

        var response = await Send(client, new HttpMethod(method), path, body: """{"status":"approved"}""");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Student not found");
    }

    /// <summary>
    /// Gate ORDER: assignment first, body second. A garbage status on an unassigned student is a 404, never a
    /// 400 — otherwise the status code itself leaks whether the student exists on the caseload.
    /// </summary>
    [Fact]
    public async Task The_assignment_gate_runs_before_body_validation()
    {
        using var factory = new Factory();
        factory.Repository.Assigned = false;
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, Base + "/review", body: """{"status":"maybe"}""");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Student not found");
        Assert.Null(factory.Repository.LastDecision); // reviewPlan never ran
    }

    /// <summary>DECISION D1: the counselor AI generator stays on Node. Seven segments, and not ours.</summary>
    [Fact]
    public async Task Counselor_generate_is_not_mapped_by_this_service()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, Base + "/generate");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---------------------------------------------------------------- GET

    /// <summary>
    /// The counselor's target projection is THREE keys and it is null unless the target is active. It is not
    /// the student's own nine-key targetDto, and an inactive target is null rather than an empty object.
    /// </summary>
    [Fact]
    public async Task Get_returns_a_three_key_target_projection()
    {
        using var factory = new Factory();
        factory.Repository.View = new CounselorPlanView(
            GraduationPlanEndpointsTests.SamplePlan(),
            new CounselorTargetProjection("MIT", "Computer Science", "computer-science:most-selective"));
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Base);

        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(2, data.EnumerateObject().Count()); // { plan, target }
        var target = data.GetProperty("target");
        Assert.Equal(3, target.EnumerateObject().Count());
        Assert.Equal("MIT", target.GetProperty("universityName").GetString());
        Assert.False(target.TryGetProperty("fieldKey", out _));
        Assert.Equal("plan-1", data.GetProperty("plan").GetProperty("id").GetString());
    }

    [Fact]
    public async Task Get_emits_nulls_for_both_halves_when_there_is_nothing()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Base);

        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(JsonValueKind.Null, data.GetProperty("plan").ValueKind);
        Assert.Equal(JsonValueKind.Null, data.GetProperty("target").ValueKind);
    }

    // ---------------------------------------------------------------- PUT /review

    [Theory]
    [InlineData("""{}""")]
    [InlineData("""{"status":"Approved"}""")] // case-SENSITIVE
    [InlineData("""{"status":"maybe"}""")]
    [InlineData("""{"status":null}""")]
    public async Task Review_requires_status_to_be_approved_or_rejected(string body)
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, Base + "/review", body: body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "status must be approved or rejected");
    }

    [Theory]
    [InlineData("""{"status":"rejected"}""")]
    [InlineData("""{"status":"rejected","note":""}""")]
    [InlineData("""{"status":"rejected","note":"   "}""")]
    [InlineData("""{"status":"rejected","note":5}""")]
    public async Task Rejecting_requires_a_non_blank_note(string body)
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, Base + "/review", body: body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "A note is required when rejecting a plan");
    }

    /// <summary>Approving does NOT require a note — the note gate is on the reject arm only.</summary>
    [Fact]
    public async Task Approving_without_a_note_is_accepted_and_the_note_is_null()
    {
        using var factory = new Factory();
        factory.Repository.Result = new ReviewPlanResult(
            ReviewPlanOutcome.Reviewed, GraduationPlanEndpointsTests.SamplePlan(), 3);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, Base + "/review", body: """{"status":"approved"}""");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("approved", factory.Repository.LastDecision);
        Assert.Null(factory.Repository.LastNote);
    }

    [Fact]
    public async Task The_note_is_trimmed_before_it_reaches_review()
    {
        using var factory = new Factory();
        factory.Repository.Result = new ReviewPlanResult(
            ReviewPlanOutcome.Reviewed, GraduationPlanEndpointsTests.SamplePlan(), 0);
        using var client = factory.CreateClient();

        await Send(client, HttpMethod.Put, Base + "/review",
            body: """{"status":"rejected","note":"  add more math  "}""");

        Assert.Equal("add more math", factory.Repository.LastNote);
    }

    [Fact]
    public async Task No_proposed_plan_is_404()
    {
        using var factory = new Factory();
        factory.Repository.Result = new ReviewPlanResult(ReviewPlanOutcome.NoProposedPlan, null, 0);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, Base + "/review", body: """{"status":"approved"}""");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "No proposed plan to review");
    }

    /// <summary>
    /// This route maps EVERY PlanError to 422 (counselor-graduation.ts:84-86), unlike the student router's
    /// per-code table where NO_CURRENT_YEAR would also be 422 but NO_DRAFT would be 400. Only NO_CURRENT_YEAR
    /// is reachable from reviewPlan.
    /// </summary>
    [Fact]
    public async Task No_current_academic_year_is_422_with_the_code()
    {
        using var factory = new Factory();
        factory.Repository.Result = new ReviewPlanResult(ReviewPlanOutcome.NoCurrentYear, null, 0);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, Base + "/review", body: """{"status":"approved"}""");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        using var doc = await Json(response);
        Assert.Equal("NO_CURRENT_YEAR", doc.RootElement.GetProperty("code").GetString());
        Assert.Equal("Plan request cannot be fulfilled", doc.RootElement.GetProperty("message").GetString());
    }

    // ---------------------------------------------------------------- harness

    private static Task<HttpResponseMessage> Send(
        HttpClient client, HttpMethod method, string path,
        string permission = FormMapsPermissions.CounselorDashboard, string? body = null)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, Counselor);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.Counselor);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "cou@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Counselor");
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
        public FakeRepository Repository { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ICounselorGraduationRepository>();
                services.AddSingleton<ICounselorGraduationRepository>(Repository);
            });
        }
    }

    private sealed class FakeRepository : ICounselorGraduationRepository
    {
        public bool Assigned { get; set; } = true;

        public CounselorPlanView View { get; set; } = new(null, null);

        public ReviewPlanResult Result { get; set; } = new(ReviewPlanOutcome.Reviewed, null, 0);

        public string? LastDecision { get; private set; }

        public string? LastNote { get; private set; }

        public Task<bool> IsAssignedAsync(
            RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default)
        {
            Assert.Equal(Counselor, counselorId);
            Assert.Equal(Student, studentId);
            return Task.FromResult(Assigned);
        }

        public Task<CounselorPlanView> GetPlanAsync(
            RequestContext context, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(View);

        public Task<ReviewPlanResult> ReviewPlanAsync(
            RequestContext context, string counselorId, string studentId, string decision, string? note,
            CancellationToken cancellationToken = default)
        {
            LastDecision = decision;
            LastNote = note;
            return Task.FromResult(Result);
        }
    }
}
