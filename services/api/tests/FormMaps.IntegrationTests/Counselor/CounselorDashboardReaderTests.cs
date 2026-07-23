using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Infrastructure.Counselor;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.Counselor;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC container tz) tests for <see cref="CounselorDashboardReader"/>. Pins the SQL-level
/// parity the faked endpoint tests cannot: the tz-independent now comparisons (upcomingSessions / overdueFollowUps —
/// RED if `now` regresses to a Kind=Utc/timestamptz binding under the -04/-05 session); the pendingRequests
/// no-isActive-filter vs the change-requests isActive-filter asymmetry; total = returned page length (not a COUNT);
/// credits raw Decimal → string + the joined student name (raw vs null); the empty-caseload early returns; note
/// content 200-char truncation + followUpDate-ASC / createdDate-DESC ordering.
/// </summary>
public sealed class CounselorDashboardReaderTests
    : IClassFixture<CounselorDashboardDatabaseFixture>, IAsyncLifetime
{
    // FixedTimeProvider now = 2026-07-23 12:00:00Z; the fixture session tz is America/New_York (DST → UTC-4 in July).
    private static readonly DateTime Now = new(2026, 7, 23, 12, 0, 0, DateTimeKind.Utc);
    private const string Counselor = "counselor-1";
    private const string School = "school-1";

    private readonly CounselorDashboardDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CounselorDashboardReaderTests(CounselorDashboardDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "users","counselor_student_assignments","counselor_notes","counselor_sessions","course_change_requests" """,
            conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- tz-independence (RED if `now` regresses to a Kind=Utc / timestamptz binding) ----

    [Fact]
    public async Task Dashboard_now_comparisons_are_timezone_independent()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School);
        await SeedAssignment(conn, "a1", Counselor, "s1");

        // Wall-clock times either side of now (12:00). Under a correct `timestamp` (Kind=Unspecified) binding, the
        // comparison is a plain wall-clock compare. Under a timestamptz (Kind=Utc) regression the -04 session would
        // shift BOTH future, flipping both counts.
        await SeedSession(conn, "sess-future", Counselor, "s1", startTime: new DateTime(2026, 7, 23, 13, 0, 0), status: "confirmed");
        await SeedSession(conn, "sess-past", Counselor, "s1", startTime: new DateTime(2026, 7, 23, 11, 0, 0), status: "confirmed");

        await SeedNote(conn, "n-overdue", "s1", Counselor, followUpDate: new DateTime(2026, 7, 23, 11, 0, 0), followUpCompleted: false);
        await SeedNote(conn, "n-future", "s1", Counselor, followUpDate: new DateTime(2026, 7, 23, 13, 0, 0), followUpCompleted: false);

        var result = await Reader().GetDashboardAsync(Ctx(), Counselor);

        Assert.Equal(1, result.UpcomingSessions);   // only the 13:00 session; regression → 2
        Assert.Equal(2, result.FollowUps);           // both dated open follow-ups
        Assert.Equal(1, result.OverdueFollowUps);    // only the 11:00 follow-up; regression → 0
    }

    // ---- pendingRequests (no isActive) vs change-requests list (isActive) asymmetry ----

    [Fact]
    public async Task PendingRequests_count_ignores_isActive_but_change_requests_list_requires_it()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Counselor, School);
        await SeedUser(conn, "s1", School, name: "Alice");
        await SeedAssignment(conn, "a1", Counselor, "s1");
        await SeedChangeRequest(conn, "r-active", "s1", School, status: "pending", isActive: true, credits: 3.5m);
        await SeedChangeRequest(conn, "r-inactive", "s1", School, status: "pending", isActive: false, credits: 1m);

        var dashboard = await Reader().GetDashboardAsync(Ctx(), Counselor);
        Assert.Equal(2, dashboard.PendingRequests); // counts BOTH — no isActive filter

        var list = await Reader().GetDashboardChangeRequestsAsync(Ctx(), Counselor, limit: 30);
        Assert.Equal(1, list.Total);                 // only the active one
        Assert.Equal("r-active", list.Data[0].Id);
        Assert.Equal("3.5", list.Data[0].Credits);   // raw Decimal → STRING
        Assert.Equal("Alice", list.Data[0].StudentName); // joined users.name (raw)
    }

    // ---- total = returned page length (NOT a full COUNT) ----

    [Fact]
    public async Task ChangeRequests_total_is_page_length_not_full_count()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Counselor, School);
        await SeedUser(conn, "s1", School, name: "Alice");
        await SeedAssignment(conn, "a1", Counselor, "s1");
        for (var i = 0; i < 3; i++)
        {
            await SeedChangeRequest(conn, $"r{i}", "s1", School, status: "pending", isActive: true, credits: 1m);
        }

        var list = await Reader().GetDashboardChangeRequestsAsync(Ctx(), Counselor, limit: 2);
        Assert.Equal(2, list.Data.Count);
        Assert.Equal(2, list.Total); // page length, NOT 3
    }

    // ---- empty caseload early returns ----

    [Fact]
    public async Task Empty_caseload_yields_zero_and_empty()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Counselor, School);
        // no assignments; seed an unrelated pending CCR that must NOT be counted.
        await SeedUser(conn, "other", School);
        await SeedChangeRequest(conn, "r-other", "other", School, status: "pending", isActive: true, credits: 1m);

        var dashboard = await Reader().GetDashboardAsync(Ctx(), Counselor);
        Assert.Equal(0, dashboard.TotalStudents);
        Assert.Equal(0, dashboard.PendingRequests); // = ANY('{}') matches nothing

        var list = await Reader().GetDashboardChangeRequestsAsync(Ctx(), Counselor, limit: 30);
        Assert.Empty(list.Data);
        Assert.Equal(0, list.Total);
    }

    [Fact]
    public async Task No_school_counselor_change_requests_empty()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Counselor, schoolId: null);
        var list = await Reader().GetDashboardChangeRequestsAsync(Ctx(), Counselor, limit: 30);
        Assert.Empty(list.Data);
        Assert.Equal(0, list.Total);
    }

    // ---- note content truncation + ordering + studentName resolution ----

    [Fact]
    public async Task Dashboard_notes_truncate_content_resolve_name_and_order()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, name: null); // null name → "Student"
        await SeedAssignment(conn, "a1", Counselor, "s1");
        var longContent = new string('x', 250);
        // Two recent notes; createdDate DESC → n-new first.
        await SeedNote(conn, "n-old", "s1", Counselor, followUpDate: null, followUpCompleted: false,
            content: longContent, createdDate: new DateTime(2026, 7, 1, 0, 0, 0));
        await SeedNote(conn, "n-new", "s1", Counselor, followUpDate: null, followUpCompleted: false,
            content: "short", createdDate: new DateTime(2026, 7, 10, 0, 0, 0));

        var result = await Reader().GetDashboardAsync(Ctx(), Counselor);

        Assert.Equal("n-new", result.RecentNotes[0].Id);        // createdDate DESC
        Assert.Equal("Student", result.RecentNotes[0].StudentName); // null name → "Student"
        var old = result.RecentNotes.Single(n => n.Id == "n-old");
        Assert.Equal(200, old.Content.Length);                  // truncated to 200
    }

    // ---- student detail ----

    [Fact]
    public async Task StudentDetail_returns_six_fields_or_null()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, name: "Alice", gradeLevel: 11);

        Assert.True(await Reader().HasActiveAssignmentAsync(Ctx(), Counselor, "s1") is false); // no assignment yet
        await SeedAssignment(conn, "a1", Counselor, "s1");
        Assert.True(await Reader().HasActiveAssignmentAsync(Ctx(), Counselor, "s1"));

        var detail = await Reader().GetStudentDetailAsync(Ctx(), "s1");
        Assert.NotNull(detail);
        Assert.Equal("Alice", detail!.Name);
        Assert.Equal(11, detail.GradeLevel);
        Assert.Equal(School, detail.SchoolId);

        Assert.Null(await Reader().GetStudentDetailAsync(Ctx(), "nope"));
    }

    [Fact]
    public async Task Inactive_assignment_is_not_active()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School);
        await SeedAssignment(conn, "a1", Counselor, "s1", isActive: false);
        Assert.False(await Reader().HasActiveAssignmentAsync(Ctx(), Counselor, "s1"));
    }

    // ---- helpers ----

    private CounselorDashboardReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            new FixedTimeProvider(Now));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(Counselor, "counselor", "c@e.st", "Counselor"),
            schoolId: School, permissions: new[] { "counselor:dashboard" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
    }

    private static async Task SeedUser(
        NpgsqlConnection conn, string id, string? schoolId, string? name = "User", int? gradeLevel = null)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users"("id","name","email","roleName","schoolId","gradeLevel") VALUES(@id,@name,@email,'counselor',@school,@grade)""",
            conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("name", (object?)name ?? DBNull.Value);
        cmd.Parameters.AddWithValue("email", id + "@e.st");
        cmd.Parameters.AddWithValue("school", (object?)schoolId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("grade", (object?)gradeLevel ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedAssignment(
        NpgsqlConnection conn, string id, string counselorId, string studentId, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "counselor_student_assignments"("id","counselorId","studentId","isActive") VALUES(@id,@c,@s,@a)""",
            conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("c", counselorId);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedSession(
        NpgsqlConnection conn, string id, string counselorId, string studentId, DateTime startTime, string status)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "counselor_sessions"("id","counselorId","studentId","startTime","endTime","status") VALUES(@id,@c,@s,@st,@et,@status)""",
            conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("c", counselorId);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("st", DateTime.SpecifyKind(startTime, DateTimeKind.Unspecified));
        cmd.Parameters.AddWithValue("et", DateTime.SpecifyKind(startTime.AddHours(1), DateTimeKind.Unspecified));
        cmd.Parameters.AddWithValue("status", status);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedNote(
        NpgsqlConnection conn, string id, string studentId, string authorId, DateTime? followUpDate,
        bool followUpCompleted, string type = "general", string content = "note", DateTime? createdDate = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "counselor_notes"("id","studentId","authorId","type","content","followUpDate","followUpCompleted","createdDate")
            VALUES(@id,@s,@a,@type,@content,@fud,@fuc,@cd)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("a", authorId);
        cmd.Parameters.AddWithValue("type", type);
        cmd.Parameters.AddWithValue("content", content);
        cmd.Parameters.AddWithValue("fud", followUpDate is null ? DBNull.Value : DateTime.SpecifyKind(followUpDate.Value, DateTimeKind.Unspecified));
        cmd.Parameters.AddWithValue("fuc", followUpCompleted);
        cmd.Parameters.AddWithValue("cd", createdDate is null ? (object)DateTime.SpecifyKind(new DateTime(2026, 1, 1), DateTimeKind.Unspecified) : DateTime.SpecifyKind(createdDate.Value, DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedChangeRequest(
        NpgsqlConnection conn, string id, string studentId, string schoolId, string status, bool isActive, decimal credits)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "course_change_requests"("id","studentId","schoolId","courseId","credits","gradeLevel","action","status","isActive")
            VALUES(@id,@s,@school,'c1',@credits,11,'add'::"CourseChangeAction",@status::"CourseChangeStatus",@active)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("school", schoolId);
        cmd.Parameters.AddWithValue("credits", credits);
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("active", isActive);
        await cmd.ExecuteNonQueryAsync();
    }
}
