using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Counselor;

/// <summary>
/// Counselor availability GET/PUT (FM-DOTNET-069). GET on a read-only RLS session; PUT (upsert by the unique userId)
/// on a writable session + commit. weeklySchedule is written as verbatim jsonb (arbitrary body value; the endpoint
/// already picked timezone/weeklySchedule with JS-|| semantics). Timestamps bound Kind=Unspecified + ms-truncated
/// (the codebase tz rule). SET/INSERT columns are fixed literals — the mass-assignment guard.
/// </summary>
public sealed class CounselorAvailabilityRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : ICounselorAvailabilityRepository
{
    private const string SelectColumns =
        """ "id", "userId", "timezone", "weeklySchedule"::text, "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt" """;

    public async Task<AvailabilityRow?> GetAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, $"""SELECT {SelectColumns} FROM "counselor_availabilities" WHERE "userId" = @uid""");
        AddParameter(command, "uid", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? MapRow(reader) : null;
    }

    public async Task<AvailabilityRow> UpsertAsync(
        RequestContext context, string userId, string timezone, string weeklyScheduleJson, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Prisma upsert on the unique userId: create {userId, timezone, weeklySchedule} / update {timezone,
        // weeklySchedule}. id is a client uuid (no DB default) → gen_random_uuid()::text; createdDate/updatedAt set on
        // insert, updatedAt bumped on update (@updatedAt).
        await using var command = Command(session, $"""
            INSERT INTO "counselor_availabilities" ("id", "userId", "timezone", "weeklySchedule", "createdDate", "updatedAt")
            VALUES (gen_random_uuid()::text, @uid, @tz, @schedule::jsonb, @now, @now)
            ON CONFLICT ("userId") DO UPDATE SET
                "timezone" = EXCLUDED."timezone",
                "weeklySchedule" = EXCLUDED."weeklySchedule",
                "updatedAt" = @now
            RETURNING {SelectColumns}
            """);
        AddParameter(command, "uid", userId);
        AddParameter(command, "tz", timezone);
        AddParameter(command, "schedule", weeklyScheduleJson);
        AddTimestamp(command, "now", Now());

        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            await reader.ReadAsync(cancellationToken);
            var row = MapRow(reader);
            await reader.DisposeAsync();
            await session.CommitAsync(cancellationToken);
            return row;
        }
    }

    private static AvailabilityRow MapRow(DbDataReader reader) => new(
        Id: reader.GetString(0),
        UserId: reader.GetString(1),
        Timezone: reader.GetString(2),
        WeeklySchedule: ReadJson(reader, 3),
        IsActive: reader.GetBoolean(4),
        CreatedBy: reader.IsDBNull(5) ? null : reader.GetString(5),
        CreatedDate: IsoZ(reader.GetDateTime(6)),
        UpdatedBy: reader.IsDBNull(7) ? null : reader.GetString(7),
        UpdatedAt: IsoZ(reader.GetDateTime(8)));

    // jsonb-as-text → JsonElement (verbatim; cloned to survive the document's disposal).
    private static JsonElement ReadJson(DbDataReader reader, int ordinal)
    {
        var raw = reader.IsDBNull(ordinal) ? "null" : reader.GetString(ordinal);
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.Clone();
    }

    private DateTime Now() =>
        new DateTime(
            (timeProvider.GetUtcNow().UtcDateTime.Ticks / TimeSpan.TicksPerMillisecond) * TimeSpan.TicksPerMillisecond,
            DateTimeKind.Unspecified);

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = System.Data.DbType.DateTime2;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
