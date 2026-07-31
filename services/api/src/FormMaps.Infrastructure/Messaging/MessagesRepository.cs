using System.Data;
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

    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
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
        var now = NowTruncated();
        await using (var insert = Command(session, """
            INSERT INTO "conversations" ("id", "participantAId", "participantBId", "createdDate", "updatedAt")
            VALUES (@id, @pa, @pb, @now, @now)
            """))
        {
            AddParameter(insert, "id", newId);
            AddParameter(insert, "pa", participantAId);
            AddParameter(insert, "pb", participantBId);
            AddTimestamp(insert, "now", now);
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }

        // Re-read (joined with users, for the response) while the transaction is still open — querying
        // through `session` after CommitAsync would reuse an already-completed DbTransaction and throw.
        var created = await FindConversationRowAsync(session, participantAId, participantBId, cancellationToken)
            ?? throw new InvalidOperationException("conversation vanished immediately after insert");
        await session.CommitAsync(cancellationToken);
        return new CreateConversationResult(CreateConversationStatus.Created, ToSummary(created, userId), null);
    }

    /// <summary>
    /// routes/messages.ts GET /conversations/:id. RLS on "conversations" is participant-scoped, so a
    /// non-participant's lookup finds no row and collapses legacy's 403 "Access denied" into 404 "Conversation
    /// not found" -- deliberate divergence, see the plan's Global Constraints. The SELECT that builds the
    /// returned page runs BEFORE the mark-as-read UPDATE (matching legacy's Promise.all-then-updateMany
    /// ordering), so messages in the returned page reflect ReadAt as of read time, not after marking.
    /// Legacy's `prisma.message.updateMany` bumps `updatedAt` via Prisma's `@updatedAt` on Message even
    /// though the update's `data` only sets `readAt` -- Prisma Client stamps `@updatedAt` fields on every
    /// write path (update/updateMany/upsert). This raw-SQL UPDATE sets "updatedAt" = @now explicitly to
    /// match that behavior.
    /// </summary>
    public async Task<ConversationMessagesResult> GetConversationMessagesAsync(
        RequestContext context, string userId, string conversationId, int page, int limit,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // RLS hides this row entirely for non-participants in production (see plan's Global Constraints for
        // the resulting 404-collapses-403 divergence from legacy). Also filtered explicitly here, matching
        // every other method in this class (ListConversationsAsync, CreateConversationAsync): RLS is
        // defense-in-depth, not the sole gate -- an explicit participant check keeps this correct even when
        // the connecting role bypasses RLS (e.g. a superuser, as Testcontainers' default Postgres role is).
        var exists = await ConversationExistsAsync(session, conversationId, userId, cancellationToken);
        if (!exists) return new ConversationMessagesResult(ConversationMessagesStatus.NotFound, null);

        var offset = (page - 1) * limit;
        int total;
        await using (var countCmd = Command(session, """SELECT count(*)::int FROM "messages" WHERE "conversationId" = @cid"""))
        {
            AddParameter(countCmd, "cid", conversationId);
            total = (int)(await countCmd.ExecuteScalarAsync(cancellationToken))!;
        }

        var rows = new List<MessageRow>();
        await using (var listCmd = Command(session, """
            SELECT m."id", m."conversationId", m."senderId", u."name", m."content", m."readAt", m."createdDate"
            FROM "messages" m JOIN "users" u ON u."id" = m."senderId"
            WHERE m."conversationId" = @cid ORDER BY m."createdDate" ASC OFFSET @offset LIMIT @limit
            """))
        {
            AddParameter(listCmd, "cid", conversationId);
            AddParameter(listCmd, "offset", offset);
            AddParameter(listCmd, "limit", limit);
            await using var reader = await listCmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add(new MessageRow(
                    reader.GetString(0), reader.GetString(1), reader.GetString(2),
                    reader.IsDBNull(3) ? null : reader.GetString(3), reader.GetString(4),
                    reader.IsDBNull(5) ? null : reader.GetDateTime(5), reader.GetDateTime(6)));
            }
        }

        var now = NowTruncated();
        await using (var markReadCmd = Command(session, """
            UPDATE "messages" SET "readAt" = @now, "updatedAt" = @now
            WHERE "conversationId" = @cid AND "senderId" <> @userId AND "readAt" IS NULL
            """))
        {
            AddParameter(markReadCmd, "cid", conversationId);
            AddParameter(markReadCmd, "userId", userId);
            AddTimestamp(markReadCmd, "now", now);
            await markReadCmd.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);

        var totalPages = (int)Math.Ceiling(total / (double)limit);
        return new ConversationMessagesResult(
            ConversationMessagesStatus.Ok,
            new ConversationMessagesPage(rows, total, page, limit, totalPages));
    }

    /// <summary>
    /// routes/messages.ts POST /conversations/:id. Legacy checks `isParticipant` explicitly and returns a
    /// distinct 403 "Access denied"; this port collapses that into the same NotFound as a missing conversation
    /// id, matching GetConversationMessagesAsync's deliberate 404-collapses-403 divergence (see that method's
    /// doc comment and the plan's Global Constraints). The check itself is explicit here (not left to RLS)
    /// for the same defense-in-depth reason as ConversationExistsAsync below -- the connecting role in tests
    /// (and potentially some production paths) can bypass RLS, so this must not be the only gate.
    /// </summary>
    public async Task<SendMessageResult> SendMessageAsync(
        RequestContext context, string userId, string conversationId, string content,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var conversation = await FindConversationRowAsync(session, conversationId, cancellationToken);
        if (conversation is null || (conversation.ParticipantAId != userId && conversation.ParticipantBId != userId))
            return new SendMessageResult(SendMessageStatus.NotFound, null, null, null, null, null);

        var otherId = conversation.ParticipantAId == userId ? conversation.ParticipantBId : conversation.ParticipantAId;
        if (await IsBlockedBetweenAsync(session, userId, otherId, cancellationToken))
            return new SendMessageResult(SendMessageStatus.Blocked, null, null, null, null, null);

        var preview = content.Length > 100 ? content[..97] + "..." : content;
        var now = NowTruncated();
        var messageId = Guid.NewGuid().ToString();

        await using (var insert = Command(session, """
            INSERT INTO "messages" ("id", "conversationId", "senderId", "content", "createdDate", "updatedAt")
            VALUES (@id, @cid, @sid, @content, @now, @now)
            """))
        {
            AddParameter(insert, "id", messageId);
            AddParameter(insert, "cid", conversationId);
            AddParameter(insert, "sid", userId);
            AddParameter(insert, "content", content);
            AddTimestamp(insert, "now", now);
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (var update = Command(session, """
            UPDATE "conversations" SET "lastMessageAt" = @now, "lastMessagePreview" = @preview, "updatedAt" = @now WHERE "id" = @cid
            """))
        {
            AddParameter(update, "cid", conversationId);
            AddParameter(update, "preview", preview);
            AddTimestamp(update, "now", now);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        var recipientEmail = conversation.ParticipantAId == userId ? conversation.BEmail : conversation.AEmail;
        var senderName = (conversation.ParticipantAId == userId ? conversation.AName : conversation.BName) ?? "";

        await using (var outbox = Command(session, """
            INSERT INTO "notification_outbox" ("id", "type", "payload", "due_at")
            VALUES (@id, 'unread_message', @payload::jsonb, @dueAt)
            """))
        {
            AddParameter(outbox, "id", Guid.NewGuid().ToString());
            AddParameter(outbox, "payload", System.Text.Json.JsonSerializer.Serialize(new
            {
                messageId, recipientEmail, senderName, preview,
            }));
            AddTimestamp(outbox, "dueAt", now.AddMinutes(5));
            await outbox.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);

        var message = new MessageRow(messageId, conversationId, userId, senderName, content, null, now);
        return new SendMessageResult(SendMessageStatus.Sent, message, otherId, recipientEmail, senderName, preview);
    }

    private static async Task<bool> ConversationExistsAsync(
        FormMapsDatabaseSession session, string conversationId, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT 1 FROM "conversations"
            WHERE "id" = @id AND ("participantAId" = @userId OR "participantBId" = @userId)
            LIMIT 1
            """);
        AddParameter(command, "id", conversationId);
        AddParameter(command, "userId", userId);
        return await command.ExecuteScalarAsync(cancellationToken) is not null;
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

    /// <summary>
    /// Looks up a conversation row (joined with both participants' users, for the fields CreateConversationAsync
    /// and SendMessageAsync both need) either by participant pair or by conversation id. The two lookups share
    /// this one query builder rather than existing as near-duplicate methods -- see the two thin overloads below.
    /// </summary>
    private static async Task<ConversationRow?> FindConversationRowAsync(
        FormMapsDatabaseSession session, string? conversationId, string? participantAId, string? participantBId,
        CancellationToken cancellationToken)
    {
        var whereClause = conversationId is not null
            ? """WHERE c."id" = @id"""
            : """WHERE c."participantAId" = @pa AND c."participantBId" = @pb""";

        await using var command = Command(session, $"""
            SELECT c."id", c."participantAId", c."participantBId", ua."name", ua."email", ub."name", ub."email",
                   c."lastMessagePreview", c."lastMessageAt"
            FROM "conversations" c
            JOIN "users" ua ON ua."id" = c."participantAId"
            JOIN "users" ub ON ub."id" = c."participantBId"
            {whereClause}
            """);
        if (conversationId is not null)
        {
            AddParameter(command, "id", conversationId);
        }
        else
        {
            AddParameter(command, "pa", participantAId!);
            AddParameter(command, "pb", participantBId!);
        }

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        return new ConversationRow(
            reader.GetString(0), reader.GetString(1), reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3), reader.GetString(4),
            reader.IsDBNull(5) ? null : reader.GetString(5), reader.GetString(6),
            reader.IsDBNull(7) ? null : reader.GetString(7),
            reader.IsDBNull(8) ? null : reader.GetDateTime(8));
    }

    private static Task<ConversationRow?> FindConversationRowAsync(
        FormMapsDatabaseSession session, string participantAId, string participantBId, CancellationToken cancellationToken) =>
        FindConversationRowAsync(session, conversationId: null, participantAId, participantBId, cancellationToken);

    private static Task<ConversationRow?> FindConversationRowAsync(
        FormMapsDatabaseSession session, string conversationId, CancellationToken cancellationToken) =>
        FindConversationRowAsync(session, conversationId, participantAId: null, participantBId: null, cancellationToken);

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
