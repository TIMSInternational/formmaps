using System.Reflection;
using FormMaps.Application.Auth;
using FormMaps.Application.StudentApplications;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.StudentApplications;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.StudentApplications;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="StudentApplicationRepository"/> (FM-DOTNET-074). Pins list scoping +
/// createdDate order; deadlines filter (deadline not null) + deadline order; get ownership; create defaults + enum
/// cast + matchScore int; update ownership + deferred InvalidBody + bounded slice + null-set + updatedAt bump; delete.
/// </summary>
public sealed class StudentApplicationRepositoryTests : IClassFixture<StudentApplicationRepositoryTests.Fixture>, IAsyncLifetime
{
    private const string Student = "student-1";

    private readonly Fixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public StudentApplicationRepositoryTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "student_applications" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task List_scopes_student_active_desc()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await App(conn, "old", Student, created: new DateTime(2026, 7, 1));
        await App(conn, "new", Student, created: new DateTime(2026, 7, 10));
        await App(conn, "inactive", Student, isActive: false);
        await App(conn, "other", "student-2");

        var rows = await Repo().ListAsync(Ctx(), Student);
        Assert.Equal(["new", "old"], rows.Select(r => r.Id));
    }

    [Fact]
    public async Task Deadlines_filters_non_null_and_orders_asc()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await App(conn, "no-deadline", Student, deadline: null);
        await App(conn, "late", Student, deadline: "2026-12-01");
        await App(conn, "early", Student, deadline: "2026-09-01");

        var rows = await Repo().ListDeadlinesAsync(Ctx(), Student);
        Assert.Equal(["early", "late"], rows.Select(r => r.Id)); // deadline ASC; no-deadline excluded
    }

    [Fact]
    public async Task Get_requires_ownership_and_active()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await App(conn, "mine", Student);
        await App(conn, "theirs", "student-2");
        await App(conn, "inactive", Student, isActive: false);

        Assert.NotNull(await Repo().GetAsync(Ctx(), Student, "mine"));
        Assert.Null(await Repo().GetAsync(Ctx(), Student, "theirs"));
        Assert.Null(await Repo().GetAsync(Ctx(), Student, "inactive"));
    }

    [Fact]
    public async Task Create_applies_defaults_and_enum()
    {
        var input = new CreateApplicationInput("Stanford", "university", false, null, true, 92, false, null, false, null, "shortlisted");
        var row = await Repo().CreateAsync(Ctx(), Student, input);

        Assert.Equal("Stanford", row.Name);
        Assert.Equal("university", row.Type);
        Assert.Equal("shortlisted", row.Column);
        Assert.Equal(92, row.MatchScore);
        Assert.Equal("researching", row.AppStatus); // DB default
        Assert.True(row.IsActive);
    }

    [Fact]
    public async Task Update_ownership_then_partial_bounded_and_deferred_invalid()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await App(conn, "mine", Student, name: "Orig", updated: new DateTime(2020, 1, 1));
        await App(conn, "theirs", "student-2");

        // Ownership: missing / not-owned → NotFound (before any type check).
        Assert.Equal(ApplicationUpdateOutcome.NotFound,
            (await Repo().UpdateAsync(Ctx(), Student, "missing", fieldsValid: true, Empty())).Outcome);
        Assert.Equal(ApplicationUpdateOutcome.NotFound,
            (await Repo().UpdateAsync(Ctx(), Student, "theirs", fieldsValid: false, Empty())).Outcome); // invalid body still 404

        // Owner + invalid body → InvalidBody.
        Assert.Equal(ApplicationUpdateOutcome.InvalidBody,
            (await Repo().UpdateAsync(Ctx(), Student, "mine", fieldsValid: false, Empty())).Outcome);

        // Partial: name (bounded 200) + column enum; type untouched; updatedAt bumped.
        var longName = new string('n', 250);
        var fields = new ApplicationUpdateFields(
            true, longName, false, null, false, false, null, false, false, null,
            false, false, null, false, false, null, true, "applied");
        var result = await Repo().UpdateAsync(Ctx(), Student, "mine", fieldsValid: true, fields);
        Assert.Equal(ApplicationUpdateOutcome.Ok, result.Outcome);
        Assert.Equal(200, result.Row!.Name.Length);   // bounded slice
        Assert.Equal("applied", result.Row.Column);
        Assert.StartsWith("2026-07-23", result.Row.UpdatedAt);
    }

    [Fact]
    public async Task Update_sets_nullable_to_null()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await App(conn, "mine", Student, matchScore: 50, deadline: "2026-09-01");

        var fields = new ApplicationUpdateFields(
            false, null, false, null, false, false, null, true, true, null, // matchScore → NULL
            true, true, null, false, false, null, false, null);            // deadline → NULL
        var result = await Repo().UpdateAsync(Ctx(), Student, "mine", fieldsValid: true, fields);
        Assert.Equal(ApplicationUpdateOutcome.Ok, result.Outcome);
        Assert.Null(result.Row!.MatchScore);
        Assert.Null(result.Row.Deadline);
    }

    [Fact]
    public async Task SoftDelete_requires_ownership()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await App(conn, "mine", Student);
        await App(conn, "theirs", "student-2");

        Assert.False(await Repo().SoftDeleteAsync(Ctx(), Student, "missing"));
        Assert.False(await Repo().SoftDeleteAsync(Ctx(), Student, "theirs"));
        Assert.True(await Repo().SoftDeleteAsync(Ctx(), Student, "mine"));

        await using var check = new NpgsqlCommand("""SELECT "isActive" FROM "student_applications" WHERE "id"='mine'""", conn);
        Assert.False((bool)(await check.ExecuteScalarAsync())!);
    }

    // ---- helpers ----

    private static ApplicationUpdateFields Empty() =>
        new(false, null, false, null, false, false, null, false, false, null, false, false, null, false, false, null, false, null);

    private StudentApplicationRepository Repo() =>
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

    private static async Task App(
        NpgsqlConnection conn, string id, string studentId, bool isActive = true, string name = "n",
        int? matchScore = null, string? deadline = null, DateTime? created = null, DateTime? updated = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_applications"("id","studentId","name","type","matchScore","deadline","isActive","createdDate","updatedAt")
            VALUES(@id,@s,@n,'university',@ms,@d,@act,@cd,@ud)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("n", name);
        cmd.Parameters.AddWithValue("ms", (object?)matchScore ?? DBNull.Value);
        cmd.Parameters.AddWithValue("d", (object?)deadline ?? DBNull.Value);
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
            var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("student-applications-schema.sql", StringComparison.Ordinal));
            await using var stream = assembly.GetManifestResourceStream(name)!;
            using var sr = new StreamReader(stream);
            await using var cmd = new NpgsqlCommand(await sr.ReadToEndAsync(), connection);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task DisposeAsync() => await _container.DisposeAsync();
    }
}
