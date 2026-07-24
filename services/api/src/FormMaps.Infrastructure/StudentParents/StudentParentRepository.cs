using System.Data;
using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Email;
using FormMaps.Application.StudentParents;
using Npgsql;

namespace FormMaps.Infrastructure.StudentParents;

/// <summary>
/// Student parent-links CRUD (FM-DOTNET-076). Read on a read-only RLS session; invite/delete/resend on a writable
/// session + commit (ownership + write in one session, atomic). Invite mints a base64url token + a 48h expiry; a
/// duplicate (studentId, parentEmail) → unique violation (23505) → Duplicate (→ 500). Timestamps bind
/// Kind=Unspecified + ms-truncated; SET/INSERT columns are fixed literals (mass-assignment guard).
/// </summary>
public sealed class StudentParentRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : IStudentParentRepository
{
    private const string RowColumns =
        """
        "id", "studentId", "parentEmail", "parentName", "parentUserId", "relation", "invitationToken",
        "tokenExpiresAt", "isAccepted", "acceptedAt", "invitedBy", "isActive", "createdBy", "createdDate",
        "updatedBy", "updatedAt"
        """;

    public async Task<IReadOnlyList<ParentLinkRow>> ListAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, $"""
            SELECT {RowColumns} FROM "student_parent_links" WHERE "studentId" = @sid AND "isActive" = true
            ORDER BY "createdDate" DESC, "id" ASC
            """);
        AddParameter(command, "sid", studentId);

        var rows = new List<ParentLinkRow>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(MapRow(reader));
        }

        return rows;
    }

    public async Task<CreateInviteResult> CreateInviteAsync(
        RequestContext context, string studentId, string parentEmail, string parentName, string relation,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var token = InvitationTokenGenerator.Generate();
        var expires = Now().AddHours(48);

        await using var command = Command(session, """
            INSERT INTO "student_parent_links"
                ("id", "studentId", "parentEmail", "parentName", "relation", "invitationToken", "tokenExpiresAt",
                 "invitedBy", "createdDate", "updatedAt")
            VALUES (gen_random_uuid()::text, @sid, @email, @name, @relation, @token, @expires, @sid, @now, @now)
            RETURNING "id"
            """);
        AddParameter(command, "sid", studentId);
        AddParameter(command, "email", parentEmail);
        AddParameter(command, "name", parentName);
        AddParameter(command, "relation", relation);
        AddParameter(command, "token", token);
        AddTimestamp(command, "expires", expires);
        AddTimestamp(command, "now", Now());

        try
        {
            var id = (string)(await command.ExecuteScalarAsync(cancellationToken))!;
            await session.CommitAsync(cancellationToken);
            return new CreateInviteResult(Duplicate: false, id, token);
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            return new CreateInviteResult(Duplicate: true, null, null); // → 500 (Prisma unique-violation throw)
        }
    }

    public async Task<bool> DeleteLinkAsync(
        RequestContext context, string studentId, string parentLinkId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        if (!await IsOwnerAsync(session, studentId, parentLinkId, cancellationToken))
        {
            return false; // missing / not owned → 404
        }

        await using (var update = Command(session, """
            UPDATE "student_parent_links" SET "isActive" = false, "updatedAt" = @now WHERE "id" = @id
            """))
        {
            AddTimestamp(update, "now", Now());
            AddParameter(update, "id", parentLinkId);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return true;
    }

    public async Task<string?> ResendAsync(
        RequestContext context, string studentId, string parentLinkId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        if (!await IsOwnerAsync(session, studentId, parentLinkId, cancellationToken))
        {
            return null; // missing / not owned → 404
        }

        var token = InvitationTokenGenerator.Generate();
        await using (var update = Command(session, """
            UPDATE "student_parent_links" SET "invitationToken" = @token, "tokenExpiresAt" = @expires, "updatedAt" = @now
            WHERE "id" = @id
            """))
        {
            AddParameter(update, "token", token);
            AddTimestamp(update, "expires", Now().AddHours(48));
            AddTimestamp(update, "now", Now());
            AddParameter(update, "id", parentLinkId);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return token;
    }

    // findUnique → owner (missing or different studentId → false). No isActive check (matches deleteParentLink /
    // resendParentInvite: only studentId ownership).
    private static async Task<bool> IsOwnerAsync(
        FormMapsDatabaseSession session, string studentId, string id, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "studentId" FROM "student_parent_links" WHERE "id" = @id""");
        AddParameter(command, "id", id);
        var owner = await command.ExecuteScalarAsync(cancellationToken);
        return owner is not (null or DBNull) && (string)owner == studentId;
    }

    private static ParentLinkRow MapRow(DbDataReader reader) => new(
        Id: reader.GetString(0),
        StudentId: reader.GetString(1),
        ParentEmail: reader.GetString(2),
        ParentName: reader.GetString(3),
        ParentUserId: reader.IsDBNull(4) ? null : reader.GetString(4),
        Relation: reader.GetString(5),
        InvitationToken: reader.IsDBNull(6) ? null : reader.GetString(6),
        TokenExpiresAt: reader.IsDBNull(7) ? null : IsoZ(reader.GetDateTime(7)),
        IsAccepted: reader.GetBoolean(8),
        AcceptedAt: reader.IsDBNull(9) ? null : IsoZ(reader.GetDateTime(9)),
        InvitedBy: reader.IsDBNull(10) ? null : reader.GetString(10),
        IsActive: reader.GetBoolean(11),
        CreatedBy: reader.IsDBNull(12) ? null : reader.GetString(12),
        CreatedDate: IsoZ(reader.GetDateTime(13)),
        UpdatedBy: reader.IsDBNull(14) ? null : reader.GetString(14),
        UpdatedAt: IsoZ(reader.GetDateTime(15)));

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

    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
