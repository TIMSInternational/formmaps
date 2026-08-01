using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Auth;

/// <summary>
/// SQL for routes/auth.ts's login/lockout slice (this task; Tasks 7-10 add refresh-token
/// rotation/revoke, profile, change-*, school-admin registration, and forgot/reset-password methods
/// to this same class). Every method runs under <see cref="RequestContext.System"/> since these are
/// pre-auth operations -- there is no caller identity to scope RLS by yet.
/// </summary>
public sealed partial class AuthRepository(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IAuthRepository
{
    private const int MaxLoginAttempts = 5;
    private static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);

    public async Task<AuthUserRow?> FindUserByEmailAsync(string normalizedEmail, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT "id","name","email","password","roleId","roleName","schoolId","isActive"
            FROM "users" WHERE "email" = @email
            """);
        AddParameter(command, "email", normalizedEmail);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;

        return new AuthUserRow(
            reader.GetString(0), reader.GetString(1), reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            reader.GetString(4), reader.GetString(5),
            reader.IsDBNull(6) ? null : reader.GetString(6),
            reader.GetBoolean(7));
    }

    public async Task<LockoutStatus> GetLockoutStatusAsync(string email, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """SELECT "lockedUntil" FROM "login_attempts" WHERE "email" = @email""");
        AddParameter(command, "email", email);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        if (result is null or DBNull) return new LockoutStatus(false, null);

        var lockedUntil = (DateTime)result;
        var isLocked = lockedUntil > DateTime.UtcNow;
        return new LockoutStatus(isLocked, isLocked ? new DateTimeOffset(lockedUntil, TimeSpan.Zero) : null);
    }

    /// <summary>
    /// "login_attempts"."updatedAt" is NOT NULL with NO database default (see auth-schema.sql's
    /// header comment -- application-managed, matching Prisma's @updatedAt exactly). Both the INSERT
    /// branch AND the ON CONFLICT DO UPDATE branch bind it explicitly here; an earlier draft only set
    /// it in the DO UPDATE branch, which would fail with a not-null violation on every first-ever
    /// failed login for a given email.
    /// </summary>
    public async Task<int> RecordFailedLoginAsync(string email, string clientIp, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        await using var upsert = Command(session, """
            INSERT INTO "login_attempts" ("id","email","failedCount","lastIp","updatedAt")
            VALUES (gen_random_uuid()::text, @email, 1, @ip, now())
            ON CONFLICT ("email") DO UPDATE SET "failedCount" = "login_attempts"."failedCount" + 1, "lastIp" = @ip, "updatedAt" = now()
            RETURNING "failedCount"
            """);
        AddParameter(upsert, "email", email);
        AddParameter(upsert, "ip", clientIp);
        var newCount = (int)(await upsert.ExecuteScalarAsync(cancellationToken))!;

        if (newCount >= MaxLoginAttempts)
        {
            await using var lockCommand = Command(session, """
                UPDATE "login_attempts" SET "lockedUntil" = @lockedUntil, "failedCount" = 0, "updatedAt" = now()
                WHERE "email" = @email
                """);
            AddParameter(lockCommand, "lockedUntil", DateTime.UtcNow.Add(LockoutDuration));
            AddParameter(lockCommand, "email", email);
            await lockCommand.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return newCount;
    }

    public async Task ClearLoginAttemptsAsync(string email, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, """DELETE FROM "login_attempts" WHERE "email" = @email""");
        AddParameter(command, "email", email);
        await command.ExecuteNonQueryAsync(cancellationToken);
        await session.CommitAsync(cancellationToken);
    }

    public async Task<string> GetLanguageAsync(string userId, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """SELECT "language" FROM "user_settings" WHERE "userId" = @userId""");
        AddParameter(command, "userId", userId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        var language = result as string;
        return language == "es" ? "es" : "en";
    }

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
