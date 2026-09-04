using System.Data;
using System.Data.Common;
using System.Text;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Telemetry;

namespace FormMaps.Infrastructure.Telemetry;

/// <summary>
/// SQL for <c>prisma.telemetryEvent.createMany</c> at
/// formmaps-platform/api/src/routes/telemetry.ts:45-55 (formmaps#65).
///
/// <para>THE CALLER'S SESSION, ALWAYS. <c>telemetry_events</c> IS policied in production
/// (api/prisma/rls/003-fk-users.sql, vendored at TestSupport/Rls/003-fk-users.sql): a row is writable
/// when its <c>"userId"</c> is the session's <c>app.current_user_id</c>, or when that user shares the
/// session's non-empty <c>app.current_school_id</c>. Legacy reaches the table through the RLS-extended
/// Prisma client on the request's tenant context, so this opens on <paramref name="context"/> and never
/// on <see cref="RequestContext.System"/>. There is no reason for an ingest endpoint to hold a bypass:
/// every row it writes belongs to the caller.</para>
///
/// <para>WHAT THE POLICY DOES NOT DO, stated because a test that leaned on it would be passing for the
/// wrong reason: the school branch of that policy means a caller CAN write a row naming a classmate,
/// and the database will allow it. The thing that stops it is the endpoint passing
/// <c>context.Tenant!.UserId</c> and nothing else — legacy's <c>req.userId!</c> at telemetry.ts:47.
/// TelemetryCrossTenantRlsTests records both halves.</para>
/// </summary>
public sealed class TelemetryEventWriter(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ITelemetryEventWriter
{
    public async Task WriteAsync(
        RequestContext context,
        string userId,
        IReadOnlyList<TelemetryEventRow> rows,
        DateTime expiresAt,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(rows);

        if (rows.Count == 0)
        {
            // Mirrors telemetry.ts:44's `if (validEvents.length > 0)`. Guarded here as well as at the
            // endpoint so no caller can turn an empty batch into an opened transaction.
            return;
        }

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // ONE multi-row INSERT, which is what createMany compiles to. Batching matters beyond round
        // trips: legacy's createMany is a single statement, so a batch either lands whole or not at all,
        // and `eventsReceived` in the response is only honest if that stays true.
        //
        // "id" is Prisma @default(uuid()), generated CLIENT-side, so the column carries no database
        // default and the INSERT must supply one; "updatedAt" is @updatedAt, also app-managed with no DB
        // default (0_init/migration.sql:879-894). "isActive" and "createdDate" DO have real DB defaults
        // and are left to them. "createdBy"/"updatedBy" are NOT set: createMany does not set them either,
        // and inventing an actor here would put data in columns legacy leaves NULL.
        var sql = new StringBuilder(
            """
            INSERT INTO "telemetry_events"
                ("id","userId","userIdHash","type","timestamp","properties","expiresAt","updatedAt")
            VALUES
            """);

        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;

        for (var i = 0; i < rows.Count; i++)
        {
            sql.Append(i == 0 ? "\n    " : ",\n    ");
            sql.Append("(gen_random_uuid()::text, @userId, @userIdHash, @type").Append(i)
               .Append(", @timestamp").Append(i)
               .Append(", CAST(@properties").Append(i)
               .Append(" AS jsonb), @expiresAt, now())");

            AddText(command, $"type{i}", rows[i].Type);
            AddTimestamp(command, $"timestamp{i}", rows[i].Timestamp);
            AddText(command, $"properties{i}", rows[i].PropertiesJson);
        }

        AddText(command, "userId", userId);
        // telemetry.ts:39. Derived from the userId the ENDPOINT resolved, so the pair can never disagree.
        AddText(command, "userIdHash", TelemetryBatch.HashUserId(userId));
        AddTimestamp(command, "expiresAt", expiresAt);

        command.CommandText = sql.ToString();
        await command.ExecuteNonQueryAsync(cancellationToken);
        await session.CommitAsync(cancellationToken);
    }

    /// <summary>
    /// Explicit <see cref="DbType.String"/> because a null <c>properties</c> is a real case
    /// (<c>e.properties || null</c>, telemetry.ts:51) and Npgsql cannot infer a type from DBNull alone.
    /// </summary>
    private static void AddText(DbCommand command, string name, string? value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.String;
        parameter.Value = (object?)value ?? DBNull.Value;
        command.Parameters.Add(parameter);
    }

    /// <summary>
    /// The columns are <c>TIMESTAMP(3)</c> — timestamp WITHOUT time zone — so the value binds as
    /// Kind=Unspecified UTC wall-clock and is truncated to milliseconds, matching what Prisma stores and
    /// what GraduationRulesWriter.Now() already does. Handing Npgsql a Kind=Utc DateTime for a
    /// <c>timestamp without time zone</c> column throws; the truncation keeps a round-trip exact rather
    /// than letting Postgres round the sub-millisecond digits.
    /// </summary>
    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        // Unspecified is treated as already-UTC (the wall-clock convention this schema stores in), NOT
        // converted from local time — a machine-timezone-dependent shift is the last thing a retention
        // column needs. TelemetryBatch only ever produces Kind=Utc; the Local arm is defensive.
        var utc = value.Kind == DateTimeKind.Local ? value.ToUniversalTime() : value;
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = DateTime.SpecifyKind(
            new DateTime(utc.Ticks - (utc.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Unspecified),
            DateTimeKind.Unspecified);
        command.Parameters.Add(parameter);
    }
}
