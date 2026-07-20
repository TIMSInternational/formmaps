using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Gradebook;
using Npgsql;

namespace FormMaps.IntegrationTests.Gradebook;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="GradebookReader"/>: the verifyStudentInSchool scoping rail
/// (cross-school / non-student -> null), the grades-by-year grouping (DESC year / ASC semester order, null year
/// -> "Unknown"), full-row passthrough (credits as a number, ISO-Z timestamps), isActive filtering, GPA parity,
/// and the config default-vs-custom (lowercased bonus keys) path.
/// </summary>
public sealed class GradebookReaderTests : IClassFixture<GradebookDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";
    private const string Student = "stu-1";

    private readonly GradebookDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public GradebookReaderTests(GradebookDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "users","student_grades","gpa_configurations" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Cross_school_student_is_null()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Student, OtherSchool);
        await SeedGrade(conn, Student, School, "A", 3, academicYear: "2025-2026");

        Assert.Null(await Reader().GetStudentTranscriptAsync(Ctx("admin-1"), School, Student));
    }

    [Fact]
    public async Task Non_student_role_is_null()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Student, School, role: "counselor");

        Assert.Null(await Reader().GetStudentTranscriptAsync(Ctx("admin-1"), School, Student));
    }

    [Fact]
    public async Task Missing_user_is_null()
    {
        Assert.Null(await Reader().GetStudentTranscriptAsync(Ctx("admin-1"), School, "ghost"));
    }

    [Theory]
    [InlineData("student")]
    [InlineData("Student")]
    public async Task Both_student_role_casings_are_accepted(string role)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Student, School, role: role);
        await SeedGrade(conn, Student, School, "A", 3, academicYear: "2025-2026");

        var result = await Reader().GetStudentTranscriptAsync(Ctx("admin-1"), School, Student);

        Assert.NotNull(result);
        Assert.Equal(4.0, result!.GpaUnweighted);
    }

    [Fact]
    public async Task Groups_by_year_desc_semester_asc_with_full_row_passthrough()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Student, School);
        await SeedGrade(conn, Student, School, "A", 4, academicYear: "2024-2025", semester: "Fall", courseCode: "ENG101", courseLevel: "honors");
        await SeedGrade(conn, Student, School, "B", 3, academicYear: "2025-2026", semester: "Spring");
        await SeedGrade(conn, Student, School, "A-", 3, academicYear: "2025-2026", semester: "Fall");

        var result = await Reader().GetStudentTranscriptAsync(Ctx("admin-1"), School, Student);

        Assert.NotNull(result);
        // academicYear DESC -> 2025-2026 first, then 2024-2025.
        Assert.Equal(new[] { "2025-2026", "2024-2025" }, result!.ByYear.Keys.ToArray());
        // Within 2025-2026: semester ASC -> Fall before Spring.
        var recent = result.ByYear["2025-2026"];
        Assert.Equal(new[] { "Fall", "Spring" }, recent.Select(r => r.Semester).ToArray());
        // Full-row passthrough: credits as a number; camelCase-serializable record fields present.
        var eng = result.ByYear["2024-2025"][0];
        Assert.Equal(4d, eng.Credits);
        Assert.Equal("ENG101", eng.CourseCode);
        Assert.Equal("honors", eng.CourseLevel);
        Assert.EndsWith("Z", eng.CreatedDate);
    }

    [Fact]
    public async Task Null_or_empty_academic_year_buckets_under_Unknown()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Student, School);
        await SeedGrade(conn, Student, School, "A", 3, academicYear: null);

        var result = await Reader().GetStudentTranscriptAsync(Ctx("admin-1"), School, Student);

        Assert.NotNull(result);
        Assert.True(result!.ByYear.ContainsKey("Unknown"));
        Assert.Single(result.ByYear["Unknown"]);
    }

    [Fact]
    public async Task Inactive_grades_are_excluded()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Student, School);
        await SeedGrade(conn, Student, School, "A", 3, academicYear: "2025-2026");
        await SeedGrade(conn, Student, School, "F", 3, academicYear: "2025-2026", isActive: false);

        var result = await Reader().GetStudentTranscriptAsync(Ctx("admin-1"), School, Student);

        Assert.NotNull(result);
        Assert.Single(result!.ByYear["2025-2026"]);
        Assert.Equal(4.0, result.GpaUnweighted); // the inactive F did not drag it down
    }

    [Fact]
    public async Task Empty_transcript_has_no_years_and_null_gpas()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Student, School);

        var result = await Reader().GetStudentTranscriptAsync(Ctx("admin-1"), School, Student);

        Assert.NotNull(result);
        Assert.Empty(result!.ByYear);
        Assert.Null(result.GpaUnweighted);
        Assert.Null(result.GpaWeighted);
        Assert.Equal(0, result.TotalCredits);
    }

    [Fact]
    public async Task Custom_config_applies_with_lowercased_bonus_keys()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Student, School);
        await SeedGrade(conn, Student, School, "A", 2, academicYear: "2025-2026", courseLevel: "ap");
        // Config stored with an UPPERCASE bonus key + a bumped AP bonus of 2.0.
        await SeedConfig(conn, School, unweightedMap: null, weightBonuses: """{"AP":2.0}""");

        var result = await Reader().GetStudentTranscriptAsync(Ctx("admin-1"), School, Student);

        Assert.NotNull(result);
        Assert.Equal(4.0, result!.GpaUnweighted);
        Assert.Equal(6.0, result.GpaWeighted); // (4.0 + 2.0) via the lowercased "ap" key
    }

    [Fact]
    public async Task Default_config_used_when_no_row()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Student, School);
        await SeedGrade(conn, Student, School, "A", 3, academicYear: "2025-2026", courseLevel: "honors");
        // No gpa_configurations row -> DEFAULT_WEIGHT_BONUSES (honors 0.5).

        var result = await Reader().GetStudentTranscriptAsync(Ctx("admin-1"), School, Student);

        Assert.NotNull(result);
        Assert.Equal(4.0, result!.GpaUnweighted);
        Assert.Equal(4.5, result.GpaWeighted);
    }

    // ---- helpers ----

    private GradebookReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx(string userId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "school-admin", $"{userId}@e.st", "Admin"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task SeedUser(NpgsqlConnection conn, string id, string? schoolId, string role = "Student")
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users" ("id","name","email","roleName","schoolId","isActive") VALUES (@id,@n,@e,@r,@s,true)""",
            conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("n", "Student");
        cmd.Parameters.AddWithValue("e", "s@e.st");
        cmd.Parameters.AddWithValue("r", role);
        cmd.Parameters.AddWithValue("s", (object?)schoolId ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedGrade(
        NpgsqlConnection conn, string studentId, string schoolId, string grade, decimal credits,
        string? academicYear, string? semester = null, string? courseCode = null, string? courseLevel = null,
        bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_grades"
              ("id","schoolId","studentId","courseId","courseCode","semester","grade","credits","courseLevel","academicYear","isActive")
            VALUES (@id,@sc,@st,@cid,@cc,@sem,@g,@cr,@cl,@ay,@a)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("sc", schoolId);
        cmd.Parameters.AddWithValue("st", studentId);
        cmd.Parameters.AddWithValue("cid", "course-1");
        cmd.Parameters.AddWithValue("cc", (object?)courseCode ?? DBNull.Value);
        cmd.Parameters.AddWithValue("sem", (object?)semester ?? DBNull.Value);
        cmd.Parameters.AddWithValue("g", grade);
        cmd.Parameters.AddWithValue("cr", credits);
        cmd.Parameters.AddWithValue("cl", (object?)courseLevel ?? DBNull.Value);
        cmd.Parameters.AddWithValue("ay", (object?)academicYear ?? DBNull.Value);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedConfig(NpgsqlConnection conn, string schoolId, string? unweightedMap, string? weightBonuses)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "gpa_configurations" ("id","schoolId","unweightedMap","weightBonuses")
            VALUES (@id,@s,CAST(@um AS jsonb),CAST(@wb AS jsonb))
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("um", (object?)unweightedMap ?? DBNull.Value);
        cmd.Parameters.AddWithValue("wb", (object?)weightBonuses ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }
}
