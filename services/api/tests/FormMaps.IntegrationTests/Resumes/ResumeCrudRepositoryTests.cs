using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Resumes;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Resumes;
using Npgsql;

namespace FormMaps.IntegrationTests.Resumes;

/// <summary>
/// Real-DB (Testcontainers, real jsonb + DB defaults) tests for <see cref="ResumeRepository"/> (FM-DOTNET-090). Pins
/// the list scope (own + isActive only, ORDER BY updatedAt DESC, id ASC tie-break) and full-row passthrough; and the
/// create path — coalesced defaults, jsonb verbatim, DB-defaulted columns (documentEdits []/hasOriginal false/
/// isActive true/createdBy-updatedBy null), createdDate/updatedAt set, and the truthy-non-string String-column reject
/// (InvalidStringField, no row written).
/// </summary>
public sealed class ResumeCrudRepositoryTests : IClassFixture<ResumeCrudDatabaseFixture>, IAsyncLifetime
{
    private const string Owner = "user-1";
    private const string Other = "user-2";

    private readonly ResumeCrudDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public ResumeCrudRepositoryTests(ResumeCrudDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "resumes" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- List ----

    [Fact]
    public async Task List_returns_only_own_active_ordered_by_updatedAt_desc()
    {
        await Seed("r-old", Owner, isActive: true, updatedAt: "2026-07-01T00:00:00Z");
        await Seed("r-new", Owner, isActive: true, updatedAt: "2026-07-20T00:00:00Z");
        await Seed("r-inactive", Owner, isActive: false, updatedAt: "2026-07-25T00:00:00Z");
        await Seed("r-other", Other, isActive: true, updatedAt: "2026-07-30T00:00:00Z");

        var rows = await Repo().ListAsync(Ctx(Owner));

        Assert.Equal(["r-new", "r-old"], rows.Select(r => r.Id).ToArray());
    }

    [Fact]
    public async Task List_tie_break_is_id_ascending()
    {
        await Seed("r-b", Owner, isActive: true, updatedAt: "2026-07-20T00:00:00Z");
        await Seed("r-a", Owner, isActive: true, updatedAt: "2026-07-20T00:00:00Z");

        var rows = await Repo().ListAsync(Ctx(Owner));

        Assert.Equal(["r-a", "r-b"], rows.Select(r => r.Id).ToArray());
    }

    [Fact]
    public async Task List_passes_jsonb_columns_through_verbatim()
    {
        await Seed("r1", Owner, isActive: true, updatedAt: "2026-07-20T00:00:00Z",
            personalInfo: """{"name":"Ada"}""", skills: """["c","d"]""");

        var row = Assert.Single(await Repo().ListAsync(Ctx(Owner)));

        Assert.Equal("Ada", row.PersonalInfo.GetProperty("name").GetString());
        Assert.Equal("c", row.Skills[0].GetString());
        Assert.EndsWith("Z", row.UpdatedAt); // ISO-Z
    }

    [Fact]
    public async Task List_empty_when_none()
    {
        Assert.Empty(await Repo().ListAsync(Ctx(Owner)));
    }

    // ---- Create ----

    [Fact]
    public async Task Create_with_defaults_writes_full_row()
    {
        var outcome = await Repo().CreateAsync(Ctx(Owner), Body("{}"));

        Assert.Equal(ResumeCreateStatus.Created, outcome.Status);
        var row = outcome.Row!;
        Assert.True(Guid.TryParse(row.Id, out _));
        Assert.Equal(Owner, row.UserId);
        Assert.Equal("My Resume", row.Name);
        Assert.Equal("default", row.Template);
        Assert.Equal("", row.CareerField);
        Assert.Equal(JsonValueKind.Object, row.PersonalInfo.ValueKind);
        Assert.Equal(JsonValueKind.Array, row.Experience.ValueKind);
        Assert.Equal(JsonValueKind.Array, row.DocumentEdits.ValueKind); // DB default []
        Assert.Null(row.OriginalFileKey);
        Assert.False(row.HasOriginal);   // DB default
        Assert.True(row.IsActive);       // DB default
        Assert.Null(row.CreatedBy);
        Assert.Null(row.UpdatedBy);
        Assert.EndsWith("Z", row.CreatedDate);
        Assert.EndsWith("Z", row.UpdatedAt);

        // the row is really persisted and now visible to the list
        Assert.Single(await Repo().ListAsync(Ctx(Owner)));
    }

    [Fact]
    public async Task Create_stores_provided_values_verbatim()
    {
        var outcome = await Repo().CreateAsync(
            Ctx(Owner),
            Body("""{"name":"Mine","template":"modern","careerField":"eng","personalInfo":{"name":"A"},"skills":["x"]}"""));

        var row = outcome.Row!;
        Assert.Equal("Mine", row.Name);
        Assert.Equal("modern", row.Template);
        Assert.Equal("eng", row.CareerField);
        Assert.Equal("A", row.PersonalInfo.GetProperty("name").GetString());
        Assert.Equal("x", row.Skills[0].GetString());
    }

    [Fact]
    public async Task Create_empty_array_personalInfo_is_stored_not_defaulted()
    {
        var outcome = await Repo().CreateAsync(Ctx(Owner), Body("""{"personalInfo":[]}"""));
        Assert.Equal(JsonValueKind.Array, outcome.Row!.PersonalInfo.ValueKind); // [] truthy → stored as []
    }

    [Fact]
    public async Task Create_truthy_non_string_name_is_invalid_and_writes_nothing()
    {
        var outcome = await Repo().CreateAsync(Ctx(Owner), Body("""{"name":5}"""));

        Assert.Equal(ResumeCreateStatus.InvalidStringField, outcome.Status);
        Assert.Null(outcome.Row);
        Assert.Empty(await Repo().ListAsync(Ctx(Owner)));
    }

    // ---- helpers ----

    private ResumeRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            new FixedTimeProvider(new DateTime(2026, 7, 24, 12, 0, 0, DateTimeKind.Utc)));

    private static JsonElement Body(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private static RequestContext Ctx(string userId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "student", "s@e.st", "Student"),
            schoolId: null, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private async Task Seed(
        string id, string userId, bool isActive, string updatedAt,
        string personalInfo = "{}", string skills = "[]")
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "resumes" ("id","userId","isActive","personalInfo","skills","updatedAt")
            VALUES (@id,@u,@a,@p::jsonb,@s::jsonb,@t)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("u", userId);
        cmd.Parameters.AddWithValue("a", isActive);
        cmd.Parameters.AddWithValue("p", personalInfo);
        cmd.Parameters.AddWithValue("s", skills);
        cmd.Parameters.AddWithValue("t", DateTime.SpecifyKind(DateTime.Parse(updatedAt).ToUniversalTime(), DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
    }
}
