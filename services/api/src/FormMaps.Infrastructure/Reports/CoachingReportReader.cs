using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Reports;

namespace FormMaps.Infrastructure.Reports;

/// <summary>
/// Reproduces the legacy GET /coaching/:userId handler (api/src/routes/report.ts).
/// Runs three queries under the CALLER's read-only RLS session.
/// Returns null when the target user row does not exist (endpoint maps that to a 404).
///
/// The booking-&gt;coach join selects ONLY the whitelisted columns; sensitive booking fields
/// (paymentIntentId, coachNotes, notes, meetingLink, cancellationReason) and coach fields
/// (hourlyRate, platformCommission, email) are never selected. amount is a BigInt read as long?.
/// </summary>
public sealed class CoachingReportReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : ICoachingReportReader
{
    private const string UserSql = """
        SELECT "id", "name"
        FROM "users"
        WHERE "id" = @userId
        """;

    // Explicit whitelist join. status is cast to text so Npgsql does not need the PG enum
    // registered. amount stays BigInt (int8) -> long. No sensitive columns are selected.
    private const string BookingsSql = """
        SELECT
            b."id",
            b."status"::text AS "status",
            b."startTime",
            b."amount",
            b."currency",
            c."name" AS coach_name,
            c."specialization" AS coach_specialization
        FROM "bookings" b
        JOIN "coaches" c ON c."id" = b."coachId"
        WHERE b."studentId" = @userId AND b."isActive" = true
        ORDER BY b."startTime" DESC
        """;

    private const string ReviewsCountSql = """
        SELECT COUNT(*)::int
        FROM "reviews"
        WHERE "studentId" = @userId AND "isActive" = true
        """;

    public async Task<CoachingReport?> ReadAsync(
        RequestContext requestContext,
        string targetUserId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(
            requestContext,
            cancellationToken);

        // 1) Target user — null when absent.
        string studentId;
        string studentName;
        await using (var userCommand = session.Connection.CreateCommand())
        {
            userCommand.Transaction = session.Transaction;
            userCommand.CommandText = UserSql;
            AddUserIdParameter(userCommand, targetUserId);

            await using var userReader = await userCommand.ExecuteReaderAsync(cancellationToken);
            if (!await userReader.ReadAsync(cancellationToken))
            {
                return null;
            }

            studentId = userReader.GetString(userReader.GetOrdinal("id"));
            studentName = userReader.GetString(userReader.GetOrdinal("name"));
        }

        // 2) Bookings joined to coaches (newest first), whitelisted columns only.
        var sessions = new List<CoachingSession>();
        var completedSessions = 0;
        long totalSpent = 0;
        string? firstCurrency = null;
        await using (var bookingCommand = session.Connection.CreateCommand())
        {
            bookingCommand.Transaction = session.Transaction;
            bookingCommand.CommandText = BookingsSql;
            AddUserIdParameter(bookingCommand, targetUserId);

            await using var bookingReader = await bookingCommand.ExecuteReaderAsync(cancellationToken);
            var amountOrdinal = -1;
            var currencyOrdinal = -1;
            while (await bookingReader.ReadAsync(cancellationToken))
            {
                if (amountOrdinal < 0)
                {
                    amountOrdinal = bookingReader.GetOrdinal("amount");
                    currencyOrdinal = bookingReader.GetOrdinal("currency");
                }

                var status = bookingReader.GetString(bookingReader.GetOrdinal("status"));
                long? rawAmount = bookingReader.IsDBNull(amountOrdinal)
                    ? null
                    : bookingReader.GetInt64(amountOrdinal);

                if (sessions.Count == 0)
                {
                    firstCurrency = bookingReader.IsDBNull(currencyOrdinal)
                        ? null
                        : bookingReader.GetString(currencyOrdinal);
                }

                if (status == "completed")
                {
                    completedSessions++;
                    // Legacy: (b.amount ? Number(b.amount) : 0) -> null AND 0n both contribute 0.
                    totalSpent += rawAmount ?? 0;
                }

                // Legacy: b.amount ? Number(b.amount) : null -> BigInt 0n is falsy, so 0 -> null.
                var displayAmount = rawAmount is null or 0 ? null : rawAmount;

                sessions.Add(new CoachingSession(
                    Id: bookingReader.GetString(bookingReader.GetOrdinal("id")),
                    CoachName: bookingReader.GetString(bookingReader.GetOrdinal("coach_name")),
                    CoachSpecialization: bookingReader.GetString(bookingReader.GetOrdinal("coach_specialization")),
                    Date: ReadDateTimeOffsetUtc(bookingReader, "startTime"),
                    Status: status,
                    Amount: displayAmount));
            }
        }

        // 3) Reviews given (count only).
        var reviewsGiven = 0;
        await using (var reviewsCommand = session.Connection.CreateCommand())
        {
            reviewsCommand.Transaction = session.Transaction;
            reviewsCommand.CommandText = ReviewsCountSql;
            AddUserIdParameter(reviewsCommand, targetUserId);

            var scalar = await reviewsCommand.ExecuteScalarAsync(cancellationToken);
            reviewsGiven = scalar is int count ? count : Convert.ToInt32(scalar);
        }

        // Legacy: bookings[0]?.currency || "USD" — null AND "" both fall back to "USD".
        var currency = string.IsNullOrEmpty(firstCurrency) ? "USD" : firstCurrency;

        return new CoachingReport(
            StudentId: studentId,
            StudentName: studentName,
            TotalSessions: sessions.Count,
            CompletedSessions: completedSessions,
            TotalSpent: totalSpent,
            Currency: currency,
            ReviewsGiven: reviewsGiven,
            Sessions: sessions,
            GeneratedAt: DateTimeOffset.UtcNow);
    }

    private static void AddUserIdParameter(DbCommand command, string targetUserId)
    {
        var userIdParameter = command.CreateParameter();
        userIdParameter.ParameterName = "userId";
        userIdParameter.Value = targetUserId;
        command.Parameters.Add(userIdParameter);
    }

    private static DateTimeOffset ReadDateTimeOffsetUtc(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        var value = reader.GetDateTime(ordinal);
        return new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Utc));
    }
}
