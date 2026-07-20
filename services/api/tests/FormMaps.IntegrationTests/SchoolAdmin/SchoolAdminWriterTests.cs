using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolAdmin;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolAdmin;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="SchoolAdminWriter"/> (FM-DOTNET-044). Pins: config upsert
/// PATCH semantics (only provided columns written; create uses DB defaults; update preserves untouched fields);
/// the read-back coalescing (empty/null retakePolicy -> CONFIG default; DB default "none" echoed verbatim);
/// aiWeights JSON round-trip; schedule per-item upsert on the composite (create sets createdBy, conflict-update
/// sets updatedBy + new dates, preserves id + createdBy); ISO-Z date round-trip under a non-UTC server.
/// </summary>
public sealed class SchoolAdminWriterTests : IClassFixture<SchoolAdminDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string Actor = "admin-1";

    private readonly SchoolAdminDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public SchoolAdminWriterTests(SchoolAdminDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "school_assessment_settings","assessment_schedules" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---------------------------------------------------------------- config

    [Fact]
    public async Task Config_create_writes_provided_fields_and_both_actors()
    {
        var patch = Patch(windowStart: ("2026-04-01", true), reminderDaysBefore: (14, true),
            aiWeightsJson: ("""{"academic":0.6,"social":0.2,"career":0.2}""", true));

        var config = await Writer().UpdateAssessmentConfigAsync(Ctx(), School, Actor, patch);

        Assert.Equal("2026-04-01", config.AssessmentWindowStart);
        Assert.Equal(14, config.ReminderDaysBefore);
        Assert.Equal(0.6, config.AiWeights.GetProperty("academic").GetDouble());
        // Omitted retakePolicy -> DB default "none", echoed verbatim (NOT the no-row CONFIG default).
        Assert.Equal("none", config.RetakePolicy);
        Assert.False(config.AllowSelfSchedule); // DB default

        var (createdBy, updatedBy) = await ActorsAsync();
        Assert.Equal(Actor, createdBy);
        Assert.Equal(Actor, updatedBy);
    }

    [Fact]
    public async Task Config_empty_patch_creates_row_with_db_defaults()
    {
        var config = await Writer().UpdateAssessmentConfigAsync(Ctx(), School, Actor, Patch());

        // Legacy WRITE returns raw DB values (NO GET-style coalescing): unset nullable windows read back null;
        // retakePolicy takes its non-null DB default "none"; aiWeightsJson null -> parseAiWeights default weights.
        Assert.Null(config.AssessmentWindowStart);
        Assert.Null(config.AssessmentWindowEnd);
        Assert.Equal("none", config.RetakePolicy);
        Assert.False(config.AllowSelfSchedule);
        Assert.Equal(7, config.ReminderDaysBefore);
        Assert.Equal(0.4, config.AiWeights.GetProperty("academic").GetDouble());
    }

    [Fact]
    public async Task Config_update_patches_only_provided_and_preserves_rest()
    {
        await SeedSettingsAsync(windowStart: "2020-01-01", retakePolicy: "custom", reminderDaysBefore: 3,
            aiWeightsJson: """{"academic":0.9,"social":0.05,"career":0.05}""");

        var config = await Writer().UpdateAssessmentConfigAsync(
            Ctx(), School, "editor-2", Patch(reminderDaysBefore: (21, true)));

        Assert.Equal(21, config.ReminderDaysBefore);        // patched
        Assert.Equal("2020-01-01", config.AssessmentWindowStart); // preserved
        Assert.Equal("custom", config.RetakePolicy);        // preserved
        Assert.Equal(0.9, config.AiWeights.GetProperty("academic").GetDouble()); // preserved

        var (createdBy, updatedBy) = await ActorsAsync();
        Assert.Equal("seed", createdBy);   // create actor preserved on update
        Assert.Equal("editor-2", updatedBy);
    }

    [Fact]
    public async Task Config_empty_retakePolicy_reads_back_raw_empty()
    {
        // The legacy WRITE returns the stored value RAW (no coalescing) — a stored "" reads back as "",
        // NOT the CONFIG default "once_per_semester" (which is a GET-only fallback). Parity-critical.
        var config = await Writer().UpdateAssessmentConfigAsync(
            Ctx(), School, Actor, Patch(retakePolicy: ("", true)));

        Assert.Equal("", config.RetakePolicy);
    }

    // ---------------------------------------------------------------- schedule

    [Fact]
    public async Task Schedule_create_returns_full_rows_with_actor()
    {
        var start = new DateTime(2026, 3, 1, 0, 0, 0, DateTimeKind.Unspecified);
        var end = new DateTime(2026, 6, 30, 0, 0, 0, DateTimeKind.Unspecified);

        var rows = await Writer().UpsertSchedulesAsync(Ctx(), School, Actor,
            [new ScheduleUpsertItem(9, "PCA", start, end)]);

        var row = Assert.Single(rows);
        Assert.Equal(School, row.SchoolId);
        Assert.Equal(9, row.GradeLevel);
        Assert.Equal("PCA", row.AssessmentType);
        Assert.Equal("2026-03-01T00:00:00.000Z", row.StartDate);
        Assert.Equal("2026-06-30T00:00:00.000Z", row.EndDate);
        Assert.True(row.IsActive);
        Assert.Equal(Actor, row.CreatedBy);
        Assert.Null(row.UpdatedBy);           // create leaves updatedBy null
    }

    [Fact]
    public async Task Schedule_update_on_composite_preserves_id_and_createdBy()
    {
        var s1 = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
        var e1 = new DateTime(2026, 2, 1, 0, 0, 0, DateTimeKind.Unspecified);
        var first = await Writer().UpsertSchedulesAsync(Ctx(), School, "creator-1",
            [new ScheduleUpsertItem(11, "MIL", s1, e1)]);
        var id = first[0].Id;

        var s2 = new DateTime(2026, 5, 1, 0, 0, 0, DateTimeKind.Unspecified);
        var e2 = new DateTime(2026, 8, 1, 0, 0, 0, DateTimeKind.Unspecified);
        var second = await Writer().UpsertSchedulesAsync(Ctx(), School, "editor-9",
            [new ScheduleUpsertItem(11, "MIL", s2, e2)]);

        var row = Assert.Single(second);
        Assert.Equal(id, row.Id);                       // same row (composite upsert)
        Assert.Equal("2026-05-01T00:00:00.000Z", row.StartDate);
        Assert.Equal("creator-1", row.CreatedBy);       // preserved
        Assert.Equal("editor-9", row.UpdatedBy);        // set on update

        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""SELECT COUNT(*) FROM "assessment_schedules" """, conn);
        Assert.Equal(1L, (long)(await cmd.ExecuteScalarAsync())!); // no duplicate row
    }

    [Fact]
    public async Task Schedule_empty_list_writes_nothing()
    {
        var rows = await Writer().UpsertSchedulesAsync(Ctx(), School, Actor, []);
        Assert.Empty(rows);
    }

    // ---------------------------------------------------------------- helpers

    private SchoolAdminWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(Actor, "school-admin", "a@e.st", "Admin"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static AssessmentConfigPatch Patch(
        (string? Value, bool Has) windowStart = default,
        (string? Value, bool Has) windowEnd = default,
        (string? Value, bool Has) retakePolicy = default,
        (bool Value, bool Has) allowSelfSchedule = default,
        (int Value, bool Has) reminderDaysBefore = default,
        (string? Value, bool Has) aiWeightsJson = default) =>
        new(windowStart.Has, windowStart.Value, windowEnd.Has, windowEnd.Value,
            retakePolicy.Has, retakePolicy.Value, allowSelfSchedule.Has, allowSelfSchedule.Value,
            reminderDaysBefore.Has, reminderDaysBefore.Value, aiWeightsJson.Has, aiWeightsJson.Value);

    private async Task<(string? CreatedBy, string? UpdatedBy)> ActorsAsync()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT "createdBy","updatedBy" FROM "school_assessment_settings" WHERE "schoolId"=@s""", conn);
        cmd.Parameters.AddWithValue("s", School);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (reader.IsDBNull(0) ? null : reader.GetString(0), reader.IsDBNull(1) ? null : reader.GetString(1));
    }

    private async Task SeedSettingsAsync(string? windowStart, string retakePolicy, int reminderDaysBefore, string? aiWeightsJson)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "school_assessment_settings"
                ("id","schoolId","assessmentWindowStart","retakePolicy","reminderDaysBefore","aiWeightsJson","createdBy","updatedBy")
            VALUES (@id,@s,@ws,@rp,@rdb,@aw,'seed','seed')
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("s", School);
        cmd.Parameters.AddWithValue("ws", (object?)windowStart ?? DBNull.Value);
        cmd.Parameters.AddWithValue("rp", retakePolicy);
        cmd.Parameters.AddWithValue("rdb", reminderDaysBefore);
        cmd.Parameters.AddWithValue("aw", (object?)aiWeightsJson ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }
}
