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
    ///      value from login time -- this is the TOCTOU-safety re-check) in one JOINed SELECT --
    ///      <c>FOR UPDATE</c>, taking the row lock BEFORE the validity check runs. Same idiom as
    ///      PcaExamWriter.SubmitExamAsync/LiaSessionWriter's SelectForUpdateSql: a second concurrent
    ///      rotation attempt for the SAME token blocks on this lock until the first transaction
    ///      commits, then (READ COMMITTED semantics) re-reads the now-current, post-commit row, so
    ///      it observes "isRevoked" = true rather than the stale value it would have seen with a
    ///      plain (non-locking) SELECT. Fix round 1 (Critical, post-review): the original draft used
    ///      a plain SELECT here, which let two simultaneous requests both read "isRevoked" = false
    ///      before either committed and both mint a replacement token -- defeating single-use
    ///      rotation as a theft-detection signal. See AuthRepositoryRefreshTests'
    ///      RotateRefreshToken_ConcurrentRotationOfSameToken_ExactlyOneWins for the regression test.
    ///   2. If unknown, stop (nothing to revoke, nothing to commit besides the read).
    ///   3. If revoked/expired/inactive-user, revoke the row anyway (matches legacy: a token
    ///      presented after it's gone stale still gets marked revoked on the attempt that discovers
    ///      it, closing any window where a stale-but-not-yet-revoked row could be replayed) and
    ///      commit, returning null.
    ///   4. Otherwise revoke-old THEN create-new, both inside the same still-open transaction,
    ///      committed once at the end. The revoke here uses a CONDITIONAL UPDATE (WHERE "id" = @id
    ///      AND "isRevoked" = false) and fails closed (throws) on 0 rows affected -- same
    ///      belt-and-suspenders idiom as PcaExamWriter's completion UPDATE: the FOR UPDATE lock
    ///      above already makes this unreachable in practice (nothing else can have flipped
    ///      "isRevoked" on a row we are holding locked), so 0 rows here means the row vanished out
    ///      from under an active lock -- an invariant violation, not a normal race outcome -- and
    ///      minting a replacement token for that case must never happen silently.
    /// "refresh_tokens"."updatedAt" is bound explicitly on the new-token INSERT (same NOT-NULL-no-
    /// default gap as CreateRefreshTokenAsync above), and "updatedAt" = now() is added to every
    /// revoke UPDATE to keep the app-managed timestamp current on every actual row mutation,
    /// matching RecordFailedLoginAsync's established convention.
    /// </summary>
    public async Task<RotateResult?> RotateRefreshTokenAsync(string oldToken, string clientIp, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        await using var lookup = Command(session, """
            SELECT rt."id", rt."userId", rt."expiresAt", rt."isRevoked", u."isActive"
            FROM "refresh_tokens" rt JOIN "users" u ON u."id" = rt."userId"
            WHERE rt."token" = @token
            FOR UPDATE OF rt
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
            // get marked revoked on the attempt that discovers them, not just left dangling). Plain
            // (unconditional) revoke here -- this is idempotent bookkeeping on an already-invalid
            // row, not the single-use state transition, so there is no race to guard against and no
            // replacement token is ever minted off the back of it.
            await RevokeTokenRowAsync(session, tokenId, clientIp, cancellationToken);
            await session.CommitAsync(cancellationToken);
            return null;
        }

        // Revoke-old-THEN-create-new, single-use enforced by the FOR UPDATE lock above plus this
        // ordering within one transaction. Conditional UPDATE + fail-closed 0-row check: see the
        // class doc above this method for why 0 rows here is an invariant violation, not a race.
        var revoked = await RevokeTokenRowForRotationAsync(session, tokenId, clientIp, cancellationToken);
        if (revoked == 0)
        {
            throw new InvalidOperationException($"Refresh token rotation revoke-old update affected 0 rows for token id {tokenId}");
        }

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

    /// <summary>
    /// Unconditional revoke -- used for the invalid-token bookkeeping path (already-revoked/expired/
    /// inactive-user) in RotateRefreshTokenAsync, where re-marking an already-revoked row is
    /// idempotent and never gates minting a replacement token. See RevokeAllRefreshTokensAsync's
    /// remark re: "updatedAt" = now() on row mutation.
    /// </summary>
    private static async Task RevokeTokenRowAsync(FormMapsDatabaseSession session, string tokenId, string clientIp, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            UPDATE "refresh_tokens" SET "isRevoked" = true, "revokedAt" = now(), "revokedByIp" = @ip, "updatedAt" = now() WHERE "id" = @id
            """);
        AddParameter(command, "id", tokenId);
        AddParameter(command, "ip", clientIp);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    /// <summary>
    /// Conditional revoke used ONLY for the single-use state transition inside
    /// RotateRefreshTokenAsync's valid-token path -- guards "isRevoked" = false in the WHERE clause
    /// (same idiom as PcaExamWriter.SubmitExamAsync's completion UPDATE guarding "isCompleted" =
    /// false) so the caller can fail closed if 0 rows are affected. Returns the affected row count.
    /// </summary>
    private static async Task<int> RevokeTokenRowForRotationAsync(FormMapsDatabaseSession session, string tokenId, string clientIp, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            UPDATE "refresh_tokens" SET "isRevoked" = true, "revokedAt" = now(), "revokedByIp" = @ip, "updatedAt" = now()
            WHERE "id" = @id AND "isRevoked" = false
            """);
        AddParameter(command, "id", tokenId);
        AddParameter(command, "ip", clientIp);
        return await command.ExecuteNonQueryAsync(cancellationToken);
    }

    /// <summary>
    /// Profile read backing GET /auth/profile (authService.ts's getProfile). Joins the latest
    /// "isActive" = true "user_subscriptions" row for this user via a correlated subquery
    /// (ordered by "createdDate" DESC, LIMIT 1) -- defensive against the real schema's
    /// @@unique([userId]) ever being relaxed, matching legacy's Prisma query shape exactly rather
    /// than relying on that constraint. Falls back to "none" when no active subscription row
    /// exists, matching legacy's `user.subscriptions[0]?.status || "none"`.
    /// </summary>
    public async Task<ProfileRow?> GetProfileAsync(string userId, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT u."id", u."name", u."email", u."roleId", u."roleName", u."schoolId",
                (SELECT us."status" FROM "user_subscriptions" us
                 WHERE us."userId" = u."id" AND us."isActive" = true
                 ORDER BY us."createdDate" DESC LIMIT 1) AS "subscriptionStatus"
            FROM "users" u
            WHERE u."id" = @userId
            """);
        AddParameter(command, "userId", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;

        return new ProfileRow(
            reader.GetString(0), reader.GetString(1), reader.GetString(2),
            reader.GetString(3), reader.GetString(4),
            reader.IsDBNull(5) ? null : reader.GetString(5),
            reader.IsDBNull(6) ? "none" : reader.GetString(6));
    }

    /// <summary>
    /// Looks up a user by id (companion to FindUserByEmailAsync above, keyed by id instead of
    /// email). Used by Task 12 to resolve the acting caller's role/school for authorization checks
    /// and the target user for change-email/change-password/change-role.
    /// </summary>
    public async Task<AuthUserRow?> FindUserByIdWithRoleAsync(string userId, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT "id","name","email","password","roleId","roleName","schoolId","isActive"
            FROM "users" WHERE "id" = @userId
            """);
        AddParameter(command, "userId", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;

        return new AuthUserRow(
            reader.GetString(0), reader.GetString(1), reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            reader.GetString(4), reader.GetString(5),
            reader.IsDBNull(6) ? null : reader.GetString(6),
            reader.GetBoolean(7));
    }

    /// <summary>
    /// Persists a new password hash. Task 12's change-password endpoint has already authorized
    /// the change and verified the old password per authService.ts's changePassword ordering --
    /// this method trusts that already happened. Also clears "passwordNeedsMigration", matching
    /// legacy's `data: { password: hashed, passwordNeedsMigration: false }` exactly: a
    /// lazily-migrated bcrypt hash getting overwritten by a real change-password call should not
    /// still be flagged for migration. "updatedAt" = now() bound explicitly -- same NOT-NULL-no-
    /// database-default column as every other write in this domain (see auth-schema.sql's header
    /// comment / RecordFailedLoginAsync's remark above).
    /// </summary>
    public async Task UpdatePasswordAsync(string userId, string newHash, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, """
            UPDATE "users" SET "password" = @password, "passwordNeedsMigration" = false, "updatedAt" = now()
            WHERE "id" = @userId
            """);
        AddParameter(command, "userId", userId);
        AddParameter(command, "password", newHash);
        await command.ExecuteNonQueryAsync(cancellationToken);
        await session.CommitAsync(cancellationToken);
    }

    /// <summary>
    /// Change-email happy/same-email/conflict, per authService.ts's changeEmail. Role-scoping and
    /// existence-hiding rules (uniform 403 before target lookup, cross-school 404, school_admin
    /// scoped to own school) are NOT this method's concern -- see IAuthRepository's remarks; Task
    /// 12's endpoint layer authorizes the caller before calling this.
    ///
    /// Two-layer conflict guard, mirroring Task 7's TOCTOU-safety idiom (see
    /// RotateRefreshTokenAsync's class-level remark for the same class of bug):
    ///   1. Pre-check `SELECT 1 ... WHERE "email" = @newEmail AND "id" != @userId` -- deliberately
    ///      NOT scoped to "isActive" = true, since the DB unique constraint on "users"."email"
    ///      spans inactive (soft-deleted) users too; scoping the pre-check to active-only would
    ///      miss an inactive duplicate and 500 on the real constraint instead of a clean Conflict
    ///      (see ChangeEmail_AgainstInactiveDuplicate_StillConflict).
    ///   2. The pre-check alone is NOT a sufficient guard -- a second caller can pass its own
    ///      pre-check for the SAME new email in the window between the two callers' pre-checks and
    ///      either one's UPDATE committing (classic TOCTOU race). The real safety net is catching
    ///      the Postgres 23505 unique-violation on the UPDATE itself, exactly the way legacy
    ///      catches Prisma's P2002 in authService.ts's changeEmail
    ///      (`err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"`). See
    ///      ChangeEmail_ConcurrentRaceForSameNewEmail_ExactlyOneWins for the regression test: two
    ///      real concurrent ChangeEmailAsync calls targeting the same new email, both able to pass
    ///      the pre-check, exactly one committing and the other caught here.
    /// "updatedAt" = now() bound explicitly on the UPDATE, same convention as every other write in
    /// this domain.
    /// </summary>
    public async Task<ChangeEmailResult> ChangeEmailAsync(string userId, string newEmail, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        await using var lookup = Command(session, """SELECT "email" FROM "users" WHERE "id" = @userId""");
        AddParameter(lookup, "userId", userId);
        var currentEmail = (string?)await lookup.ExecuteScalarAsync(cancellationToken);
        if (currentEmail is null) return ChangeEmailResult.NotFound;
        if (currentEmail == newEmail) return ChangeEmailResult.SameEmail;

        await using var dupCheck = Command(session, """
            SELECT 1 FROM "users" WHERE "email" = @newEmail AND "id" != @userId
            """);
        AddParameter(dupCheck, "newEmail", newEmail);
        AddParameter(dupCheck, "userId", userId);
        if (await dupCheck.ExecuteScalarAsync(cancellationToken) is not null)
        {
            return ChangeEmailResult.Conflict;
        }

        try
        {
            await using var update = Command(session, """
                UPDATE "users" SET "email" = @newEmail, "updatedAt" = now() WHERE "id" = @userId
                """);
            AddParameter(update, "newEmail", newEmail);
            AddParameter(update, "userId", userId);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }
        catch (Npgsql.PostgresException ex) when (ex.SqlState == "23505")
        {
            return ChangeEmailResult.Conflict;
        }

        await session.CommitAsync(cancellationToken);
        return ChangeEmailResult.Ok;
    }

    /// <summary>
    /// Change-role happy path, per authService.ts's changeRole. Collapses ALL invalid cases to
    /// null -- target user not found, role id not found/inactive (mirrors legacy's
    /// `prisma.role.findFirst({ where: { id: roleId, isActive: true } })`), or the user already
    /// has this role -- same collapsed-null contract as RotateRefreshTokenAsync's RotateResult
    /// (see that record's doc comment); Task 12's endpoint layer maps null to its own specific
    /// 4xx/message the same way it already must for RotateResult. "updatedAt" = now() bound
    /// explicitly on the UPDATE, same convention as every other write in this domain.
    /// </summary>
    public async Task<ChangeRoleResult?> ChangeRoleAsync(string userId, string roleId, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        string name, email, oldRoleId, oldRoleName;
        await using (var userLookup = Command(session, """
            SELECT "name","email","roleId","roleName" FROM "users" WHERE "id" = @userId
            """))
        {
            AddParameter(userLookup, "userId", userId);
            await using var reader = await userLookup.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) return null; // target user not found

            name = reader.GetString(0);
            email = reader.GetString(1);
            oldRoleId = reader.GetString(2);
            oldRoleName = reader.GetString(3);
        }

        if (oldRoleId == roleId) return null; // already has this role

        await using var roleLookup = Command(session, """SELECT "name" FROM "roles" WHERE "id" = @roleId AND "isActive" = true""");
        AddParameter(roleLookup, "roleId", roleId);
        var newRoleName = (string?)await roleLookup.ExecuteScalarAsync(cancellationToken);
        if (newRoleName is null) return null; // role not found / inactive

        await using var update = Command(session, """
            UPDATE "users" SET "roleId" = @roleId, "roleName" = @roleName, "updatedAt" = now()
            WHERE "id" = @userId
            """);
        AddParameter(update, "roleId", roleId);
        AddParameter(update, "roleName", newRoleName);
        AddParameter(update, "userId", userId);
        await update.ExecuteNonQueryAsync(cancellationToken);

        await session.CommitAsync(cancellationToken);
        return new ChangeRoleResult(userId, name, email, oldRoleId, oldRoleName, roleId, newRoleName);
    }

    /// <summary>
    /// Standalone role-validity check, added post-review (Task 12 fix) -- see this method's
    /// interface doc comment for why it exists: it lets the endpoint layer check role validity
    /// BEFORE any same-role comparison, matching authService.ts's changeRole precedence exactly,
    /// independent of <see cref="ChangeRoleAsync"/>'s own internal (inverted) check order. Read-only,
    /// same query <see cref="ChangeRoleAsync"/> already runs internally.
    /// </summary>
    public async Task<bool> RoleExistsAndActiveAsync(string roleId, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """SELECT 1 FROM "roles" WHERE "id" = @roleId AND "isActive" = true""");
        AddParameter(command, "roleId", roleId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is not null;
    }

    private const string SchoolAdminRoleName = "school_admin";

    /// <summary>
    /// Per authService.ts's `prisma.school.findFirst({ where: { invitationToken: invToken, isActive:
    /// true } })`. Deliberately does NOT filter on "invitationTokenExpiresAt" -- see
    /// <see cref="SchoolInviteRow"/>'s doc comment for why the expiry check is a separate concern
    /// left to the caller.
    /// </summary>
    public async Task<SchoolInviteRow?> FindSchoolByInvitationTokenAsync(string token, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT "id","adminEmail","invitationTokenExpiresAt"
            FROM "schools" WHERE "invitationToken" = @token AND "isActive" = true
            """);
        AddParameter(command, "token", token);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;

        return new SchoolInviteRow(
            reader.GetString(0), reader.GetString(1),
            reader.IsDBNull(2) ? null : new DateTimeOffset(reader.GetDateTime(2), TimeSpan.Zero));
    }

    /// <summary>
    /// Find-or-create, per authService.ts's `let adminRole = await prisma.role.findFirst({ where: {
    /// name: ROLES.SchoolAdmin, isActive: true } }); if (!adminRole) adminRole = await
    /// prisma.role.create({ data: { name: ROLES.SchoolAdmin, description: "School Admin role" } });`.
    /// Opens a writable session unconditionally (same as every other write path in this class) even
    /// though the find-only branch performs no write -- simplest to reason about, and the
    /// transaction commits either way. "roles"."updatedAt" is NOT NULL with no database default
    /// (see auth-schema.sql's header comment) -- bound explicitly (inline now()) on the INSERT.
    /// </summary>
    public async Task<string> EnsureSchoolAdminRoleAsync(CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        await using (var lookup = Command(session, """SELECT "id" FROM "roles" WHERE "name" = @name AND "isActive" = true"""))
        {
            AddParameter(lookup, "name", SchoolAdminRoleName);
            var existingId = (string?)await lookup.ExecuteScalarAsync(cancellationToken);
            if (existingId is not null)
            {
                await session.CommitAsync(cancellationToken);
                return existingId;
            }
        }

        await using var insert = Command(session, """
            INSERT INTO "roles" ("id","name","description","updatedAt")
            VALUES (gen_random_uuid()::text, @name, 'School Admin role', now())
            RETURNING "id"
            """);
        AddParameter(insert, "name", SchoolAdminRoleName);
        var roleId = (string)(await insert.ExecuteScalarAsync(cancellationToken))!;

        await session.CommitAsync(cancellationToken);
        return roleId;
    }

    /// <summary>
    /// Update-if-exists / create-if-not by email, per authService.ts's `let user = await
    /// prisma.user.findUnique({ where: { email } }); if (user) { user = await prisma.user.update({
    /// where: { id: user.id }, data: { name, password: hashedPassword, roleId: adminRole.id,
    /// roleName: adminRole.name, schoolId: school.id, passwordNeedsMigration: false } }); } else {
    /// user = await prisma.user.create({ data: { name, email, password: hashedPassword, roleId:
    /// adminRole.id, roleName: adminRole.name, schoolId: school.id } }); }`. The update branch fetches
    /// the existing user's current "isActive" rather than assuming true -- legacy's update data
    /// shape never touches "isActive", so this must reflect whatever it already was, not silently
    /// reactivate/deactivate the account as a side effect of registration completion.
    /// <paramref name="email"/> must already be normalized by the caller (see interface doc).
    /// "users"."updatedAt" is NOT NULL with no database default -- bound explicitly on both the
    /// UPDATE and the INSERT.
    /// </summary>
    public async Task<AuthUserRow> UpsertSchoolAdminUserAsync(
        string schoolId, string email, string name, string passwordHash, string roleId, string roleName,
        CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        string? existingId = null;
        var existingIsActive = true;
        await using (var lookup = Command(session, """SELECT "id","isActive" FROM "users" WHERE "email" = @email"""))
        {
            AddParameter(lookup, "email", email);
            await using var reader = await lookup.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                existingId = reader.GetString(0);
                existingIsActive = reader.GetBoolean(1);
            }
        }

        string userId;
        bool isActive;
        if (existingId is not null)
        {
            userId = existingId;
            isActive = existingIsActive;
            await using var update = Command(session, """
                UPDATE "users"
                SET "name" = @name, "password" = @password, "roleId" = @roleId, "roleName" = @roleName,
                    "schoolId" = @schoolId, "passwordNeedsMigration" = false, "updatedAt" = now()
                WHERE "id" = @id
                """);
            AddParameter(update, "name", name);
            AddParameter(update, "password", passwordHash);
            AddParameter(update, "roleId", roleId);
            AddParameter(update, "roleName", roleName);
            AddParameter(update, "schoolId", schoolId);
            AddParameter(update, "id", userId);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }
        else
        {
            isActive = true;
            await using var insert = Command(session, """
                INSERT INTO "users" ("id","name","email","password","roleId","roleName","schoolId","updatedAt")
                VALUES (gen_random_uuid()::text, @name, @email, @password, @roleId, @roleName, @schoolId, now())
                RETURNING "id"
                """);
            AddParameter(insert, "name", name);
            AddParameter(insert, "email", email);
            AddParameter(insert, "password", passwordHash);
            AddParameter(insert, "roleId", roleId);
            AddParameter(insert, "roleName", roleName);
            AddParameter(insert, "schoolId", schoolId);
            userId = (string)(await insert.ExecuteScalarAsync(cancellationToken))!;
        }

        await session.CommitAsync(cancellationToken);
        return new AuthUserRow(userId, name, email, passwordHash, roleId, roleName, schoolId, isActive);
    }

    /// <summary>
    /// Per authService.ts's `await prisma.school.update({ where: { id: school.id }, data: {
    /// invitationToken: null, status: "active" } });` -- clears the single-use invitation token and
    /// flips "status" to "active". Does not touch "isActive". "schools"."updatedAt" is NOT NULL with
    /// no database default -- bound explicitly.
    /// </summary>
    public async Task ActivateSchoolAsync(string schoolId, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, """
            UPDATE "schools" SET "invitationToken" = NULL, "status" = 'active', "updatedAt" = now()
            WHERE "id" = @schoolId
            """);
        AddParameter(command, "schoolId", schoolId);
        await command.ExecuteNonQueryAsync(cancellationToken);
        await session.CommitAsync(cancellationToken);
    }

    /// <summary>
    /// Marks every currently-unused "password_reset_tokens" row for userId as used, per
    /// authService.ts's requestPasswordReset invalidating any previously-issued, still-live reset
    /// token whenever a new one is requested -- at most one live reset token per user at a time.
    /// "updatedAt" = now() bound explicitly, same NOT-NULL-no-database-default column as every
    /// other write in this domain.
    /// </summary>
    public async Task InvalidatePriorResetTokensAsync(string userId, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, """
            UPDATE "password_reset_tokens" SET "usedAt" = now(), "updatedAt" = now()
            WHERE "userId" = @userId AND "usedAt" IS NULL
            """);
        AddParameter(command, "userId", userId);
        await command.ExecuteNonQueryAsync(cancellationToken);
        await session.CommitAsync(cancellationToken);
    }

    /// <summary>
    /// Persists a new password-reset token keyed by its SHA-256 hex digest -- the raw-token hashing
    /// happens in Task 12's endpoint handler (authService.ts's hashResetToken), not here; this
    /// repository only ever sees/stores the digest. "password_reset_tokens"."updatedAt" is NOT NULL
    /// with no database default (see auth-schema.sql's header comment) -- bound explicitly.
    /// </summary>
    public async Task CreatePasswordResetTokenAsync(string userId, string sha256Hex, TimeSpan lifetime, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, """
            INSERT INTO "password_reset_tokens" ("id","userId","token","expiresAt","updatedAt")
            VALUES (gen_random_uuid()::text, @userId, @token, @expiresAt, now())
            """);
        AddParameter(command, "userId", userId);
        AddParameter(command, "token", sha256Hex);
        AddParameter(command, "expiresAt", DateTime.UtcNow.Add(lifetime));
        await command.ExecuteNonQueryAsync(cancellationToken);
        await session.CommitAsync(cancellationToken);
    }

    /// <summary>
    /// Looks up a password-reset token by its SHA-256 hex digest, joined to the owning user's
    /// CURRENT "isActive" (matching RotateRefreshTokenAsync's TOCTOU-safety convention of always
    /// re-checking current state rather than a cached value). Returns null only for an unknown
    /// digest -- see <see cref="ResetTokenRow"/>'s doc comment for why expired/already-used/
    /// inactive-user cases still return a row rather than collapsing to null: that check is
    /// deliberately Task 12's job, same convention as FindSchoolByInvitationTokenAsync's expiry
    /// check.
    /// </summary>
    public async Task<ResetTokenRow?> FindResetTokenAsync(string sha256Hex, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT prt."id", prt."userId", prt."expiresAt", prt."usedAt", u."isActive"
            FROM "password_reset_tokens" prt JOIN "users" u ON u."id" = prt."userId"
            WHERE prt."token" = @token
            """);
        AddParameter(command, "token", sha256Hex);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;

        return new ResetTokenRow(
            reader.GetString(0), reader.GetString(1),
            new DateTimeOffset(reader.GetDateTime(2), TimeSpan.Zero),
            reader.IsDBNull(3) ? null : new DateTimeOffset(reader.GetDateTime(3), TimeSpan.Zero),
            reader.GetBoolean(4));
    }

    /// <summary>
    /// Single writable session, single transaction, three writes in this exact order -- update
    /// password, mark the reset token used, revoke every currently-active refresh token -- committed
    /// once at the end. This ordering/atomicity IS the security property this method exists to
    /// provide: a partial failure must never leave the password changed while an old session stays
    /// valid (mirrors legacy's `$transaction([...])` exactly).
    ///
    /// Deliberately NO explicit try/catch-rollback here. <see cref="FormMapsDatabaseSession"/>'s
    /// source was read to resolve this: it exposes only <c>CommitAsync</c> and <c>DisposeAsync</c> --
    /// there is no <c>RollbackAsync</c> method on that type. Its <c>DisposeAsync</c> simply disposes
    /// the underlying <c>DbTransaction</c> (then the connection) without committing, and disposing an
    /// uncommitted <c>DbTransaction</c>/<c>NpgsqlTransaction</c> performs an implicit ROLLBACK -- this
    /// was verified empirically against a real Testcontainers postgres:16-alpine instance for this
    /// exact three-statement shape before writing this method (see this task's report): the first two
    /// writes execute for real, the third fails with a genuine Postgres-raised exception, and with NO
    /// rollback call anywhere, disposing the still-open transaction rolls back all three. Same idiom
    /// BillingShadowRepository.RunTransactionAsync already relies on ("Don't commit:
    /// session.DisposeAsync() rolls back the whole transaction, including `write`"). So: if ANY of the
    /// three ExecuteNonQueryAsync calls below throws, the exception simply propagates out of this
    /// method -- CommitAsync is never reached, the `await using var session` above disposes on the way
    /// out, and every write in this transaction rolls back, not just the one that failed.
    ///
    /// "updatedAt" = now() bound explicitly on all three UPDATEs -- "users"/"password_reset_tokens"/
    /// "refresh_tokens" all have this NOT-NULL-no-database-default column (see auth-schema.sql's
    /// header comment / every prior write method in this class). This task's brief's illustrative
    /// version of this method omitted the bind on all three statements, which would 500 with a
    /// not-null violation on every real call -- caught and fixed here before implementing.
    /// </summary>
    public async Task<bool> ApplyPasswordResetAsync(string resetTokenId, string userId, string newHash, string clientIp, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        await using (var updatePassword = Command(session, """
            UPDATE "users" SET "password" = @hash, "passwordNeedsMigration" = false, "updatedAt" = now()
            WHERE "id" = @userId
            """))
        {
            AddParameter(updatePassword, "hash", newHash);
            AddParameter(updatePassword, "userId", userId);
            await updatePassword.ExecuteNonQueryAsync(cancellationToken);
        }

        // Single-use enforcement (final whole-branch review finding, Important). Guarded on
        // "usedAt" IS NULL and checked for 0 rows, mirroring RevokeTokenRowForRotationAsync's
        // conditional-UPDATE idiom for the structurally identical single-use refresh-token
        // transition. Task 12's handler pre-checks UsedAt via FindResetTokenAsync, but that read
        // runs in a SEPARATE read-only transaction with no row lock, so two concurrent requests
        // presenting the SAME valid token could both pass the pre-check and both apply a reset --
        // defeating single-use exactly the way the un-guarded refresh rotation would have. Task 10
        // flagged this ("no FOR UPDATE on reset-token read, out of this task's scope") and deferred
        // it to Task 12, which did not pick it up; it fell through the gap between the two tasks.
        //
        // The guarded UPDATE closes the race without needing FOR UPDATE on the read: the loser
        // blocks on this row's write lock, then (READ COMMITTED) re-evaluates the WHERE against the
        // winner's committed row, sees "usedAt" set, and matches 0 rows. Unlike the rotation case,
        // 0 rows here is a REAL concurrent-use outcome rather than an invariant violation, so this
        // returns false for the caller to map onto the normal "Invalid or expired reset token" 400
        // instead of throwing. Returning without CommitAsync rolls back the password update above --
        // see this method's remark on dispose-without-commit.
        await using (var consumeToken = Command(session, """
            UPDATE "password_reset_tokens" SET "usedAt" = now(), "updatedAt" = now()
            WHERE "id" = @id AND "usedAt" IS NULL
            """))
        {
            AddParameter(consumeToken, "id", resetTokenId);
            if (await consumeToken.ExecuteNonQueryAsync(cancellationToken) == 0)
            {
                return false;
            }
        }

        await using (var revokeSessions = Command(session, """
            UPDATE "refresh_tokens" SET "isRevoked" = true, "revokedAt" = now(), "revokedByIp" = @ip, "updatedAt" = now()
            WHERE "userId" = @userId AND "isRevoked" = false
            """))
        {
            AddParameter(revokeSessions, "userId", userId);
            AddParameter(revokeSessions, "ip", clientIp);
            await revokeSessions.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return true;
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
