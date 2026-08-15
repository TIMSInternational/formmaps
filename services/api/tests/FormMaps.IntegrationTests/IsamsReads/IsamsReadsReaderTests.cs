using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.IsamsReads;
using Npgsql;

namespace FormMaps.IntegrationTests.IsamsReads;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC container tz, native SyncJobStatus enum) tests for
/// <see cref="IsamsReadsReader"/>. Pins the two iSAMS reads: status (no-config → null; endpoint/lastSyncAt/
/// isActive/credentialsEncrypted passthrough incl. NULL endpoint, empty endpoint, NULL lastSyncAt, inactive
/// config and NULL/empty credentials — formmaps#145; school scoping) and jobs (empty → [];
/// full-row camelCase passthrough; nullable startedAt/finishedAt → null ISO-Z; createdDate-DESC + id-ASC
/// tie-break; LIMIT 20; native-enum status passthrough; details null AND string; school scoping).
/// </summary>
public sealed class IsamsReadsReaderTests : IClassFixture<IsamsReadsDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";

    private readonly IsamsReadsDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public IsamsReadsReaderTests(IsamsReadsDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "isams_configs","isams_sync_jobs" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- status ----

    [Fact]
    public async Task Status_no_config_row_returns_null()
    {
        Assert.Null(await Reader().GetStatusAsync(Ctx(), School));
    }

    [Fact]
    public async Task Status_config_with_endpoint_and_lastSyncAt_passthrough()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedConfig(conn, "cfg1", School, endpoint: "https://x", lastSyncAt: new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc));

        var status = await Reader().GetStatusAsync(Ctx(), School);

        Assert.NotNull(status);
        Assert.Equal("https://x", status!.Endpoint);
        Assert.Equal("2026-01-02T03:04:05.000Z", status.LastSyncAt);
    }

    [Fact]
    public async Task Status_endpoint_null_is_null()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedConfig(conn, "cfg1", School, endpoint: null, lastSyncAt: null);

        var status = await Reader().GetStatusAsync(Ctx(), School);

        Assert.NotNull(status);
        Assert.Null(status!.Endpoint);   // endpoint enabled-derivation (→ false) is the endpoint's job
        Assert.Null(status.LastSyncAt);
    }

    [Fact]
    public async Task Status_endpoint_empty_string_passthrough()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedConfig(conn, "cfg1", School, endpoint: "", lastSyncAt: null);

        var status = await Reader().GetStatusAsync(Ctx(), School);

        Assert.NotNull(status);
        Assert.Equal("", status!.Endpoint);   // enabled → false (empty) derived by the endpoint
    }

    [Fact]
    public async Task Status_lastSyncAt_null_is_null_with_endpoint_present()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedConfig(conn, "cfg1", School, endpoint: "https://x", lastSyncAt: null);

        var status = await Reader().GetStatusAsync(Ctx(), School);

        Assert.NotNull(status);
        Assert.Equal("https://x", status!.Endpoint);
        Assert.Null(status.LastSyncAt);
    }

    [Fact]
    public async Task Status_isActive_false_and_credentials_passthrough()
    {
        // formmaps#145 — the endpoint derives `connected` from these raw columns; the reader only passes through.
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedConfig(conn, "cfg1", School, endpoint: "https://x", lastSyncAt: null,
            isActive: false, credentialsEncrypted: "enc:v1:abc");

        var status = await Reader().GetStatusAsync(Ctx(), School);

        Assert.NotNull(status);
        Assert.False(status!.IsActive);
        Assert.Equal("enc:v1:abc", status.CredentialsEncrypted);
    }

    [Fact]
    public async Task Status_isActive_true_and_credentials_null_passthrough()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedConfig(conn, "cfg1", School, endpoint: "https://x", lastSyncAt: null);   // defaults: active, no creds

        var status = await Reader().GetStatusAsync(Ctx(), School);

        Assert.NotNull(status);
        Assert.True(status!.IsActive);
        Assert.Null(status.CredentialsEncrypted);
    }

    [Fact]
    public async Task Status_credentials_empty_string_passthrough()
    {
        // "" must survive as "" (NOT null): the endpoint owns the JS-falsy "" → connected:false derivation.
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedConfig(conn, "cfg1", School, endpoint: "https://x", lastSyncAt: null, credentialsEncrypted: "");

        var status = await Reader().GetStatusAsync(Ctx(), School);

        Assert.NotNull(status);
        Assert.Equal("", status!.CredentialsEncrypted);
    }

    [Fact]
    public async Task Status_is_school_scoped()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedConfig(conn, "cfg2", OtherSchool, endpoint: "https://other", lastSyncAt: null);

        Assert.Null(await Reader().GetStatusAsync(Ctx(), School));   // other school's config is invisible
    }

    // ---- jobs ----

    [Fact]
    public async Task Jobs_empty_when_none()
    {
        Assert.Empty(await Reader().GetSyncJobsAsync(Ctx(), School));
    }

    [Fact]
    public async Task Jobs_full_row_passthrough_every_column()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedJob(conn, "j1", School,
            initiatedBy: "user-1", status: "completed", details: "{\"n\":3}",
            startedAt: new DateTime(2026, 3, 1, 10, 0, 0, DateTimeKind.Utc),
            finishedAt: new DateTime(2026, 3, 1, 10, 5, 0, DateTimeKind.Utc),
            isActive: true, createdBy: "creator-1",
            createdDate: new DateTime(2026, 3, 1, 9, 0, 0, DateTimeKind.Utc),
            updatedBy: "updater-1",
            updatedAt: new DateTime(2026, 3, 1, 10, 6, 0, DateTimeKind.Utc));

        var job = Assert.Single(await Reader().GetSyncJobsAsync(Ctx(), School));

        Assert.Equal("j1", job.Id);
        Assert.Equal(School, job.SchoolId);
        Assert.Equal("user-1", job.InitiatedBy);
        Assert.Equal("completed", job.Status);
        Assert.Equal("{\"n\":3}", job.Details);
        Assert.Equal("2026-03-01T10:00:00.000Z", job.StartedAt);
        Assert.Equal("2026-03-01T10:05:00.000Z", job.FinishedAt);
        Assert.True(job.IsActive);
        Assert.Equal("creator-1", job.CreatedBy);
        Assert.Equal("2026-03-01T09:00:00.000Z", job.CreatedDate);
        Assert.Equal("updater-1", job.UpdatedBy);
        Assert.Equal("2026-03-01T10:06:00.000Z", job.UpdatedAt);
    }

    [Fact]
    public async Task Jobs_nullable_started_finished_details_are_null()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedJob(conn, "j1", School, status: "pending",
            details: null, startedAt: null, finishedAt: null,
            createdDate: new DateTime(2026, 3, 1, 9, 0, 0, DateTimeKind.Utc),
            updatedAt: new DateTime(2026, 3, 1, 9, 0, 0, DateTimeKind.Utc));

        var job = Assert.Single(await Reader().GetSyncJobsAsync(Ctx(), School));

        Assert.Null(job.Details);
        Assert.Null(job.StartedAt);
        Assert.Null(job.FinishedAt);
        Assert.Null(job.CreatedBy);
        Assert.Null(job.UpdatedBy);
    }

    [Fact]
    public async Task Jobs_details_string_and_null_coexist()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedJob(conn, "j1", School, status: "failed", details: "boom",
            createdDate: new DateTime(2026, 3, 2, 0, 0, 0, DateTimeKind.Utc), updatedAt: new DateTime(2026, 3, 2, 0, 0, 0, DateTimeKind.Utc));
        await SeedJob(conn, "j2", School, status: "pending", details: null,
            createdDate: new DateTime(2026, 3, 1, 0, 0, 0, DateTimeKind.Utc), updatedAt: new DateTime(2026, 3, 1, 0, 0, 0, DateTimeKind.Utc));

        var jobs = await Reader().GetSyncJobsAsync(Ctx(), School);

        Assert.Equal("boom", jobs[0].Details);   // j1 newer → first
        Assert.Null(jobs[1].Details);
    }

    [Fact]
    public async Task Jobs_native_enum_status_passthrough_all_values()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        var statuses = new[] { "pending", "running", "completed", "failed", "cancelled" };
        // Distinct DESCending createdDate so the read order is deterministic and independent of the tie-break.
        for (var i = 0; i < statuses.Length; i++)
        {
            await SeedJob(conn, $"j{i}", School, status: statuses[i],
                createdDate: new DateTime(2026, 3, 1, 0, 0, 0, DateTimeKind.Utc).AddMinutes(-i),
                updatedAt: new DateTime(2026, 3, 1, 0, 0, 0, DateTimeKind.Utc));
        }

        var jobs = await Reader().GetSyncJobsAsync(Ctx(), School);

        Assert.Equal(statuses, jobs.Select(j => j.Status).ToArray());
    }

    [Fact]
    public async Task Jobs_ordered_createdDate_desc_then_id_asc_tiebreak()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        var equal = new DateTime(2026, 3, 1, 0, 0, 0, DateTimeKind.Utc);
        // Same createdDate for b/a/c (insert out of id order) → tie-break by id ASC. z is newer → strictly first.
        await SeedJob(conn, "b", School, createdDate: equal, updatedAt: equal);
        await SeedJob(conn, "a", School, createdDate: equal, updatedAt: equal);
        await SeedJob(conn, "c", School, createdDate: equal, updatedAt: equal);
        await SeedJob(conn, "z", School, createdDate: equal.AddMinutes(1), updatedAt: equal);

        var ids = (await Reader().GetSyncJobsAsync(Ctx(), School)).Select(j => j.Id).ToArray();

        Assert.Equal(new[] { "z", "a", "b", "c" }, ids);
    }

    [Fact]
    public async Task Jobs_limit_20_keeps_the_20_newest()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        var baseTime = new DateTime(2026, 3, 1, 0, 0, 0, DateTimeKind.Utc);
        // 21 jobs; createdDate increases with i so the 20 newest are i=1..20 (i=0 is the oldest, dropped).
        for (var i = 0; i < 21; i++)
        {
            await SeedJob(conn, $"j{i:D2}", School, createdDate: baseTime.AddMinutes(i), updatedAt: baseTime);
        }

        var jobs = await Reader().GetSyncJobsAsync(Ctx(), School);

        Assert.Equal(20, jobs.Count);
        Assert.Equal("j20", jobs[0].Id);                 // newest first
        Assert.DoesNotContain(jobs, j => j.Id == "j00"); // the oldest is excluded by LIMIT 20
    }

    [Fact]
    public async Task Jobs_are_school_scoped()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        var t = new DateTime(2026, 3, 1, 0, 0, 0, DateTimeKind.Utc);
        await SeedJob(conn, "mine", School, createdDate: t, updatedAt: t);
        await SeedJob(conn, "theirs", OtherSchool, createdDate: t, updatedAt: t);

        var job = Assert.Single(await Reader().GetSyncJobsAsync(Ctx(), School));
        Assert.Equal("mine", job.Id);
    }

    // ---- helpers ----

    private IsamsReadsReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school-admin", "admin@e.st", "Admin"),
            schoolId: School, permissions: new[] { "school:manage" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static DateTime Unspec(DateTime utc) => DateTime.SpecifyKind(utc, DateTimeKind.Unspecified);

    private static async Task SeedConfig(
        NpgsqlConnection conn, string id, string schoolId, string? endpoint, DateTime? lastSyncAt,
        bool isActive = true, string? credentialsEncrypted = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "isams_configs" ("id","schoolId","endpoint","lastSyncAt","isActive","credentialsEncrypted","updatedAt")
            VALUES (@id,@s,@e,@l,@a,@c,now())
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("e", (object?)endpoint ?? DBNull.Value);
        cmd.Parameters.AddWithValue("l", lastSyncAt is null ? DBNull.Value : Unspec(lastSyncAt.Value));
        cmd.Parameters.AddWithValue("a", isActive);
        cmd.Parameters.AddWithValue("c", (object?)credentialsEncrypted ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedJob(
        NpgsqlConnection conn, string id, string schoolId,
        string initiatedBy = "user-1", string status = "pending", string? details = null,
        DateTime? startedAt = null, DateTime? finishedAt = null, bool isActive = true,
        string? createdBy = null, DateTime? createdDate = null, string? updatedBy = null, DateTime? updatedAt = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "isams_sync_jobs"
                ("id","schoolId","initiatedBy","status","details","startedAt","finishedAt","isActive",
                 "createdBy","createdDate","updatedBy","updatedAt")
            VALUES (@id,@s,@ib,@st::"SyncJobStatus",@d,@sa,@fa,@a,@cb,@cd,@ub,@ua)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("ib", initiatedBy);
        cmd.Parameters.AddWithValue("st", status);
        cmd.Parameters.AddWithValue("d", (object?)details ?? DBNull.Value);
        cmd.Parameters.AddWithValue("sa", startedAt is null ? DBNull.Value : Unspec(startedAt.Value));
        cmd.Parameters.AddWithValue("fa", finishedAt is null ? DBNull.Value : Unspec(finishedAt.Value));
        cmd.Parameters.AddWithValue("a", isActive);
        cmd.Parameters.AddWithValue("cb", (object?)createdBy ?? DBNull.Value);
        cmd.Parameters.AddWithValue("cd", Unspec((createdDate ?? DateTime.UtcNow)));
        cmd.Parameters.AddWithValue("ub", (object?)updatedBy ?? DBNull.Value);
        cmd.Parameters.AddWithValue("ua", Unspec((updatedAt ?? DateTime.UtcNow)));
        await cmd.ExecuteNonQueryAsync();
    }
}
