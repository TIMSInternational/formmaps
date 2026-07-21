using FormMaps.Application.Auth;
using FormMaps.Application.SchoolReads;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolReads;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolReads;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC container tz) tests for <see cref="SchoolReadsReader"/>. Pins the four
/// school:manage reads: dashboard KPIs (student both-case count, counselor EXACT-case count, distinct-PCA,
/// avg over status='Completed' with null→0, JsRound 1-dp completionRate incl. a .x5 half-up tie), counselor
/// assignments (counselor-school scoping + isActive + deterministic order), notes (type filter, ILIKE over
/// content AND student.name, pagination + createdDate-DESC, empty-students { …, page, limit } shape, scalar
/// passthrough + nested), and counselor-workload (per-counselor batched counts, studentCount-DESC STABLE over a
/// name-ASC fetch, assignedStudents shape).
/// </summary>
public sealed class SchoolReadsReaderTests : IClassFixture<SchoolReadsDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";

    private readonly SchoolReadsDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public SchoolReadsReaderTests(SchoolReadsDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            TRUNCATE "users","school_courses","course_change_requests","pca_evaluations","pca_exam_sessions",
                     "counselor_student_assignments","counselor_sessions","counselor_notes"
            """,
            conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- dashboard/stats ----

    [Fact]
    public async Task Dashboard_computes_all_kpis()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        // students: 2 active (both-case roleName), 1 inactive (still excluded from active count), 1 other-school.
        await SeedUser(conn, "s1", School, role: "Student");
        await SeedUser(conn, "s2", School, role: "student");
        await SeedUser(conn, "s3", School, role: "Student", isActive: false);
        await SeedUser(conn, "sx", OtherSchool, role: "Student");
        // counselors: EXACT 'counselor' counted; 'Counselor' (capital) and inactive NOT counted.
        await SeedUser(conn, "c1", School, role: "counselor");
        await SeedUser(conn, "c2", School, role: "Counselor");       // capital — excluded
        await SeedUser(conn, "c3", School, role: "counselor", isActive: false); // inactive — excluded
        // courses: 1 active in school, 1 inactive, 1 other-school.
        await SeedCourse(conn, "co1", School);
        await SeedCourse(conn, "co2", School, isActive: false);
        await SeedCourse(conn, "co3", OtherSchool);
        // change requests: 2 pending in school, 1 approved, 1 other-school pending.
        await SeedChangeRequest(conn, "cr1", School, "pending");
        await SeedChangeRequest(conn, "cr2", School, "pending");
        await SeedChangeRequest(conn, "cr3", School, "approved");
        await SeedChangeRequest(conn, "cr4", OtherSchool, "pending");
        // PCA: s1 has TWO evals (de-dup to 1 distinct), s2 one -> distinct = 2. Inactive s3 not among active ids.
        await SeedPca(conn, "p1", "s1");
        await SeedPca(conn, "p2", "s1");
        await SeedPca(conn, "p3", "s2");
        // exam sessions (avg over status='Completed' only): 80 + 81 + 83 (avg 81.333 -> 81.3); an InProgress 10
        // is excluded; an other-school 200 is excluded (not in active-student ids).
        await SeedSession(conn, "e1", "s1", 80.0, "Completed");
        await SeedSession(conn, "e2", "s1", 81.0, "Completed");
        await SeedSession(conn, "e3", "s2", 83.0, "Completed");
        await SeedSession(conn, "e4", "s1", 10.0, "InProgress");
        await SeedSession(conn, "e5", "sx", 200.0, "Completed");

        var stats = await Reader().GetDashboardStatsAsync(Ctx(), School);

        Assert.Equal(2, stats.TotalStudents);        // active students only, both-case
        Assert.Equal(1, stats.TotalCounselors);      // EXACT 'counselor', active only
        Assert.Equal(1, stats.TotalCourses);
        Assert.Equal(2, stats.PendingRequests);
        Assert.Equal(2, stats.CompletedAssessments); // distinct PCA users among active students
        Assert.Equal(100.0, stats.AssessmentCompletionRate); // 2/2*100 = 100.0
        Assert.Equal(81.3, stats.AverageScore);      // JsRound(81.3333*10)/10, Completed-only, school-scoped
    }

    [Fact]
    public async Task Dashboard_average_score_is_zero_when_no_completed_sessions()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "Student");
        await SeedSession(conn, "e1", "s1", 90.0, "InProgress"); // not Completed -> AVG NULL -> 0

        var stats = await Reader().GetDashboardStatsAsync(Ctx(), School);

        Assert.Equal(0.0, stats.AverageScore);
        Assert.Equal(0, stats.CompletedAssessments);
        Assert.Equal(0.0, stats.AssessmentCompletionRate);
    }

    // Codex FM-050 MEDIUM: a Completed session with a NaN scorePercentage poisons SQL AVG → NaN. TS `avg || 0`
    // coerces NaN → 0; the reader must too (else STJ throws serializing NaN → 500 on the whole dashboard).
    [Fact]
    public async Task Dashboard_average_score_nan_coalesces_to_zero()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "Student");
        await SeedSession(conn, "e1", "s1", double.NaN, "Completed"); // NaN row poisons AVG

        var stats = await Reader().GetDashboardStatsAsync(Ctx(), School);

        Assert.Equal(0.0, stats.AverageScore);
        Assert.False(double.IsNaN(stats.AverageScore));
    }

    [Fact]
    public async Task Dashboard_completion_rate_is_one_decimal_jsround_half_up()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        // 16 active students, exactly ONE with a PCA eval -> 1/16*1000 = 62.5 (exact in double). JsRound half-up
        // -> 63 -> 6.3. Banker's ToEven would give 62 -> 6.2, so this pins the reused SchoolAnalyticsMath.JsRound.
        for (var i = 0; i < 16; i++)
        {
            await SeedUser(conn, $"s{i}", School, role: "Student");
        }

        await SeedPca(conn, "p1", "s0");

        var stats = await Reader().GetDashboardStatsAsync(Ctx(), School);

        Assert.Equal(16, stats.TotalStudents);
        Assert.Equal(1, stats.CompletedAssessments);
        Assert.Equal(6.3, stats.AssessmentCompletionRate);
    }

    [Fact]
    public async Task Dashboard_valid_school_with_no_students_is_all_zero()
    {
        var stats = await Reader().GetDashboardStatsAsync(Ctx(), School);

        Assert.Equal(0, stats.TotalStudents);
        Assert.Equal(0, stats.CompletedAssessments);
        Assert.Equal(0.0, stats.AverageScore);
        Assert.Equal(0.0, stats.AssessmentCompletionRate);
    }

    // ---- counselor-assignments/all ----

    [Fact]
    public async Task Assignments_returns_active_pairs_for_counselors_in_school_only()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "c1", School, role: "counselor");
        await SeedUser(conn, "cx", OtherSchool, role: "counselor");
        // active pairs on in-school counselor.
        await SeedAssignment(conn, "a1", "c1", "s1");
        await SeedAssignment(conn, "a2", "c1", "s2");
        // inactive -> excluded.
        await SeedAssignment(conn, "a3", "c1", "s3", isActive: false);
        // counselor in another school -> excluded (relation filter counselor.schoolId).
        await SeedAssignment(conn, "a4", "cx", "s4");

        var rows = await Reader().GetAllCounselorAssignmentsAsync(Ctx(), School);

        Assert.Equal(new[] { "s1", "s2" }, rows.Select(r => r.StudentId).ToArray());
        Assert.All(rows, r => Assert.Equal("c1", r.CounselorId));
    }

    [Fact]
    public async Task Assignments_empty_when_none()
    {
        Assert.Empty(await Reader().GetAllCounselorAssignmentsAsync(Ctx(), School));
    }

    // ---- notes ----

    [Fact]
    public async Task Notes_empty_students_returns_service_shape_with_page_and_limit()
    {
        // No students at all -> service returns { data:[], total:0, page, limit } (WITH page/limit).
        var page = await Reader().GetSchoolNotesAsync(Ctx(), School, Query(page: 2, limit: 5));

        Assert.Empty(page.Data);
        Assert.Equal(0, page.Total);
        Assert.Equal(2, page.Page);
        Assert.Equal(5, page.Limit);
    }

    [Fact]
    public async Task Notes_returns_scalar_passthrough_and_nested_student_and_author()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "Student", name: "Ada Lovelace");
        await SeedUser(conn, "c1", School, role: "counselor", name: "Grace Hopper");
        await SeedNote(conn, "n1", "s1", "c1", type: "academic", content: "Great progress", tags: ["t1", "t2"]);

        var page = await Reader().GetSchoolNotesAsync(Ctx(), School, Query());

        var note = Assert.Single(page.Data);
        Assert.Equal("n1", note.Id);
        Assert.Equal("s1", note.StudentId);
        Assert.Equal("c1", note.AuthorId);
        Assert.Equal("academic", note.Type);
        Assert.Equal("Great progress", note.Content);
        Assert.Equal(new[] { "t1", "t2" }, note.Tags.ToArray());
        Assert.EndsWith("Z", note.CreatedDate);
        Assert.Equal("s1", note.Student.Id);
        Assert.Equal("Ada Lovelace", note.Student.Name);
        Assert.Equal("c1", note.Author.Id);
        Assert.Equal("Grace Hopper", note.Author.Name);
        Assert.Equal(1, page.Total);
    }

    [Fact]
    public async Task Notes_type_filter_applies_and_inactive_excluded()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "Student");
        await SeedUser(conn, "c1", School, role: "counselor");
        await SeedNote(conn, "n1", "s1", "c1", type: "academic", content: "a");
        await SeedNote(conn, "n2", "s1", "c1", type: "behavioral", content: "b");
        await SeedNote(conn, "n3", "s1", "c1", type: "academic", content: "c", isActive: false); // inactive

        var page = await Reader().GetSchoolNotesAsync(Ctx(), School, Query(type: "academic"));

        var note = Assert.Single(page.Data);
        Assert.Equal("n1", note.Id);
        Assert.Equal(1, page.Total);
    }

    [Fact]
    public async Task Notes_search_matches_content_or_student_name()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "Student", name: "Ada Lovelace");
        await SeedUser(conn, "s2", School, role: "Student", name: "Alan Turing");
        await SeedUser(conn, "c1", School, role: "counselor");
        await SeedNote(conn, "n1", "s1", "c1", type: "academic", content: "needs zebra practice"); // content match
        await SeedNote(conn, "n2", "s2", "c1", type: "academic", content: "all good");             // student-name match
        await SeedNote(conn, "n3", "s1", "c1", type: "academic", content: "nothing here");          // no match (Ada, no zebra/turing)

        // "zebra" matches n1 by content; "turing" matches n2 by student.name (case-insensitive ILIKE).
        var byContent = await Reader().GetSchoolNotesAsync(Ctx(), School, Query(search: "ZEBRA"));
        Assert.Equal(new[] { "n1" }, byContent.Data.Select(n => n.Id).ToArray());

        var byName = await Reader().GetSchoolNotesAsync(Ctx(), School, Query(search: "turing"));
        Assert.Equal(new[] { "n2" }, byName.Data.Select(n => n.Id).ToArray());
    }

    [Fact]
    public async Task Notes_paginates_ordered_by_createdDate_desc()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "Student");
        await SeedUser(conn, "c1", School, role: "counselor");
        var baseTime = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        await SeedNote(conn, "old", "s1", "c1", content: "1", createdDate: baseTime);
        await SeedNote(conn, "mid", "s1", "c1", content: "2", createdDate: baseTime.AddDays(1));
        await SeedNote(conn, "new", "s1", "c1", content: "3", createdDate: baseTime.AddDays(2));

        var pageOne = await Reader().GetSchoolNotesAsync(Ctx(), School, Query(page: 1, limit: 2));
        Assert.Equal(new[] { "new", "mid" }, pageOne.Data.Select(n => n.Id).ToArray()); // newest first
        Assert.Equal(3, pageOne.Total);

        var pageTwo = await Reader().GetSchoolNotesAsync(Ctx(), School, Query(page: 2, limit: 2));
        Assert.Equal(new[] { "old" }, pageTwo.Data.Select(n => n.Id).ToArray());
        Assert.Equal(3, pageTwo.Total);
    }

    // ---- counselor-workload ----

    [Fact]
    public async Task Workload_batched_counts_and_assigned_students_shape()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "c1", School, role: "counselor", name: "Grace");
        await SeedUser(conn, "s1", School, role: "Student", name: "Ada", gradeLevel: 10);
        await SeedUser(conn, "s2", School, role: "Student", name: "Alan", gradeLevel: null, isActive: false);
        await SeedAssignment(conn, "a1", "c1", "s1");
        await SeedAssignment(conn, "a2", "c1", "s2");
        await SeedAssignment(conn, "a3", "c1", "s1", isActive: false); // inactive -> not counted
        await SeedCounselorSession(conn, "cs1", "c1");
        await SeedCounselorSession(conn, "cs2", "c1");
        await SeedCounselorSession(conn, "cs3", "c1", isActive: false); // inactive -> not counted
        await SeedNote(conn, "n1", "s1", "c1", content: "x");
        await SeedNote(conn, "n2", "s1", "c1", content: "y", isActive: false); // inactive -> not counted

        var rows = await Reader().GetCounselorWorkloadAsync(Ctx(), School);

        var row = Assert.Single(rows);
        Assert.Equal("c1", row.Id);
        Assert.Equal(2, row.StudentCount);
        Assert.Equal(2, row.SessionCount);
        Assert.Equal(1, row.NoteCount);
        Assert.Equal(2, row.AssignedStudents.Count);
        var s2 = row.AssignedStudents.Single(s => s.Id == "s2");
        Assert.Null(s2.GradeLevel);
        Assert.False(s2.IsActive);
        var s1 = row.AssignedStudents.Single(s => s.Id == "s1");
        Assert.Equal(10, s1.GradeLevel);
        Assert.True(s1.IsActive);
    }

    [Fact]
    public async Task Workload_sorts_studentCount_desc_stable_over_name_asc()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        // Three counselors fetched name-ASC: Aaron, Bianca, Chloe. Aaron & Chloe both have 1 student (tie),
        // Bianca has 2. Expect Bianca first (2), then the tie in name-ASC order (Aaron before Chloe).
        await SeedUser(conn, "aaron", School, role: "counselor", name: "Aaron");
        await SeedUser(conn, "bianca", School, role: "counselor", name: "Bianca");
        await SeedUser(conn, "chloe", School, role: "counselor", name: "Chloe");
        await SeedUser(conn, "s1", School, role: "Student");
        await SeedUser(conn, "s2", School, role: "Student");
        await SeedUser(conn, "s3", School, role: "Student");
        await SeedUser(conn, "s4", School, role: "Student");
        await SeedAssignment(conn, "a1", "aaron", "s1");                 // Aaron: 1
        await SeedAssignment(conn, "a2", "bianca", "s2");                // Bianca: 2
        await SeedAssignment(conn, "a3", "bianca", "s3");
        await SeedAssignment(conn, "a4", "chloe", "s4");                 // Chloe: 1

        var rows = await Reader().GetCounselorWorkloadAsync(Ctx(), School);

        Assert.Equal(new[] { "bianca", "aaron", "chloe" }, rows.Select(r => r.Id).ToArray());
        Assert.Equal(new[] { 2, 1, 1 }, rows.Select(r => r.StudentCount).ToArray());
    }

    [Fact]
    public async Task Workload_excludes_capital_Counselor_and_inactive()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "c1", School, role: "counselor");
        await SeedUser(conn, "c2", School, role: "Counselor");             // capital -> excluded
        await SeedUser(conn, "c3", School, role: "counselor", isActive: false); // inactive -> excluded

        var rows = await Reader().GetCounselorWorkloadAsync(Ctx(), School);

        Assert.Equal(new[] { "c1" }, rows.Select(r => r.Id).ToArray());
    }

    [Fact]
    public async Task Workload_empty_when_no_counselors()
    {
        Assert.Empty(await Reader().GetCounselorWorkloadAsync(Ctx(), School));
    }

    // ---- helpers ----

    private SchoolReadsReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school-admin", "admin@e.st", "Admin"),
            schoolId: School, permissions: new[] { "school:manage" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static SchoolNotesQuery Query(int page = 1, int limit = 20, string? search = null, string? type = null) =>
        new(page, limit, (long)(page - 1) * limit, search, type);

    private static DateTime Unspec(DateTime utc) => DateTime.SpecifyKind(utc, DateTimeKind.Unspecified);

    private static async Task SeedUser(
        NpgsqlConnection conn, string id, string schoolId, string role = "Student",
        bool isActive = true, int? gradeLevel = null, string? name = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "users" ("id","name","email","roleName","schoolId","gradeLevel","isActive")
            VALUES (@id,@n,@e,@r,@s,@g,@a)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("n", name ?? $"Name {id}");
        cmd.Parameters.AddWithValue("e", $"{id}@e.st");
        cmd.Parameters.AddWithValue("r", role);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("g", (object?)gradeLevel ?? DBNull.Value);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedCourse(NpgsqlConnection conn, string id, string schoolId, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "school_courses" ("id","schoolId","isActive") VALUES (@id,@s,@a)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedChangeRequest(NpgsqlConnection conn, string id, string schoolId, string status)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "course_change_requests" ("id","schoolId","status") VALUES (@id,@s,@st)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("st", status);
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
        NpgsqlConnection conn, string id, string userId, double scorePercentage, string status)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "pca_exam_sessions" ("id","userId","scorePercentage","status")
            VALUES (@id,@u,@sc,@st)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("u", userId);
        cmd.Parameters.AddWithValue("sc", scorePercentage);
        cmd.Parameters.AddWithValue("st", status);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedAssignment(
        NpgsqlConnection conn, string id, string counselorId, string studentId, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "counselor_student_assignments" ("id","studentId","counselorId","isActive")
            VALUES (@id,@s,@c,@a)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("c", counselorId);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedCounselorSession(
        NpgsqlConnection conn, string id, string counselorId, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "counselor_sessions" ("id","counselorId","isActive") VALUES (@id,@c,@a)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("c", counselorId);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedNote(
        NpgsqlConnection conn, string id, string studentId, string authorId,
        string type = "academic", string content = "note", bool isActive = true,
        string[]? tags = null, DateTime? createdDate = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "counselor_notes" ("id","studentId","authorId","type","content","isActive","tags","createdDate","updatedAt")
            VALUES (@id,@s,@au,@t,@c,@a,@tags,@cd,@cd)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("au", authorId);
        cmd.Parameters.AddWithValue("t", type);
        cmd.Parameters.AddWithValue("c", content);
        cmd.Parameters.AddWithValue("a", isActive);
        cmd.Parameters.AddWithValue("tags", tags ?? []);
        cmd.Parameters.AddWithValue("cd", Unspec(createdDate ?? DateTime.UtcNow));
        await cmd.ExecuteNonQueryAsync();
    }
}
