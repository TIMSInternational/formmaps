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

    /// <summary>
    /// "refresh_tokens"."updatedAt" is NOT NULL with NO database default (same app-managed-timestamp
    /// convention as "login_attempts"/"users" -- see auth-schema.sql's header comment and
    /// RecordFailedLoginAsync above). Bound explicitly (inline now()) on this INSERT.
    /// </summary>
    public async Task<string> CreateRefreshTokenAsync(string userId, string clientIp, CancellationToken cancellationToken = default)
    {
        var token = RefreshTokenGenerator.Generate();
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, """
            INSERT INTO "refresh_tokens" ("id","userId","token","expiresAt","createdByIp","updatedAt")
            VALUES (gen_random_uuid()::text, @userId, @token, @expiresAt, @ip, now())
            """);
        AddParameter(command, "userId", userId);
        AddParameter(command, "token", token);
        AddParameter(command, "expiresAt", DateTime.UtcNow.AddDays(14));
        AddParameter(command, "ip", clientIp);
        await command.ExecuteNonQueryAsync(cancellationToken);
        await session.CommitAsync(cancellationToken);
        return token;
    }

    /// <summary>
    /// Single-use rotation. Ordering within this one session/transaction is deliberate and is the
    /// highest-risk logic in this domain:
    ///   1. Look up the presented token (and its owning user's CURRENT "isActive", not a cached
    ///      value from login time -- this is the TOCTOU-safety re-check) in one JOINed SELECT.
    ///   2. If unknown, stop (nothing to revoke, nothing to commit besides the read).
    ///   3. If revoked/expired/inactive-user, revoke the row anyway (matches legacy: a token
    ///      presented after it's gone stale still gets marked revoked on the attempt that discovers
    ///      it, closing any window where a stale-but-not-yet-revoked row could be replayed) and
    ///      commit, returning null.
    ///   4. Otherwise revoke-old THEN create-new, both inside the same still-open transaction,
    ///      committed once at the end. Revoking old before minting new is what makes the token
    ///      single-use: if two concurrent requests race to rotate the same token, only one can
    ///      observe "not yet revoked" under the row lock the UPDATE takes -- see the report for the
    ///      full concurrency walkthrough.
    /// "refresh_tokens"."updatedAt" is bound explicitly on the new-token INSERT (same NOT-NULL-no-
    /// default gap as CreateRefreshTokenAsync above), and "updatedAt" = now() is added to the
    /// revoke UPDATE (RevokeTokenRowAsync) to keep the app-managed timestamp current on every actual
    /// row mutation, matching RecordFailedLoginAsync's established convention.
    /// </summary>
    public async Task<RotateResult?> RotateRefreshTokenAsync(string oldToken, string clientIp, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        await using var lookup = Command(session, """
            SELECT rt."id", rt."userId", rt."expiresAt", rt."isRevoked", u."isActive"
            FROM "refresh_tokens" rt JOIN "users" u ON u."id" = rt."userId"
            WHERE rt."token" = @token
            """);
        AddParameter(lookup, "token", oldToken);

        string tokenId;
        string userId;
        DateTime expiresAt;
        bool isRevoked;
        bool userIsActive;
        await using (var reader = await lookup.ExecuteReaderAsync(cancellationToken))
        {
            if (!await reader.ReadAsync(cancellationToken)) return null; // unknown token -- nothing to revoke, nothing to commit

            tokenId = reader.GetString(0);
            userId = reader.GetString(1);
            expiresAt = reader.GetDateTime(2);
            isRevoked = reader.GetBoolean(3);
            userIsActive = reader.GetBoolean(4);
        }

        if (isRevoked || expiresAt < DateTime.UtcNow || !userIsActive)
        {
            // Revoke on any invalid presentation too (matches legacy: expired/inactive-user tokens
            // get marked revoked on the attempt that discovers them, not just left dangling).
            await RevokeTokenRowAsync(session, tokenId, clientIp, cancellationToken);
            await session.CommitAsync(cancellationToken);
            return null;
        }

        // Revoke-old-THEN-create-new, single-use enforced by this exact ordering within one transaction.
        await RevokeTokenRowAsync(session, tokenId, clientIp, cancellationToken);

        var newToken = RefreshTokenGenerator.Generate();
        await using var insert = Command(session, """
            INSERT INTO "refresh_tokens" ("id","userId","token","expiresAt","createdByIp","updatedAt")
            VALUES (gen_random_uuid()::text, @userId, @token, @expiresAt, @ip, now())
            """);
        AddParameter(insert, "userId", userId);
        AddParameter(insert, "token", newToken);
        AddParameter(insert, "expiresAt", DateTime.UtcNow.AddDays(14));
        AddParameter(insert, "ip", clientIp);
        await insert.ExecuteNonQueryAsync(cancellationToken);

        await session.CommitAsync(cancellationToken);
        return new RotateResult(newToken, userId);
    }

    /// <summary>
    /// "updatedAt" = now() added to this UPDATE -- it doesn't crash without it (UPDATE only touches
    /// the columns it SETs), but leaving the app-managed timestamp stale after actually mutating the
    /// row would violate the convention every other write path in this domain follows.
    /// </summary>
    public async Task RevokeAllRefreshTokensAsync(string userId, string clientIp, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, """
            UPDATE "refresh_tokens" SET "isRevoked" = true, "revokedAt" = now(), "revokedByIp" = @ip, "updatedAt" = now()
            WHERE "userId" = @userId AND "isRevoked" = false
            """);
        AddParameter(command, "userId", userId);
        AddParameter(command, "ip", clientIp);
        await command.ExecuteNonQueryAsync(cancellationToken);
        await session.CommitAsync(cancellationToken);
    }

    /// <summary>See RevokeAllRefreshTokensAsync's remark re: "updatedAt" = now() on row mutation.</summary>
    private static async Task RevokeTokenRowAsync(FormMapsDatabaseSession session, string tokenId, string clientIp, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            UPDATE "refresh_tokens" SET "isRevoked" = true, "revokedAt" = now(), "revokedByIp" = @ip, "updatedAt" = now() WHERE "id" = @id
            """);
        AddParameter(command, "id", tokenId);
        AddParameter(command, "ip", clientIp);
        await command.ExecuteNonQueryAsync(cancellationToken);
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
