using System.Data;
using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Email;
using FormMaps.Application.StudentParents;

namespace FormMaps.Infrastructure.StudentParents;

/// <summary>
/// Student parent-links CRUD (FM-DOTNET-076). Read on a read-only RLS session; invite/delete/resend on a writable
/// session + commit (ownership + write in one session, atomic). Invite/resend follow legacy parentLinkService
/// inviteOrAttachParent / resendOrAttachParent (audit 2026-10-09 C8b/C8): idempotent per (studentId, parentEmail),
/// an onboarded parent account is attached as accepted, never a self-link, and the token is returned to the ENDPOINT
/// only (for the email). The onboarded-parent lookup runs on a System (RLS-bypass) read-only session — a parent
/// account usually has no school, so the student's identity cannot see it (legacy runAsSystem); it is an exact email
/// match and only that row is used. Timestamps bind Kind=Unspecified + ms-truncated; SET/INSERT columns are fixed
/// literals (mass-assignment guard).
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

    public async Task<ParentInviteOutcome> InviteOrAttachAsync(
        RequestContext context, string studentId, string parentEmail, string parentName, string relation,
        CancellationToken cancellationToken = default)
    {
        var parent = await FindOnboardedParentAsync(parentEmail, cancellationToken);

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        var (studentName, studentEmail) = await StudentAsync(session, studentId, cancellationToken);

        // Never link a student to themselves (own address, any case).
        if (string.Equals(studentEmail, parentEmail, StringComparison.OrdinalIgnoreCase) || parent?.Id == studentId)
        {
            return new ParentInviteOutcome(ParentInviteKind.SelfLink, null, null, null, parentName, studentName);
        }

        string? existingId = null;
        string existingName = string.Empty;
        string existingRelation = "parent";
        var existingActive = false;
        var existingAccepted = false;
        await using (var command = Command(session, """
            SELECT "id", "parentName", "relation", "isActive", "isAccepted" FROM "student_parent_links"
            WHERE "studentId" = @sid AND "parentEmail" = @email
            """))
        {
            AddParameter(command, "sid", studentId);
            AddParameter(command, "email", parentEmail);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                existingId = reader.GetString(0);
                existingName = reader.GetString(1);
                existingRelation = reader.GetString(2);
                existingActive = reader.GetBoolean(3);
                existingAccepted = reader.GetBoolean(4);
            }
        }

        if (existingId is not null && existingActive && existingAccepted)
        {
            return new ParentInviteOutcome(ParentInviteKind.AlreadyLinked, existingId, null, null, existingName, studentName);
        }

        if (parent is not null)
        {
            var name = string.IsNullOrEmpty(parentName) ? parent.Name : parentName;
            string id;
            if (existingId is not null)
            {
                await using var update = Command(session, """
                    UPDATE "student_parent_links" SET "isActive" = true, "parentUserId" = @puid, "isAccepted" = true,
                        "acceptedAt" = @now, "invitationToken" = NULL, "tokenExpiresAt" = NULL, "updatedAt" = @now
                    WHERE "id" = @id
                    """);
                AddParameter(update, "puid", parent.Id);
                AddTimestamp(update, "now", Now());
                AddParameter(update, "id", existingId);
                await update.ExecuteNonQueryAsync(cancellationToken);
                id = existingId;
            }
            else
            {
                await using var insert = Command(session, """
                    INSERT INTO "student_parent_links"
                        ("id", "studentId", "parentEmail", "parentName", "relation", "parentUserId", "isAccepted",
                         "acceptedAt", "invitedBy", "createdDate", "updatedAt")
                    VALUES (gen_random_uuid()::text, @sid, @email, @name, @relation, @puid, true, @now, @sid, @now, @now)
                    RETURNING "id"
                    """);
                AddParameter(insert, "sid", studentId);
                AddParameter(insert, "email", parentEmail);
                AddParameter(insert, "name", name);
                AddParameter(insert, "relation", string.IsNullOrEmpty(relation) ? "parent" : relation);
                AddParameter(insert, "puid", parent.Id);
                AddTimestamp(insert, "now", Now());
                id = (string)(await insert.ExecuteScalarAsync(cancellationToken))!;
            }

            await session.CommitAsync(cancellationToken);
            return new ParentInviteOutcome(ParentInviteKind.Attached, id, null, parent.Id, name, studentName);
        }

        var token = InvitationTokenGenerator.Generate();
        string linkId;
        string sentName;
        if (existingId is not null)
        {
            // Re-invite refreshes the row (a bare INSERT 500'd on the unique key). relation "" = not supplied → keep.
            sentName = string.IsNullOrEmpty(parentName) ? existingName : parentName;
            await using var update = Command(session, """
                UPDATE "student_parent_links" SET "isActive" = true, "parentName" = @name, "relation" = @relation,
                    "invitedBy" = @sid, "invitationToken" = @token, "tokenExpiresAt" = @expires, "updatedAt" = @now
                WHERE "id" = @id
                """);
            AddParameter(update, "name", sentName);
            AddParameter(update, "relation", string.IsNullOrEmpty(relation) ? existingRelation : relation);
            AddParameter(update, "sid", studentId);
            AddParameter(update, "token", token);
            AddTimestamp(update, "expires", Now().AddHours(48));
            AddTimestamp(update, "now", Now());
            AddParameter(update, "id", existingId);
            await update.ExecuteNonQueryAsync(cancellationToken);
            linkId = existingId;
        }
        else
        {
            sentName = parentName;
            await using var insert = Command(session, """
                INSERT INTO "student_parent_links"
                    ("id", "studentId", "parentEmail", "parentName", "relation", "invitationToken", "tokenExpiresAt",
                     "invitedBy", "createdDate", "updatedAt")
                VALUES (gen_random_uuid()::text, @sid, @email, @name, @relation, @token, @expires, @sid, @now, @now)
                RETURNING "id"
                """);
            AddParameter(insert, "sid", studentId);
            AddParameter(insert, "email", parentEmail);
            AddParameter(insert, "name", parentName);
            AddParameter(insert, "relation", string.IsNullOrEmpty(relation) ? "parent" : relation);
            AddParameter(insert, "token", token);
            AddTimestamp(insert, "expires", Now().AddHours(48));
            AddTimestamp(insert, "now", Now());
            linkId = (string)(await insert.ExecuteScalarAsync(cancellationToken))!;
        }

        await session.CommitAsync(cancellationToken);
        return new ParentInviteOutcome(ParentInviteKind.Invited, linkId, token, null, sentName, studentName);
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

    public async Task<ParentResendOutcome> ResendAsync(
        RequestContext context, string studentId, string parentLinkId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        string owner, email, name;
        string? invitedBy;
        bool active, accepted;
        await using (var command = Command(session, """
            SELECT "studentId", "parentEmail", "parentName", "isActive", "isAccepted", "invitedBy"
            FROM "student_parent_links" WHERE "id" = @id
            """))
        {
            AddParameter(command, "id", parentLinkId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return ParentResendOutcome.NotFound;
            }

            owner = reader.GetString(0);
            email = reader.GetString(1);
            name = reader.GetString(2);
            active = reader.GetBoolean(3);
            accepted = reader.GetBoolean(4);
            invitedBy = reader.IsDBNull(5) ? null : reader.GetString(5);
        }

        // Not owned → 404; accepted / inactive links have nothing to resend (audit 2026-10-09 C8b).
        if (owner != studentId || !active || accepted)
        {
            return ParentResendOutcome.NotFound;
        }

        var (studentName, _) = await StudentAsync(session, studentId, cancellationToken);
        var parent = await FindOnboardedParentAsync(email, cancellationToken);

        if (parent is not null && parent.Id != studentId)
        {
            // The address has since become an onboarded parent: attach instead of minting a dead token (C8).
            await using var attach = Command(session, """
                UPDATE "student_parent_links" SET "parentUserId" = @puid, "isAccepted" = true, "acceptedAt" = @now,
                    "invitationToken" = NULL, "tokenExpiresAt" = NULL, "updatedAt" = @now
                WHERE "id" = @id
                """);
            AddParameter(attach, "puid", parent.Id);
            AddTimestamp(attach, "now", Now());
            AddParameter(attach, "id", parentLinkId);
            await attach.ExecuteNonQueryAsync(cancellationToken);
            await session.CommitAsync(cancellationToken);
            var linkedName = string.IsNullOrEmpty(name) ? parent.Name : name;
            return new ParentResendOutcome(ParentResendKind.Attached, null, email, linkedName, studentName, parent.Id, invitedBy);
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
        return new ParentResendOutcome(ParentResendKind.Reissued, token, email, name, studentName, null, invitedBy);
    }

    private sealed record OnboardedParent(string Id, string Name);

    // legacy findOnboardedParentUser: active, parent role, password set. System session (see the class doc).
    private async Task<OnboardedParent?> FindOnboardedParentAsync(string email, CancellationToken cancellationToken)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
        await using var command = Command(session, """
            SELECT "id", "name" FROM "users"
            WHERE "email" = @email AND "isActive" = true AND "roleName" IN ('parent', 'Parent')
              AND "password" IS NOT NULL AND "password" <> ''
            LIMIT 1
            """);
        AddParameter(command, "email", email.ToLowerInvariant());
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken)
            ? new OnboardedParent(reader.GetString(0), reader.IsDBNull(1) ? string.Empty : reader.GetString(1))
            : null;
    }

    // The caller's own users row (RLS admits id = current user): name for the email, email for the self-link guard.
    private static async Task<(string Name, string? Email)> StudentAsync(
        FormMapsDatabaseSession session, string studentId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "name", "email" FROM "users" WHERE "id" = @id""");
        AddParameter(command, "id", studentId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return (string.Empty, null);
        }

        return (reader.IsDBNull(0) ? string.Empty : reader.GetString(0), reader.IsDBNull(1) ? null : reader.GetString(1));
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
