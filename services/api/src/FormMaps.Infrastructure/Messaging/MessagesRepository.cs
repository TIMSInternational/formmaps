using System.Data;
using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Messaging;
using FormMaps.Infrastructure.Data;
using Microsoft.Extensions.Options;
using Npgsql;

namespace FormMaps.Infrastructure.Messaging;

/// <summary>
/// SQL for routes/messages.ts (586 lines). One method per legacy route, matching
/// VideoSessionsRepository's convention. RLS on "conversations"/"messages" is participant-scoped
/// (api/prisma/rls/005-sensitive.sql) — see the plan's Global Constraints for the resulting
/// 404-collapses-403 divergence from legacy, which is deliberate.
/// </summary>
public sealed class MessagesRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider,
    IMessagesRealtimeNotifier realtimeNotifier,
    IOptions<FormMapsDatabaseOptions>? databaseOptions = null) : IMessagesRepository
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
        // audit 2026-10-09 C14 (formmaps#132): a coach has no schoolId, so the school-scoped list below was always
        // empty for them. A coach's contacts are exactly the students with a non-cancelled booking with them.
        if (role == "coach") return await GetBookedContactsAsync(userId, search, coachSide: true, cancellationToken);

        // ...and a student can also reach the coaches they booked (independent students have no school at all).
        var bookedCoaches = role == "student"
            ? await GetBookedContactsAsync(userId, search, coachSide: false, cancellationToken)
            : [];
        if (string.IsNullOrWhiteSpace(schoolId)) return bookedCoaches;

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
        if (bookedCoaches.Count == 0) return rows;
        return rows.Concat(bookedCoaches.Where(c => rows.All(r => r.Id != c.Id)))
            .OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .Take(20)
            .ToList();
    }

    /// <summary>
    /// audit 2026-10-09 C14 (formmaps#132): the coach&lt;-&gt;student messaging relationship is a booking. A coach and a
    /// school student are mutually invisible under the "users" policy (self OR same non-empty school), so the user
    /// rows are read on a SYSTEM session — but the predicate is the authorization and is confined to the caller's
    /// own bookings: <paramref name="coachSide"/> lists the students who booked the calling coach, otherwise the
    /// coaches the calling student booked. A cancelled (or soft-deleted) booking grants nothing.
    /// </summary>
    private async Task<IReadOnlyList<ContactRow>> GetBookedContactsAsync(
        string userId, string? search, bool coachSide, CancellationToken cancellationToken)
    {
        var bookedIds = coachSide
            ? """SELECT b."studentId" FROM "bookings" b JOIN "coaches" co ON co."id" = b."coachId" WHERE co."userId" = @userId AND b."status" <> 'cancelled' AND b."isActive" = true"""
            : """SELECT co."userId" FROM "bookings" b JOIN "coaches" co ON co."id" = b."coachId" WHERE b."studentId" = @userId AND b."status" <> 'cancelled' AND b."isActive" = true""";
        var targetRole = coachSide ? "student" : "coach";
        var sql = $"""
            SELECT u."id", u."name", u."email", u."roleName" FROM "users" u
            WHERE u."id" IN ({bookedIds}) AND lower(u."roleName") = '{targetRole}' AND u."isActive" = true AND u."id" <> @userId
            {(string.IsNullOrWhiteSpace(search) ? "" : """AND (u."name" ILIKE @search OR u."email" ILIKE @search)""")}
            ORDER BY u."name" ASC LIMIT 20
            """;

        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
        await using var command = Command(session, sql);
        AddParameter(command, "userId", userId);
        if (!string.IsNullOrWhiteSpace(search)) AddParameter(command, "search", $"%{search}%");
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<ContactRow>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new ContactRow(
                reader.GetString(0), reader.IsDBNull(1) ? null : reader.GetString(1), reader.GetString(2), reader.GetString(3)));
        }
        return rows;
    }

    /// <summary>audit 2026-10-09 C14: true when <paramref name="studentId"/> has a non-cancelled, active booking with
    /// the coach whose user id is <paramref name="coachUserId"/>. bookings/coaches carry no RLS policy (escalated in
    /// 007-self-scoped.sql), so this runs on the caller's own session.</summary>
    private static async Task<bool> HasCoachBookingAsync(
        FormMapsDatabaseSession session, string coachUserId, string studentId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT 1 FROM "bookings" b JOIN "coaches" co ON co."id" = b."coachId"
            WHERE co."userId" = @coachUserId AND b."studentId" = @studentId AND b."status" <> 'cancelled' AND b."isActive" = true
            LIMIT 1
            """);
        AddParameter(command, "coachUserId", coachUserId);
        AddParameter(command, "studentId", studentId);
        return await command.ExecuteScalarAsync(cancellationToken) is not null;
    }

    /// <summary>
    /// audit 2026-10-09 C14: names/emails of conversation participants the caller cannot see under the "users"
    /// policy (a coach and a booked school student are mutually invisible). Callers pass ONLY the other participant
    /// of a conversation they have already proven they are in, so the system read cannot widen past that.
    /// </summary>
    private async Task<Dictionary<string, (string? Name, string Email)>> LookupParticipantsAsSystemAsync(
        IReadOnlyCollection<string> participantIds, CancellationToken cancellationToken)
    {
        var found = new Dictionary<string, (string? Name, string Email)>();
        if (participantIds.Count == 0) return found;
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
        await using var command = Command(session, """SELECT "id", "name", "email" FROM "users" WHERE "id" = ANY(@ids)""");
        AddParameter(command, "ids", participantIds.Distinct().ToArray());
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            found[reader.GetString(0)] = (reader.IsDBNull(1) ? null : reader.GetString(1), reader.GetString(2));
        return found;
    }

    private async Task<ConversationRow> FillHiddenParticipantsAsync(ConversationRow row, CancellationToken cancellationToken)
    {
        if (row.AEmail is not null && row.BEmail is not null) return row;
        var hidden = new List<string>();
        if (row.AEmail is null) hidden.Add(row.ParticipantAId);
        if (row.BEmail is null) hidden.Add(row.ParticipantBId);
        var found = await LookupParticipantsAsSystemAsync(hidden, cancellationToken);
        return row with
        {
            AName = row.AEmail is null && found.TryGetValue(row.ParticipantAId, out var a) ? a.Name : row.AName,
            AEmail = row.AEmail ?? (found.TryGetValue(row.ParticipantAId, out var ae) ? ae.Email : ""),
            BName = row.BEmail is null && found.TryGetValue(row.ParticipantBId, out var b) ? b.Name : row.BName,
            BEmail = row.BEmail ?? (found.TryGetValue(row.ParticipantBId, out var be) ? be.Email : ""),
        };
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

    // Wire format for every messaging timestamp (REST and the realtime push): the columns are
    // timestamp-without-tz, so the DateTime comes back Kind.Unspecified and would serialize as a bare
    // local time. Same convention as VideoSessionsRepository / CalendarReader; matches legacy's
    // Prisma DateTime -> JSON output including millisecond precision.
    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

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
            LEFT JOIN "users" ua ON ua."id" = c."participantAId"
            LEFT JOIN "users" ub ON ub."id" = c."participantBId"
            LEFT JOIN (
                SELECT m."conversationId", count(*) AS "cnt" FROM "messages" m
                WHERE m."senderId" <> @userId AND m."readAt" IS NULL
                GROUP BY m."conversationId"
            ) uc ON uc."conversationId" = c."id"
            WHERE c."participantAId" = @userId OR c."participantBId" = @userId
            ORDER BY c."lastMessageAt" DESC NULLS FIRST
            """);
        AddParameter(command, "userId", userId);
        var rows = new List<ConversationSummary>();
        var hidden = new List<string>();
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            while (await reader.ReadAsync(cancellationToken))
            {
                // audit 2026-10-09 C14: LEFT JOIN — an inner join silently dropped every coach<->student thread,
                // because the other participant's "users" row is invisible to the caller under RLS.
                if (reader.IsDBNull(3)) hidden.Add(reader.GetString(1));
                rows.Add(new ConversationSummary(
                    reader.GetString(0), reader.GetString(1),
                    reader.IsDBNull(2) ? null : reader.GetString(2), reader.IsDBNull(3) ? "" : reader.GetString(3),
                    reader.IsDBNull(4) ? null : reader.GetString(4),
                    reader.IsDBNull(5) ? null : IsoZ(reader.GetDateTime(5)),
                    reader.GetInt32(6)));
            }
        }
        if (hidden.Count == 0) return rows;
        // Every id here is the other participant of a conversation the WHERE clause proved the caller is in.
        var found = await LookupParticipantsAsSystemAsync(hidden, cancellationToken);
        return rows.Select(r => found.TryGetValue(r.OtherParticipantId, out var u) && r.OtherParticipantEmail == ""
            ? r with { OtherParticipantName = u.Name, OtherParticipantEmail = u.Email }
            : r).ToList();
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

        // audit 2026-10-09 C14 (formmaps#132): a coach may reach exactly the students with a non-cancelled booking
        // with them, and those students their coach — nobody else. The pair is mutually invisible under the "users"
        // policy, so only once the booking proves the relationship is the target read on a SYSTEM session.
        var bookingLinked = role switch
        {
            "coach" => await HasCoachBookingAsync(session, userId, targetId, cancellationToken),
            "student" => await HasCoachBookingAsync(session, targetId, userId, cancellationToken),
            _ => false,
        };
        var (targetSchoolId, targetRole) = await LookupUserAsync(session, targetId, cancellationToken);
        if (targetRole is null && bookingLinked)
        {
            await using var systemSession = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
            (targetSchoolId, targetRole) = await LookupUserAsync(systemSession, targetId, cancellationToken);
        }
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
            // audit 2026-10-09 C14: coach was allow-by-omission (any user, any school). Now booking-bounded; an
            // ineligible target answers exactly like a nonexistent one so this is not a user-existence oracle.
            if (role == "coach" && !(bookingLinked && targetRole.ToLowerInvariant() == "student"))
                return new CreateConversationResult(CreateConversationStatus.RecipientNotFound, null, "Recipient not found");

            if (role == "student")
            {
                var normalizedTargetRole = targetRole.ToLowerInvariant();
                if (normalizedTargetRole == "coach")
                {
                    if (!bookingLinked) return new CreateConversationResult(CreateConversationStatus.Forbidden, null, "You can only message a coach you have booked");
                }
                else if (normalizedTargetRole == "counselor")
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
                // formmaps#121. Both lookups run on a SYSTEM session, not the caller's. A parent has NO schoolId:
                // student_parent_links did not admit them at all before prisma/rls/009-parent-links.sql, and
                // counselor_student_assignments is school-inherit so it still does not. On the caller's own session
                // childIds came back empty and every parent got "No linked children found" — parents could not open
                // a conversation with their child's counselor at all. Both predicates are self-scoped and are the
                // authorization: parentUserId is the authenticated caller's own id, and the assignment check is
                // confined to the child ids that first query proved plus the single counselor being messaged. The
                // system session therefore cannot widen past what was already checked.
                await using var parentLinkSession =
                    await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
                var childIds = await GetLinkedChildIdsAsync(parentLinkSession, userId, cancellationToken);
                if (childIds.Count == 0)
                    return new CreateConversationResult(CreateConversationStatus.Forbidden, null, "No linked children found");
                var anyAssigned = false;
                foreach (var childId in childIds)
                {
                    if (await HasActiveAssignmentAsync(parentLinkSession, childId, targetId, cancellationToken)) { anyAssigned = true; break; }
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
            existing = await FillHiddenParticipantsAsync(existing, cancellationToken);
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
        created = await FillHiddenParticipantsAsync(created, cancellationToken);
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
        var hiddenSenders = new HashSet<string>();
        await using (var listCmd = Command(session, """
            SELECT m."id", m."conversationId", m."senderId", u."name", m."content", m."readAt", m."createdDate", u."id" IS NULL
            FROM "messages" m LEFT JOIN "users" u ON u."id" = m."senderId"
            WHERE m."conversationId" = @cid ORDER BY m."createdDate" DESC, m."id" DESC OFFSET @offset LIMIT @limit
            """))
        {
            AddParameter(listCmd, "cid", conversationId);
            AddParameter(listCmd, "offset", offset);
            AddParameter(listCmd, "limit", limit);
            await using var reader = await listCmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                if (reader.GetBoolean(7)) hiddenSenders.Add(reader.GetString(2));
                rows.Add(new MessageRow(
                    reader.GetString(0), reader.GetString(1), reader.GetString(2),
                    reader.IsDBNull(3) ? null : reader.GetString(3), reader.GetString(4),
                    reader.IsDBNull(5) ? null : IsoZ(reader.GetDateTime(5)), IsoZ(reader.GetDateTime(6))));
            }
        }

        // Page 1 is the NEWEST page (audit 2026-10-09 C6): oldest-first paging showed the first 50 messages of
        // a long thread forever, so anything newer never appeared. Each page is still returned oldest-first.
        rows.Reverse();

        // audit 2026-10-09 C14: the LEFT JOIN keeps messages whose sender the caller cannot see under RLS (the
        // coach<->student case); senders are participants of a conversation proven above to include the caller.
        if (hiddenSenders.Count > 0)
        {
            var found = await LookupParticipantsAsSystemAsync(hiddenSenders, cancellationToken);
            rows = rows.Select(r => hiddenSenders.Contains(r.SenderId) && found.TryGetValue(r.SenderId, out var u)
                ? r with { SenderName = u.Name } : r).ToList();
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
        conversation = await FillHiddenParticipantsAsync(conversation, cancellationToken);

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

        var recipientEmail = (conversation.ParticipantAId == userId ? conversation.BEmail : conversation.AEmail) ?? "";
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

        // CancellationToken.None, not the request's token: the message is already committed at this
        // point, so delivery is best-effort -- if the sender disconnects between commit and push, the
        // request's token would cancel and silently swallow (SignalRMessagesNotifier catches everything)
        // a push for a message that was, in fact, successfully sent. The recipient just misses the
        // realtime nudge, not the message.
        var createdDate = IsoZ(now);
        await realtimeNotifier.NotifyMessageReceivedAsync(otherId, new
        {
            id = messageId, conversationId, senderId = userId, content, createdDate,
        }, CancellationToken.None);

        var message = new MessageRow(messageId, conversationId, userId, senderName, content, null, createdDate);
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
        string Id, string ParticipantAId, string ParticipantBId, string? AName, string? AEmail,
        string? BName, string? BEmail, string? LastMessagePreview, string? LastMessageAt);

    private static ConversationSummary ToSummary(ConversationRow row, string userId)
    {
        var iAmA = row.ParticipantAId == userId;
        return new ConversationSummary(
            row.Id,
            iAmA ? row.ParticipantBId : row.ParticipantAId,
            iAmA ? row.BName : row.AName,
            (iAmA ? row.BEmail : row.AEmail) ?? "",
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
            LEFT JOIN "users" ua ON ua."id" = c."participantAId"
            LEFT JOIN "users" ub ON ub."id" = c."participantBId"
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
            reader.IsDBNull(3) ? null : reader.GetString(3), reader.IsDBNull(4) ? null : reader.GetString(4),
            reader.IsDBNull(5) ? null : reader.GetString(5), reader.IsDBNull(6) ? null : reader.GetString(6),
            reader.IsDBNull(7) ? null : reader.GetString(7),
            reader.IsDBNull(8) ? null : IsoZ(reader.GetDateTime(8)));
    }

    private static Task<ConversationRow?> FindConversationRowAsync(
        FormMapsDatabaseSession session, string participantAId, string participantBId, CancellationToken cancellationToken) =>
        FindConversationRowAsync(session, conversationId: null, participantAId, participantBId, cancellationToken);

    private static Task<ConversationRow?> FindConversationRowAsync(
        FormMapsDatabaseSession session, string conversationId, CancellationToken cancellationToken) =>
        FindConversationRowAsync(session, conversationId, participantAId: null, participantBId: null, cancellationToken);

    /// <summary>
    /// Deliberately NOT filtered on "isActive" -- matches legacy exactly
    /// (routes/messages.ts:206-207, a bare `prisma.user.findUnique({ where: { id } })`).
    ///
    /// formmaps#40. This previously carried `AND "isActive" = true`, which made
    /// POST /conversations against a deactivated user return 400 "Recipient not found" on .NET
    /// while succeeding on Node. That is arguably the better behaviour, and it is consistent with
    /// /contacts already excluding inactive users -- but it was an undocumented divergence
    /// introduced by the port, not a decision anyone made.
    ///
    /// Resolved toward legacy on migration grounds rather than product grounds: the cardinal rule
    /// for every domain in this migration is that flipping a flag is behaviour-neutral, so that
    /// when something breaks you know whether it was the port or a change. The risk is asymmetric
    /// too -- matching legacy means a message can be addressed to a deactivated account that
    /// cannot read it (harmless); keeping the tightening means a flow that worked yesterday 400s
    /// the moment FORMMAPS_ROUTE_MESSAGES_TO_DOTNET flips, which is a cutover regression.
    ///
    /// Tightening this is a fine idea, but it belongs in a separate change applied to BOTH
    /// backends, not smuggled in as a side effect of the port. Blocking is unaffected: the caller
    /// still runs IsBlockedBetweenAsync, and RLS still applies.
    ///
    /// WARNING — do NOT copy this lookup into a moderation (block/report) port. See formmaps#80.
    /// This runs inside the caller's RLS session, and "users" is ENABLE + FORCE ROW LEVEL SECURITY
    /// with a self-or-same-school policy. A coach has no schoolId, so app.current_school_id is ''
    /// and the policy's school branch fails its own &lt;&gt; '' guard: a coach and a school student are
    /// mutually INVISIBLE here. That is tolerable for messaging, where the caller treats an
    /// unreadable row as "recipient not found" and the pre-existing behaviour is preserved on both
    /// backends. It is NOT tolerable for a safety action — reproduced against real policies, it made
    /// blocking and reporting silently fail on every coach&lt;-&gt;student thread, so a student who
    /// blocked a coach stayed messageable by that coach.
    ///
    /// When moderation is ported (formmaps#63), mirror legacy's canModerateUser instead: resolve
    /// existence OUTSIDE the caller's tenant scope, then require a real relationship (same non-empty
    /// school OR a shared conversation), and collapse "absent" and "ineligible" into one response so
    /// the endpoint is not a user-existence oracle. A safety action must never depend on the actor
    /// being able to see the target in the tenant sense — that inverts the security property.
    /// Legacy reference: api/src/services/moderationService.ts (canModerateUser), with a real-policy
    /// test at api/src/__tests__/rls/moderation-cross-tenant.integration.test.ts.
    /// </summary>
    private static async Task<(string? SchoolId, string? RoleName)> LookupUserAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "schoolId", "roleName" FROM "users" WHERE "id" = @id""");
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

    private static readonly Dictionary<string, string[]> BroadcastRoleMap = new()
    {
        ["students"] = ["student", "Student"],
        ["parents"] = ["parent", "Parent"],
        ["counselors"] = ["counselor", "Counselor"],
        // audit 2026-10-09 D4: teachers and general staff are school staff too; the group used to skip them.
        ["staff"] = ["school_admin", "counselor", "teacher", "staff", "coach", "Coach"],
    };

    /// <summary>
    /// routes/messages.ts POST /broadcast. Authorization boundary lives entirely in application SQL, not
    /// RLS: GetSchoolRecipientsAsync always filters by schoolId+roleName+isActive explicitly, and for a
    /// counselor broadcasting to "students" the resolved (possibly empty) assignment-id list is ALWAYS
    /// passed through as restrictToIds -- never skipped or left null for that combination -- so an empty
    /// assignment list yields zero recipients rather than falling through to the whole school.
    ///
    /// Delivery is per recipient, NOT one transaction: legacy runs each recipient's Prisma calls with
    /// auto-commit under `Promise.all` over chunks of 20. This method used to hold ONE writable session
    /// and loop every recipient sequentially with a single COMMIT at the end, so 500 recipients x 3
    /// statements ran serially against the 60s request budget (504 with zero messages delivered) and any
    /// one failure rolled back every other recipient. Now each recipient gets its own session/transaction
    /// (sessions are not thread-safe; one per task) and its outcome is recorded rather than thrown.
    ///
    /// Two deliberate differences from legacy inside a recipient's transaction: (1) the unread-notification
    /// outbox INSERT rides in it, so an enqueue failure fails that recipient -- legacy fires
    /// enqueueUnreadMessageNotification without awaiting it (failure logged, recipient still counted);
    /// (2) the whole fan-out ignores <paramref name="cancellationToken"/> -- legacy's Node handler keeps
    /// running after the client socket closes, so a disconnect or the gateway timeout never leaves a
    /// broadcast half-delivered with no response for the client to act on (a retry would double-send).
    /// </summary>
    public async Task<BroadcastResult> BroadcastAsync(
        RequestContext context, string userId, string role, string schoolId, string recipientGroup, string content,
        CancellationToken cancellationToken = default)
    {
        var roles = BroadcastRoleMap[recipientGroup];
        List<RecipientRow> filtered;
        string senderName;

        // Recipient selection is read-only and released before the fan-out: MaxPoolSize is 10, so holding
        // this connection across the per-recipient sessions would only shrink what the chunk can use.
        await using (var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken))
        {
            IReadOnlyList<string>? restrictToIds = null;
            if (role == "counselor" && recipientGroup == "students")
            {
                restrictToIds = await GetAssignedStudentIdsAsync(session, userId, cancellationToken);
            }

            var groupSize = await CountSchoolRecipientsAsync(session, schoolId, roles, userId, restrictToIds, cancellationToken);
            if (groupSize > BroadcastResult.MaxRecipients) return BroadcastResult.TooLarge(groupSize);

            var recipients = await GetSchoolRecipientsAsync(session, schoolId, roles, userId, restrictToIds, cancellationToken);
            if (recipients.Count == 0) return BroadcastResult.Empty;

            var blockedIds = await GetBlockedIdsAsync(session, userId, recipients.Select(r => r.Id).ToList(), cancellationToken);
            filtered = recipients.Where(r => !blockedIds.Contains(r.Id)).ToList();
            senderName = await GetUserNameAsync(session, userId, cancellationToken) ?? "";
        }

        var preview = content.Length > 100 ? content[..97] + "..." : content;
        var now = NowTruncated();

        // Bounded concurrency: legacy's CHUNK = 20 with Promise.all per chunk. Task.WhenAll waits for the
        // whole chunk (including failures) before the next one starts, and -- exactly like a rejected
        // Promise.all throwing out of legacy's for-loop into the route's catch -- a chunk that records any
        // failure ends the broadcast: its siblings have already finished, later chunks never start, the
        // endpoint answers 500 with the successes kept. Otherwise a systemic failure (pool exhausted, DB
        // gone) would still walk every remaining chunk, each open waiting out Database.TimeoutSeconds,
        // and burn the request budget delivering more than legacy did before failing.
        //
        // Within a chunk the pool, not the chunk, is the real concurrency limit: it is process-wide and
        // MaxPoolSize is 10, so 20 simultaneous opens would pin every connection for the whole broadcast
        // and park every other request on the pool's 20s wait. At most MaxPoolSize - PoolHeadroom
        // sessions are open at once (per broadcast; two concurrent broadcasts still share the pool).
        const int chunkSize = 20;
        using var inFlight = new SemaphoreSlim(MaxInFlightSessions(chunkSize));
        var created = 0;
        var failures = new List<BroadcastFailure>();
        for (var i = 0; i < filtered.Count; i += chunkSize)
        {
            var outcomes = await Task.WhenAll(filtered.Skip(i).Take(chunkSize).Select(recipient =>
                DeliverBroadcastMessageAsync(context, userId, recipient, content, preview, senderName, now, inFlight)));
            foreach (var failure in outcomes)
            {
                if (failure is null) created++;
                else failures.Add(failure);
            }
            if (failures.Count > 0) break;
        }

        return new BroadcastResult(created, failures);
    }

    /// <summary>Connections left for the other requests on this instance while a broadcast is fanning out.</summary>
    private const int PoolHeadroom = 2;

    private int MaxInFlightSessions(int chunkSize)
    {
        var maxPoolSize = databaseOptions?.Value.MaxPoolSize ?? new FormMapsDatabaseOptions().MaxPoolSize;
        return Math.Clamp(maxPoolSize - PoolHeadroom, 1, chunkSize);
    }

    /// <summary>
    /// One recipient of a broadcast on its OWN session: upsert conversation, insert message, enqueue outbox,
    /// COMMIT. Returns null on success or the failure to record; a failed recipient's session rolls back on
    /// dispose without touching any other recipient's committed rows. Deliberately takes no cancellation
    /// token (see <see cref="BroadcastAsync"/>): once the fan-out has started it runs to completion.
    /// </summary>
    private async Task<BroadcastFailure?> DeliverBroadcastMessageAsync(
        RequestContext context, string userId, RecipientRow recipient, string content, string preview, string senderName,
        DateTime now, SemaphoreSlim inFlight)
    {
        var cancellationToken = CancellationToken.None;
        await inFlight.WaitAsync(cancellationToken);
        var committed = false;
        try
        {
            await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
            var (pa, pb) = string.CompareOrdinal(userId, recipient.Id) < 0 ? (userId, recipient.Id) : (recipient.Id, userId);
            var conversationId = await UpsertConversationAsync(session, pa, pb, now, preview, cancellationToken);
            // ONE id, bound to both the message row and the outbox payload below. These were two
            // separate Guid.NewGuid() calls until this fix, so every broadcast enqueued a payload
            // pointing at a message that does not exist -- and notificationOutboxService's
            // handleUnreadMessage does `findUnique({ id: payload.messageId })` then `if (!msg) return`,
            // so every broadcast notification email was silently dropped. SendMessageAsync always did
            // this correctly; only this loop was wrong.
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
            await using (var outbox = Command(session, """
                INSERT INTO "notification_outbox" ("id", "type", "payload", "due_at")
                VALUES (@id, 'unread_message', @payload::jsonb, @dueAt)
                """))
            {
                AddParameter(outbox, "id", Guid.NewGuid().ToString());
                AddParameter(outbox, "payload", System.Text.Json.JsonSerializer.Serialize(new
                {
                    messageId, recipientEmail = recipient.Email, senderName, preview,
                }));
                AddTimestamp(outbox, "dueAt", now.AddMinutes(5));
                await outbox.ExecuteNonQueryAsync(cancellationToken);
            }
            await session.CommitAsync(cancellationToken);
            committed = true;
            return null;
        }
        catch (Exception ex)
        {
            // Once COMMIT has returned the message IS delivered: a failure after that point (the session's
            // dispose returning a broken connection to the pool) must not be reported as an undelivered
            // recipient, or the endpoint answers 500 for a message the recipient will read.
            return committed ? null : new BroadcastFailure(recipient.Id, DescribeFailure(ex));
        }
        finally
        {
            inFlight.Release();
        }
    }

    /// <summary>
    /// SQLSTATE + primary message only. PostgresException.Message also carries DETAIL, which for a
    /// unique/FK violation quotes the offending row's values (participant ids, emails); Npgsql redacts it
    /// unless the connection string sets "Include Error Detail", which DATABASE_URL passes through
    /// untouched -- and BroadcastFailure.Error ends up verbatim in the endpoint's log line.
    /// </summary>
    private static string DescribeFailure(Exception ex) =>
        ex is PostgresException pg ? $"{pg.SqlState}: {pg.MessageText}" : ex.Message;

    private sealed record RecipientRow(string Id, string Email);

    private static async Task<IReadOnlyList<string>> GetAssignedStudentIdsAsync(
        FormMapsDatabaseSession session, string counselorId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT "studentId" FROM "counselor_student_assignments" WHERE "counselorId" = @counselorId AND "isActive" = true
            """);
        AddParameter(command, "counselorId", counselorId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var ids = new List<string>();
        while (await reader.ReadAsync(cancellationToken)) ids.Add(reader.GetString(0));
        return ids;
    }

    private const string SchoolRecipientsWhere = """
        WHERE "schoolId" = @schoolId AND "roleName" = ANY(@roles) AND "isActive" = true AND "id" <> @excludeUserId
        """;

    private static async Task<int> CountSchoolRecipientsAsync(
        FormMapsDatabaseSession session, string schoolId, string[] roles, string excludeUserId,
        IReadOnlyList<string>? restrictToIds, CancellationToken cancellationToken)
    {
        var sql = """SELECT COUNT(*) FROM "users" """ + SchoolRecipientsWhere
            + (restrictToIds is not null ? """ AND "id" = ANY(@restrictToIds)""" : "");
        await using var command = Command(session, sql);
        AddParameter(command, "schoolId", schoolId);
        AddParameter(command, "roles", roles);
        AddParameter(command, "excludeUserId", excludeUserId);
        if (restrictToIds is not null) AddParameter(command, "restrictToIds", restrictToIds.ToArray());
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
    }

    private static async Task<IReadOnlyList<RecipientRow>> GetSchoolRecipientsAsync(
        FormMapsDatabaseSession session, string schoolId, string[] roles, string excludeUserId,
        IReadOnlyList<string>? restrictToIds, CancellationToken cancellationToken)
    {
        var sql = """SELECT "id", "email" FROM "users" """ + SchoolRecipientsWhere
            + (restrictToIds is not null ? """ AND "id" = ANY(@restrictToIds)""" : "")
            + $" LIMIT {BroadcastResult.MaxRecipients}";
        await using var command = Command(session, sql);
        AddParameter(command, "schoolId", schoolId);
        AddParameter(command, "roles", roles);
        AddParameter(command, "excludeUserId", excludeUserId);
        if (restrictToIds is not null) AddParameter(command, "restrictToIds", restrictToIds.ToArray());
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<RecipientRow>();
        while (await reader.ReadAsync(cancellationToken)) rows.Add(new RecipientRow(reader.GetString(0), reader.GetString(1)));
        return rows;
    }

    private static async Task<ISet<string>> GetBlockedIdsAsync(
        FormMapsDatabaseSession session, string userId, IReadOnlyList<string> candidateIds, CancellationToken cancellationToken)
    {
        if (candidateIds.Count == 0) return new HashSet<string>();
        await using var command = Command(session, """
            SELECT "blockerId", "blockedId" FROM "user_blocks"
            WHERE "isActive" = true AND (
                ("blockerId" = @userId AND "blockedId" = ANY(@candidateIds)) OR
                ("blockedId" = @userId AND "blockerId" = ANY(@candidateIds))
            )
            """);
        AddParameter(command, "userId", userId);
        AddParameter(command, "candidateIds", candidateIds.ToArray());
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var ids = new HashSet<string>();
        while (await reader.ReadAsync(cancellationToken))
        {
            var blockerId = reader.GetString(0);
            var blockedId = reader.GetString(1);
            ids.Add(blockerId == userId ? blockedId : blockerId);
        }
        return ids;
    }

    private static async Task<string?> GetUserNameAsync(FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "name" FROM "users" WHERE "id" = @id""");
        AddParameter(command, "id", userId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result as string;
    }

    /// <summary>
    /// "updatedAt" has NO database default on "conversations" (NOT NULL, application-managed -- see
    /// messaging-schema.sql's header comment and Task 4/6's fix for the same gap). Both the INSERT branch
    /// AND the ON CONFLICT DO UPDATE branch bind it explicitly here: a rebroadcast into an existing
    /// conversation only bumps "lastMessageAt"/"lastMessagePreview" in the legacy Prisma upsert's `update`
    /// clause, but Prisma's @updatedAt stamps every write path regardless -- this raw SQL must match that
    /// by bumping "updatedAt" on the DO UPDATE too, not just on first insert.
    /// </summary>
    private static async Task<string> UpsertConversationAsync(
        FormMapsDatabaseSession session, string participantAId, string participantBId, DateTime now, string preview,
        CancellationToken cancellationToken)
    {
        await using var upsert = Command(session, """
            INSERT INTO "conversations" ("id", "participantAId", "participantBId", "lastMessageAt", "lastMessagePreview", "updatedAt")
            VALUES (@id, @pa, @pb, @now, @preview, @now)
            ON CONFLICT ("participantAId", "participantBId")
            DO UPDATE SET "lastMessageAt" = @now, "lastMessagePreview" = @preview, "updatedAt" = @now
            RETURNING "id"
            """);
        AddParameter(upsert, "id", Guid.NewGuid().ToString());
        AddParameter(upsert, "pa", participantAId);
        AddParameter(upsert, "pb", participantBId);
        AddTimestamp(upsert, "now", now);
        AddParameter(upsert, "preview", preview);
        var result = await upsert.ExecuteScalarAsync(cancellationToken);
        return (string)result!;
    }
}
