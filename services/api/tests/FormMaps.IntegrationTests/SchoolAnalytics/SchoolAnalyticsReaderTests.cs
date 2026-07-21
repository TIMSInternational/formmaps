using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolAnalytics;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolAnalytics;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC container tz) tests for <see cref="SchoolAnalyticsReader"/>. Pins the
/// overview aggregation (inactive students still counted, distinct-PCA de-dup, GPA/at-risk, counselor coverage),
/// the trends per-metric event sourcing (completion_rate merges PCA+eval; grades scoped by schoolId ONLY not
/// studentId; enrollments; unknown→zeros) with UTC-safe range filtering under a non-UTC server tz, and
/// top-performers (gradeLevel filter, gpa-DESC stable ties, limit, gpa dropped, empty→[]).
/// </summary>
public sealed class SchoolAnalyticsReaderTests : IClassFixture<SchoolAnalyticsDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";

    private readonly SchoolAnalyticsDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public SchoolAnalyticsReaderTests(SchoolAnalyticsDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "users","student_grades","pca_evaluations","pca_exam_sessions","evaluation_groups","counselor_student_assignments" """,
            conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- overview ----

    [Fact]
    public async Task Overview_computes_all_fields()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        // 3 students (2 active, 1 inactive) + one other-school student (excluded from every metric).
        await SeedUser(conn, "s1", School, isActive: true);
        await SeedUser(conn, "s2", School, isActive: true);
        await SeedUser(conn, "s3", School, isActive: false);
        await SeedUser(conn, "other", OtherSchool, isActive: true);

        // grades: s1 -> A (4.0), s2 -> D (1.0, at risk), s3 -> none. mean-of-means (4+1)/2 = 2.5 -> 62.5.
        await SeedGrade(conn, "g1", School, "s1", "A");
        await SeedGrade(conn, "g2", School, "s2", "D");

        // PCA: s1 has TWO evaluations (must de-dup to 1 distinct user), s2 has one, s3 none -> distinct = 2.
        await SeedPca(conn, "p1", "s1");
        await SeedPca(conn, "p2", "s1");
        await SeedPca(conn, "p3", "s2");

        // counselor assignments: s1 assigned twice (active, de-dup) + s2 -> 2 distinct assigned of 3 total.
        await SeedAssignment(conn, "a1", "s1");
        await SeedAssignment(conn, "a2", "s1");
        await SeedAssignment(conn, "a3", "s2");

        var overview = await Reader().GetOverviewAsync(Ctx(), School);

        Assert.Equal(3, overview.TotalStudents);          // inactive s3 still counted
        Assert.Equal(2, overview.ActiveStudents);
        Assert.Equal(67, overview.AssessmentCompletionRate); // round(2*100/3) = 67
        Assert.Equal(62.5, overview.AverageProgressScore);
        Assert.Equal(1, overview.StudentsAtRisk);          // only s2 (mean 1.0 < 2.0)
        Assert.Equal(67, overview.CounselorCoverage);      // round(2*100/3) = 67
    }

    [Fact]
    public async Task Overview_valid_school_with_no_students_is_all_zero_full_object()
    {
        // getAnalyticsOverview (NOT the endpoint no-school branch) returns the full 6-field object, all zero.
        var overview = await Reader().GetOverviewAsync(Ctx(), School);

        Assert.Equal(0, overview.TotalStudents);
        Assert.Equal(0, overview.ActiveStudents);
        Assert.Equal(0, overview.AssessmentCompletionRate);
        Assert.Equal(0.0, overview.AverageProgressScore);
        Assert.Equal(0, overview.StudentsAtRisk);
        Assert.Equal(0, overview.CounselorCoverage);
    }

    [Fact]
    public async Task Overview_counselor_coverage_reaches_100_when_all_assigned()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School);
        await SeedUser(conn, "s2", School);
        await SeedAssignment(conn, "a1", "s1");
        await SeedAssignment(conn, "a2", "s2");

        var overview = await Reader().GetOverviewAsync(Ctx(), School);

        Assert.Equal(100, overview.CounselorCoverage);
    }

    // ---- trends ----

    [Fact]
    public async Task Trends_completion_rate_merges_pca_sessions_and_eval_groups()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School);
        await SeedUser(conn, "s2", School);
        var now = DateTime.UtcNow;

        await SeedSession(conn, "ses1", "s1", isCompleted: true, startTime: now.AddDays(-3));   // ✓
        await SeedSession(conn, "ses2", "s2", isCompleted: true, startTime: now.AddDays(-1));   // ✓
        await SeedSession(conn, "ses3", "s1", isCompleted: false, startTime: now.AddDays(-2));  // ✗ not completed
        await SeedSession(conn, "ses4", "s1", isCompleted: true, startTime: now.AddDays(-40));  // ✗ out of range
        await SeedEvalGroup(conn, "eg1", "s1", isCompleted: true, completedDate: now.AddDays(-5)); // ✓
        await SeedEvalGroup(conn, "eg2", "s2", isCompleted: true, completedDate: null);          // ✗ null date
        await SeedEvalGroup(conn, "eg3", "s2", isCompleted: true, completedDate: now.AddDays(-40)); // ✗ out of range

        var trends = await Reader().GetTrendsAsync(Ctx(), School, "completion_rate", "30d");

        Assert.Equal("completion_rate", trends.Metric);
        Assert.Equal("30d", trends.Range);
        Assert.Equal(15, trends.Labels.Count); // step=2 over 30d
        Assert.Equal(15, trends.Values.Count);
        Assert.Equal(3, trends.Values.Sum());  // 2 sessions + 1 eval, in range, under a NON-UTC container tz
    }

    [Fact]
    public async Task Trends_assessments_metric_is_identical_to_completion_rate_source()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School);
        await SeedSession(conn, "ses1", "s1", isCompleted: true, startTime: DateTime.UtcNow.AddDays(-2));

        var trends = await Reader().GetTrendsAsync(Ctx(), School, "assessments", "30d");

        Assert.Equal(1, trends.Values.Sum());
    }

    [Fact]
    public async Task Trends_grades_metric_is_scoped_by_schoolId_only_not_studentId()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School);
        var now = DateTime.UtcNow;

        await SeedGrade(conn, "g1", School, "s1", "A", createdDate: now.AddDays(-2));               // ✓
        // studentId that is NOT a student-role user — still counted, proving schoolId-ONLY scoping.
        await SeedGrade(conn, "g2", School, "ghost-not-a-user", "B", createdDate: now.AddDays(-2)); // ✓
        await SeedGrade(conn, "g3", OtherSchool, "s1", "A", createdDate: now.AddDays(-2));          // ✗ other school
        await SeedGrade(conn, "g4", School, "s1", "A", status: "in_progress", createdDate: now.AddDays(-2)); // ✗ not completed
        await SeedGrade(conn, "g5", School, "s1", "A", isActive: false, createdDate: now.AddDays(-2)); // ✗ inactive
        await SeedGrade(conn, "g6", School, "s1", "A", createdDate: now.AddDays(-40));              // ✗ out of range

        var trends = await Reader().GetTrendsAsync(Ctx(), School, "grades", "30d");

        Assert.Equal(2, trends.Values.Sum()); // g1 + g2 (ghost included -> not studentId-scoped)
    }

    [Fact]
    public async Task Trends_enrollments_counts_students_created_in_range()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        var now = DateTime.UtcNow;
        await SeedUser(conn, "s-in", School, createdDate: now.AddDays(-2));                 // ✓
        await SeedUser(conn, "s-old", School, createdDate: now.AddDays(-40));               // ✗ out of range
        await SeedUser(conn, "c-in", School, role: "Counselor", createdDate: now.AddDays(-2)); // ✗ not a student
        await SeedUser(conn, "s-other", OtherSchool, createdDate: now.AddDays(-2));         // ✗ other school

        var trends = await Reader().GetTrendsAsync(Ctx(), School, "enrollments", "30d");

        Assert.Equal(1, trends.Values.Sum());
    }

    [Fact]
    public async Task Trends_unknown_metric_is_all_zeros()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School);
        await SeedSession(conn, "ses1", "s1", isCompleted: true, startTime: DateTime.UtcNow.AddDays(-1));

        var trends = await Reader().GetTrendsAsync(Ctx(), School, "bogus", "30d");

        Assert.Equal(15, trends.Values.Count);
        Assert.Equal(0, trends.Values.Sum());
    }

    [Fact]
    public async Task Trends_range_90d_and_1y_change_step_and_bucket_count()
    {
        var ninety = await Reader().GetTrendsAsync(Ctx(), School, "completion_rate", "90d");
        Assert.Equal("90d", ninety.Range);
        Assert.Equal(13, ninety.Labels.Count); // step=7 over 90d: i=89,82,...,1 -> 13 buckets

        var year = await Reader().GetTrendsAsync(Ctx(), School, "completion_rate", "1y");
        Assert.Equal("1y", year.Range);
        Assert.Equal(13, year.Labels.Count); // step=30 over 365d: i=364,334,...,4 -> 13 buckets
    }

    // ---- top-performers ----

    [Fact]
    public async Task TopPerformers_orders_by_gpa_desc_drops_gpa_and_flags_pca()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, gradeLevel: 10);
        await SeedUser(conn, "s2", School, gradeLevel: 10);
        await SeedUser(conn, "s3", School, gradeLevel: 10);
        await SeedGrade(conn, "g1", School, "s1", "A"); // 4.0
        await SeedGrade(conn, "g2", School, "s2", "C"); // 2.0
        // s3: no grades -> gpa 0
        await SeedPca(conn, "p1", "s1"); // s1 completed; s2/s3 not_started

        var rows = await Reader().GetTopPerformersAsync(Ctx(), School, limit: 10, gradeLevel: null);

        Assert.Equal(new[] { "s1", "s2", "s3" }, rows.Select(r => r.StudentId).ToArray());
        Assert.Equal(new[] { 100.0, 50.0, 0.0 }, rows.Select(r => r.ProgressScore).ToArray());
        Assert.Equal("completed", rows[0].AssessmentStatus);
        Assert.Equal("not_started", rows[1].AssessmentStatus);
        Assert.Equal("not_started", rows[2].AssessmentStatus);
        // gpa is dropped from the payload (TopPerformer has no Gpa member) — compile-time guarantee.
    }

    [Fact]
    public async Task TopPerformers_stable_ties_keep_query_order()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School);
        await SeedUser(conn, "s2", School);
        await SeedUser(conn, "s3", School);
        await SeedGrade(conn, "g1", School, "s1", "A"); // 4.0
        await SeedGrade(conn, "g2", School, "s2", "A"); // 4.0 (ties with s1)
        await SeedGrade(conn, "g3", School, "s3", "C"); // 2.0

        var rows = await Reader().GetTopPerformersAsync(Ctx(), School, limit: 10, gradeLevel: null);

        // s1 & s2 tie at 4.0 -> stable order keeps query order (id ASC: s1 before s2), then s3.
        Assert.Equal(new[] { "s1", "s2", "s3" }, rows.Select(r => r.StudentId).ToArray());
    }

    [Fact]
    public async Task TopPerformers_gradeLevel_filter_applies_when_truthy()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, gradeLevel: 10);
        await SeedUser(conn, "s2", School, gradeLevel: 11);
        await SeedUser(conn, "s3", School, gradeLevel: 10);

        var rows = await Reader().GetTopPerformersAsync(Ctx(), School, limit: 10, gradeLevel: 10);

        Assert.Equal(new[] { "s1", "s3" }, rows.Select(r => r.StudentId).OrderBy(x => x).ToArray());
    }

    [Fact]
    public async Task TopPerformers_respects_limit()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School);
        await SeedUser(conn, "s2", School);
        await SeedUser(conn, "s3", School);
        await SeedGrade(conn, "g1", School, "s1", "A");
        await SeedGrade(conn, "g2", School, "s2", "B");
        await SeedGrade(conn, "g3", School, "s3", "C");

        var rows = await Reader().GetTopPerformersAsync(Ctx(), School, limit: 2, gradeLevel: null);

        Assert.Equal(new[] { "s1", "s2" }, rows.Select(r => r.StudentId).ToArray());
    }

    [Fact]
    public async Task TopPerformers_empty_when_no_students()
    {
        Assert.Empty(await Reader().GetTopPerformersAsync(Ctx(), School, limit: 10, gradeLevel: null));
    }

    // ---- helpers ----

    private SchoolAnalyticsReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school-admin", "admin@e.st", "Admin"),
            schoolId: School, permissions: new[] { "analytics:school" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static DateTime Unspec(DateTime utc) => DateTime.SpecifyKind(utc, DateTimeKind.Unspecified);

    private static async Task SeedUser(
        NpgsqlConnection conn, string id, string schoolId, string role = "Student",
        bool isActive = true, int? gradeLevel = null, DateTime? createdDate = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "users" ("id","name","email","roleName","schoolId","gradeLevel","isActive","createdDate")
            VALUES (@id,@n,@e,@r,@s,@g,@a,@c)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("n", $"Name {id}");
        cmd.Parameters.AddWithValue("e", $"{id}@e.st");
        cmd.Parameters.AddWithValue("r", role);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("g", (object?)gradeLevel ?? DBNull.Value);
        cmd.Parameters.AddWithValue("a", isActive);
        cmd.Parameters.AddWithValue("c", Unspec(createdDate ?? DateTime.UtcNow));
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedGrade(
        NpgsqlConnection conn, string id, string schoolId, string studentId, string? grade,
        string status = "completed", bool isActive = true, DateTime? createdDate = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_grades" ("id","schoolId","studentId","grade","status","isActive","createdDate")
            VALUES (@id,@s,@st,@g,@status,@a,@c)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("st", studentId);
        cmd.Parameters.AddWithValue("g", (object?)grade ?? DBNull.Value);
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("a", isActive);
        cmd.Parameters.AddWithValue("c", Unspec(createdDate ?? DateTime.UtcNow));
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedPca(NpgsqlConnection conn, string id, string userId)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "pca_evaluations" ("id","userId") VALUES (@id,@u)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("u", userId);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedSession(
        NpgsqlConnection conn, string id, string userId, bool isCompleted, DateTime startTime)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "pca_exam_sessions" ("id","userId","isCompleted","startTime")
            VALUES (@id,@u,@c,@t)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("u", userId);
        cmd.Parameters.AddWithValue("c", isCompleted);
        cmd.Parameters.AddWithValue("t", Unspec(startTime));
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedEvalGroup(
        NpgsqlConnection conn, string id, string evaluatedUserId, bool isCompleted, DateTime? completedDate)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "evaluation_groups" ("id","evaluatedUserId","isEvaluationCompleted","evaluationCompletedDate")
            VALUES (@id,@u,@c,@d)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("u", evaluatedUserId);
        cmd.Parameters.AddWithValue("c", isCompleted);
        cmd.Parameters.AddWithValue("d", (object?)(completedDate is null ? null : Unspec(completedDate.Value)) ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedAssignment(
        NpgsqlConnection conn, string id, string studentId, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "counselor_student_assignments" ("id","studentId","counselorId","isActive")
            VALUES (@id,@s,@c,@a)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("c", "counselor-1");
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }
}
