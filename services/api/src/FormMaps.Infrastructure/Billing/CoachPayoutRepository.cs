using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Billing.Payouts;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Billing;

/// <summary>
/// Monthly coach payouts (audit D3) — twin of formmaps-platform coachPayoutService.ts and the Mark-as-paid route.
/// Runs on the caller's session; the endpoint admits Super Admins only, whose session is the RLS bypass plan
/// ("payments" and "payouts" are policied owner-only in 007-self-scoped.sql, "bookings" and "coaches" are not).
///
/// <para>Superset of Node, deliberately: the PAYOUT_GENERATE / PAYOUT_APPROVE audit rows are written in the SAME
/// transaction as the payout write (Node audits after the commit and swallows audit errors) — the
/// SchoolUsersWriter precedent. "audit_logs" is unpolicied.</para>
///
/// <para>Prisma Decimal columns are numeric(65,30); scale 30 overflows System.Decimal (28), so every Decimal is read
/// through ROUND(x, 6).</para>
/// </summary>
public sealed class CoachPayoutRepository(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ICoachPayoutRepository
{
    public async Task<MonthlyPayouts> GetMonthlyAsync(
        RequestContext context, PayoutMonth month, DateTime nowUtc, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        var lines = await LoadLinesAsync(session, month, cancellationToken);
        var payouts = await LoadMonthPayoutsAsync(session, month, cancellationToken);
        return MonthlyPayoutAssembler.Summarize(month, MonthlyPayoutAssembler.BuildRows(lines, payouts), nowUtc);
    }

    public async Task<GenerateOutcome> GenerateAsync(
        RequestContext context, PayoutMonth month, PayoutAuditActor actor, DateTime nowUtc, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Same key as Node (hashtext('coach-payouts:YYYY-MM')), so the two backends serialize against each other too.
        await using (var lockCommand = Command(session, "SELECT pg_advisory_xact_lock(hashtext(@key))"))
        {
            AddParameter(lockCommand, "key", "coach-payouts:" + month.Month);
            await lockCommand.ExecuteNonQueryAsync(cancellationToken);
        }

        var lines = await LoadLinesAsync(session, month, cancellationToken);
        var existing = await LoadMonthPayoutsAsync(session, month, cancellationToken);
        var byKey = new Dictionary<string, MonthlyPayoutAssembler.StoredPayout>(StringComparer.Ordinal);
        foreach (var p in existing) byKey.TryAdd(p.CoachId + "|" + p.Currency.ToUpperInvariant(), p);

        int created = 0, updated = 0, unchanged = 0, locked = 0;
        foreach (var line in lines)
        {
            var notes = $"Monthly payout {month.Month}: {line.Sessions} session(s), gross {Units(line.GrossCents):0.00} {line.Currency}";
            if (!byKey.TryGetValue(line.CoachId + "|" + line.Currency, out var payout))
            {
                await using var insert = Command(session, """
                    INSERT INTO "payouts" ("id","coachId","amount","currency","status","requestedAt","notes","periodStart","periodEnd",
                        "platformFeeAmount","platformFeePercentage","netAmount","isActive","createdBy","createdDate","updatedAt")
                    VALUES (gen_random_uuid()::text, @coach, @net, @currency, 'pending', @now, @notes, @start, @end,
                        @fee, @pct, @net, true, @actor, @now, @now)
                    """);
                AddParameter(insert, "coach", line.CoachId);
                AddParameter(insert, "net", Units(line.NetCents));
                AddParameter(insert, "currency", line.Currency);
                AddParameter(insert, "now", Ts(nowUtc));
                AddParameter(insert, "notes", notes);
                AddParameter(insert, "start", Ts(month.Start));
                AddParameter(insert, "end", Ts(month.End));
                AddParameter(insert, "fee", Units(line.CommissionCents));
                AddParameter(insert, "pct", line.CommissionPercent);
                AddParameter(insert, "actor", actor.UserId);
                await insert.ExecuteNonQueryAsync(cancellationToken);
                created++;
            }
            else if (payout.Status != "pending")
            {
                locked++;
            }
            else if (payout.NetCents == line.NetCents && payout.CommissionCents == line.CommissionCents)
            {
                unchanged++;
            }
            else
            {
                await using var update = Command(session, """
                    UPDATE "payouts" SET "amount" = @net, "netAmount" = @net, "platformFeeAmount" = @fee,
                        "platformFeePercentage" = @pct, "notes" = @notes, "updatedBy" = @actor, "updatedAt" = @now
                    WHERE "id" = @id AND "status" = 'pending'
                    """);
                AddParameter(update, "net", Units(line.NetCents));
                AddParameter(update, "fee", Units(line.CommissionCents));
                AddParameter(update, "pct", line.CommissionPercent);
                AddParameter(update, "notes", notes);
                AddParameter(update, "actor", actor.UserId);
                AddParameter(update, "now", Ts(nowUtc));
                AddParameter(update, "id", payout.Id);
                await update.ExecuteNonQueryAsync(cancellationToken);
                updated++;
            }
        }

        await WriteAuditAsync(session, actor, "PAYOUT_GENERATE", month.Month, new Dictionary<string, object?>
        {
            ["month"] = month.Month,
            ["created"] = created,
            ["updated"] = updated,
            ["unchanged"] = unchanged,
            ["locked"] = locked,
        }, cancellationToken);

        var after = await LoadMonthPayoutsAsync(session, month, cancellationToken);
        await session.CommitAsync(cancellationToken);
        return new GenerateOutcome(created, updated, unchanged, locked,
            MonthlyPayoutAssembler.Summarize(month, MonthlyPayoutAssembler.BuildRows(lines, after), nowUtc));
    }

    public async Task<MarkPaidOutcome> MarkPaidAsync(
        RequestContext context, string payoutId, DateTime paidAt, string? reference, PayoutAuditActor actor,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, """
            UPDATE "payouts" SET "status" = 'completed', "approvedBy" = @actor, "approvedAt" = now(),
                "processedAt" = @paidAt, "transactionId" = @reference, "updatedAt" = now()
            WHERE "id" = @id AND "status" = 'pending'
            RETURNING "coachId", ROUND("amount", 6), "currency"
            """);
        AddParameter(command, "actor", actor.UserId);
        AddParameter(command, "paidAt", Ts(paidAt));
        AddParameter(command, "reference", (object?)reference ?? DBNull.Value);
        AddParameter(command, "id", payoutId);

        string coachId, currency;
        decimal amount;
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            if (!await reader.ReadAsync(cancellationToken)) return new MarkPaidOutcome(MarkPaidStatus.NotPending);
            coachId = reader.GetString(0);
            amount = reader.GetDecimal(1);
            currency = reader.GetString(2);
        }

        await WriteAuditAsync(session, actor, "PAYOUT_APPROVE", payoutId, new Dictionary<string, object?>
        {
            ["coachId"] = coachId,
            ["amount"] = amount,
            ["currency"] = currency,
            ["paidAt"] = paidAt.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
            ["reference"] = reference,
        }, cancellationToken);

        await session.CommitAsync(cancellationToken);
        return new MarkPaidOutcome(MarkPaidStatus.Paid);
    }

    private static async Task<IReadOnlyList<PayoutLine>> LoadLinesAsync(
        FormMapsDatabaseSession session, PayoutMonth month, CancellationToken cancellationToken)
    {
        var bookings = new List<EligibleBooking>();
        await using (var command = Command(session, """
            SELECT b."id", b."coachId", b."amount", b."currency"
            FROM "bookings" b
            WHERE b."status" = 'completed' AND b."isPaymentDone" = true AND b."isActive" = true AND b."amount" > 0
              AND ((b."completedAt" >= @start AND b."completedAt" < @end)
                   OR (b."completedAt" IS NULL AND b."endTime" >= @start AND b."endTime" < @end))
              AND NOT EXISTS (
                SELECT 1 FROM "payments" p WHERE p."bookingId" = b."id" AND p."status" = ANY(@refunded))
            """))
        {
            AddParameter(command, "start", Ts(month.Start));
            AddParameter(command, "end", Ts(month.End));
            AddParameter(command, "refunded", CoachPayoutCalculator.RefundedPaymentStatuses);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                bookings.Add(new EligibleBooking(reader.GetString(0), reader.GetString(1), reader.GetInt64(2),
                    reader.IsDBNull(3) ? null : reader.GetString(3)));
            }
        }

        if (bookings.Count == 0) return [];

        var coaches = new List<PayoutCoach>();
        await using (var command = Command(session, """
            SELECT "id", "name", "email", ROUND("platformCommission", 6) FROM "coaches" WHERE "id" = ANY(@ids)
            """))
        {
            AddParameter(command, "ids", bookings.Select(b => b.CoachId).Distinct(StringComparer.Ordinal).ToArray());
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                coaches.Add(new PayoutCoach(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetDecimal(3)));
            }
        }

        return CoachPayoutCalculator.ComputeLines(bookings, coaches);
    }

    private static async Task<IReadOnlyList<MonthlyPayoutAssembler.StoredPayout>> LoadMonthPayoutsAsync(
        FormMapsDatabaseSession session, PayoutMonth month, CancellationToken cancellationToken)
    {
        var payouts = new List<MonthlyPayoutAssembler.StoredPayout>();
        await using var command = Command(session, """
            SELECT p."id", p."coachId", c."name", c."email", p."currency", p."status"::text,
                   ROUND(COALESCE(p."netAmount", p."amount"), 6), ROUND(p."platformFeeAmount", 6), ROUND(p."platformFeePercentage", 6),
                   p."requestedAt", p."processedAt", p."transactionId"
            FROM "payouts" p JOIN "coaches" c ON c."id" = p."coachId"
            WHERE p."isActive" = true AND p."periodStart" = @start
            ORDER BY p."createdDate" ASC
            """);
        AddParameter(command, "start", Ts(month.Start));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            payouts.Add(new MonthlyPayoutAssembler.StoredPayout(
                reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4),
                reader.GetString(5), Cents(reader.GetDecimal(6)), reader.IsDBNull(7) ? 0 : Cents(reader.GetDecimal(7)),
                reader.IsDBNull(8) ? null : reader.GetDecimal(8),
                DateTime.SpecifyKind(reader.GetDateTime(9), DateTimeKind.Utc),
                reader.IsDBNull(10) ? null : DateTime.SpecifyKind(reader.GetDateTime(10), DateTimeKind.Utc),
                reader.IsDBNull(11) ? null : reader.GetString(11)));
        }

        return payouts;
    }

    // audit(req, ACTION, "Payout", resourceId, details) — the legacy audit_logs row, same columns Node writes.
    private static async Task WriteAuditAsync(
        FormMapsDatabaseSession session, PayoutAuditActor actor, string action, string resourceId,
        Dictionary<string, object?> details, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            INSERT INTO "audit_logs" ("id","actorId","actorEmail","action","resourceType","resourceId","details","ipAddress","updatedAt")
            VALUES (gen_random_uuid()::text, @actorId, @actorEmail, @action, 'Payout', @resourceId, CAST(@details AS jsonb), @ip, now())
            """);
        AddParameter(command, "actorId", actor.UserId);
        AddParameter(command, "actorEmail", actor.Email);
        AddParameter(command, "action", action);
        AddParameter(command, "resourceId", resourceId);
        AddParameter(command, "details", JsonSerializer.Serialize(details));
        AddParameter(command, "ip", string.IsNullOrEmpty(actor.IpAddress) ? DBNull.Value : actor.IpAddress);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    // Prisma DateTime columns are `timestamp(3) without time zone` holding UTC wall time: bind Unspecified, ms precision.
    private static DateTime Ts(DateTime utc) =>
        new(utc.Ticks - (utc.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Unspecified);

    private static decimal Units(long cents) => cents / 100m;

    private static long Cents(decimal units) => (long)Math.Round(units * 100m, MidpointRounding.AwayFromZero);

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
}
