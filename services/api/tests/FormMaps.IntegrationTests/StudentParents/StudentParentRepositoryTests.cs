using System.Reflection;
using FormMaps.Application.Auth;
using FormMaps.Application.StudentParents;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.StudentParents;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.StudentParents;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="StudentParentRepository"/> (FM-DOTNET-076). Pins list scoping +
/// order; create (token minted, id returned) + the unique (studentId, parentEmail) → Duplicate; delete ownership;
/// resend ownership + token regeneration.
/// </summary>
public sealed class StudentParentRepositoryTests : IClassFixture<StudentParentRepositoryTests.Fixture>, IAsyncLifetime
{
    private const string Student = "student-1";

    private readonly Fixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public StudentParentRepositoryTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "student_parent_links" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task List_scopes_student_active_desc()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Link(conn, "old", Student, "a@x.com", created: new DateTime(2026, 7, 1));
        await Link(conn, "new", Student, "b@x.com", created: new DateTime(2026, 7, 10));
        await Link(conn, "inactive", Student, "c@x.com", isActive: false);
        await Link(conn, "other", "student-2", "d@x.com");

        var rows = await Repo().ListAsync(Ctx(), Student);
        Assert.Equal(["new", "old"], rows.Select(r => r.Id));
    }

    [Fact]
    public async Task Create_mints_token_and_returns_id()
    {
        var result = await Repo().CreateInviteAsync(Ctx(), Student, "mom@example.com", "Mom", "parent");
        Assert.False(result.Duplicate);
        Assert.False(string.IsNullOrEmpty(result.Id));
        Assert.False(string.IsNullOrEmpty(result.Token));

        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var check = new NpgsqlCommand("""SELECT "parentEmail","invitationToken","invitedBy","tokenExpiresAt" FROM "student_parent_links" WHERE "id"=@id""", conn);
        check.Parameters.AddWithValue("id", result.Id!);
        await using var reader = await check.ExecuteReaderAsync();
        await reader.ReadAsync();
        Assert.Equal("mom@example.com", reader.GetString(0));
        Assert.Equal(result.Token, reader.GetString(1));
        Assert.Equal(Student, reader.GetString(2));    // invitedBy = caller
        Assert.False(reader.IsDBNull(3));               // tokenExpiresAt set
    }

    [Fact]
    public async Task Create_duplicate_email_is_Duplicate()
    {
        Assert.False((await Repo().CreateInviteAsync(Ctx(), Student, "dup@example.com", "", "parent")).Duplicate);
        var second = await Repo().CreateInviteAsync(Ctx(), Student, "dup@example.com", "", "parent");
        Assert.True(second.Duplicate); // unique (studentId, parentEmail)
    }

    [Fact]
    public async Task Delete_requires_ownership()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Link(conn, "mine", Student, "a@x.com");
        await Link(conn, "theirs", "student-2", "b@x.com");

        await Link(conn, "mine-inactive", Student, "e@x.com", isActive: false); // gate is ownership-only (no isActive)

        Assert.False(await Repo().DeleteLinkAsync(Ctx(), Student, "missing"));
        Assert.False(await Repo().DeleteLinkAsync(Ctx(), Student, "theirs"));
        Assert.True(await Repo().DeleteLinkAsync(Ctx(), Student, "mine"));
        Assert.True(await Repo().DeleteLinkAsync(Ctx(), Student, "mine-inactive")); // already inactive + owned → still true

        await using var check = new NpgsqlCommand("""SELECT "isActive" FROM "student_parent_links" WHERE "id"='mine'""", conn);
        Assert.False((bool)(await check.ExecuteScalarAsync())!);
    }

    [Fact]
    public async Task Resend_requires_ownership_and_regenerates_token()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Link(conn, "mine", Student, "a@x.com", token: "old-token");
        await Link(conn, "theirs", "student-2", "b@x.com");

        Assert.Null(await Repo().ResendAsync(Ctx(), Student, "missing"));
        Assert.Null(await Repo().ResendAsync(Ctx(), Student, "theirs"));

        var newToken = await Repo().ResendAsync(Ctx(), Student, "mine");
        Assert.False(string.IsNullOrEmpty(newToken));
        Assert.NotEqual("old-token", newToken);

        await using var check = new NpgsqlCommand("""SELECT "invitationToken" FROM "student_parent_links" WHERE "id"='mine'""", conn);
        Assert.Equal(newToken, (string)(await check.ExecuteScalarAsync())!);
    }

    // ---- helpers ----

    private StudentParentRepository Repo() =>
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

    private static async Task Link(
        NpgsqlConnection conn, string id, string studentId, string parentEmail, bool isActive = true,
        string? token = null, DateTime? created = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_parent_links"("id","studentId","parentEmail","invitationToken","isActive","createdDate","updatedAt")
            VALUES(@id,@s,@e,@t,@act,@cd,@ud)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("e", parentEmail);
        cmd.Parameters.AddWithValue("t", (object?)token ?? DBNull.Value);
        cmd.Parameters.AddWithValue("act", isActive);
        cmd.Parameters.AddWithValue("cd", DateTime.SpecifyKind(created ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
        cmd.Parameters.AddWithValue("ud", DateTime.SpecifyKind(new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
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
            var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("student-parents-schema.sql", StringComparison.Ordinal));
            await using var stream = assembly.GetManifestResourceStream(name)!;
            using var sr = new StreamReader(stream);
            await using var cmd = new NpgsqlCommand(await sr.ReadToEndAsync(), connection);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task DisposeAsync() => await _container.DisposeAsync();
    }
}
