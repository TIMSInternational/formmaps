using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.SchoolAdmin;

/// <summary>
/// Guard chain + HTTP mapping for the school-admin read endpoints (reader + scope resolver faked; their DB
/// behavior is proven by SchoolAdminReaderTests). Pins: anon -> 401; missing school:manage -> 403; no school
/// -> 400 "No school"; the response-wrapping asymmetry (config double-wrap vs status single-wrap vs results
/// nested data.data); and the pca-status 404 "Student not found".
/// </summary>
public class SchoolAdminEndpointsTests
{
    private const string Caller = "admin-1";
    private const string School = "school-1";

    [Theory]
    [InlineData("/api/v1/school-admin/evaluations/overview")]
    [InlineData("/api/v1/school-admin/results")]
    [InlineData("/api/v1/school-admin/assessments/config")]
    [InlineData("/api/v1/school-admin/assessments/status")]
    [InlineData("/api/v1/school-admin/assessments/schedule")]
    [InlineData("/api/v1/school-admin/results/student-x/pca-status")]
    [InlineData("/api/v1/school-admin/results/export")]
    [InlineData("/api/v1/school-admin/results/student-x")]
    [InlineData("/api/v1/school-admin/assessments/pipeline")]
    public async Task Anonymous_is_401(string path)
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Missing_school_manage_permission_is_403()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/school-admin/assessments/status", permission: FormMapsPermissions.ProfileRead);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        await AssertMessage(response, "Insufficient permissions");
    }

    [Fact]
    public async Task No_school_is_400()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/school-admin/assessments/status");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "No school");
    }

    [Fact]
    public async Task Overview_returns_200_list_shape()
    {
        var reader = new FakeReader { Overview = [new EvaluationOverviewRow("s-a", 2, 1, true)] };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/school-admin/evaluations/overview");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(School, reader.OverviewSchool); // scope threaded through
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var first = doc.RootElement.GetProperty("data")[0];
        Assert.Equal("s-a", first.GetProperty("studentId").GetString());
        Assert.True(first.GetProperty("selfCompleted").GetBoolean());
    }

    [Fact]
    public async Task Results_wraps_nested_data_with_pagination()
    {
        var reader = new FakeReader
        {
            Results = new ResultsListResult(
                [new ResultRow("u-1", "Alice", "a@e.st", 12, 3, 85.5, "completed")], 1, 1, 20, 1),
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/school-admin/results");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(1, data.GetProperty("total").GetInt32());
        Assert.Equal(1, data.GetProperty("totalPages").GetInt32());
        var row = data.GetProperty("data")[0]; // nested data.data
        Assert.Equal("Alice", row.GetProperty("name").GetString());
        Assert.Equal(85.5, row.GetProperty("averageScore").GetDouble()); // Float -> JSON number
        Assert.Equal("completed", row.GetProperty("pcaStatus").GetString());
    }

    [Fact]
    public async Task Results_parses_page_limit_grade_query()
    {
        var reader = new FakeReader { Results = new ResultsListResult([], 0, 2, 5, 0) };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/school-admin/results?page=2&limit=5&search=al&gradeLevel=11");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(2, reader.ResultsQuery!.Page);
        Assert.Equal(5, reader.ResultsQuery.Limit);
        Assert.Equal(5, reader.ResultsQuery.Skip); // (2-1)*5
        Assert.Equal("al", reader.ResultsQuery.Search);
        Assert.Equal(11, reader.ResultsQuery.GradeLevel);
    }

    [Fact]
    public async Task PcaStatus_null_is_404_student_not_found()
    {
        var reader = new FakeReader { PcaStatus = null };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/school-admin/results/student-x/pca-status");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Student not found");
    }

    [Fact]
    public async Task PcaStatus_returns_completed_flag()
    {
        var reader = new FakeReader { PcaStatus = new PcaStatusResult(true) };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/school-admin/results/student-x/pca-status");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("data").GetProperty("completed").GetBoolean());
    }

    [Fact]
    public async Task PcaStatus_bounds_the_path_param_to_100_chars()
    {
        var longId = new string('a', 150);
        var reader = new FakeReader { PcaStatus = null };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/school-admin/results/{longId}/pca-status");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(100, reader.PcaStudentId!.Length);
    }

    [Fact]
    public async Task Config_is_double_wrapped()
    {
        var aiWeights = JsonDocument.Parse("""{"academic":0.4,"social":0.3,"career":0.3}""").RootElement.Clone();
        var reader = new FakeReader
        {
            Config = new AssessmentConfig("2026-03-01", "2026-06-30", "once_per_semester", true, 7, aiWeights),
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/school-admin/assessments/config");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var inner = doc.RootElement.GetProperty("data").GetProperty("data"); // DOUBLE-wrap
        Assert.Equal("once_per_semester", inner.GetProperty("retakePolicy").GetString());
        Assert.True(inner.GetProperty("allowSelfSchedule").GetBoolean());
        Assert.Equal(0.4, inner.GetProperty("aiWeights").GetProperty("academic").GetDouble());
    }

    [Fact]
    public async Task Status_is_single_wrapped()
    {
        var reader = new FakeReader { Status = new AssessmentStatus(10, 7, 0, 3, 30.0) };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/school-admin/assessments/status");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(10, data.GetProperty("totalStudents").GetInt32()); // SINGLE-wrap (not data.data)
        Assert.Equal(0, data.GetProperty("inProgress").GetInt32());
        Assert.False(data.TryGetProperty("data", out _)); // no nested data
    }

    [Fact]
    public async Task Schedule_returns_list()
    {
        var reader = new FakeReader
        {
            Schedules = [new AssessmentScheduleRow(
                "sch-1", School, 11, "PCA", "2026-03-01T08:00:00.000Z", "2026-06-30T17:00:00.000Z",
                true, null, "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z")],
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/school-admin/assessments/schedule");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var row = doc.RootElement.GetProperty("data")[0];
        Assert.Equal("sch-1", row.GetProperty("id").GetString());
        Assert.Equal("2026-03-01T08:00:00.000Z", row.GetProperty("startDate").GetString());
    }

    // ---- helpers ----

    private static async Task AssertMessage(HttpResponseMessage response, string expected)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(expected, doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task StudentReport_returns_200_shape_with_generatedAt_and_nested_sections()
    {
        var report = new StudentReport(
            Version: "1",
            GeneratedAt: "2026-07-20T12:34:56.789Z",
            Student: new StudentReportStudent("stu-1", "Ana", "ana@x.test", 11),
            Completion: new StudentReportCompletion(true, true, false, false),
            Pca: new StudentReportPca(true, 2, "2026-07-01T00:00:00.000Z"),
            Mil: new StudentReportMil(1, 85.3, [new StudentReportMilSession(
                "sess-1", "PR", "Completed", true, 85.3, "2026-07-01T00:00:00.000Z", null)]),
            Evaluation360: new StudentReportEvaluation360(3, 1,
                [new StudentReportEvalGroup("g1", "self", "Ana", true, "2026-07-01T00:00:00.000Z")]));
        using var factory = new Factory(new FakeReader { Report = report }, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/school-admin/results/student-1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("1", data.GetProperty("version").GetString());
        Assert.Equal("2026-07-20T12:34:56.789Z", data.GetProperty("generatedAt").GetString());
        Assert.Equal("stu-1", data.GetProperty("student").GetProperty("id").GetString());
        Assert.False(data.GetProperty("completion").GetProperty("eval360").GetBoolean());
        Assert.Equal(2, data.GetProperty("pca").GetProperty("evaluationCount").GetInt32());
        Assert.Equal(85.3, data.GetProperty("mil").GetProperty("averageScore").GetDouble(), 3);
        Assert.Equal(1, data.GetProperty("mil").GetProperty("sessions").GetArrayLength());
        Assert.Equal(JsonValueKind.Null, data.GetProperty("mil").GetProperty("sessions")[0].GetProperty("endTime").ValueKind);
        Assert.Equal("self", data.GetProperty("evaluation360").GetProperty("groups")[0].GetProperty("groupType").GetString());
    }

    [Fact]
    public async Task StudentReport_null_is_404_student_not_found()
    {
        using var factory = new Factory(new FakeReader { Report = null }, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/school-admin/results/missing");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Student not found");
    }

    [Fact]
    public async Task StudentReport_passes_the_full_studentId_no_truncation()
    {
        var reader = new FakeReader { Report = null };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();
        var longId = new string('a', 130);

        await Send(client, $"/api/v1/school-admin/results/{longId}");

        // Report route is NOT length-bounded (unlike pca-status): the full value reaches the parameterized query.
        Assert.Equal(longId, reader.ReportStudentId);
    }

    [Fact]
    public async Task Export_returns_text_csv_with_attachment_disposition()
    {
        const string csv = "Name,Email,Grade Level,PCA Status,MIL Average Score,Completed Exams\n\"Ana\",\"ana@x.test\",11,completed,85.3,1";
        using var factory = new Factory(new FakeReader { ExportCsv = csv }, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/school-admin/results/export");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/csv", response.Content.Headers.ContentType!.ToString());
        Assert.Equal("attachment; filename=results-export.csv", response.Content.Headers.ContentDisposition!.ToString());
        Assert.Equal(csv, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Export_anonymous_is_401_json_not_csv()
    {
        using var factory = new Factory(new FakeReader { ExportCsv = "x" }, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/v1/school-admin/results/export");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.NotEqual("text/csv", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Pipeline_returns_200_with_ordered_pca_keys_and_passes_filters()
    {
        var row = new PipelineRow(
            "stu-1", "Ana", "ana@x.test", 11,
            new Dictionary<string, string>
            {
                ["PatternRecognition"] = "done",
                ["VerbalReasoning"] = "in_progress",
                ["WorkingMemory"] = "not_started",
                ["NumericVelocity"] = "not_started",
                ["VisualRotation"] = "not_started"
            },
            "not_started", "in_progress", new PipelineEvalDetail(2, 1));
        var reader = new FakeReader { Pipeline = [row] };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/school-admin/assessments/pipeline?grade=11&status=incomplete");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(11, reader.PipelineGrade);
        Assert.Equal("incomplete", reader.PipelineStatus);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var pca = doc.RootElement.GetProperty("data")[0].GetProperty("pca");
        // key order must be the EXAM_TYPES order
        var keys = pca.EnumerateObject().Select(p => p.Name).ToArray();
        Assert.Equal(
            new[] { "PatternRecognition", "VerbalReasoning", "WorkingMemory", "NumericVelocity", "VisualRotation" }, keys);
        Assert.Equal("done", pca.GetProperty("PatternRecognition").GetString());
        Assert.Equal(1, doc.RootElement.GetProperty("data")[0].GetProperty("eval360Detail").GetProperty("completed").GetInt32());
    }

    [Fact]
    public async Task Pipeline_absent_grade_and_status_pass_null_and_empty()
    {
        var reader = new FakeReader();
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        await Send(client, "/api/v1/school-admin/assessments/pipeline");

        Assert.Null(reader.PipelineGrade);
        Assert.Equal(string.Empty, reader.PipelineStatus);
    }

    private static Task<HttpResponseMessage> Send(HttpClient client, string path, string permission = FormMapsPermissions.SchoolManage)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, Caller);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.SchoolAdmin);
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
                services.RemoveAll<ISchoolAdminReader>();
                services.AddSingleton<ISchoolAdminReader>(reader);
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

    private sealed class FakeReader : ISchoolAdminReader
    {
        public IReadOnlyList<EvaluationOverviewRow> Overview { get; init; } = [];

        public ResultsListResult Results { get; init; } = new([], 0, 1, 20, 0);

        public PcaStatusResult? PcaStatus { get; init; }

        public AssessmentConfig Config { get; init; } =
            new("2026-03-01", "2026-06-30", "once_per_semester", true, 7,
                JsonDocument.Parse("""{"academic":0.4,"social":0.3,"career":0.3}""").RootElement.Clone());

        public AssessmentStatus Status { get; init; } = new(0, 0, 0, 0, 0);

        public IReadOnlyList<AssessmentScheduleRow> Schedules { get; init; } = [];

        public string? OverviewSchool { get; private set; }

        public ResultsListQuery? ResultsQuery { get; private set; }

        public string? PcaStudentId { get; private set; }

        public StudentReport? Report { get; init; }

        public string ExportCsv { get; init; } = string.Empty;

        public IReadOnlyList<PipelineRow> Pipeline { get; init; } = [];

        public string? ReportStudentId { get; private set; }

        public int? PipelineGrade { get; private set; }

        public string? PipelineStatus { get; private set; }

        public Task<StudentReport?> GetStudentReportAsync(
            RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default)
        {
            ReportStudentId = studentId;
            return Task.FromResult(Report);
        }

        public Task<string> ExportResultsCsvAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(ExportCsv);

        public Task<IReadOnlyList<PipelineRow>> GetAssessmentPipelineAsync(
            RequestContext context, string schoolId, int? grade, string statusFilter, CancellationToken cancellationToken = default)
        {
            PipelineGrade = grade;
            PipelineStatus = statusFilter;
            return Task.FromResult(Pipeline);
        }

        public Task<IReadOnlyList<EvaluationOverviewRow>> GetEvaluationsOverviewAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default)
        {
            OverviewSchool = schoolId;
            return Task.FromResult(Overview);
        }

        public Task<ResultsListResult> GetResultsListAsync(
            RequestContext context, string schoolId, ResultsListQuery query, CancellationToken cancellationToken = default)
        {
            ResultsQuery = query;
            return Task.FromResult(Results);
        }

        public Task<PcaStatusResult?> GetStudentPcaCompletionAsync(
            RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default)
        {
            PcaStudentId = studentId;
            return Task.FromResult(PcaStatus);
        }

        public Task<AssessmentConfig> GetAssessmentConfigAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Config);

        public Task<AssessmentStatus> GetAssessmentStatusAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Status);

        public Task<IReadOnlyList<AssessmentScheduleRow>> GetSchedulesAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Schedules);
    }
}
