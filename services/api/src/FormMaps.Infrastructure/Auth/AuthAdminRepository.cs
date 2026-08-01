using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Auth;

/// <summary>
/// SQL for routes/auth-admin.ts's in-scope slice (signup, unsubscribe, admin/set-password) -- see
/// IAuthAdminRepository's class doc for why this is a separate class/interface from
/// Tasks 6-12's AuthRepository despite touching the same tables. Every method runs under
/// <see cref="RequestContext.System"/>, same convention as AuthRepository -- these are either
/// pre-auth operations (signup/unsubscribe) or a deliberate live-DB re-read
/// (GetUserSchoolIdAsync) that must NOT be scoped by the caller's own RLS session.
/// </summary>
public sealed class AuthAdminRepository(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IAuthAdminRepository
{
    public async Task<bool> EmailExistsAsync(string normalizedEmail, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """SELECT 1 FROM "users" WHERE "email" = @email""");
        AddParameter(command, "email", normalizedEmail);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is not null;
    }

    /// <summary>
    /// Find-or-create by role name, per authAdminService.ts's signup default-role path. Opens a
    /// writable session unconditionally, same simplest-to-reason-about convention as Task 9's
    /// EnsureSchoolAdminRoleAsync. "roles"."updatedAt" is NOT NULL with no database default (see
    /// auth-schema.sql's header comment) -- bound explicitly (inline now()) on the INSERT.
    /// </summary>
    public async Task<string> EnsureRoleAsync(string roleName, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        await using (var lookup = Command(session, """SELECT "id" FROM "roles" WHERE "name" = @name AND "isActive" = true"""))
        {
            AddParameter(lookup, "name", roleName);
            var existingId = (string?)await lookup.ExecuteScalarAsync(cancellationToken);
            if (existingId is not null)
            {
                await session.CommitAsync(cancellationToken);
                return existingId;
            }
        }

        await using var insert = Command(session, """
            INSERT INTO "roles" ("id","name","description","updatedAt")
            VALUES (gen_random_uuid()::text, @name, @description, now())
            RETURNING "id"
            """);
        AddParameter(insert, "name", roleName);
        AddParameter(insert, "description", $"{roleName} role");
        var roleId = (string)(await insert.ExecuteScalarAsync(cancellationToken))!;

        await session.CommitAsync(cancellationToken);
        return roleId;
    }

    public async Task<AdminRoleRow?> FindActiveRoleByIdAsync(string roleId, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT "id","name" FROM "roles" WHERE "id" = @roleId AND "isActive" = true
            """);
        AddParameter(command, "roleId", roleId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;

        return new AdminRoleRow(reader.GetString(0), reader.GetString(1));
    }

    /// <summary>
    /// "users"."updatedAt" is NOT NULL with no database default (see auth-schema.sql's header
    /// comment) -- bound explicitly on this INSERT, same convention as every write in this domain.
    /// </summary>
    public async Task<CreatedAdminUserRow> CreateUserAsync(
        string name, string normalizedEmail, string passwordHash, string roleId, string roleName,
        DateTime dateOfBirth, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, """
            INSERT INTO "users" ("id","name","email","password","roleId","roleName","dateOfBirth","updatedAt")
            VALUES (gen_random_uuid()::text, @name, @email, @password, @roleId, @roleName, @dateOfBirth, now())
            RETURNING "id"
            """);
        AddParameter(command, "name", name);
        AddParameter(command, "email", normalizedEmail);
        AddParameter(command, "password", passwordHash);
        AddParameter(command, "roleId", roleId);
        AddParameter(command, "roleName", roleName);
        AddParameter(command, "dateOfBirth", dateOfBirth);
        var userId = (string)(await command.ExecuteScalarAsync(cancellationToken))!;

        await session.CommitAsync(cancellationToken);
        return new CreatedAdminUserRow(userId, name, normalizedEmail, roleId, roleName);
    }

    /// <summary>
    /// Shared upsert backing BOTH signup's acceptMarketing persistence and unsubscribe's opt-out --
    /// see IAuthAdminRepository's doc comment. "user_settings"."userId" is UNIQUE (auth-schema.sql),
    /// so ON CONFLICT ("userId") is a valid upsert target. "updatedAt" bound explicitly on both the
    /// INSERT and the DO UPDATE branch, same NOT-NULL-no-database-default convention as every write
    /// in this domain (see AuthRepository.RecordFailedLoginAsync's remark for why BOTH branches need
    /// the explicit bind, not just one).
    /// </summary>
    public async Task UpsertUserMarketingSettingsAsync(string userId, bool marketingEmails, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, """
            INSERT INTO "user_settings" ("id","userId","marketingEmails","updatedAt")
            VALUES (gen_random_uuid()::text, @userId, @marketingEmails, now())
            ON CONFLICT ("userId") DO UPDATE SET "marketingEmails" = @marketingEmails, "updatedAt" = now()
            """);
        AddParameter(command, "userId", userId);
        AddParameter(command, "marketingEmails", marketingEmails);
        await command.ExecuteNonQueryAsync(cancellationToken);
        await session.CommitAsync(cancellationToken);
    }

    /// <summary>
    /// Same shape as AuthRepository.CreateRefreshTokenAsync (both write to "refresh_tokens") --
    /// duplicated here rather than cross-calling IAuthRepository; see IAuthAdminRepository's doc
    /// comment for why. "refresh_tokens"."updatedAt" is NOT NULL with no database default -- bound
    /// explicitly (inline now()).
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

    public async Task<AdminTargetUserRow?> FindUserByEmailForAdminAsync(string normalizedEmail, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT "id","email","schoolId" FROM "users" WHERE "email" = @email
            """);
        AddParameter(command, "email", normalizedEmail);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;

        return new AdminTargetUserRow(
            reader.GetString(0), reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetString(2));
    }

    public async Task<string?> GetUserSchoolIdAsync(string userId, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """SELECT "schoolId" FROM "users" WHERE "id" = @userId""");
        AddParameter(command, "userId", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        return reader.IsDBNull(0) ? null : reader.GetString(0);
    }

    /// <summary>
    /// Also clears "onboardingToken", matching auth-admin.ts:216-219's
    /// `data: { password: ..., onboardingToken: null, passwordNeedsMigration: false }` exactly --
    /// this admin-bypass route is how a school admin completes onboarding for a user who hasn't set
    /// their own password yet, so the (now-consumed) onboarding token must be cleared same as
    /// UpdatePasswordAsync clears "passwordNeedsMigration". "updatedAt" bound explicitly, same
    /// NOT-NULL-no-database-default convention as every write in this domain.
    /// </summary>
    public async Task SetPasswordForSchoolUserAsync(string userId, string passwordHash, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, """
            UPDATE "users" SET "password" = @password, "onboardingToken" = NULL, "passwordNeedsMigration" = false, "updatedAt" = now()
            WHERE "id" = @userId
            """);
        AddParameter(command, "userId", userId);
        AddParameter(command, "password", passwordHash);
        await command.ExecuteNonQueryAsync(cancellationToken);
        await session.CommitAsync(cancellationToken);
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
