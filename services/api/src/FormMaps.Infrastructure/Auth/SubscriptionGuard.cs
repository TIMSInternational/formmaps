using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using Microsoft.Extensions.Logging;

namespace FormMaps.Infrastructure.Auth;

/// <summary>
/// Reproduces legacy <c>src/middleware/requireSubscription.ts</c>. Reads the caller's OWN
/// roleName + schoolId from the DB (not the JWT, matching legacy) under the caller's read-only RLS
/// session. Non-student roles and school-affiliated students pass; a school-less individual student
/// needs an access-granting subscription (<see cref="SubscriptionAccess"/>). Denials are never
/// enumerable beyond the fixed legacy messages.
/// </summary>
public sealed class SubscriptionGuard(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    ILogger<SubscriptionGuard> logger,
    int graceDays) : ISubscriptionGuard
{
    private static readonly string[] StudentRoles = ["student", "Student"];

    private const string UserSql = """
        SELECT "roleName", "schoolId"
        FROM "users"
        WHERE "id" = @userId
        """;

    private const string SubscriptionSql = """
        SELECT "status", "isActive", "nextBillingDate"
        FROM "user_subscriptions"
        WHERE "userId" = @userId AND "isActive" = true
        LIMIT 1
        """;

    public async Task<GuardDecision> RequireSubscriptionAsync(
        RequestContext context,
        CancellationToken cancellationToken = default)
    {
        var userId = context.Actor?.UserId;
        if (string.IsNullOrWhiteSpace(userId))
        {
            return GuardDecision.Deny(401, "missing_identity", "Authenticated identity is required.");
        }

        try
        {
            return await EvaluateAsync(context, userId, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Legacy requireSubscription catches its own errors and returns 503 (transient), NOT the
            // 500 the global handler would emit — fail-closed either way, but 503 is the retryable
            // status contract clients/LBs expect from the entitlement gate.
            logger.LogError(ex, "Subscription check failed");
            return GuardDecision.Deny(503, "service_unavailable", "Service temporarily unavailable");
        }
    }

    private async Task<GuardDecision> EvaluateAsync(
        RequestContext context,
        string userId,
        CancellationToken cancellationToken)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        string? roleName;
        string? schoolId;
        await using (var userCommand = session.Connection.CreateCommand())
        {
            userCommand.Transaction = session.Transaction;
            userCommand.CommandText = UserSql;
            AddUserId(userCommand, userId);

            await using var reader = await userCommand.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return GuardDecision.Deny(401, "user_not_found", "User not found");
            }

            roleName = ReadNullableString(reader, "roleName");
            schoolId = ReadNullableString(reader, "schoolId");
        }

        // Non-student roles bypass the subscription check entirely.
        if (roleName is null || !StudentRoles.Contains(roleName, StringComparer.Ordinal))
        {
            return GuardDecision.Allow();
        }

        // School students are covered by their school's subscription.
        if (!string.IsNullOrWhiteSpace(schoolId))
        {
            return GuardDecision.Allow();
        }

        // Individual (school-less) student: needs an access-granting subscription.
        await using (var subCommand = session.Connection.CreateCommand())
        {
            subCommand.Transaction = session.Transaction;
            subCommand.CommandText = SubscriptionSql;
            AddUserId(subCommand, userId);

            await using var reader = await subCommand.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var status = ReadNullableString(reader, "status");
                var isActive = reader.GetBoolean(reader.GetOrdinal("isActive"));
                DateTimeOffset? nextBillingDate = ReadNullableDateTimeOffsetUtc(reader, "nextBillingDate");

                if (SubscriptionAccess.GrantsAccess(status, isActive, nextBillingDate, DateTimeOffset.UtcNow, graceDays))
                {
                    return GuardDecision.Allow();
                }
            }
        }

        return GuardDecision.Deny(
            403,
            "SUBSCRIPTION_REQUIRED",
            "Active subscription required to access this feature");
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
