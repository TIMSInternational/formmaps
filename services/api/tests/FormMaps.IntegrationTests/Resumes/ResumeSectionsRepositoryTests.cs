using System.Text.Json;
using System.Text.Json.Nodes;
using FormMaps.Application.Auth;
using FormMaps.Application.Resumes;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Resumes;
using Npgsql;

namespace FormMaps.IntegrationTests.Resumes;

/// <summary>
/// Real-DB (Testcontainers, real jsonb) tests for <see cref="ResumeSectionsRepository"/> (FM-DOTNET-089). Pins the
/// ownership gate (missing / non-owned → NotOwned, checked BEFORE body validation), the jsonb sections round-trip
/// for reorder/add/delete, the template write, and the deferred body errors (InvalidSectionOrder / TemplateRequired
/// / InvalidTemplateType only after ownership passes; a non-owned resume + a bad body still yields NotOwned).
/// </summary>
public sealed class ResumeSectionsRepositoryTests : IClassFixture<ResumeSectionsDatabaseFixture>, IAsyncLifetime
{
    private const string Owner = "user-1";
    private const string Other = "user-2";
    private const string ResumeId = "resume-1";

    private readonly ResumeSectionsDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public ResumeSectionsRepositoryTests(ResumeSectionsDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "resumes" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Reorder_owned_reorders_sections()
    {
        await Seed(ResumeId, Owner, """[{"id":"a"},{"id":"b"},{"id":"c"}]""");

        var outcome = await Repo().ReorderAsync(Ctx(Owner), ResumeId, Body("""{"sectionOrder":["c","a","b"]}"""));

        Assert.Equal(ResumeSectionsStatus.Ok, outcome.Status);
        Assert.Equal(["c", "a", "b"], SectionIds(outcome.SectionsJson!));
        Assert.Equal(["c", "a", "b"], SectionIds(await StoredSections()));
    }

    [Fact]
    public async Task Reorder_not_owned_is_notowned_even_with_bad_body()
    {
        await Seed(ResumeId, Other, """[{"id":"a"}]""");

        // Non-owned AND a non-array sectionOrder → ownership (404) wins over the body 400.
        var outcome = await Repo().ReorderAsync(Ctx(Owner), ResumeId, Body("""{"sectionOrder":"nope"}"""));

        Assert.Equal(ResumeSectionsStatus.NotOwned, outcome.Status);
    }

    [Fact]
    public async Task Reorder_owned_bad_order_is_invalid()
    {
        await Seed(ResumeId, Owner, "[]");
        var outcome = await Repo().ReorderAsync(Ctx(Owner), ResumeId, Body("""{"sectionOrder":123}"""));
        Assert.Equal(ResumeSectionsStatus.InvalidSectionOrder, outcome.Status);
    }

    [Fact]
    public async Task Add_owned_appends_new_section_with_uuid()
    {
        await Seed(ResumeId, Owner, """[{"id":"a"}]""");

        var outcome = await Repo().AddAsync(Ctx(Owner), ResumeId, Body("""{"type":"education","title":"School"}"""));

        Assert.Equal(ResumeSectionsStatus.Ok, outcome.Status);
        var created = JsonNode.Parse(outcome.NewSectionJson!)!;
        Assert.Equal("education", created["type"]!.GetValue<string>());
        Assert.True(Guid.TryParse(created["id"]!.GetValue<string>(), out _)); // crypto.randomUUID → a UUID
        Assert.Equal(2, SectionIds(await StoredSections()).Length);
    }

    [Fact]
    public async Task Delete_owned_removes_section()
    {
        await Seed(ResumeId, Owner, """[{"id":"a"},{"id":"b"}]""");

        var outcome = await Repo().DeleteAsync(Ctx(Owner), ResumeId, "a");

        Assert.Equal(ResumeSectionsStatus.Ok, outcome.Status);
        Assert.Equal(["b"], SectionIds(await StoredSections()));
    }

    [Fact]
    public async Task Delete_not_found_is_notowned()
    {
        var outcome = await Repo().DeleteAsync(Ctx(Owner), "missing", "a");
        Assert.Equal(ResumeSectionsStatus.NotOwned, outcome.Status);
    }

    [Fact]
    public async Task Add_corrupt_sections_is_500()
    {
        await Seed(ResumeId, Owner, "{}"); // a non-array sections → legacy sections.push throws
        var outcome = await Repo().AddAsync(Ctx(Owner), ResumeId, Body("""{"title":"X"}"""));
        Assert.Equal(ResumeSectionsStatus.CorruptSections, outcome.Status);
    }

    [Fact]
    public async Task Delete_corrupt_sections_is_500()
    {
        await Seed(ResumeId, Owner, "{}");
        var outcome = await Repo().DeleteAsync(Ctx(Owner), ResumeId, "a");
        Assert.Equal(ResumeSectionsStatus.CorruptSections, outcome.Status);
    }

    [Fact]
    public async Task Reorder_corrupt_sections_nonempty_order_is_500()
    {
        await Seed(ResumeId, Owner, "{}");
        var outcome = await Repo().ReorderAsync(Ctx(Owner), ResumeId, Body("""{"sectionOrder":["a"]}"""));
        Assert.Equal(ResumeSectionsStatus.CorruptSections, outcome.Status);
    }

    [Fact]
    public async Task Reorder_corrupt_sections_empty_order_is_ok()
    {
        // Legacy: [].map(...) never calls sections.find → no throw → writes []. Corrupt sections is tolerated here.
        await Seed(ResumeId, Owner, "{}");
        var outcome = await Repo().ReorderAsync(Ctx(Owner), ResumeId, Body("""{"sectionOrder":[]}"""));
        Assert.Equal(ResumeSectionsStatus.Ok, outcome.Status);
        Assert.Empty(SectionIds(await StoredSections()));
    }

    [Fact]
    public async Task SetTemplate_owned_writes_template()
    {
        await Seed(ResumeId, Owner, "[]");

        var outcome = await Repo().SetTemplateAsync(Ctx(Owner), ResumeId, Body("""{"template":"modern"}"""));

        Assert.Equal(ResumeSectionsStatus.Ok, outcome.Status);
        Assert.Equal("modern", outcome.Template);
        Assert.Equal("modern", await StoredTemplate());
    }

    [Fact]
    public async Task SetTemplate_falsy_is_template_required()
    {
        await Seed(ResumeId, Owner, "[]");
        var outcome = await Repo().SetTemplateAsync(Ctx(Owner), ResumeId, Body("""{"template":""}"""));
        Assert.Equal(ResumeSectionsStatus.TemplateRequired, outcome.Status);
    }

    [Fact]
    public async Task SetTemplate_non_string_is_invalid_type()
    {
        await Seed(ResumeId, Owner, "[]");
        var outcome = await Repo().SetTemplateAsync(Ctx(Owner), ResumeId, Body("""{"template":5}"""));
        Assert.Equal(ResumeSectionsStatus.InvalidTemplateType, outcome.Status);
    }

    // ---- helpers ----

    private ResumeSectionsRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            new FixedTimeProvider(new DateTime(2026, 7, 24, 12, 0, 0, DateTimeKind.Utc)));

    private static JsonElement Body(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private static RequestContext Ctx(string userId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "student", "s@e.st", "Student"),
            schoolId: null, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static string[] SectionIds(string json) =>
        (JsonNode.Parse(json) as JsonArray)!.Select(n => n!["id"]!.GetValue<string>()).ToArray();

    private async Task Seed(string id, string userId, string sectionsJson)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "resumes" ("id","userId","sections") VALUES (@id,@u,@s::jsonb)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("u", userId);
        cmd.Parameters.AddWithValue("s", sectionsJson);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task<string> StoredSections()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""SELECT "sections"::text FROM "resumes" WHERE "id"=@id""", conn);
        cmd.Parameters.AddWithValue("id", ResumeId);
        return (string)(await cmd.ExecuteScalarAsync())!;
    }

    private async Task<string> StoredTemplate()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""SELECT "template" FROM "resumes" WHERE "id"=@id""", conn);
        cmd.Parameters.AddWithValue("id", ResumeId);
        return (string)(await cmd.ExecuteScalarAsync())!;
    }

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
    }
}
