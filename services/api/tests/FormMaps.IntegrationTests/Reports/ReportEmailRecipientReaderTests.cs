using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Reports;
using Npgsql;

namespace FormMaps.IntegrationTests.Reports;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="ReportEmailRecipientReader"/> (Phase F, send-report-email).
/// Uses <see cref="ReportsDatabaseFixture"/> -- the first Reports-domain Testcontainers fixture; the existing 7
/// report-reader test files in this directory (Coaching/Evaluation/Lia/Pca/SchoolBenchmark/Timeline/User) are
/// HTTP-level endpoint tests against fakes, not real-DB reader tests, so there was no existing fixture to share.
///
/// Exercises <see cref="RequestContext.Authenticated"/> (the <see cref="TenantGucPlan.Identity"/> GUC-setting
/// branch the send-report-email endpoint actually passes in production), not <see cref="RequestContext.System"/>'s
/// RLS-bypass branch, mirroring <c>SchoolUsersReaderTests.Ctx()</c> in the same test project -- a reader that
/// hard-coded <c>System()</c> internally would otherwise slip past this suite undetected.
/// </summary>
public sealed class ReportEmailRecipientReaderTests : IClassFixture<ReportsDatabaseFixture>, IAsyncLifetime
{
    private readonly ReportsDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public ReportEmailRecipientReaderTests(ReportsDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var connection = await _dataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand("""TRUNCATE "users" """, connection);
        await command.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    private ReportEmailRecipientReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("caller-1", "school-admin", "caller@example.com", "Caller Admin"),
            schoolId: "school-1", permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private async Task InsertUserAsync(string id, string email, string name)
    {
        await using var connection = await _dataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand(
            """INSERT INTO "users" ("id","email","name") VALUES (@id,@email,@name)""", connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("email", email);
        command.Parameters.AddWithValue("name", name);
        await command.ExecuteNonQueryAsync();
    }

    [Fact]
    public async Task FindAsync_returns_null_for_unknown_user()
    {
        var reader = Reader();
        Assert.Null(await reader.FindAsync(Ctx(), "does-not-exist"));
    }

    [Fact]
    public async Task FindAsync_returns_id_email_name_for_existing_user()
    {
        await InsertUserAsync("u-1", "student@example.com", "Ana Student");
        var reader = Reader();

        var recipient = await reader.FindAsync(Ctx(), "u-1");

        Assert.NotNull(recipient);
        Assert.Equal("u-1", recipient!.Id);
        Assert.Equal("student@example.com", recipient.Email);
        Assert.Equal("Ana Student", recipient.Name);
    }
}
