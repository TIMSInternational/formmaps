using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.StudentCoursePlan;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.StudentCoursePlan;

/// <summary>
/// Guard + result mapping for the course-plan compute reads (FM-DOTNET-086; reader faked). Pins: anonymous → 401;
/// recommendations locked payload { data:[], locked:true, completion:{7 fields incl readyForInsights} } vs the scored
/// list (full course row + matchScore); eligibility { data:[] } on no-school vs the reduced entries.
/// </summary>
public class CoursePlanComputeEndpointsTests
{
    private const string RecsPath = "/api/v1/student/course-plan/recommendations";
    private const string EligPath = "/api/v1/student/course-plan/eligibility";

    private static readonly JsonElement EmptyArray = JsonDocument.Parse("[]").RootElement.Clone();

    [Theory]
    [InlineData(RecsPath)]
    [InlineData(EligPath)]
    public async Task Anonymous_is_401(string path)
    {
        using var factory = new Factory(new FakeReader());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.SendAsync(new HttpRequestMessage(HttpMethod.Get, path))).StatusCode);
    }

    [Fact]
    public async Task Recommendations_locked_payload()
    {
        var reader = new FakeReader
        {
            Recommendations = new RecommendationsData(
                new StudentCompletionVerdict(2, 5, 1, 3, false, false), Done: false, [], new HashSet<string>(), [], [])
        };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();
        var response = await Send(client, RecsPath);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        Assert.Equal(0, root.GetProperty("data").GetArrayLength());
        Assert.True(root.GetProperty("locked").GetBoolean());
        var completion = root.GetProperty("completion");
        Assert.Equal(2, completion.GetProperty("liaCompleted").GetInt32());
        Assert.Equal(5, completion.GetProperty("liaTotal").GetInt32());
        Assert.Equal(1, completion.GetProperty("evalCompleted").GetInt32());
        Assert.Equal(3, completion.GetProperty("evalTotal").GetInt32());
        Assert.False(completion.GetProperty("pcaCompleted").GetBoolean());
        Assert.False(completion.GetProperty("allDone").GetBoolean());
        Assert.False(completion.GetProperty("readyForInsights").GetBoolean());
    }

    [Fact]
    public async Task Recommendations_scored_list_carries_full_row_and_matchScore()
    {
        var reader = new FakeReader
        {
            Recommendations = new RecommendationsData(
                new StudentCompletionVerdict(5, 5, 3, 3, true, true), Done: true,
                [Course("c1", rating: 5)], new HashSet<string>(), [], [])
        };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();
        var response = await Send(client, RecsPath);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var item = doc.RootElement.GetProperty("data")[0];
        Assert.Equal("c1", item.GetProperty("id").GetString());
        Assert.Equal("5", item.GetProperty("rating").GetString());      // Decimal → string passthrough
        Assert.Equal(60, item.GetProperty("matchScore").GetInt32());    // 50 + 10 (rating > 4)
        Assert.Equal(JsonValueKind.Array, item.GetProperty("syllabus").ValueKind);
        Assert.False(item.TryGetProperty("ratingNumber", out _));        // internal-only, not emitted
        // Fuller passthrough parity: ISO-Z dates, null createdBy/updatedBy emitted (not omitted), array columns present.
        Assert.Equal("2026-01-01T00:00:00.000Z", item.GetProperty("createdDate").GetString());
        Assert.Equal(JsonValueKind.Null, item.GetProperty("createdBy").ValueKind);
        Assert.Equal(JsonValueKind.Null, item.GetProperty("updatedBy").ValueKind);
        Assert.Equal(JsonValueKind.Array, item.GetProperty("skills").ValueKind);
        Assert.Equal("0", item.GetProperty("recommendedScore").GetString()); // Decimal → string
    }

    [Fact]
    public async Task Eligibility_no_school_is_empty()
    {
        var reader = new FakeReader { Eligibility = null };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();
        var response = await Send(client, EligPath);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(0, doc.RootElement.GetProperty("data").GetArrayLength());
    }

    [Fact]
    public async Task Eligibility_entries_reduced_shape()
    {
        var reader = new FakeReader
        {
            Eligibility = [new EligibilityEntry("c1", "MATH1", false, ["ALG1"])]
        };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();
        var response = await Send(client, EligPath);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var item = doc.RootElement.GetProperty("data")[0];
        Assert.Equal("c1", item.GetProperty("courseId").GetString());
        Assert.Equal("MATH1", item.GetProperty("courseCode").GetString());
        Assert.False(item.GetProperty("eligible").GetBoolean());
        Assert.Equal("ALG1", item.GetProperty("missing")[0].GetString());
    }

    // ---- helpers ----

    private static CourseRow Course(string id, double rating) => new(
        Id: id, Title: "T", ShortDescription: "", FullDescription: "", Provider: "", Instructor: "", Category: "",
        Subcategory: "", Difficulty: "", Duration: 0, DurationUnit: "weeks", EstimatedHours: 0, ThumbnailUrl: "",
        VideoUrl: "", CourseraUrl: "", ExternalId: "", Rating: rating.ToString(System.Globalization.CultureInfo.InvariantCulture),
        RatingNumber: rating, ReviewCount: 0, EnrollmentCount: 0, Certificate: false, Language: "", Country: "", Region: "",
        Skills: [], MatchingCompetencies: [], CareerPaths: [], LearningObjectives: [], Prerequisites: [],
        Syllabus: EmptyArray, RecommendedScore: "0", SourceUrl: "", IsActive: true, CreatedBy: null,
        CreatedDate: "2026-01-01T00:00:00.000Z", UpdatedBy: null, UpdatedAt: "2026-01-01T00:00:00.000Z");

    private static Task<HttpResponseMessage> Send(HttpClient client, string path)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "user-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.Student);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "s@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Student");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, "");
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeReader reader) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ICoursePlanComputeReader>();
                services.AddSingleton<ICoursePlanComputeReader>(reader);
            });
        }
    }

    private sealed class FakeReader : ICoursePlanComputeReader
    {
        public RecommendationsData Recommendations { get; init; } =
            new(new StudentCompletionVerdict(0, 5, 0, 0, false, false), false, [], new HashSet<string>(), [], []);

        public IReadOnlyList<EligibilityEntry>? Eligibility { get; init; } = [];

        public Task<RecommendationsData> GetRecommendationsAsync(RequestContext context, string userId, CancellationToken ct = default) =>
            Task.FromResult(Recommendations);

        public Task<IReadOnlyList<EligibilityEntry>?> GetEligibilityAsync(RequestContext context, string userId, CancellationToken ct = default) =>
            Task.FromResult(Eligibility);
    }
}
