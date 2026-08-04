using System.Reflection;
using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Infrastructure.Counselor;
using FormMaps.Infrastructure.Data;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Counselor;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="CounselorNotesRepository"/> (FM-DOTNET-072). Pins the access check,
/// list scoping (studentId + active, type filter, createdDate DESC + id tie, author-name join), create, the partial
/// update + deferred InvalidBody + always-bumped updatedAt, soft-delete role asymmetry, and complete-followup.
/// </summary>
public sealed class CounselorNotesRepositoryTests : IClassFixture<CounselorNotesRepositoryTests.Fixture>, IAsyncLifetime
{
    private const string Counselor = "counselor-1";

    private readonly Fixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CounselorNotesRepositoryTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "users","counselor_student_assignments","counselor_notes" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Access_check_honours_active_assignment_only()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Assignment(conn, "a1", Counselor, "s1", isActive: true);
        await Assignment(conn, "a2", Counselor, "s2", isActive: false);

        Assert.True(await Repo().HasCounselorStudentAccessAsync(Ctx(), Counselor, "s1"));
        Assert.False(await Repo().HasCounselorStudentAccessAsync(Ctx(), Counselor, "s2")); // inactive
        Assert.False(await Repo().HasCounselorStudentAccessAsync(Ctx(), Counselor, "s3")); // none
    }

    [Fact]
    public async Task List_scopes_student_active_orders_desc_joins_author_and_filters_type()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Counselor, "Author");
        await Note(conn, "old", "s1", Counselor, type: "general", created: new DateTime(2026, 7, 1));
        await Note(conn, "new", "s1", Counselor, type: "academic", created: new DateTime(2026, 7, 10));
        await Note(conn, "inactive", "s1", Counselor, isActive: false);   // excluded
        await Note(conn, "other-student", "s2", Counselor);               // excluded

        var all = await Repo().ListAsync(Ctx(), "s1", typeFilter: null, page: 1, limit: 20);
        Assert.Equal(2, all.Total);
        Assert.Equal(["new", "old"], all.Data.Select(n => n.Note.Id)); // createdDate DESC
        Assert.Equal("Author", all.Data[0].AuthorName);                 // join

        var academic = await Repo().ListAsync(Ctx(), "s1", typeFilter: "academic", page: 1, limit: 20);
        Assert.Equal(1, academic.Total);
        Assert.Equal("new", academic.Data.Single().Note.Id);
    }

    [Fact]
    public async Task List_ties_on_createdDate_break_by_id_asc()
    {
        // Documented determinism superset (FM-032 precedent): Prisma emits only createdDate DESC, leaving equal-ms
        // rows arbitrarily ordered; the port adds id ASC as a stable tie-break. Red-if-regressed.
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Counselor, "Author");
        var tie = new DateTime(2026, 7, 5, 9, 0, 0);
        await Note(conn, "b-note", "s1", Counselor, created: tie);
        await Note(conn, "a-note", "s1", Counselor, created: tie);

        var result = await Repo().ListAsync(Ctx(), "s1", typeFilter: null, page: 1, limit: 20);
        Assert.Equal(["a-note", "b-note"], result.Data.Select(n => n.Note.Id)); // id ASC on the createdDate tie
    }

    [Fact]
    public async Task Create_persists_fields_and_returns_row()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        var input = new CreateNoteInput("academic", "hello", IsPrivate: true,
            FollowUpDate: new DateTime(2026, 8, 1, 0, 0, 0, DateTimeKind.Utc), Tags: ["x", "y"]);

        await User(conn, Counselor, "Ada Counselor");

        var created = await Repo().CreateAsync(Ctx(), "s1", Counselor, input);

        // The author name comes back with the insert, so the create response is
        // shape-identical to a listed row (formmaps#89). Asserted against a seeded name
        // rather than merely non-empty, so a join that silently returned the wrong row
        // would still fail.
        Assert.Equal("Ada Counselor", created.AuthorName);

        var row = created.Note;
        Assert.Equal("s1", row.StudentId);
        Assert.Equal(Counselor, row.AuthorId);
        Assert.Equal("academic", row.Type);
        Assert.Equal("hello", row.Content);
        Assert.True(row.IsPrivate);
        Assert.Equal(["x", "y"], row.Tags);
        Assert.False(row.FollowUpCompleted);
        Assert.NotNull(row.FollowUpDate);
        Assert.False(string.IsNullOrEmpty(row.Id));
    }

    [Fact]
    public async Task Create_still_succeeds_when_the_author_row_is_not_joinable()
    {
        // The INSERT has already happened by the time the author join runs. With an INNER
        // join a miss yields zero rows and the caller gets a 500 for a note that WAS
        // created — the client then rolls back its optimistic row and the user writes the
        // note again, producing duplicates. The join is LEFT so this degrades to a null
        // name instead. No users row is seeded here, which is exactly that case.
        await using var conn = await _dataSource.OpenConnectionAsync();
        var input = new CreateNoteInput("general", "orphan", IsPrivate: false,
            FollowUpDate: null, Tags: []);

        var created = await Repo().CreateAsync(Ctx(), "s1", "ghost-author", input);

        Assert.Null(created.AuthorName);
        Assert.Equal("orphan", created.Note.Content);
        Assert.False(string.IsNullOrEmpty(created.Note.Id));
    }

    [Fact]
    public async Task Update_requires_ownership_then_partial_writes_and_bumps_updatedAt()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Note(conn, "mine", "s1", Counselor, type: "general", content: "orig",
            updated: new DateTime(2020, 1, 1));
        await Note(conn, "theirs", "s1", "counselor-2");

        Assert.Equal(UpdateNoteOutcome.NotAuthorized,
            (await Repo().UpdateAsync(Ctx(), "missing", Counselor, fieldsValid: true, Empty())).Outcome);
        Assert.Equal(UpdateNoteOutcome.NotAuthorized,
            (await Repo().UpdateAsync(Ctx(), "theirs", Counselor, fieldsValid: true, Empty())).Outcome);

        // A bad-type body is rejected only AFTER ownership passes (InvalidBody), and never for a non-owner.
        Assert.Equal(UpdateNoteOutcome.NotAuthorized,
            (await Repo().UpdateAsync(Ctx(), "theirs", Counselor, fieldsValid: false, Empty())).Outcome);
        Assert.Equal(UpdateNoteOutcome.InvalidBody,
            (await Repo().UpdateAsync(Ctx(), "mine", Counselor, fieldsValid: false, Empty())).Outcome);

        // Partial update: only content present → type untouched, updatedAt bumped.
        var fields = new UpdateNoteFields(false, null, true, "changed", false, false, false, null, false, null);
        var result = await Repo().UpdateAsync(Ctx(), "mine", Counselor, fieldsValid: true, fields);
        Assert.Equal(UpdateNoteOutcome.Ok, result.Outcome);
        Assert.Equal("changed", result.Row!.Content);
        Assert.Equal("general", result.Row.Type);          // untouched
        Assert.StartsWith("2026-07-23", result.Row.UpdatedAt); // bumped to the fixed clock
    }

    [Fact]
    public async Task SoftDelete_role_asymmetry()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Note(conn, "mine", "s1", Counselor);
        await Note(conn, "theirs", "s1", "counselor-2");

        // Missing → NotAuthorized.
        Assert.Equal(SimpleWriteOutcome.NotAuthorized,
            await Repo().SoftDeleteAsync(Ctx(), "missing", Counselor, callerIsCounselor: true));
        // A counselor cannot delete another author's note.
        Assert.Equal(SimpleWriteOutcome.NotAuthorized,
            await Repo().SoftDeleteAsync(Ctx(), "theirs", Counselor, callerIsCounselor: true));
        // A non-counselor (school_admin / Super Admin) may delete any note.
        Assert.Equal(SimpleWriteOutcome.Ok,
            await Repo().SoftDeleteAsync(Ctx(), "theirs", "admin-1", callerIsCounselor: false));
        // The author may delete their own note.
        Assert.Equal(SimpleWriteOutcome.Ok,
            await Repo().SoftDeleteAsync(Ctx(), "mine", Counselor, callerIsCounselor: true));

        Assert.False(await IsActive(conn, "mine"));
        Assert.False(await IsActive(conn, "theirs"));
    }

    [Fact]
    public async Task CompleteFollowUp_requires_ownership_then_marks_complete()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Note(conn, "mine", "s1", Counselor);
        await Note(conn, "theirs", "s1", "counselor-2");

        Assert.True((await Repo().CompleteFollowUpAsync(Ctx(), "missing", Counselor)).NotAuthorized);
        Assert.True((await Repo().CompleteFollowUpAsync(Ctx(), "theirs", Counselor)).NotAuthorized);

        var ok = await Repo().CompleteFollowUpAsync(Ctx(), "mine", Counselor);
        Assert.False(ok.NotAuthorized);
        Assert.Equal("mine", ok.Data!.Id);
        Assert.True(ok.Data.FollowUpCompleted);
        Assert.NotNull(ok.Data.FollowUpCompletedAt);
    }

    // ---- helpers ----

    private static UpdateNoteFields Empty() =>
        new(false, null, false, null, false, false, false, null, false, null);

    private CounselorNotesRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            new FixedTimeProvider(new DateTime(2026, 7, 23, 12, 0, 0, DateTimeKind.Utc)));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(Counselor, "counselor", "c@e.st", "Counselor"),
            schoolId: "school-1", permissions: new[] { "counselor:notes" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
    }

    private static async Task<bool> IsActive(NpgsqlConnection conn, string id)
    {
        await using var cmd = new NpgsqlCommand("""SELECT "isActive" FROM "counselor_notes" WHERE "id"=@id""", conn);
        cmd.Parameters.AddWithValue("id", id);
        return (bool)(await cmd.ExecuteScalarAsync())!;
    }

    private static async Task User(NpgsqlConnection conn, string id, string? name)
    {
        await using var cmd = new NpgsqlCommand("""INSERT INTO "users"("id","name") VALUES(@id,@n)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("n", (object?)name ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Assignment(NpgsqlConnection conn, string id, string counselorId, string studentId, bool isActive)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "counselor_student_assignments"("id","counselorId","studentId","isActive") VALUES(@id,@c,@s,@a)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("c", counselorId);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Note(
        NpgsqlConnection conn, string id, string studentId, string authorId, bool isActive = true,
        string type = "general", string content = "c", DateTime? created = null, DateTime? updated = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "counselor_notes"("id","studentId","authorId","type","content","isActive","createdDate","updatedAt")
            VALUES(@id,@s,@a,@t,@c,@act,@cd,@ud)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("a", authorId);
        cmd.Parameters.AddWithValue("t", type);
        cmd.Parameters.AddWithValue("c", content);
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
            var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("counselor-notes-schema.sql", StringComparison.Ordinal));
            await using var stream = assembly.GetManifestResourceStream(name)!;
            using var sr = new StreamReader(stream);
            await using var cmd = new NpgsqlCommand(await sr.ReadToEndAsync(), connection);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task DisposeAsync() => await _container.DisposeAsync();
    }
}
