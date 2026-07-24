using System.Data;
using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.ParentPortal;

namespace FormMaps.Infrastructure.ParentPortal;

/// <summary>
/// Parent portal self-scoped surface (FM-DOTNET-078). Reads on a read-only RLS (Identity) session; the two writes
/// (mark-read, delete-link) on a writable session + commit (ownership + write in one session, atomic). Every query is
/// explicitly scoped to the caller (userId / lowercased email / link party). Notifications/eval-groups are read raw
/// (Prisma passthrough); timestamps emit ISO-Z; write timestamps bind Kind=Unspecified + ms-truncated; SET columns are
/// fixed literals (mass-assignment guard). ORDER BYs add an id tie-break (deterministic superset over the legacy
/// single-key orderBy).
/// </summary>
public sealed class ParentPortalRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : IParentPortalRepository
{
    private const string NotificationColumns =
        """
        "id", "userId", "type", "title", "message", "isRead", "readAt", "relatedEntityId", "relatedEntityType",
        "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
        """;

    public async Task<ParentProfile> GetProfileAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        bool userFound = false;
        string? name = null, email = null;
        await using (var command = Command(session, """SELECT "name", "email" FROM "users" WHERE "id" = @uid"""))
        {
            AddParameter(command, "uid", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                userFound = true;
                name = reader.IsDBNull(0) ? null : reader.GetString(0);
                email = reader.IsDBNull(1) ? null : reader.GetString(1);
            }
        }

        // Linked+accepted children, inner-joined to the child user (a link whose child user is absent is dropped,
        // matching links.filter(byId.has(studentId))). relationship = link.relation.
        var children = new List<ParentChild>();
        await using (var command = Command(session, """
            SELECT sp."studentId", sp."relation", u."name", u."gradeLevel"
            FROM "student_parent_links" sp
            JOIN "users" u ON u."id" = sp."studentId"
            WHERE sp."parentUserId" = @uid AND sp."isActive" = true AND sp."isAccepted" = true
            ORDER BY sp."createdDate" ASC, sp."id" ASC
            """))
        {
            AddParameter(command, "uid", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                children.Add(new ParentChild(
                    StudentId: reader.GetString(0),
                    Relationship: reader.GetString(1),
                    StudentName: reader.GetString(2),
                    GradeLevel: reader.IsDBNull(3) ? null : reader.GetInt32(3)));
            }
        }

        return new ParentProfile(userFound, userFound ? userId : null, name, email, children);
    }

    public async Task<(IReadOnlyList<NotificationRow> Rows, int Total)> ListNotificationsAsync(
        RequestContext context, string userId, bool unreadOnly, long skip, int take, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var where = "\"userId\" = @uid AND \"isActive\" = true" + (unreadOnly ? " AND \"isRead\" = false" : "");

        var rows = new List<NotificationRow>();
        await using (var command = Command(session, $"""
            SELECT {NotificationColumns} FROM "notifications" WHERE {where}
            ORDER BY "createdDate" DESC, "id" ASC OFFSET @skip LIMIT @take
            """))
        {
            AddParameter(command, "uid", userId);
            AddParameter(command, "skip", skip);
            AddParameter(command, "take", take);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add(MapNotification(reader));
            }
        }

        int total;
        await using (var command = Command(session, $"""SELECT COUNT(*) FROM "notifications" WHERE {where}"""))
        {
            AddParameter(command, "uid", userId);
            total = Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
        }

        return (rows, total);
    }

    public async Task<bool> MarkNotificationReadAsync(
        RequestContext context, string userId, string notificationId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // findUnique (no isActive filter) → missing OR not owned → false (403).
        await using (var lookup = Command(session, """SELECT "userId" FROM "notifications" WHERE "id" = @id"""))
        {
            AddParameter(lookup, "id", notificationId);
            var owner = await lookup.ExecuteScalarAsync(cancellationToken);
            if (owner is null or DBNull || (string)owner != userId)
            {
                return false;
            }
        }

        await using (var update = Command(session, """
            UPDATE "notifications" SET "isRead" = true, "readAt" = @now, "updatedAt" = @now WHERE "id" = @id
            """))
        {
            AddTimestamp(update, "now", Now());
            AddParameter(update, "id", notificationId);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return true;
    }

    public async Task<int> MarkAllNotificationsReadAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // updateMany where { userId, isRead:false } (NO isActive filter — matches legacy).
        int count;
        await using (var update = Command(session, """
            UPDATE "notifications" SET "isRead" = true, "readAt" = @now, "updatedAt" = @now
            WHERE "userId" = @uid AND "isRead" = false
            """))
        {
            AddTimestamp(update, "now", Now());
            AddParameter(update, "uid", userId);
            count = await update.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return count;
    }

    public async Task<IReadOnlyList<PendingEvaluation>> ListPendingEvaluationsAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        string? email = null;
        await using (var command = Command(session, """SELECT "email" FROM "users" WHERE "id" = @uid"""))
        {
            AddParameter(command, "uid", userId);
            var value = await command.ExecuteScalarAsync(cancellationToken);
            email = value is null or DBNull ? null : (string)value;
        }

        if (string.IsNullOrEmpty(email))
        {
            return Array.Empty<PendingEvaluation>(); // !user?.email → []
        }

        var rows = new List<PendingEvaluation>();
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
                rows.Add(new PendingEvaluation(
                    EvaluationId: reader.GetString(0),
                    StudentName: string.IsNullOrEmpty(studentName) ? "your student" : studentName, // name || "your student"
                    Deadline: IsoZ(reader.GetDateTime(2)),
                    Token: reader.GetString(3)));
            }
        }

        return rows;
    }

    public async Task<bool> DeleteLinkAsync(
        RequestContext context, string userId, string parentLinkId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // findUnique (no isActive filter) → missing OR neither the parent nor the student is the caller → false (403).
        await using (var lookup = Command(session,
            """SELECT "parentUserId", "studentId" FROM "student_parent_links" WHERE "id" = @id"""))
        {
            AddParameter(lookup, "id", parentLinkId);
            await using var reader = await lookup.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return false;
            }

            var parentUserId = reader.IsDBNull(0) ? null : reader.GetString(0);
            var studentId = reader.GetString(1);
            if (parentUserId != userId && studentId != userId)
            {
                return false;
            }
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

    private static NotificationRow MapNotification(DbDataReader reader) => new(
        Id: reader.GetString(0),
        UserId: reader.GetString(1),
        Type: reader.GetString(2),
        Title: reader.GetString(3),
        Message: reader.GetString(4),
        IsRead: reader.GetBoolean(5),
        ReadAt: reader.IsDBNull(6) ? null : IsoZ(reader.GetDateTime(6)),
        RelatedEntityId: reader.IsDBNull(7) ? null : reader.GetString(7),
        RelatedEntityType: reader.IsDBNull(8) ? null : reader.GetString(8),
        IsActive: reader.GetBoolean(9),
        CreatedBy: reader.IsDBNull(10) ? null : reader.GetString(10),
        CreatedDate: IsoZ(reader.GetDateTime(11)),
        UpdatedBy: reader.IsDBNull(12) ? null : reader.GetString(12),
        UpdatedAt: IsoZ(reader.GetDateTime(13)));

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
