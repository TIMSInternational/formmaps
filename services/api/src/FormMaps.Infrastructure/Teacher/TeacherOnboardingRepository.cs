using System.Data;
using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Teacher;

namespace FormMaps.Infrastructure.Teacher;

/// <summary>
/// SQL behind routes/teacher.ts (issue #62). Raw Npgsql through
/// <see cref="IFormMapsDatabaseSessionFactory"/>; no EF Core anywhere.
///
/// <para>WHICH SESSION EACH METHOD OPENS IS THE POINT OF THIS CLASS, so it is stated once here and repeated on
/// each method: the four pre-auth methods open under <see cref="RequestContext.System"/> (=&gt; Bypass GUC,
/// legacy's <c>runAsSystem</c> at tenantContext.ts:20-22), because teacher.ts:18/:33 mount <c>systemContext</c>
/// and there is no caller to scope by. The three authenticated methods open under the CALLER's RequestContext
/// (=&gt; Identity GUCs, legacy's <c>tenantContext</c> at teacher.ts:85). No method here ever opens a bypass
/// session on behalf of an authenticated caller.</para>
/// </summary>
public sealed class TeacherOnboardingRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : ITeacherOnboardingRepository
{
    // =============================================================================================
    // PRE-AUTH -- systemContext (teacher.ts:18, :33)
    // =============================================================================================

    /// <summary>teacher.ts:23 / :42. SYSTEM session: bypass, exactly like legacy's runAsSystem.</summary>
    public async Task<TeacherInviteRow?> FindInviteByTokenAsync(
        string token, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(
            RequestContext.System(), cancellationToken);

        await using var command = Command(session, """
            SELECT "id","token","email","schoolId","expiresAt","usedAt"
            FROM "teacher_invites" WHERE "token" = @token
            """);
        AddParameter(command, "token", token);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new TeacherInviteRow(
            reader.GetString(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            reader.GetDateTime(4),
            reader.IsDBNull(5) ? null : reader.GetDateTime(5));
    }

    /// <summary>teacher.ts:28. SYSTEM session -- the caller has no identity yet.</summary>
    public async Task<string?> FindSchoolNameAsync(string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(
            RequestContext.System(), cancellationToken);

        await using var command = Command(session, """SELECT "name" FROM "schools" WHERE "id" = @id""");
        AddParameter(command, "id", schoolId);
        var value = await command.ExecuteScalarAsync(cancellationToken);
        return value is null or DBNull ? null : (string)value;
    }

    /// <summary>
    /// teacher.ts:47. SYSTEM session. <c>roles</c> is not a tenant table, but the route it serves is pre-auth,
    /// so there is no Identity context available to open with in the first place.
    /// </summary>
    public async Task<TeacherRoleRow?> FindActiveTeacherRoleAsync(CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(
            RequestContext.System(), cancellationToken);

        // findFirst({ where: { name: "teacher", isActive: true } }) -- Prisma emits no ORDER BY for a
        // findFirst without one; "roles"."name" is @unique so at most one row can match anyway.
        await using var command = Command(session, """
            SELECT "id","name" FROM "roles" WHERE "name" = 'teacher' AND "isActive" = true LIMIT 1
            """);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken)
            ? new TeacherRoleRow(reader.GetString(0), reader.GetString(1))
            : null;
    }

    /// <summary>teacher.ts:52-68. SYSTEM writable session; see the interface for the atomicity divergence.</summary>
    public async Task<TeacherOnboardingResult> CompleteOnboardingAsync(
        string token,
        string normalizedEmail,
        string? name,
        string passwordHash,
        TeacherRoleRow role,
        string? schoolId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(
            RequestContext.System(), cancellationToken);

        // teacher.ts:52 -- prisma.user.findFirst({ where: { email: emailLower } }).
        string? existingId = null;
        string existingName = string.Empty;
        string existingEmail = string.Empty;
        string? existingPassword = null;
        var existingNeedsMigration = false;

        await using (var lookup = Command(session, """
            SELECT "id","name","email","password","passwordNeedsMigration"
            FROM "users" WHERE "email" = @email LIMIT 1
            """))
        {
            AddParameter(lookup, "email", normalizedEmail);
            await using var reader = await lookup.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                existingId = reader.GetString(0);
                existingName = reader.GetString(1);
                existingEmail = reader.GetString(2);
                existingPassword = reader.IsDBNull(3) ? null : reader.GetString(3);
                existingNeedsMigration = reader.GetBoolean(4);
            }
        }

        if (existingId is not null)
        {
            // teacher.ts:55 -- `if (user.password && !user.passwordNeedsMigration)`. JS truthiness: a NULL or
            // EMPTY-STRING password is falsy, so both fall through to the migrate branch rather than 409ing.
            if (!string.IsNullOrEmpty(existingPassword) && !existingNeedsMigration)
            {
                // No write at all, and in particular the invite is NOT consumed -- same as legacy's early return.
                return new TeacherOnboardingResult(
                    TeacherOnboardingOutcome.AccountAlreadyExists, existingId, existingName, existingEmail);
            }

            // teacher.ts:58-61. `name: name || user.name` -- an absent OR empty body name keeps the old one.
            await using (var update = Command(session, """
                UPDATE "users"
                SET "password" = @password, "passwordNeedsMigration" = false, "name" = @name,
                    "roleId" = @roleId, "roleName" = @roleName, "schoolId" = @schoolId,
                    "isActive" = true, "updatedAt" = @now
                WHERE "id" = @id
                """))
            {
                AddParameter(update, "password", passwordHash);
                AddParameter(update, "name", string.IsNullOrEmpty(name) ? existingName : name);
                AddParameter(update, "roleId", role.Id);
                AddParameter(update, "roleName", role.Name);
                AddNullableParameter(update, "schoolId", schoolId);
                AddTimestamp(update, "now", Now());
                AddParameter(update, "id", existingId);
                await update.ExecuteNonQueryAsync(cancellationToken);
            }

            await ConsumeInviteAsync(session, token, cancellationToken);
            await session.CommitAsync(cancellationToken);

            // The PRE-update name/email, deliberately -- see TeacherOnboardingResult's remarks.
            return new TeacherOnboardingResult(
                TeacherOnboardingOutcome.Completed, existingId, existingName, existingEmail);
        }

        // teacher.ts:63-65 -- create. `name: name || emailLower`.
        var createdName = string.IsNullOrEmpty(name) ? normalizedEmail : name;
        string createdId;
        await using (var insert = Command(session, """
            INSERT INTO "users" ("id","email","password","name","roleId","roleName","schoolId","isActive","updatedAt")
            VALUES (gen_random_uuid()::text, @email, @password, @name, @roleId, @roleName, @schoolId, true, @now)
            RETURNING "id"
            """))
        {
            AddParameter(insert, "email", normalizedEmail);
            AddParameter(insert, "password", passwordHash);
            AddParameter(insert, "name", createdName);
            AddParameter(insert, "roleId", role.Id);
            AddParameter(insert, "roleName", role.Name);
            AddNullableParameter(insert, "schoolId", schoolId);
            AddTimestamp(insert, "now", Now());
            createdId = (string)(await insert.ExecuteScalarAsync(cancellationToken))!;
        }

        await ConsumeInviteAsync(session, token, cancellationToken);
        await session.CommitAsync(cancellationToken);

        return new TeacherOnboardingResult(
            TeacherOnboardingOutcome.Completed, createdId, createdName, normalizedEmail);
    }

    // teacher.ts:68 -- prisma.teacherInvite.update({ where: { token }, data: { usedAt: new Date() } }).
    // "updatedAt" is Prisma @updatedAt: application-managed, NOT NULL, no DB default, so it is bound here.
    private async Task ConsumeInviteAsync(
        FormMapsDatabaseSession session, string token, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            UPDATE "teacher_invites" SET "usedAt" = @now, "updatedAt" = @now WHERE "token" = @token
            """);
        AddTimestamp(command, "now", Now());
        AddParameter(command, "token", token);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    // =============================================================================================
    // AUTHENTICATED -- authenticate + tenantContext (teacher.ts:84-85)
    // =============================================================================================

    /// <summary>teacher.ts:93-96. CALLER's Identity session.</summary>
    public async Task<TeacherProfileRow?> GetProfileAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        await using var command = Command(session, """
            SELECT "id","name","email","schoolId" FROM "users" WHERE "id" = @id
            """);
        AddParameter(command, "id", userId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new TeacherProfileRow(
            reader.GetString(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3));
    }

    /// <summary>teacher.ts:98. CALLER's Identity session.</summary>
    public async Task<string?> GetSchoolNameAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        await using var command = Command(session, """SELECT "name" FROM "schools" WHERE "id" = @id""");
        AddParameter(command, "id", schoolId);
        var value = await command.ExecuteScalarAsync(cancellationToken);
        return value is null or DBNull ? null : (string)value;
    }

    /// <summary>teacher.ts:113-120. CALLER's Identity session for BOTH reads -- see the interface remarks.</summary>
    public async Task<IReadOnlyList<TeacherPendingEvaluationRow>> ListPendingEvaluationsAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // teacher.ts:113 -- the caller's OWN users row, by id. `!user?.email` -> [] (:114).
        string? email = null;
        await using (var lookup = Command(session, """SELECT "email" FROM "users" WHERE "id" = @id"""))
        {
            AddParameter(lookup, "id", userId);
            var value = await lookup.ExecuteScalarAsync(cancellationToken);
            email = value is null or DBNull ? null : (string)value;
        }

        if (string.IsNullOrEmpty(email))
        {
            return Array.Empty<TeacherPendingEvaluationRow>();
        }

        // teacher.ts:116-120. orderBy createdDate desc; the "id" ASC tiebreak makes an otherwise
        // engine-defined order deterministic without changing which rows come back (same convention as
        // ParentPortalRepository.ListPendingEvaluationsAsync).
        var rows = new List<TeacherPendingEvaluationRow>();
        await using (var command = Command(session, """
            SELECT eg."id", u."name", eg."tokenExpiryDate", eg."invitationToken"
            FROM "evaluation_groups" eg
            LEFT JOIN "users" u ON u."id" = eg."evaluatedUserId"
            WHERE eg."evaluatorEmail" = @email AND eg."isActive" = true AND eg."isEvaluationCompleted" = false
            ORDER BY eg."createdDate" DESC, eg."id" ASC
            """))
        {
            AddParameter(command, "email", email.ToLowerInvariant());
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var studentName = reader.IsDBNull(1) ? null : reader.GetString(1);
                rows.Add(new TeacherPendingEvaluationRow(
                    EvaluationId: reader.GetString(0),
                    // `g.evaluatedUser?.name || "your student"` (:126) -- an EMPTY name is falsy too.
                    StudentName: string.IsNullOrEmpty(studentName) ? "your student" : studentName,
                    Deadline: IsoZ(reader.GetDateTime(2)),
                    Token: reader.GetString(3)));
            }
        }

        return rows;
    }

    // =============================================================================================
    // plumbing
    // =============================================================================================

    private DateTime Now() =>
        new DateTime(
            (timeProvider.GetUtcNow().UtcDateTime.Ticks / TimeSpan.TicksPerMillisecond) * TimeSpan.TicksPerMillisecond,
            DateTimeKind.Unspecified);

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

    private static void AddNullableParameter(DbCommand command, string name, string? value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.String;
        parameter.Value = (object?)value ?? DBNull.Value;
        command.Parameters.Add(parameter);
    }

    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    /// <summary>Prisma/JSON.stringify Date shape: millisecond precision, trailing Z.</summary>
    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc)
            .ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
