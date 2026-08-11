using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Billing;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Billing;

/// <summary>
/// Domain 9a Task 7. Opens a read-only session via the caller's own RequestContext (tenant-scoped RLS
/// GUCs applied), mirroring SubscriptionGuard's read of the same table -- NOT RequestContext.System(),
/// which the shadow-table repository/reconciliation worker use since shadow_* tables are .NET-internal
/// and not tenant-scoped. user_subscriptions is Node-owned legacy data; this class is read-only. (The
/// one .NET write to that table lives in LiveSubscriptionWriter, added by formmaps#30 for
/// POST /cancel-subscription — see ILiveSubscriptionWriter for why.)
/// </summary>
public sealed class LiveSubscriptionReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ILiveSubscriptionReader
{
    /// <summary>
    /// formmaps#108. ORDER BY + LIMIT 1 are DEFENCE IN DEPTH, not a correctness requirement.
    ///
    /// <para>CORRECTED 2026-08-10 -- an earlier version of this comment asserted that
    /// <c>@@unique([userId])</c> "exists in NO migration, so production may hold several rows for one
    /// user". That premise is REFUTED and must not be repeated. Production is believed to carry the
    /// unique index <c>user_subscriptions_userId_key</c>, because prod was built with
    /// <c>prisma db push</c> straight from schema.prisma, which realises schema.prisma:534's
    /// <c>@@unique([userId])</c>.
    ///
    /// <para>PROVENANCE, stated precisely so the next reader knows what to trust: that is an inference
    /// from the build method, plus a <c>\d user_subscriptions</c> reading recorded in a 2026-08-07
    /// comment on formmaps#108. Neither is a committed artefact in this repo, and neither has been
    /// re-confirmed since. Do NOT upgrade this to "measured" without re-running it -- an earlier
    /// revision of this comment said exactly that, which is worse than the error it replaced because it
    /// instructs the reader not to re-derive. An uncommitted measurement from a past session is not
    /// evidence; that rule is written into domain-status.manifest.json for the same reason.</para>
    ///
    /// <para>The migration history was separately reconciled by
    /// api/prisma/migrations/20260808000000_user_subscriptions_userid_unique, whose
    /// <c>CREATE UNIQUE INDEX IF NOT EXISTS</c> is a no-op against prod and a real fix for any database
    /// replayed from prisma/migrations/. So a user owns AT MOST ONE row, and this SELECT's WHERE already
    /// matches at most one.</para>
    ///
    /// <para>The ordering stays anyway because it is free and it removes a silent dependency on an index
    /// rather than on the query: a database restored from a replay that stops before 2026-08-08, or one
    /// where the index is dropped during maintenance, still gets a deterministic read instead of heap
    /// order (which shifts under VACUUM/UPDATE and could surface a stale cancelled row while an active
    /// one existed). <c>createdDate DESC</c> mirrors legacy api/src/routes/user.ts:314
    /// (<c>findFirst orderBy: { createdDate: "desc" }</c>); <c>"id"</c> is the tie-break for
    /// same-millisecond rows, since createdDate alone is not unique.</para>
    ///
    /// <para>Separately real and NOT fixed here: user_subscriptions still has other migration/schema
    /// drift (the stripeSubscriptionId unique, the planId index, and the stripeSubscriptionId /
    /// cancelAtPeriodEnd COLUMNS are all absent from the history), and ~30 tables have no CREATE TABLE at
    /// all. That is formmaps#126, not this one.</para>
    /// </summary>
    private const string SubscriptionSql = """
        SELECT "id", "status", "isActive", "nextBillingDate", "planId", "stripeSubscriptionId"
        FROM "user_subscriptions"
        WHERE "userId" = @userId
        ORDER BY "createdDate" DESC, "id"
        LIMIT 1
        """;

    public async Task<LiveSubscriptionRow?> GetForUserAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = SubscriptionSql;
        AddUserId(command, userId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new LiveSubscriptionRow(
            ReadNullableString(reader, "status"),
            reader.GetBoolean(reader.GetOrdinal("isActive")),
            ReadNullableDateTimeOffsetUtc(reader, "nextBillingDate"),
            ReadNullableString(reader, "planId"),
            ReadNullableString(reader, "stripeSubscriptionId"),
            reader.GetString(reader.GetOrdinal("id")));
    }

    private static void AddUserId(DbCommand command, string userId)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = "userId";
        parameter.Value = userId;
        command.Parameters.Add(parameter);
    }

    private static string? ReadNullableString(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        return reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
    }

    private static DateTimeOffset? ReadNullableDateTimeOffsetUtc(DbDataReader reader, string name)
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
