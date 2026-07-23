using System.Reflection;
using FormMaps.Application.Auth;
using FormMaps.Application.StudentPortfolio;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.StudentPortfolio;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.StudentPortfolio;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="StudentPortfolioRepository"/> (FM-DOTNET-073). Pins list scoping +
/// createdDate/id order + type filter; the summary aggregate (byType, non-null hour sums, volunteer-only totalHours,
/// skills union, categories); create defaults + Decimal trim_scale string + enum; update ownership + partial + the
/// bounded() slice + updatedAt bump; and soft-delete ownership.
/// </summary>
public sealed class StudentPortfolioRepositoryTests : IClassFixture<StudentPortfolioRepositoryTests.Fixture>, IAsyncLifetime
{
    private const string Student = "student-1";

    private readonly Fixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public StudentPortfolioRepositoryTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "student_portfolio_items" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task List_scopes_student_active_orders_desc_and_filters_type()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Item(conn, "old", Student, type: "activity", created: new DateTime(2026, 7, 1));
        await Item(conn, "new", Student, type: "volunteer", created: new DateTime(2026, 7, 10));
        await Item(conn, "inactive", Student, isActive: false);
        await Item(conn, "other", "student-2");

        var all = await Repo().ListAsync(Ctx(), Student, type: null, page: 1, limit: 20);
        Assert.Equal(2, all.Total);
        Assert.Equal(["new", "old"], all.Data.Select(r => r.Id));

        var filtered = await Repo().ListAsync(Ctx(), Student, type: "volunteer", page: 1, limit: 20);
        Assert.Equal(1, filtered.Total);
        Assert.Equal("new", filtered.Data.Single().Id);
    }

    [Fact]
    public async Task Summary_aggregates_types_hours_skills()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Item(conn, "a", Student, type: "volunteer", hoursPerWeek: 5m, totalHours: 20m, skills: ["x", "y"], created: new DateTime(2026, 1, 1));
        await Item(conn, "b", Student, type: "volunteer", hoursPerWeek: 3m, totalHours: null, skills: ["y", "z"], created: new DateTime(2026, 1, 2));
        await Item(conn, "c", Student, type: "work", hoursPerWeek: null, totalHours: 10m, skills: [], created: new DateTime(2026, 1, 3));
        await Item(conn, "inactive", Student, type: "work", isActive: false);

        var s = await Repo().GetSummaryAsync(Ctx(), Student);

        Assert.Equal(3, s.TotalItems);
        Assert.Equal(2, s.ByType["volunteer"]);
        Assert.Equal(1, s.ByType["work"]);
        Assert.Equal(8.0, s.TotalHoursPerWeek);       // 5 + 3 (c null skipped)
        Assert.Equal(20.0, s.TotalVolunteerHours);    // a(20) + b(null→0); c is "work" (excluded)
        Assert.Equal(["x", "y", "z"], s.Skills);      // union, first-seen order
        Assert.Equal(2, s.Categories);
    }

    [Fact]
    public async Task Create_applies_defaults_and_round_trips_decimals()
    {
        var input = new PortfolioInput(
            false, null, true, "Robotics Club", false, null, false, null, false, null,
            true, true, false, null, false, null, true, 5.5m, false, null,
            false, null, true, 40m, true, ["lead"], true, ["c#", "welding"]);

        var row = await Repo().CreateAsync(Ctx(), Student, input);

        Assert.Equal("activity", row.Type);           // || "activity" (absent)
        Assert.Equal("Robotics Club", row.Title);
        Assert.True(row.IsCurrent);
        Assert.Equal("5.5", row.HoursPerWeek);         // Decimal trim_scale::text
        Assert.Equal("40", row.TotalHours);            // trailing zeros trimmed
        Assert.Equal(["lead"], row.Achievements);
        Assert.Equal("other", row.ActivityCategory);   // absent enum → DB default 'other'
        Assert.False(row.IsActive == false);           // default true
    }

    [Fact]
    public async Task Create_sets_explicit_enum_and_nullable_absent()
    {
        var input = Minimal("Art") with { HasActivityCategory = true, ActivityCategory = "arts" };
        var row = await Repo().CreateAsync(Ctx(), Student, input);
        Assert.Equal("arts", row.ActivityCategory);
        Assert.Null(row.HoursPerWeek);   // absent → null
        Assert.Null(row.Organization);
        Assert.Empty(row.Skills);        // absent → [] (default)
    }

    [Fact]
    public async Task Update_requires_ownership_then_partial_writes_and_bumps_updatedAt()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Item(conn, "mine", Student, type: "activity", title: "Orig", updated: new DateTime(2020, 1, 1));
        await Item(conn, "theirs", "student-2");

        Assert.Null(await Repo().UpdateAsync(Ctx(), Student, "missing", Minimal("x")));
        Assert.Null(await Repo().UpdateAsync(Ctx(), Student, "theirs", Minimal("x")));

        // Partial: only title present → type untouched, updatedAt bumped.
        var input = new PortfolioInput(
            false, null, true, "Updated", false, null, false, null, false, null,
            false, false, false, null, false, null, false, null, false, null,
            false, null, false, null, false, null, false, null);
        var row = await Repo().UpdateAsync(Ctx(), Student, "mine", input);
        Assert.NotNull(row);
        Assert.Equal("Updated", row!.Title);
        Assert.Equal("activity", row.Type);              // untouched
        Assert.StartsWith("2026-07-23", row.UpdatedAt);  // bumped to the fixed clock
    }

    [Fact]
    public async Task Update_applies_bounded_slice_on_unbounded_type()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Item(conn, "mine", Student);

        // type has no zod max but bounded() slices it to 50.
        var longType = new string('t', 60);
        var input = Minimal("t") with { HasTitle = false, Title = null, HasType = true, Type = longType };
        var row = await Repo().UpdateAsync(Ctx(), Student, "mine", input);
        Assert.NotNull(row);
        Assert.Equal(50, row!.Type.Length);
    }

    [Fact]
    public async Task SoftDelete_requires_ownership()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Item(conn, "mine", Student);
        await Item(conn, "theirs", "student-2");

        Assert.False(await Repo().SoftDeleteAsync(Ctx(), Student, "missing"));
        Assert.False(await Repo().SoftDeleteAsync(Ctx(), Student, "theirs"));
        Assert.True(await Repo().SoftDeleteAsync(Ctx(), Student, "mine"));

        await using var check = new NpgsqlCommand("""SELECT "isActive" FROM "student_portfolio_items" WHERE "id"='mine'""", conn);
        Assert.False((bool)(await check.ExecuteScalarAsync())!);
    }

    // ---- helpers ----

    private static PortfolioInput Minimal(string title) => new(
        false, null, true, title, false, null, false, null, false, null,
        false, false, false, null, false, null, false, null, false, null,
        false, null, false, null, false, null, false, null);

    private StudentPortfolioRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            new FixedTimeProvider(new DateTime(2026, 7, 23, 12, 0, 0, DateTimeKind.Utc)));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(Student, "student", "s@e.st", "Student"),
            schoolId: "school-1", permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
    }

    private static async Task Item(
        NpgsqlConnection conn, string id, string studentId, bool isActive = true, string type = "activity",
        string title = "t", decimal? hoursPerWeek = null, decimal? totalHours = null, string[]? skills = null,
        DateTime? created = null, DateTime? updated = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_portfolio_items"
                ("id","studentId","type","title","hoursPerWeek","totalHours","skills","isActive","createdDate","updatedAt")
            VALUES(@id,@s,@t,@title,@hpw,@total,@skills,@act,@cd,@ud)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("t", type);
        cmd.Parameters.AddWithValue("title", title);
        cmd.Parameters.AddWithValue("hpw", (object?)hoursPerWeek ?? DBNull.Value);
        cmd.Parameters.AddWithValue("total", (object?)totalHours ?? DBNull.Value);
        cmd.Parameters.AddWithValue("skills", (object)(skills ?? Array.Empty<string>()));
        cmd.Parameters.AddWithValue("act", isActive);
        cmd.Parameters.AddWithValue("cd", DateTime.SpecifyKind(created ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
        cmd.Parameters.AddWithValue("ud", DateTime.SpecifyKind(updated ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
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
            var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("student-portfolio-schema.sql", StringComparison.Ordinal));
            await using var stream = assembly.GetManifestResourceStream(name)!;
            using var sr = new StreamReader(stream);
            await using var cmd = new NpgsqlCommand(await sr.ReadToEndAsync(), connection);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task DisposeAsync() => await _container.DisposeAsync();
    }
}
