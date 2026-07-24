using FormMaps.Application.Auth;
using FormMaps.Application.College;
using FormMaps.Infrastructure.College;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.College;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="CollegeApplicationsRepository"/> (FM-DOTNET-081). Pins: list reduced
/// shape + student/active scope + createdDate DESC; checklist/essay counts are UNFILTERED by isActive (Prisma _count);
/// create name = universities lookup else collegeName else "Unknown"; enum casts persist; the create date resolver;
/// FindActiveOwner ownership; update present-only fields + column sync + NOT bounded + null-set; soft-delete.
/// </summary>
public sealed class CollegeApplicationsRepositoryTests
    : IClassFixture<CollegeApplicationsDatabaseFixture>, IAsyncLifetime
{
    private const string Student = "stu-1";

    private readonly CollegeApplicationsDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CollegeApplicationsRepositoryTests(CollegeApplicationsDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "student_applications", "application_checklists", "college_essays", "universities" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task List_reduced_shape_scoped_active_desc_with_unfiltered_counts()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await App(conn, "old", Student, name: "Old U", created: new DateTime(2026, 7, 1), appStatus: "applying", column: "applying");
        await App(conn, "new", Student, name: "New U", created: new DateTime(2026, 7, 10));
        await App(conn, "inactive", Student, isActive: false);
        await App(conn, "other", "stu-2");
        // Counts are UNFILTERED by isActive — one active + one inactive of each linked to "new".
        await Checklist(conn, "c1", "new", isActive: true);
        await Checklist(conn, "c2", "new", isActive: false);
        await Essay(conn, "e1", "new", isActive: true);
        await Essay(conn, "e2", "new", isActive: false);
        await Essay(conn, "e3", "new", isActive: true);

        var rows = await Repo().ListAsync(Ctx(), Student);

        Assert.Equal(["new", "old"], rows.Select(r => r.Id)); // active + student-scoped, createdDate DESC
        var newRow = rows[0];
        Assert.Equal("New U", newRow.CollegeName);
        Assert.Equal(2, newRow.ChecklistCount); // both checklist rows counted (isActive ignored)
        Assert.Equal(3, newRow.EssaysCount);    // all three essays counted
        Assert.Equal("applying", rows[1].AppStatus);
        Assert.Equal("applying", rows[1].Column);
    }

    [Fact]
    public async Task Create_resolves_name_from_university_then_unknown()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await University(conn, "uni-1", "Stanford University");

        var fromUni = await Repo().CreateAsync(Ctx(), Student,
            new CollegeCreateInput(Student, "uni-1", "ignored-fallback", "researching", "researching", null, null, null));
        Assert.Equal("Stanford University", fromUni.Name); // universities lookup wins over collegeName

        var fromFallback = await Repo().CreateAsync(Ctx(), Student,
            new CollegeCreateInput(Student, "missing-uni", "Fallback College", "researching", "researching", null, null, null));
        Assert.Equal("Fallback College", fromFallback.Name); // uni not found → collegeName

        var unknown = await Repo().CreateAsync(Ctx(), Student,
            new CollegeCreateInput(Student, null, null, "researching", "researching", null, null, null));
        Assert.Equal("Unknown", unknown.Name); // both null → "Unknown"
        Assert.Equal("college", unknown.Type);
    }

    [Fact]
    public async Task Create_persists_enum_cast_and_resolved_date()
    {
        var deadline = new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc);
        var row = await Repo().CreateAsync(Ctx(), Student,
            new CollegeCreateInput(Student, null, "MIT", "submitted", "applied", "early_action", "reach", deadline));

        Assert.Equal("submitted", row.AppStatus);       // CollegeAppStatus enum cast
        Assert.Equal("applied", row.Column);            // ApplicationColumn enum cast (statusToColumn)
        Assert.Equal("early_action", row.DeadlineType);
        Assert.Equal("reach", row.FitClassification);
        Assert.Equal("2026-11-01T00:00:00.000Z", row.ApplicationDeadline);
        Assert.Equal(Student, row.CreatedBy);
    }

    [Fact]
    public async Task FindActiveOwner_returns_owner_only_when_active()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await App(conn, "active", "owner-x");
        await App(conn, "inactive", "owner-y", isActive: false);

        Assert.Equal("owner-x", await Repo().FindActiveOwnerAsync(Ctx(), "active"));
        Assert.Null(await Repo().FindActiveOwnerAsync(Ctx(), "inactive")); // inactive → 404 "Application not found"
        Assert.Null(await Repo().FindActiveOwnerAsync(Ctx(), "missing"));
    }

    [Fact]
    public async Task ApplyUpdate_present_fields_column_sync_not_bounded_and_null()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await App(conn, "app", Student, name: "Orig", deadlineType: "regular", updated: new DateTime(2020, 1, 1));

        var longNotes = new string('n', 5000);
        var fields = new CollegeUpdateFields(
            HasAppStatus: true, AppStatus: "accepted", ColumnSync: true, Column: "accepted",
            HasDeadlineType: true, DeadlineTypeIsNull: true, DeadlineType: null,   // → set NULL
            HasDeadlineDate: false, ApplicationDeadline: null,
            HasFitClassification: false, FitClassificationIsNull: false, FitClassification: null,
            HasNotes: true, NotesIsNull: false, Notes: longNotes);                 // NOT bounded

        var row = await Repo().ApplyUpdateAsync(Ctx(), "editor-1", "app", fields);

        Assert.Equal("accepted", row.AppStatus);
        Assert.Equal("accepted", row.Column);     // synced from appStatus
        Assert.Null(row.DeadlineType);             // present-null → NULL
        Assert.Equal(5000, row.Notes!.Length);     // full string, no slice
        Assert.Equal("editor-1", row.UpdatedBy);
        Assert.StartsWith("2026-07-24", row.UpdatedAt); // bumped
    }

    [Fact]
    public async Task SoftDelete_sets_inactive()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await App(conn, "app", Student);

        await Repo().SoftDeleteAsync(Ctx(), "editor-1", "app");

        await using var check = new NpgsqlCommand(
            """SELECT "isActive","updatedBy" FROM "student_applications" WHERE "id"='app'""", conn);
        await using var reader = await check.ExecuteReaderAsync();
        await reader.ReadAsync();
        Assert.False(reader.GetBoolean(0));
        Assert.Equal("editor-1", reader.GetString(1));
    }

    // ---- helpers ----

    private CollegeApplicationsRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            new FixedTimeProvider(new DateTime(2026, 7, 24, 12, 0, 0, DateTimeKind.Utc)));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("caller", "school_admin", "c@e.st", "school_admin"),
            schoolId: "school-1", permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
    }

    private static async Task App(
        NpgsqlConnection conn, string id, string studentId, bool isActive = true, string name = "n",
        string? deadlineType = null, string appStatus = "researching", string column = "researching",
        DateTime? created = null, DateTime? updated = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_applications"
                ("id","studentId","name","type","deadlineType","appStatus","column","isActive","createdDate","updatedAt")
            VALUES(@id,@s,@n,'college',@dt,@as::"CollegeAppStatus",@col::"ApplicationColumn",@act,@cd,@ud)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("n", name);
        cmd.Parameters.AddWithValue("dt", (object?)deadlineType ?? DBNull.Value);
        cmd.Parameters.AddWithValue("as", appStatus);
        cmd.Parameters.AddWithValue("col", column);
        cmd.Parameters.AddWithValue("act", isActive);
        cmd.Parameters.AddWithValue("cd", DateTime.SpecifyKind(created ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
        cmd.Parameters.AddWithValue("ud", DateTime.SpecifyKind(updated ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Checklist(NpgsqlConnection conn, string id, string appId, bool isActive)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "application_checklists"("id","studentApplicationId","isActive") VALUES(@id,@a,@act)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("a", appId);
        cmd.Parameters.AddWithValue("act", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Essay(NpgsqlConnection conn, string id, string appId, bool isActive)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "college_essays"("id","studentApplicationId","isActive") VALUES(@id,@a,@act)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("a", appId);
        cmd.Parameters.AddWithValue("act", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task University(NpgsqlConnection conn, string id, string name)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "universities"("id","name") VALUES(@id,@n)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("n", name);
        await cmd.ExecuteNonQueryAsync();
    }
}
