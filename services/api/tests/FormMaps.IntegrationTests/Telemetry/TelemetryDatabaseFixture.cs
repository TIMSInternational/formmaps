using FormMaps.Application.Auth;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Telemetry;

/// <summary>
/// Testcontainers fixture for the formmaps#65 telemetry port, derived from
/// <see cref="RlsEnabledDatabaseFixture"/> (formmaps#125) so the writer under test runs as a
/// NOSUPERUSER NOBYPASSRLS login with the REAL production policies live.
///
/// <para>A superuser fixture would be worse than useless here. The whole claim this slice makes about
/// its session — that it opens on the CALLER's Identity context and never on a bypass — is
/// indistinguishable from a bypass when the login bypasses RLS anyway.</para>
/// </summary>
public sealed class TelemetryDatabaseFixture : RlsEnabledDatabaseFixture
{
    protected override string SchemaResourceFileName => "telemetry-schema.sql";

    /// <summary>
    /// BOTH tables, unlike the moderation harness: production policies users (005-sensitive.sql) and
    /// telemetry_events (003-fk-users.sql:408-431).
    /// </summary>
    protected override IReadOnlyCollection<string> PoliciedTables => ["telemetry_events", "users"];

    public static RequestContext Ctx(string userId, string? schoolId = null, string role = "student") =>
        RequestContext.Authenticated(
            new RequestActor(userId, role, $"{userId}@test.dev", "Test User"),
            schoolId, [], TokenSource.AuthorizationBearer, isDevelopmentOverride: false);

    public async Task ResetAsync() => await TruncateAsync("users", "telemetry_events");

    // ---- seeding (SUPERUSER side: setup must not be filtered by the policies under test) ----

    public async Task SeedUserAsync(NpgsqlConnection admin, string id, string? schoolId, string role = "student")
    {
        await using var command = new NpgsqlCommand(
            """INSERT INTO "users" ("id","name","email","roleName","schoolId") VALUES (@id,@id,@id || '@test.dev',@role,@schoolId)""",
            admin);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("role", role);
        command.Parameters.AddWithValue("schoolId", (object?)schoolId ?? DBNull.Value);
        await command.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// Reads the stored rows as the SUPERUSER. Assertions must see the TRUE row state — a policy-filtered
    /// read cannot tell "row absent" from "row invisible", which is the failure mode formmaps#125 exists
    /// to close.
    /// </summary>
    public async Task<IReadOnlyList<StoredTelemetryEvent>> ReadAllAsync(NpgsqlConnection admin)
    {
        await using var command = new NpgsqlCommand(
            """
            SELECT "id","userId","userIdHash","type","timestamp","properties","expiresAt","isActive",
                   "createdBy","createdDate","updatedBy","updatedAt"
            FROM "telemetry_events"
            ORDER BY "type", "timestamp"
            """,
            admin);

        var rows = new List<StoredTelemetryEvent>();
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            rows.Add(new StoredTelemetryEvent(
                Id: reader.GetString(0),
                UserId: reader.GetString(1),
                UserIdHash: reader.GetString(2),
                Type: reader.GetString(3),
                Timestamp: reader.GetDateTime(4),
                PropertiesJson: reader.IsDBNull(5) ? null : reader.GetString(5),
                ExpiresAt: reader.GetDateTime(6),
                IsActive: reader.GetBoolean(7),
                CreatedBy: reader.IsDBNull(8) ? null : reader.GetString(8),
                CreatedDate: reader.GetDateTime(9),
                UpdatedBy: reader.IsDBNull(10) ? null : reader.GetString(10),
                UpdatedAt: reader.GetDateTime(11)));
        }

        return rows;
    }

    public async Task<int> CountAsync(NpgsqlConnection admin, string userId)
    {
        await using var command = new NpgsqlCommand(
            """SELECT count(*)::int FROM "telemetry_events" WHERE "userId" = @userId""", admin);
        command.Parameters.AddWithValue("userId", userId);
        return (int)(await command.ExecuteScalarAsync())!;
    }
}

public sealed record StoredTelemetryEvent(
    string Id,
    string UserId,
    string UserIdHash,
    string Type,
    DateTime Timestamp,
    string? PropertiesJson,
    DateTime ExpiresAt,
    bool IsActive,
    string? CreatedBy,
    DateTime CreatedDate,
    string? UpdatedBy,
    DateTime UpdatedAt);
