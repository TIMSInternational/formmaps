using System.Collections.Concurrent;
using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Domain.Auth;

namespace FormMaps.Infrastructure.Auth;

/// <summary>
/// Process-local "is this school's contract active?" cache, ~60s per school (legacy
/// <c>schoolCache</c> in studentEntitlement.ts). Singleton.
/// </summary>
public sealed class SchoolContractCache
{
    public static readonly TimeSpan Ttl = TimeSpan.FromSeconds(60);

    private readonly ConcurrentDictionary<string, (DateTimeOffset At, bool Active)> _entries = new(StringComparer.Ordinal);

    public bool TryGet(string schoolId, DateTimeOffset now, out bool active)
    {
        if (_entries.TryGetValue(schoolId, out var hit) && now - hit.At < Ttl)
        {
            active = hit.Active;
            return true;
        }

        active = false;
        return false;
    }

    public void Set(string schoolId, DateTimeOffset now, bool active) => _entries[schoolId] = (now, active);

    public void Clear() => _entries.Clear();
}

/// <summary>
/// <see cref="IStudentAccessReader"/> over raw Npgsql, under the caller's read-only RLS session (the
/// same session <see cref="SubscriptionGuard"/> uses, matching legacy's runWithTenantContext). Errors
/// propagate so the endpoint filter can fail closed with 503.
/// </summary>
public sealed class StudentAccessReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    SchoolContractCache schoolCache,
    TimeProvider timeProvider,
    int graceDays) : IStudentAccessReader
{
    private const string UserSql = """
        SELECT "roleName", "schoolId"
        FROM "users"
        WHERE "id" = @id
        """;

    private const string SchoolSql = """
        SELECT "isActive", "status"::text AS "status", "contractStartDate", "contractEndDate", "timezone"
        FROM "schools"
        WHERE "id" = @id
        """;

    private const string SubscriptionSql = """
        SELECT us."status", us."isActive", us."nextBillingDate",
               (sp."id" IS NOT NULL) AS "hasPlan", sp."interval" AS "planInterval"
        FROM "user_subscriptions" us
        LEFT JOIN "subscription_plans" sp ON sp."id" = us."planId"
        WHERE us."userId" = @id AND us."isActive" = true
        LIMIT 1
        """;

    public async Task<StudentAccess?> ReadAsync(RequestContext context, CancellationToken cancellationToken = default)
    {
        var userId = context.Actor?.UserId;
        if (string.IsNullOrWhiteSpace(userId))
        {
            return null;
        }

        var now = timeProvider.GetUtcNow();
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        string? roleName;
        string? schoolId;
        await using (var command = Create(session, UserSql, userId))
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            if (!await reader.ReadAsync(cancellationToken))
            {
                return null;
            }

            roleName = ReadNullableString(reader, "roleName");
            schoolId = ReadNullableString(reader, "schoolId");
        }

        if (FormMapsRoles.Normalize(roleName) != FormMapsRoles.Student)
        {
            return StudentAccessRules.FullAccess("not_student");
        }

        if (!string.IsNullOrEmpty(schoolId))
        {
            if (!schoolCache.TryGet(schoolId, now, out var active))
            {
                SchoolContract? school = null;
                await using (var command = Create(session, SchoolSql, schoolId))
                await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
                {
                    if (await reader.ReadAsync(cancellationToken))
                    {
                        school = new SchoolContract(
                            reader.GetBoolean(reader.GetOrdinal("isActive")),
                            ReadNullableString(reader, "status"),
                            ReadNullableUtc(reader, "contractStartDate"),
                            ReadNullableUtc(reader, "contractEndDate"),
                            ReadNullableString(reader, "timezone"));
                    }
                }

                active = StudentAccessRules.SchoolHasActiveContract(school, now);
                schoolCache.Set(schoolId, now, active);
            }

            if (active)
            {
                return StudentAccessRules.FullAccess("school_contract");
            }
        }

        EntitlementSubscription? sub = null;
        await using (var command = Create(session, SubscriptionSql, userId))
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            if (await reader.ReadAsync(cancellationToken))
            {
                sub = new EntitlementSubscription(
                    ReadNullableString(reader, "status"),
                    reader.GetBoolean(reader.GetOrdinal("isActive")),
                    ReadNullableUtc(reader, "nextBillingDate"),
                    reader.GetBoolean(reader.GetOrdinal("hasPlan")),
                    ReadNullableString(reader, "planInterval"));
            }
        }

        var fromSubscription = StudentAccessRules.Evaluate(sub, now, graceDays);
        if (fromSubscription.FullPlatform && fromSubscription.PaidResults)
        {
            return fromSubscription;
        }

        return StudentAccessRules.WithComplimentary(
            fromSubscription,
            await ComplimentaryAccessReader.ReadActiveExpiryAsync(session, userId, schoolId, now, cancellationToken));
    }

    internal static DbCommand Create(FormMapsDatabaseSession session, string sql, string id)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        var parameter = command.CreateParameter();
        parameter.ParameterName = "id";
        parameter.Value = id;
        command.Parameters.Add(parameter);
        return command;
    }

    private static string? ReadNullableString(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        return reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
    }

    internal static DateTimeOffset? ReadNullableUtc(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        if (reader.IsDBNull(ordinal))
        {
            return null;
        }

        var value = reader.GetDateTime(ordinal);
        return new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Utc));
    }
}

/// <summary>
/// <see cref="IComplimentaryAccessReader"/> over raw Npgsql under the caller's read-only RLS session (audit E5). The
/// SQL + window live here once; <see cref="StudentAccessReader"/> runs the same query in its own session.
/// </summary>
public sealed class ComplimentaryAccessReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : IComplimentaryAccessReader
{
    // audit E5: latest expiry among the active complimentary grants covering the student (own or school's). The
    // same window as StudentAccessRules.IsComplimentaryGrantActive. RLS (prisma/rls/012) lets the student's own
    // session read exactly these rows.
    private const string ComplimentarySql = """
        SELECT MAX("expiresAt") AS "expiresAt"
        FROM "complimentary_access_grants"
        WHERE "revokedAt" IS NULL AND "startsAt" <= @now AND "expiresAt" > @now
          AND ("userId" = @id OR ("schoolId" IS NOT NULL AND "schoolId" = @school))
        """;

    public async Task<DateTimeOffset?> GetActiveExpiryAsync(
        RequestContext context, string userId, string? schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        return await ReadActiveExpiryAsync(session, userId, schoolId, timeProvider.GetUtcNow(), cancellationToken);
    }

    /// <summary>
    /// Null when no grant covers the student. A missing table (the migration not applied yet, SQLSTATE 42P01) counts
    /// as "no grant" — legacy findActiveComplimentaryExpiry fails soft the same way — so it can never lock anyone
    /// out. Any other DB error propagates (the filter fails closed, 503). Callers run it as the LAST statement of
    /// their session (a caught error aborts the transaction).
    /// </summary>
    public static async Task<DateTimeOffset?> ReadActiveExpiryAsync(
        FormMapsDatabaseSession session, string userId, string? schoolId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        try
        {
            await using var command = StudentAccessReader.Create(session, ComplimentarySql, userId);
            AddParameter(command, "school", (object?)schoolId ?? DBNull.Value);
            // timestamp(3) without time zone holds UTC wall-clock: pass an Unspecified DateTime (Npgsql rejects Kind=Utc here).
            AddParameter(command, "now", DateTime.SpecifyKind(now.UtcDateTime, DateTimeKind.Unspecified));
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            return await reader.ReadAsync(cancellationToken) ? StudentAccessReader.ReadNullableUtc(reader, "expiresAt") : null;
        }
        catch (DbException ex) when (ex.SqlState == "42P01")
        {
            return null;
        }
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
