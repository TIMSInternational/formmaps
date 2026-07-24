using System.Reflection;
using FormMaps.Application.Auth;
using FormMaps.Application.StudentApplicationSubResources;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.StudentApplicationSubResources;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.StudentApplicationSubResources;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="ApplicationSubResourceRepository"/> (FM-DOTNET-077). Pins the parent
/// ownership gate (missing / not-owned app → NotFound before any type check; essay/item of another app → *NotFound),
/// the deferred InvalidBody (owner + invalid → 500 after both 404 gates), create defaults + dueDate storage, list
/// scoping + ordering, the essay bounded() slice, the draftVersion bump (changed vs unchanged currentDraft), and the
/// checklist completedAt set/clear transition. Corpus #28 (uniform-404 non-leak) is pinned by the not-owned paths.
/// </summary>
public sealed class ApplicationSubResourceRepositoryTests
    : IClassFixture<ApplicationSubResourceRepositoryTests.Fixture>, IAsyncLifetime
{
    private const string Student = "student-1";

    private readonly Fixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public ApplicationSubResourceRepositoryTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "student_applications", "application_essays", "application_checklists" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- essays: create ----

    [Fact]
    public async Task CreateEssay_ownership_then_defaults_and_dueDate()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await App(conn, "mine", Student);
        await App(conn, "theirs", "student-2");

        // Missing / not-owned app → NotFound (before the valid check — invalid body still 404).
        Assert.Equal(SubResourceCreateOutcome.NotFound,
            (await Repo().CreateEssayAsync(Ctx(), Student, "missing", EssayInput(), valid: true)).Outcome);
        Assert.Equal(SubResourceCreateOutcome.NotFound,
            (await Repo().CreateEssayAsync(Ctx(), Student, "theirs", EssayInput(), valid: false)).Outcome);

        // Owner + invalid → InvalidBody (deferred past ownership).
        Assert.Equal(SubResourceCreateOutcome.InvalidBody,
            (await Repo().CreateEssayAsync(Ctx(), Student, "mine", EssayInput(), valid: false)).Outcome);

        // Owner + valid → Ok + create-time defaults.
        var due = new DateTime(2026, 5, 1, 0, 0, 0, DateTimeKind.Utc);
        var result = await Repo().CreateEssayAsync(
            Ctx(), Student, "mine", new CreateEssayInput("Why us", null, 650, due), valid: true);
        Assert.Equal(SubResourceCreateOutcome.Ok, result.Outcome);
        Assert.Equal("Why us", result.Row!.Title);
        Assert.Equal(650, result.Row.WordLimit);
        Assert.Equal(1, result.Row.DraftVersion);          // DB default
        Assert.Equal("not_started", result.Row.Status);    // DB default
        Assert.True(result.Row.IsActive);
        Assert.Equal("2026-05-01T00:00:00.000Z", result.Row.DueDate);
    }

    // ---- essays: list ----

    [Fact]
    public async Task ListEssays_scopes_and_orders_createdDate_asc()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await App(conn, "mine", Student);
        await App(conn, "theirs", "student-2");
        await Essay(conn, "old", "mine", created: new DateTime(2026, 1, 1));
        await Essay(conn, "new", "mine", created: new DateTime(2026, 2, 1));
        await Essay(conn, "inactive", "mine", isActive: false);
        await Essay(conn, "elsewhere", "theirs");

        Assert.Null(await Repo().ListEssaysAsync(Ctx(), Student, "theirs")); // not owned → 404
        var rows = await Repo().ListEssaysAsync(Ctx(), Student, "mine");
        Assert.Equal(["old", "new"], rows!.Select(r => r.Id)); // createdDate ASC; inactive excluded
    }

    // ---- essays: update ----

    [Fact]
    public async Task UpdateEssay_app_then_essay_then_deferred_invalid()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await App(conn, "mine", Student);
        await App(conn, "theirs", "student-2");
        await App(conn, "mine2", Student);
        await Essay(conn, "e-mine", "mine", currentDraft: "orig", updated: new DateTime(2020, 1, 1));
        await Essay(conn, "e-other-app", "mine2");
        await Essay(conn, "e-theirs", "theirs");

        // Not-owned app → AppNotFound (even with invalid body).
        Assert.Equal(EssayUpdateOutcome.AppNotFound,
            (await Repo().UpdateEssayAsync(Ctx(), Student, "theirs", "e-theirs", valid: false, EmptyEssay())).Outcome);
        // Owned app, but essay belongs to a different app → EssayNotFound.
        Assert.Equal(EssayUpdateOutcome.EssayNotFound,
            (await Repo().UpdateEssayAsync(Ctx(), Student, "mine", "e-other-app", valid: true, EmptyEssay())).Outcome);
        // Missing essay → EssayNotFound.
        Assert.Equal(EssayUpdateOutcome.EssayNotFound,
            (await Repo().UpdateEssayAsync(Ctx(), Student, "mine", "missing", valid: true, EmptyEssay())).Outcome);
        // Owner + existing essay + invalid → InvalidBody (deferred past both 404s).
        Assert.Equal(EssayUpdateOutcome.InvalidBody,
            (await Repo().UpdateEssayAsync(Ctx(), Student, "mine", "e-mine", valid: false, EmptyEssay())).Outcome);
    }

    [Fact]
    public async Task UpdateEssay_bounded_slice_and_draftVersion_bump()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await App(conn, "mine", Student);
        await Essay(conn, "e", "mine", currentDraft: "orig", draftVersion: 3, updated: new DateTime(2020, 1, 1));

        // currentDraft CHANGED → draftVersion bumps 3→4; title bounded to 200.
        var longTitle = new string('t', 250);
        var changed = new EssayUpdateFields(
            true, longTitle, false, false, null, false, false, null,
            true, false, "new draft", false, null, false, false, null);
        var r1 = await Repo().UpdateEssayAsync(Ctx(), Student, "mine", "e", valid: true, changed);
        Assert.Equal(EssayUpdateOutcome.Ok, r1.Outcome);
        Assert.Equal(200, r1.Row!.Title.Length);
        Assert.Equal("new draft", r1.Row.CurrentDraft);
        Assert.Equal(4, r1.Row.DraftVersion);
        Assert.StartsWith("2026-07-23", r1.Row.UpdatedAt);

        // currentDraft UNCHANGED (== stored "new draft") → NO bump (stays 4).
        var unchanged = new EssayUpdateFields(
            false, null, false, false, null, false, false, null,
            true, false, "new draft", false, null, false, false, null);
        var r2 = await Repo().UpdateEssayAsync(Ctx(), Student, "mine", "e", valid: true, unchanged);
        Assert.Equal(4, r2.Row!.DraftVersion);
    }

    [Fact]
    public async Task UpdateEssay_nullable_set_null_and_dueDate()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await App(conn, "mine", Student);
        await Essay(conn, "e", "mine", prompt: "had a prompt");

        var fields = new EssayUpdateFields(
            false, null, true, true, null, false, false, null,       // prompt → NULL
            false, false, null, false, null,
            true, false, new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc)); // dueDate set
        var r = await Repo().UpdateEssayAsync(Ctx(), Student, "mine", "e", valid: true, fields);
        Assert.Equal(EssayUpdateOutcome.Ok, r.Outcome);
        Assert.Null(r.Row!.Prompt);
        Assert.Equal("2026-06-01T00:00:00.000Z", r.Row.DueDate);
    }

    // ---- checklist ----

    [Fact]
    public async Task CreateChecklist_defaults()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await App(conn, "mine", Student);

        var r = await Repo().CreateChecklistAsync(
            Ctx(), Student, "mine", new CreateChecklistInput("Transcript", "other", null, null), valid: true);
        Assert.Equal(SubResourceCreateOutcome.Ok, r.Outcome);
        Assert.Equal("Transcript", r.Row!.ItemName);
        Assert.Equal("other", r.Row.Category);
        Assert.False(r.Row.IsCompleted);
        Assert.Null(r.Row.CompletedAt);
    }

    [Fact]
    public async Task ListChecklist_orders_category_then_createdDate()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await App(conn, "mine", Student);
        await Checklist(conn, "t2", "mine", category: "transcripts", created: new DateTime(2026, 2, 1));
        await Checklist(conn, "t1", "mine", category: "transcripts", created: new DateTime(2026, 1, 1));
        await Checklist(conn, "f1", "mine", category: "financial_aid", created: new DateTime(2026, 3, 1));
        await Checklist(conn, "inactive", "mine", category: "other", isActive: false);

        var rows = await Repo().ListChecklistAsync(Ctx(), Student, "mine");
        // category ASC (financial_aid < transcripts) then createdDate ASC within category.
        Assert.Equal(["f1", "t1", "t2"], rows!.Select(r => r.Id));
    }

    [Fact]
    public async Task UpdateChecklist_completedAt_set_and_clear()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await App(conn, "mine", Student);
        await App(conn, "mine2", Student);
        await Checklist(conn, "c", "mine", isCompleted: false);
        await Checklist(conn, "c-other", "mine2");

        // Item under a different owned app → ItemNotFound.
        Assert.Equal(ChecklistUpdateOutcome.ItemNotFound,
            (await Repo().UpdateChecklistAsync(Ctx(), Student, "mine", "c-other", valid: true, EmptyChecklist())).Outcome);

        // false → true: completedAt set to now.
        var complete = new ChecklistUpdateFields(true, true, false, null, false, null, false, false, null, false, false, null);
        var r1 = await Repo().UpdateChecklistAsync(Ctx(), Student, "mine", "c", valid: true, complete);
        Assert.Equal(ChecklistUpdateOutcome.Ok, r1.Outcome);
        Assert.True(r1.Row!.IsCompleted);
        Assert.StartsWith("2026-07-23", r1.Row.CompletedAt);

        // true → false: completedAt cleared.
        var uncomplete = new ChecklistUpdateFields(true, false, false, null, false, null, false, false, null, false, false, null);
        var r2 = await Repo().UpdateChecklistAsync(Ctx(), Student, "mine", "c", valid: true, uncomplete);
        Assert.False(r2.Row!.IsCompleted);
        Assert.Null(r2.Row.CompletedAt);
    }

    // ---- helpers ----

    private static CreateEssayInput EssayInput() => new("Title", null, null, null);

    private static EssayUpdateFields EmptyEssay() =>
        new(false, null, false, false, null, false, false, null, false, false, null, false, null, false, false, null);

    private static ChecklistUpdateFields EmptyChecklist() =>
        new(false, false, false, null, false, null, false, false, null, false, false, null);

    private ApplicationSubResourceRepository Repo() =>
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

    private static async Task App(NpgsqlConnection conn, string id, string studentId, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "student_applications"("id","studentId","isActive") VALUES(@id,@s,@a)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Essay(
        NpgsqlConnection conn, string id, string appId, bool isActive = true, string? prompt = null,
        string? currentDraft = null, int draftVersion = 1, DateTime? created = null, DateTime? updated = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "application_essays"
                ("id","studentApplicationId","title","prompt","currentDraft","draftVersion","isActive","createdDate","updatedAt")
            VALUES(@id,@app,'Title',@p,@cd,@dv,@a,@cr,@up)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("app", appId);
        cmd.Parameters.AddWithValue("p", (object?)prompt ?? DBNull.Value);
        cmd.Parameters.AddWithValue("cd", (object?)currentDraft ?? DBNull.Value);
        cmd.Parameters.AddWithValue("dv", draftVersion);
        cmd.Parameters.AddWithValue("a", isActive);
        cmd.Parameters.AddWithValue("cr", DateTime.SpecifyKind(created ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
        cmd.Parameters.AddWithValue("up", DateTime.SpecifyKind(updated ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Checklist(
        NpgsqlConnection conn, string id, string appId, bool isActive = true, string category = "other",
        bool isCompleted = false, DateTime? created = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "application_checklists"
                ("id","studentApplicationId","itemName","category","isCompleted","isActive","createdDate","updatedAt")
            VALUES(@id,@app,'Item',@cat,@ic,@a,@cr,@cr)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("app", appId);
        cmd.Parameters.AddWithValue("cat", category);
        cmd.Parameters.AddWithValue("ic", isCompleted);
        cmd.Parameters.AddWithValue("a", isActive);
        cmd.Parameters.AddWithValue("cr", DateTime.SpecifyKind(created ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
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
                .Single(n => n.EndsWith("application-subresources-schema.sql", StringComparison.Ordinal));
            await using var stream = assembly.GetManifestResourceStream(name)!;
            using var sr = new StreamReader(stream);
            await using var cmd = new NpgsqlCommand(await sr.ReadToEndAsync(), connection);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task DisposeAsync() => await _container.DisposeAsync();
    }
}
