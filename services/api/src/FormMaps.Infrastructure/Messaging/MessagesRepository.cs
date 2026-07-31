using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Messaging;

namespace FormMaps.Infrastructure.Messaging;

/// <summary>
/// SQL for routes/messages.ts (586 lines). One method per legacy route, matching
/// VideoSessionsRepository's convention. RLS on "conversations"/"messages" is participant-scoped
/// (api/prisma/rls/005-sensitive.sql) — see the plan's Global Constraints for the resulting
/// 404-collapses-403 divergence from legacy, which is deliberate.
/// </summary>
public sealed class MessagesRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : IMessagesRepository
{
    public async Task<int> GetUnreadCountAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT count(*)::int FROM "messages" m
            WHERE m."conversationId" IN (
                SELECT c."id" FROM "conversations" c
                WHERE c."participantAId" = @userId OR c."participantBId" = @userId
            )
            AND m."senderId" <> @userId AND m."readAt" IS NULL
            """);
        AddParameter(command, "userId", userId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return (int)result!;
    }

    public async Task<IReadOnlyList<ContactRow>> GetContactsAsync(
        RequestContext context, string userId, string role, string? schoolId, string? search,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(schoolId)) return [];

        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        var privileged = role is "school_admin" or "super admin" or "counselor";

        var sqlBuilder = new System.Text.StringBuilder();
        sqlBuilder.Append("""SELECT u."id", u."name", u."email", u."roleName" FROM "users" u WHERE u."schoolId" = @schoolId AND u."isActive" = true AND u."id" <> @userId""");

        if (!string.IsNullOrWhiteSpace(search))
            sqlBuilder.Append(""" AND (u."name" ILIKE @search OR u."email" ILIKE @search)""");

        if (!privileged)
            sqlBuilder.Append(""" AND (u."roleName" = 'school_admin' OR u."id" = ANY(@assignedIds))""");

        sqlBuilder.Append(""" ORDER BY u."name" ASC LIMIT 20""");

        var sql = sqlBuilder.ToString();

        await using var command = Command(session, sql);
        AddParameter(command, "schoolId", schoolId);
        AddParameter(command, "userId", userId);
        if (!string.IsNullOrWhiteSpace(search)) AddParameter(command, "search", $"%{search}%");
        if (!privileged)
        {
            var assignedIds = await GetAssignedCounselorIdsAsync(session, userId, cancellationToken);
            AddParameter(command, "assignedIds", assignedIds.ToArray());
        }

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<ContactRow>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new ContactRow(
                reader.GetString(0),
                reader.IsDBNull(1) ? null : reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3)));
        }
        return rows;
    }

    private static async Task<IReadOnlyList<string>> GetAssignedCounselorIdsAsync(
        FormMapsDatabaseSession session, string studentId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT "counselorId" FROM "counselor_student_assignments" WHERE "studentId" = @studentId AND "isActive" = true
            """);
        AddParameter(command, "studentId", studentId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var ids = new List<string>();
        while (await reader.ReadAsync(cancellationToken)) ids.Add(reader.GetString(0));
        return ids;
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

    public async Task<IReadOnlyList<ConversationSummary>> ListConversationsAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT
                c."id",
                CASE WHEN c."participantAId" = @userId THEN c."participantBId" ELSE c."participantAId" END AS "otherId",
                CASE WHEN c."participantAId" = @userId THEN ub."name" ELSE ua."name" END AS "otherName",
                CASE WHEN c."participantAId" = @userId THEN ub."email" ELSE ua."email" END AS "otherEmail",
                c."lastMessagePreview", c."lastMessageAt",
                COALESCE(uc."cnt", 0)::int AS "unreadCount"
            FROM "conversations" c
            JOIN "users" ua ON ua."id" = c."participantAId"
            JOIN "users" ub ON ub."id" = c."participantBId"
            LEFT JOIN (
                SELECT m."conversationId", count(*) AS "cnt" FROM "messages" m
                WHERE m."senderId" <> @userId AND m."readAt" IS NULL
                GROUP BY m."conversationId"
            ) uc ON uc."conversationId" = c."id"
            WHERE c."participantAId" = @userId OR c."participantBId" = @userId
            ORDER BY c."lastMessageAt" DESC NULLS FIRST
            """);
        AddParameter(command, "userId", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<ConversationSummary>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new ConversationSummary(
                reader.GetString(0), reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetString(2), reader.GetString(3),
                reader.IsDBNull(4) ? null : reader.GetString(4),
                reader.IsDBNull(5) ? null : reader.GetDateTime(5),
                reader.GetInt32(6)));
        }
        return rows;
    }

    private DateTime NowTruncated() =>
        DateTime.SpecifyKind(new DateTime(timeProviderTicks(), DateTimeKind.Unspecified), DateTimeKind.Unspecified);

    private long timeProviderTicks() => (timeProvider.GetUtcNow().UtcDateTime.Ticks / TimeSpan.TicksPerMillisecond) * TimeSpan.TicksPerMillisecond;

    /// <summary>
    /// routes/messages.ts POST /conversations. Auth matrix, in legacy's exact order: recipient existence
    /// (400, oracle-safe) -> bidirectional block (403) -> tenant/role scoping. Privileged callers
    /// (school_admin/counselor, not super admin) are confined to their own school; a cross-school target
    /// is reported as RecipientNotFound (same status+message as a genuinely nonexistent recipient) so a
    /// caller can't distinguish "doesn't exist" from "exists in another school" — same for the student
    /// -> school_admin cross-school case below. Everything else (unassigned counselor, un-linked child,
    /// non-counselor/non-admin student target) is a plain Forbidden: those targets are already within the
    /// caller's own school/reachable directory, so revealing their existence isn't an oracle leak.
    /// </summary>
    public async Task<CreateConversationResult> CreateConversationAsync(
        RequestContext context, string userId, string role, string? schoolId, string targetId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var currentSchoolId = schoolId;
        var (targetSchoolId, targetRole) = await LookupUserAsync(session, targetId, cancellationToken);
        if (targetRole is null)
            return new CreateConversationResult(CreateConversationStatus.RecipientNotFound, null, "Recipient not found");

        if (await IsBlockedBetweenAsync(session, userId, targetId, cancellationToken))
            return new CreateConversationResult(CreateConversationStatus.Blocked, null, "You cannot message this user");

        var sameSchool = currentSchoolId is not null && currentSchoolId == targetSchoolId;
        var privilegedRoles = new[] { "school_admin", "super admin", "counselor" };
        var isPrivileged = privilegedRoles.Contains(role);
        var isSuperAdmin = role == "super admin";

        if (isPrivileged && !isSuperAdmin)
        {
            if (!sameSchool) return new CreateConversationResult(CreateConversationStatus.RecipientNotFound, null, "Recipient not found");
        }
        else if (!isSuperAdmin)
        {
            if (role == "student")
            {
                var normalizedTargetRole = targetRole.ToLowerInvariant();
                if (normalizedTargetRole == "counselor")
                {
                    var assigned = await HasActiveAssignmentAsync(session, userId, targetId, cancellationToken);
                    if (!assigned) return new CreateConversationResult(CreateConversationStatus.Forbidden, null, "You are not assigned to this counselor");
                }
                else if (normalizedTargetRole == "school_admin")
                {
                    if (!sameSchool) return new CreateConversationResult(CreateConversationStatus.RecipientNotFound, null, "Recipient not found");
                }
                else
                {
                    return new CreateConversationResult(CreateConversationStatus.Forbidden, null, "You can only message your assigned counselor or school admin");
                }
            }

            if (role == "parent")
            {
                var childIds = await GetLinkedChildIdsAsync(session, userId, cancellationToken);
                if (childIds.Count == 0)
                    return new CreateConversationResult(CreateConversationStatus.Forbidden, null, "No linked children found");
                var anyAssigned = false;
                foreach (var childId in childIds)
                {
                    if (await HasActiveAssignmentAsync(session, childId, targetId, cancellationToken)) { anyAssigned = true; break; }
                }
                if (!anyAssigned)
                    return new CreateConversationResult(CreateConversationStatus.Forbidden, null, "This user is not assigned to any of your children");
            }
        }

        var (participantAId, participantBId) = string.CompareOrdinal(userId, targetId) < 0 ? (userId, targetId) : (targetId, userId);

        var existing = await FindConversationRowAsync(session, participantAId, participantBId, cancellationToken);
        if (existing is not null)
        {
            await session.CommitAsync(cancellationToken);
            return new CreateConversationResult(CreateConversationStatus.Existing, ToSummary(existing, userId), null);
        }

        var newId = Guid.NewGuid().ToString();
        await using (var insert = Command(session, """
            INSERT INTO "conversations" ("id", "participantAId", "participantBId") VALUES (@id, @pa, @pb)
            """))
        {
            AddParameter(insert, "id", newId);
            AddParameter(insert, "pa", participantAId);
            AddParameter(insert, "pb", participantBId);
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }

        // Re-read (joined with users, for the response) while the transaction is still open — querying
        // through `session` after CommitAsync would reuse an already-completed DbTransaction and throw.
        var created = await FindConversationRowAsync(session, participantAId, participantBId, cancellationToken)
            ?? throw new InvalidOperationException("conversation vanished immediately after insert");
        await session.CommitAsync(cancellationToken);
        return new CreateConversationResult(CreateConversationStatus.Created, ToSummary(created, userId), null);
    }

    private sealed record ConversationRow(
        string Id, string ParticipantAId, string ParticipantBId, string? AName, string AEmail,
        string? BName, string BEmail, string? LastMessagePreview, DateTime? LastMessageAt);

    private static ConversationSummary ToSummary(ConversationRow row, string userId)
    {
        var iAmA = row.ParticipantAId == userId;
        return new ConversationSummary(
            row.Id,
            iAmA ? row.ParticipantBId : row.ParticipantAId,
            iAmA ? row.BName : row.AName,
            iAmA ? row.BEmail : row.AEmail,
            row.LastMessagePreview, row.LastMessageAt, 0);
    }

    private static async Task<ConversationRow?> FindConversationRowAsync(
        FormMapsDatabaseSession session, string participantAId, string participantBId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT c."id", c."participantAId", c."participantBId", ua."name", ua."email", ub."name", ub."email",
                   c."lastMessagePreview", c."lastMessageAt"
            FROM "conversations" c
            JOIN "users" ua ON ua."id" = c."participantAId"
            JOIN "users" ub ON ub."id" = c."participantBId"
            WHERE c."participantAId" = @pa AND c."participantBId" = @pb
            """);
        AddParameter(command, "pa", participantAId);
        AddParameter(command, "pb", participantBId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        return new ConversationRow(
            reader.GetString(0), reader.GetString(1), reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3), reader.GetString(4),
            reader.IsDBNull(5) ? null : reader.GetString(5), reader.GetString(6),
            reader.IsDBNull(7) ? null : reader.GetString(7),
            reader.IsDBNull(8) ? null : reader.GetDateTime(8));
    }

    private static async Task<(string? SchoolId, string? RoleName)> LookupUserAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "schoolId", "roleName" FROM "users" WHERE "id" = @id AND "isActive" = true""");
        AddParameter(command, "id", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return (null, null);
        return (reader.IsDBNull(0) ? null : reader.GetString(0), reader.GetString(1));
    }

    private static async Task<bool> IsBlockedBetweenAsync(
        FormMapsDatabaseSession session, string a, string b, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT 1 FROM "user_blocks"
            WHERE "isActive" = true AND (("blockerId" = @a AND "blockedId" = @b) OR ("blockerId" = @b AND "blockedId" = @a))
            LIMIT 1
            """);
        AddParameter(command, "a", a);
        AddParameter(command, "b", b);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is not null;
    }

    private static async Task<bool> HasActiveAssignmentAsync(
        FormMapsDatabaseSession session, string studentId, string counselorId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT 1 FROM "counselor_student_assignments"
            WHERE "studentId" = @studentId AND "counselorId" = @counselorId AND "isActive" = true LIMIT 1
            """);
        AddParameter(command, "studentId", studentId);
        AddParameter(command, "counselorId", counselorId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is not null;
    }

    private static async Task<IReadOnlyList<string>> GetLinkedChildIdsAsync(
        FormMapsDatabaseSession session, string parentUserId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT "studentId" FROM "student_parent_links"
            WHERE "parentUserId" = @parentUserId AND "isActive" = true AND "isAccepted" = true
            """);
        AddParameter(command, "parentUserId", parentUserId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var ids = new List<string>();
        while (await reader.ReadAsync(cancellationToken)) ids.Add(reader.GetString(0));
        return ids;
    }
}
