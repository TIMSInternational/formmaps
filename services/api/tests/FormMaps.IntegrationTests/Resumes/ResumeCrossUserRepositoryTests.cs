using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Resumes;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Resumes;
using Npgsql;

namespace FormMaps.IntegrationTests.Resumes;

/// <summary>
/// Real-Postgres coverage for the 4 new IResumeRepository operations (Phase F resume.ts completion), reusing the
/// FM-090 full-22-column resumes-table fixture — no schema changes needed.
/// </summary>
public sealed class ResumeCrossUserRepositoryTests : IClassFixture<ResumeCrudDatabaseFixture>, IAsyncLifetime
{
    private readonly ResumeCrudDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public ResumeCrossUserRepositoryTests(ResumeCrudDatabaseFixture fixture) => _fixture = fixture;

    public Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    private ResumeRepository CreateRepository() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System);

    private static RequestContext ContextFor(string userId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "student", "u@e.st", "User"),
            schoolId: null, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private async Task<string> InsertResumeAsync(ResumeRepository repo, string userId, string name = "R")
    {
        var created = await repo.CreateAsync(ContextFor(userId), JsonDocument.Parse($$"""{"name":"{{name}}"}""").RootElement);
        return created.Row!.Id;
    }

    [Fact]
    public async Task FindActiveByIdAsync_returns_null_for_unknown_id()
    {
        var repo = CreateRepository();
        Assert.Null(await repo.FindActiveByIdAsync("does-not-exist"));
    }

    [Fact]
    public async Task FindActiveByIdAsync_returns_the_row_regardless_of_caller()
    {
        var repo = CreateRepository();
        var id = await InsertResumeAsync(repo, "owner-1");

        var found = await repo.FindActiveByIdAsync(id);

        Assert.NotNull(found);
        Assert.Equal("owner-1", found!.UserId);
    }

    [Fact]
    public async Task FindMostRecentActiveByUserIdAsync_returns_null_when_user_has_no_resumes()
    {
        var repo = CreateRepository();
        Assert.Null(await repo.FindMostRecentActiveByUserIdAsync("nobody"));
    }

    [Fact]
    public async Task FindMostRecentActiveByUserIdAsync_returns_the_most_recently_updated_row()
    {
        var repo = CreateRepository();
        await InsertResumeAsync(repo, "owner-2", "First");
        var secondId = await InsertResumeAsync(repo, "owner-2", "Second");

        var found = await repo.FindMostRecentActiveByUserIdAsync("owner-2");

        Assert.Equal(secondId, found!.Id);
    }

    [Fact]
    public async Task UpdateAsync_returns_NotOwned_for_unknown_id()
    {
        var repo = CreateRepository();
        var outcome = await repo.UpdateAsync(
            ContextFor("someone"), "does-not-exist", JsonDocument.Parse("{}").RootElement);
        Assert.Equal(ResumeUpdateStatus.NotOwned, outcome.Status);
    }

    [Fact]
    public async Task UpdateAsync_returns_NotOwned_when_caller_is_not_the_owner()
    {
        var repo = CreateRepository();
        var id = await InsertResumeAsync(repo, "owner-3");

        var outcome = await repo.UpdateAsync(ContextFor("attacker"), id, JsonDocument.Parse("{}").RootElement);

        Assert.Equal(ResumeUpdateStatus.NotOwned, outcome.Status);
    }

    [Fact]
    public async Task UpdateAsync_writes_only_whitelisted_present_fields()
    {
        var repo = CreateRepository();
        var id = await InsertResumeAsync(repo, "owner-4", "Original Name");

        var outcome = await repo.UpdateAsync(
            ContextFor("owner-4"), id, JsonDocument.Parse("""{"name":"Updated Name"}""").RootElement);

        Assert.Equal(ResumeUpdateStatus.Updated, outcome.Status);
        Assert.Equal("Updated Name", outcome.Row!.Name);
        Assert.Equal("default", outcome.Row.Template); // untouched field survives
    }

    [Fact]
    public async Task UpdateAsync_sanitizes_documentEdits_when_present()
    {
        var repo = CreateRepository();
        var id = await InsertResumeAsync(repo, "owner-5");

        var outcome = await repo.UpdateAsync(
            ContextFor("owner-5"), id,
            JsonDocument.Parse("""{"documentEdits":[{"page":1,"runIndex":0,"orig":"a","text":"b"}]}""").RootElement);

        Assert.Equal(1, outcome.Row!.DocumentEdits.GetArrayLength());
    }

    [Fact]
    public async Task UpdateAsync_succeeds_on_a_soft_deleted_resume()
    {
        var repo = CreateRepository();
        var id = await InsertResumeAsync(repo, "owner-6");
        await repo.SoftDeleteAsync(ContextFor("owner-6"), id);

        var outcome = await repo.UpdateAsync(
            ContextFor("owner-6"), id, JsonDocument.Parse("""{"name":"Still editable"}""").RootElement);

        Assert.Equal(ResumeUpdateStatus.Updated, outcome.Status); // no isActive filter — PUT works on soft-deleted rows
    }

    [Fact]
    public async Task SoftDeleteAsync_returns_false_for_unknown_id()
    {
        var repo = CreateRepository();
        Assert.False(await repo.SoftDeleteAsync(ContextFor("someone"), "does-not-exist"));
    }

    [Fact]
    public async Task SoftDeleteAsync_returns_false_when_caller_is_not_the_owner()
    {
        var repo = CreateRepository();
        var id = await InsertResumeAsync(repo, "owner-7");

        Assert.False(await repo.SoftDeleteAsync(ContextFor("attacker"), id));
    }

    [Fact]
    public async Task SoftDeleteAsync_sets_isActive_false_and_returns_true()
    {
        var repo = CreateRepository();
        var id = await InsertResumeAsync(repo, "owner-8");

        Assert.True(await repo.SoftDeleteAsync(ContextFor("owner-8"), id));
        var row = await repo.FindActiveByIdAsync(id);
        Assert.Null(row); // FindActiveByIdAsync filters isActive=true, so it's gone from that view
    }
}
