using System.Reflection;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.StudentCoursePlan;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.StudentCoursePlan;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.StudentCoursePlan;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="CourseChangeRequestRepository"/> (FM-DOTNET-085). Pins create
/// coalescing (credits || 0 decimal.js string, gradeLevel || user || 9, dueDate body-vs-settings default, defaults
/// pending/active), the deferred type-500s (bad courseId/credits/gradeLevel/action/dueDate/nullable-string →
/// InvalidBody), the paginated school-scoped list (?status enum filter + invalid-label throw), and the pending-owned
/// soft-cancel gate.
/// </summary>
public sealed class CourseChangeRequestRepositoryTests : IClassFixture<CourseChangeRequestRepositoryTests.Fixture>, IAsyncLifetime
{
    private const string Student = "student-1";
    private const string School = "school-1";

    private readonly Fixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CourseChangeRequestRepositoryTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "users","school_assessment_settings","course_change_requests" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- create ----

    [Fact]
    public async Task Create_no_school_returns_NoSchool()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, null, gradeLevel: 9);
        var outcome = await Repo().CreateAsync(Ctx(), Student, Body("""{"courseId":"c1","action":"add"}"""));
        Assert.Equal(CreateChangeRequestStatus.NoSchool, outcome.Status);
    }

    [Fact]
    public async Task Create_persists_with_defaults()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 11);

        var outcome = await Repo().CreateAsync(Ctx(), Student, Body("""{"courseId":"c1","action":"add"}"""));
        Assert.Equal(CreateChangeRequestStatus.Created, outcome.Status);
        var row = outcome.Row!;
        Assert.Equal("c1", row.CourseId);
        Assert.Equal("add", row.Action);
        Assert.Equal("0", row.Credits);      // credits || 0
        Assert.Equal(11, row.GradeLevel);    // user.gradeLevel
        Assert.Equal("pending", row.Status); // default
        Assert.True(row.IsActive);
        Assert.Null(row.DueDate);            // no body.dueDate, no settings
    }

    [Theory]
    [InlineData("""{"courseId":"c1","action":"add","credits":3}""", "3")]
    [InlineData("""{"courseId":"c1","action":"add","credits":"3.5"}""", "3.5")]
    [InlineData("""{"courseId":"c1","action":"add","credits":0}""", "0")]
    [InlineData("""{"courseId":"c1","action":"add","credits":""}""", "0")]
    [InlineData("""{"courseId":"c1","action":"add"}""", "0")]
    public async Task Create_credits_coalesce(string body, string expected)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        var outcome = await Repo().CreateAsync(Ctx(), Student, Body(body));
        Assert.Equal(CreateChangeRequestStatus.Created, outcome.Status);
        Assert.Equal(expected, outcome.Row!.Credits);
    }

    [Theory]
    [InlineData("""{"courseId":"c1","action":"add","gradeLevel":10}""", 10, 11)] // body wins
    [InlineData("""{"courseId":"c1","action":"add"}""", 11, 11)]                 // user.gradeLevel
    [InlineData("""{"courseId":"c1","action":"add","gradeLevel":0}""", 11, 11)]  // 0 falsy → user
    public async Task Create_gradeLevel_coalesce_with_user(string body, int expected, int userGrade)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: userGrade);
        var outcome = await Repo().CreateAsync(Ctx(), Student, Body(body));
        Assert.Equal(expected, outcome.Row!.GradeLevel);
    }

    [Theory]
    [InlineData("""{"courseId":"c1","action":"add","gradeLevel":10.0}""", 10)] // JS 10.0 === integer 10 → 201
    [InlineData("""{"courseId":"c1","action":"add","gradeLevel":1e1}""", 10)]  // JS 1e1 === 10 → 201
    public async Task Create_gradeLevel_integral_valued_number_is_accepted(string body, int expected)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        var outcome = await Repo().CreateAsync(Ctx(), Student, Body(body));
        Assert.Equal(CreateChangeRequestStatus.Created, outcome.Status);
        Assert.Equal(expected, outcome.Row!.GradeLevel);
    }

    [Fact]
    public async Task Create_gradeLevel_falls_back_to_9_when_no_body_and_no_user()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: null);
        var outcome = await Repo().CreateAsync(Ctx(), Student, Body("""{"courseId":"c1","action":"add"}"""));
        Assert.Equal(9, outcome.Row!.GradeLevel);
    }

    [Fact]
    public async Task Create_dueDate_from_body_wins()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        await Settings(conn, School, new DateTime(2030, 1, 1));
        var outcome = await Repo().CreateAsync(Ctx(), Student, Body("""{"courseId":"c1","action":"add","dueDate":"2026-05-01T00:00:00Z"}"""));
        Assert.StartsWith("2026-05-01", outcome.Row!.DueDate);
    }

    [Fact]
    public async Task Create_dueDate_defaults_to_settings_when_body_falsy()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        await Settings(conn, School, new DateTime(2030, 3, 15));
        var outcome = await Repo().CreateAsync(Ctx(), Student, Body("""{"courseId":"c1","action":"add","dueDate":null}"""));
        Assert.StartsWith("2030-03-15", outcome.Row!.DueDate);
    }

    [Fact]
    public async Task Create_dueDate_null_when_no_body_and_no_settings()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        var outcome = await Repo().CreateAsync(Ctx(), Student, Body("""{"courseId":"c1","action":"add"}"""));
        Assert.Null(outcome.Row!.DueDate);
    }

    [Fact]
    public async Task Create_nullable_strings_persist_and_absent_is_null()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        var outcome = await Repo().CreateAsync(Ctx(), Student,
            Body("""{"courseId":"c1","action":"add","courseCode":"MATH101","semester":"Fall","studentNote":"pls"}"""));
        var row = outcome.Row!;
        Assert.Equal("MATH101", row.CourseCode);
        Assert.Equal("Fall", row.Semester);
        Assert.Equal("pls", row.StudentNote);
        Assert.Null(row.CourseName);
    }

    [Theory]
    [InlineData("""{}""")]                                                  // missing courseId
    [InlineData("""{"courseId":123,"action":"add"}""")]                     // non-string courseId
    [InlineData("""{"courseId":"c1"}""")]                                   // missing action
    [InlineData("""{"courseId":"c1","action":"nope"}""")]                   // invalid enum label (PostgresException)
    [InlineData("""{"courseId":"c1","action":123}""")]                      // non-string action
    [InlineData("""{"courseId":"c1","action":"add","credits":"abc"}""")]    // non-numeric credits string
    [InlineData("""{"courseId":"c1","action":"add","credits":true}""")]     // truthy non-numeric credits
    [InlineData("""{"courseId":"c1","action":"add","gradeLevel":9.5}""")]   // non-integer gradeLevel
    [InlineData("""{"courseId":"c1","action":"add","gradeLevel":"10"}""")]  // string gradeLevel
    [InlineData("""{"courseId":"c1","action":"add","dueDate":"garbage"}""")]// invalid date
    [InlineData("""{"courseId":"c1","action":"add","courseCode":5}""")]     // non-string nullable
    public async Task Create_invalid_body_returns_InvalidBody(string body)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        var outcome = await Repo().CreateAsync(Ctx(), Student, Body(body));
        Assert.Equal(CreateChangeRequestStatus.InvalidBody, outcome.Status);
    }

    // ---- list ----

    [Fact]
    public async Task List_no_school_returns_not_has_school()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, null, gradeLevel: 9);
        var view = await Repo().ListAsync(Ctx(), Student, null, 1, 20);
        Assert.False(view.HasSchool);
        Assert.Empty(view.Data);
        Assert.Equal(0, view.Total);
    }

    [Fact]
    public async Task List_scopes_student_school_active_ordered_desc()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        await Cr(conn, "a", Student, School, created: new DateTime(2026, 1, 1));
        await Cr(conn, "b", Student, School, created: new DateTime(2026, 3, 1));
        await Cr(conn, "inactive", Student, School, isActive: false);
        await Cr(conn, "other-student", "student-2", School);
        await Cr(conn, "other-school", Student, "school-2");

        var view = await Repo().ListAsync(Ctx(), Student, null, 1, 20);
        Assert.True(view.HasSchool);
        Assert.Equal(2, view.Total);
        Assert.Equal(["b", "a"], view.Data.Select(r => r.Id)); // createdDate DESC
    }

    [Fact]
    public async Task List_status_filter_and_paging()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        await Cr(conn, "p1", Student, School, status: "pending", created: new DateTime(2026, 1, 1));
        await Cr(conn, "p2", Student, School, status: "pending", created: new DateTime(2026, 2, 1));
        await Cr(conn, "p3", Student, School, status: "pending", created: new DateTime(2026, 3, 1));
        await Cr(conn, "approved", Student, School, status: "approved");

        var approved = await Repo().ListAsync(Ctx(), Student, "approved", 1, 20);
        Assert.Equal(["approved"], approved.Data.Select(r => r.Id));

        var page2 = await Repo().ListAsync(Ctx(), Student, "pending", 2, 2); // total 3, page 2 size 2 → the oldest
        Assert.Equal(3, page2.Total);
        Assert.Equal(["p1"], page2.Data.Select(r => r.Id)); // DESC: p3,p2 | p1
    }

    [Fact]
    public async Task List_invalid_status_throws_reproducing_prisma_500()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        await Cr(conn, "p1", Student, School, status: "pending");
        await Assert.ThrowsAsync<PostgresException>(() => Repo().ListAsync(Ctx(), Student, "garbage", 1, 20));
    }

    [Fact]
    public async Task List_credits_is_decimal_string()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        await Cr(conn, "a", Student, School, credits: 3.50m);
        var view = await Repo().ListAsync(Ctx(), Student, null, 1, 20);
        Assert.Equal("3.5", view.Data.Single().Credits); // trim_scale
    }

    // ---- delete ----

    [Fact]
    public async Task Delete_no_school_returns_NoSchool()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, null, gradeLevel: 9);
        Assert.Equal(DeleteChangeRequestStatus.NoSchool, await Repo().DeleteAsync(Ctx(), Student, "x"));
    }

    [Fact]
    public async Task Delete_gate_cannot_cancel_cases()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        await Cr(conn, "theirs", "student-2", School, status: "pending");
        await Cr(conn, "otherschool", Student, "school-2", status: "pending");
        await Cr(conn, "approved", Student, School, status: "approved");

        Assert.Equal(DeleteChangeRequestStatus.CannotCancel, await Repo().DeleteAsync(Ctx(), Student, "missing"));
        Assert.Equal(DeleteChangeRequestStatus.CannotCancel, await Repo().DeleteAsync(Ctx(), Student, "theirs"));
        Assert.Equal(DeleteChangeRequestStatus.CannotCancel, await Repo().DeleteAsync(Ctx(), Student, "otherschool"));
        Assert.Equal(DeleteChangeRequestStatus.CannotCancel, await Repo().DeleteAsync(Ctx(), Student, "approved"));
    }

    [Fact]
    public async Task Delete_pending_owned_soft_cancels()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Student, School, gradeLevel: 9);
        await Cr(conn, "mine", Student, School, status: "pending");

        Assert.Equal(DeleteChangeRequestStatus.Cancelled, await Repo().DeleteAsync(Ctx(), Student, "mine"));

        await using var check = new NpgsqlCommand("""SELECT "isActive" FROM "course_change_requests" WHERE "id"='mine'""", conn);
        Assert.False((bool)(await check.ExecuteScalarAsync())!);
    }

    // ---- helpers ----

    private static JsonElement Body(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private CourseChangeRequestRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            new FixedTimeProvider(new DateTime(2026, 7, 24, 12, 0, 0, DateTimeKind.Utc)));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(Student, "student", "s@e.st", "Student"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
    }

    private static async Task User(NpgsqlConnection conn, string id, string? schoolId, int? gradeLevel)
    {
        await using var cmd = new NpgsqlCommand("""INSERT INTO "users"("id","schoolId","gradeLevel") VALUES(@id,@s,@g)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", (object?)schoolId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("g", (object?)gradeLevel ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Settings(NpgsqlConnection conn, string schoolId, DateTime? deadline)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "school_assessment_settings"("id","schoolId","courseRequestDeadline") VALUES(@id,@s,@d)""", conn);
        cmd.Parameters.AddWithValue("id", "set-" + schoolId);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("d", (object?)(deadline is null ? null : DateTime.SpecifyKind(deadline.Value, DateTimeKind.Unspecified)) ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Cr(
        NpgsqlConnection conn, string id, string studentId, string schoolId, bool isActive = true,
        string status = "pending", decimal credits = 1m, DateTime? created = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "course_change_requests"("id","studentId","schoolId","courseId","credits","gradeLevel","action","status","isActive","createdDate","updatedAt")
            VALUES(@id,@s,@sc,@c,@cr,9,'add'::"CourseChangeAction",@st::"CourseChangeStatus",@act,@cd,@cd)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("sc", schoolId);
        cmd.Parameters.AddWithValue("c", "course-" + id);
        cmd.Parameters.AddWithValue("cr", credits);
        cmd.Parameters.AddWithValue("st", status);
        cmd.Parameters.AddWithValue("act", isActive);
        cmd.Parameters.AddWithValue("cd", DateTime.SpecifyKind(created ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }

    public sealed class Fixture : IAsyncLifetime
    {
        private readonly PostgreSqlContainer _container = new PostgreSqlBuilder().WithImage("postgres:16-alpine").Build();

        public string ConnectionString => _container.GetConnectionString();

        public async Task InitializeAsync()
        {
            await _container.StartAsync();
            await using var connection = new NpgsqlConnection(ConnectionString);
            await connection.OpenAsync();
            var assembly = Assembly.GetExecutingAssembly();
            var name = assembly.GetManifestResourceNames()
                .Single(n => n.EndsWith("course-change-requests-schema.sql", StringComparison.Ordinal));
            await using var stream = assembly.GetManifestResourceStream(name)!;
            using var sr = new StreamReader(stream);
            await using var cmd = new NpgsqlCommand(await sr.ReadToEndAsync(), connection);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task DisposeAsync() => await _container.DisposeAsync();
    }
}
