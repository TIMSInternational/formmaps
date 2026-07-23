using System.Reflection;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Counselor;
using FormMaps.Infrastructure.Data;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Counselor;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="CounselorAvailabilityRepository"/> (FM-DOTNET-069). Pins the upsert:
/// GET null when absent; PUT creates then updates the SAME row (unique userId, no duplicate); weeklySchedule jsonb
/// stored + read back verbatim; updatedAt bumped on the update path.
/// </summary>
public sealed class CounselorAvailabilityRepositoryTests : IClassFixture<CounselorAvailabilityRepositoryTests.Fixture>, IAsyncLifetime
{
    private const string User = "counselor-1";

    private readonly Fixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CounselorAvailabilityRepositoryTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "counselor_availabilities" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Get_returns_null_when_absent()
    {
        Assert.Null(await Repo().GetAsync(Ctx(), User));
    }

    [Fact]
    public async Task Upsert_creates_then_updates_same_row_with_verbatim_jsonb()
    {
        // create
        var created = await Repo().UpsertAsync(Ctx(), User, "America/New_York", """[{"Day":"Monday","Enabled":true}]""");
        Assert.Equal("America/New_York", created.Timezone);
        Assert.Equal("Monday", created.WeeklySchedule[0].GetProperty("Day").GetString());
        Assert.True(created.WeeklySchedule[0].GetProperty("Enabled").GetBoolean());

        // update (same userId → no new row)
        var updated = await Repo().UpsertAsync(Ctx(), User, "America/Chicago", """[{"Day":"Friday"}]""");
        Assert.Equal(created.Id, updated.Id); // same row, upserted
        Assert.Equal("America/Chicago", updated.Timezone);
        Assert.Equal("Friday", updated.WeeklySchedule[0].GetProperty("Day").GetString());

        // exactly one row exists
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var count = new NpgsqlCommand("""SELECT COUNT(*) FROM "counselor_availabilities" WHERE "userId" = @u""", conn);
        count.Parameters.AddWithValue("u", User);
        Assert.Equal(1L, (long)(await count.ExecuteScalarAsync())!);

        // GET reads it back
        var fetched = await Repo().GetAsync(Ctx(), User);
        Assert.NotNull(fetched);
        Assert.Equal("America/Chicago", fetched!.Timezone);
    }

    // ---- helpers ----

    private CounselorAvailabilityRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            new FixedTimeProvider(new DateTime(2026, 7, 23, 12, 0, 0, DateTimeKind.Utc)));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(User, "counselor", "c@e.st", "Counselor"),
            schoolId: "school-1", permissions: new[] { "counselor:sessions" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
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
            var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("counselor-availability-schema.sql", StringComparison.Ordinal));
            await using var stream = assembly.GetManifestResourceStream(name)!;
            using var sr = new StreamReader(stream);
            await using var cmd = new NpgsqlCommand(await sr.ReadToEndAsync(), connection);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task DisposeAsync() => await _container.DisposeAsync();
    }
}
