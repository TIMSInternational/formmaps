using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Moderation;

namespace FormMaps.Infrastructure.Moderation;

/// <summary>
/// SQL for routes/moderation.ts + services/moderationService.ts (formmaps#63). One method per legacy
/// function, matching MessagesRepository's convention.
///
/// <para>THE SESSION ASYMMETRY IS THE DESIGN, not an oversight. Five of the six methods open under the
/// CALLER's Identity session. <see cref="CanModerateUserAsync"/> opens under
/// <see cref="RequestContext.System"/> (Bypass), because legacy wraps its body in <c>runAsSystem</c> and
/// because MessagesRepository.cs:518-541 exists specifically to tell this port why: "users" is ENABLE +
/// FORCE ROW LEVEL SECURITY with a self-or-same-school policy, a coach has no schoolId so
/// <c>app.current_school_id</c> is '' and the policy's school branch fails its own <c>&lt;&gt; ''</c>
/// guard — a coach and a school student are mutually INVISIBLE on an Identity session. Under a
/// tenant-scoped lookup the target read null, the route 404'd, and blocking silently failed on every
/// coach↔student thread: a student who blocked a coach stayed messageable by that coach (formmaps#80).
/// A safety action must never require the actor to be able to SEE the target in the tenant sense; that
/// inverts the security property.</para>
///
/// <para>WHAT REPLACES RLS THERE. Tenant visibility and moderation ELIGIBILITY are separated: existence is
/// resolved on the bypass rail, and eligibility is then a real relationship test — same NON-EMPTY school OR
/// a shared conversation. Only a boolean leaves the method; no target data does. And because
/// <c>reports</c> and <c>user_blocks</c> are unpolicied in production (formmaps#77 group 2), the predicates
/// in this class are the ONLY tenant boundary this domain has.</para>
///
/// <para>WHICH PREDICATES ARE SABOTAGE-PROVEN, precisely — an earlier version of this paragraph claimed the
/// suite sabotages "them" and records them all going red, which was an OVER-CLAIM:
/// <list type="bullet">
/// <item>The <c>CanModerateUserAsync</c> set IS predicate-proven. It runs on a bypass session where RLS
/// contributes nothing, so its cross-tenant tests can only pass because of the predicate, and
/// ModerationCrossTenantRlsTests records the measured red for both the whole-predicate and the
/// dropped-shared-conversation-branch mutations.</item>
/// <item><c>ListOpenReportsAsync</c>'s school scope is RLS-BACKSTOPPED on the normal path, not
/// predicate-proven by the school-admin test: the scope is an INNER JOIN to <c>users</c>, which IS policied,
/// so on a school admin's Identity session the policy drops the foreign reporter's row whether or not the
/// conjunct is there. That backstop is real but invisible and one join rewrite away from evaporating, so the
/// predicate gets its own proof from a SUPER-ADMIN (bypass) context in
/// <c>Open_report_queue_school_scope_is_the_predicate_not_RLS</c>, which is red under
/// <c>AND (u."schoolId" = @schoolId OR true)</c>.</item>
/// <item><c>CanReportTargetAsync</c>'s conversation branch is likewise RLS-backstopped, and that test says so
/// in its own comment rather than claiming a predicate proof.</item>
/// </list></para>
/// </summary>
public sealed class ModerationRepository(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IModerationRepository
{
    // moderationService.ts:79-80 re-bounds defensively "in case this is ever called from another path".
    // Unreachable from the endpoint (the Zod schema already rejects longer values) and kept anyway: the
    // comment is the point, and a silent truncation is better than a 22001 from a future caller.
    private const int MaxTargetIdLength = 200;
    private const int MaxReasonLength = 1000;

    // routes/moderation.ts:63 — `{ reason: body.data.reason.slice(0, 200) }`. The audit row's own cut, and
    // nothing else enforces it: a 300-character reason is perfectly valid on the report row.
    private const int AuditReasonLength = 200;

    // =============================================================================================
    // canModerateUser (moderationService.ts:41) — the ONLY bypass-session method in this class.
    // =============================================================================================
    public async Task<bool> CanModerateUserAsync(
        RequestContext context, string actorId, string targetId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(actorId) || string.IsNullOrEmpty(targetId) ||
            string.Equals(actorId, targetId, StringComparison.Ordinal))
        {
            return false;
        }

        // RequestContext.System(), NOT `context`. See the class remarks; this is formmaps#80's fix.
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);

        // Legacy issues two findUnique calls in parallel; one ANY() read is the same two rows in one
        // round-trip. A row that is absent is simply not returned, which is the `!actor || !target` case.
        string? actorSchoolId = null;
        string? targetSchoolId = null;
        var actorFound = false;
        var targetFound = false;

        await using (var command = Command(session, """SELECT "id", "schoolId" FROM "users" WHERE "id" = ANY(@ids)"""))
        {
            AddParameter(command, "ids", new[] { actorId, targetId });
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var id = reader.GetString(0);
                var schoolId = reader.IsDBNull(1) ? null : reader.GetString(1);
                if (string.Equals(id, actorId, StringComparison.Ordinal)) (actorFound, actorSchoolId) = (true, schoolId);
                if (string.Equals(id, targetId, StringComparison.Ordinal)) (targetFound, targetSchoolId) = (true, schoolId);
            }
        }

        if (!actorFound || !targetFound) return false;

        // Same school. BOTH sides must be non-empty: two users with NULL schoolId (e.g. two unrelated
        // coaches) are not "in the same school" (moderationService.ts:55). IsNullOrEmpty rather than a null
        // check, because legacy's `actor.schoolId && ...` is JS truthiness and "" is falsy there too.
        if (!string.IsNullOrEmpty(actorSchoolId) && !string.IsNullOrEmpty(targetSchoolId) &&
            string.Equals(actorSchoolId, targetSchoolId, StringComparison.Ordinal))
        {
            return true;
        }

        // Share a conversation, in either participant order. No "isActive" filter — legacy's findFirst has
        // none, and a closed thread is still a relationship a safety action may act on.
        return await ShareAConversationAsync(session, actorId, targetId, cancellationToken);
    }

    // =============================================================================================
    // canReportTarget (moderationService.ts:91)
    // =============================================================================================
    public async Task<bool> CanReportTargetAsync(
        RequestContext context, string reporterId, string targetType, string targetId,
        CancellationToken cancellationToken = default)
    {
        if (string.Equals(targetType, "user", StringComparison.Ordinal))
        {
            // Was a caller-scoped user lookup, which made reporting impossible across tenants — same bug,
            // same fix as canModerateUser (moderationService.ts:95).
            return await CanModerateUserAsync(context, reporterId, targetId, cancellationToken);
        }

        // The message/conversation branches run on the CALLER's session — legacy does NOT wrap them in
        // runAsSystem, and 005-sensitive's participant-scoped policies deny a non-participant here anyway.
        // The explicit participant equality below is kept because it is what legacy asserts and because RLS
        // is not the thing this method promises.
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var conversationId = targetId;
        if (string.Equals(targetType, "message", StringComparison.Ordinal))
        {
            await using var command = Command(session, """SELECT "conversationId" FROM "messages" WHERE "id" = @id""");
            AddParameter(command, "id", targetId);
            if (await command.ExecuteScalarAsync(cancellationToken) is not string resolved) return false;
            conversationId = resolved;
        }

        await using var conversationCommand = Command(session, """SELECT "participantAId", "participantBId" FROM "conversations" WHERE "id" = @id""");
        AddParameter(conversationCommand, "id", conversationId);
        await using var conversationReader = await conversationCommand.ExecuteReaderAsync(cancellationToken);
        if (!await conversationReader.ReadAsync(cancellationToken)) return false;

        return string.Equals(conversationReader.GetString(0), reporterId, StringComparison.Ordinal)
            || string.Equals(conversationReader.GetString(1), reporterId, StringComparison.Ordinal);
    }

    // =============================================================================================
    // createReport (moderationService.ts:72) + the UGC_REPORT audit row (routes/moderation.ts:57)
    // =============================================================================================
    public async Task<CreatedReport> CreateReportAsync(
        RequestContext context, string reporterId, string targetType, string targetId, string reason,
        string actorEmail, string clientIp, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // "id" is Prisma @default(uuid()) — generated CLIENT-side, so the column carries no database
        // default and the INSERT must supply one. "updatedAt" is @updatedAt, also app-managed with no DB
        // default. "isActive" and "createdDate" DO have real DB defaults and are left to them.
        await using var command = Command(session, """
            INSERT INTO "reports" ("id","reporterId","targetType","targetId","reason","status","createdBy","updatedAt")
            VALUES (gen_random_uuid()::text, @reporterId, @targetType, @targetId, @reason, 'open', @reporterId, now())
            RETURNING "id", "status"
            """);
        AddParameter(command, "reporterId", reporterId);
        AddParameter(command, "targetType", targetType);
        AddParameter(command, "targetId", Truncate(targetId, MaxTargetIdLength));
        AddParameter(command, "reason", Truncate(reason, MaxReasonLength));

        string id;
        string status;
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            await reader.ReadAsync(cancellationToken);
            (id, status) = (reader.GetString(0), reader.GetString(1));
        }

        // resourceType is the TARGET TYPE ("message"/"conversation"/"user"), not the literal "User" the
        // block routes pass. Legacy quirk (routes/moderation.ts:61 puts body.data.targetType in that
        // position); ported rather than normalised, because the admin surfaces read this column.
        await WriteAuditAsync(
            session, reporterId, actorEmail, "UGC_REPORT", targetType, targetId, clientIp,
            new Dictionary<string, object?> { ["reason"] = Truncate(reason, AuditReasonLength) },
            cancellationToken);

        await session.CommitAsync(cancellationToken);
        return new CreatedReport(id, status);
    }

    // =============================================================================================
    // listOpenReports (moderationService.ts:124)
    // =============================================================================================
    public async Task<OpenReportsPage> ListOpenReportsAsync(
        RequestContext context, int page, int limit, string? schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // The join is Prisma's `include: { reporter: ... }`; the schoolId conjunct is
        // `reporter: { is: { schoolId } }`, omitted entirely for Super Admin (undefined). INNER JOIN in
        // both cases: "reporterId" carries an FK to users, so the relation is required and cannot drop a
        // row that legacy's count would have kept.
        var scope = schoolId is null ? string.Empty : """ AND u."schoolId" = @schoolId""";

        int total;
        await using (var countCommand = Command(session,
            $"""SELECT count(*)::int FROM "reports" r JOIN "users" u ON u."id" = r."reporterId" WHERE r."status" = 'open' AND r."isActive" = true{scope}"""))
        {
            if (schoolId is not null) AddParameter(countCommand, "schoolId", schoolId);
            total = (int)(await countCommand.ExecuteScalarAsync(cancellationToken))!;
        }

        await using var command = Command(session, $"""
            SELECT r."id", r."reporterId", r."targetType", r."targetId", r."reason", r."status",
                   r."reviewedBy", r."reviewedAt", r."resolution", r."isActive", r."createdBy",
                   r."createdDate", r."updatedBy", r."updatedAt",
                   u."id", u."name", u."email"
            FROM "reports" r
            JOIN "users" u ON u."id" = r."reporterId"
            WHERE r."status" = 'open' AND r."isActive" = true{scope}
            ORDER BY r."createdDate" DESC
            OFFSET @skip LIMIT @take
            """);
        if (schoolId is not null) AddParameter(command, "schoolId", schoolId);
        AddParameter(command, "skip", (page - 1) * limit);
        AddParameter(command, "take", limit);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<OpenReportRow>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new OpenReportRow(
                Id: reader.GetString(0),
                ReporterId: reader.GetString(1),
                TargetType: reader.GetString(2),
                TargetId: reader.GetString(3),
                Reason: reader.GetString(4),
                Status: reader.GetString(5),
                ReviewedBy: reader.IsDBNull(6) ? null : reader.GetString(6),
                ReviewedAt: reader.IsDBNull(7) ? null : reader.GetDateTime(7),
                Resolution: reader.IsDBNull(8) ? null : reader.GetString(8),
                IsActive: reader.GetBoolean(9),
                CreatedBy: reader.IsDBNull(10) ? null : reader.GetString(10),
                CreatedDate: reader.GetDateTime(11),
                UpdatedBy: reader.IsDBNull(12) ? null : reader.GetString(12),
                UpdatedAt: reader.GetDateTime(13),
                Reporter: new ReportReporter(
                    reader.GetString(14),
                    reader.IsDBNull(15) ? null : reader.GetString(15),
                    reader.GetString(16))));
        }

        return new OpenReportsPage(rows, total);
    }

    // =============================================================================================
    // blockUser (moderationService.ts:143) + the USER_BLOCK audit row (routes/moderation.ts:139)
    // =============================================================================================
    public async Task BlockUserAsync(
        RequestContext context, string blockerId, string blockedId, string actorEmail, string clientIp,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Prisma's upsert on @@unique([blockerId, blockedId]). The two branches are NOT symmetric and that
        // is legacy's shape: create sets createdBy and not updatedBy; update sets updatedBy and not
        // createdBy. Prisma's @updatedAt stamps BOTH paths, so "updatedAt" is bound in both.
        await using (var command = Command(session, """
            INSERT INTO "user_blocks" ("id","blockerId","blockedId","isActive","createdBy","updatedAt")
            VALUES (gen_random_uuid()::text, @blockerId, @blockedId, true, @blockerId, now())
            ON CONFLICT ("blockerId","blockedId")
            DO UPDATE SET "isActive" = true, "updatedBy" = @blockerId, "updatedAt" = now()
            """))
        {
            AddParameter(command, "blockerId", blockerId);
            AddParameter(command, "blockedId", blockedId);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        // formmaps#84. Blocking is a safety action taken by one user against another, and it is the record
        // an abuse investigation starts from — who blocked whom, when, from where. Before #84 it wrote
        // nothing at all; only the /report route was audited. Dropping it in the port would silently undo
        // that fix at flag-flip time.
        await WriteAuditAsync(
            session, blockerId, actorEmail, "USER_BLOCK", "User", blockedId, clientIp,
            new Dictionary<string, object?> { ["blockerId"] = blockerId },
            cancellationToken);

        await session.CommitAsync(cancellationToken);
    }

    // =============================================================================================
    // unblockUser (moderationService.ts:154) + the USER_UNBLOCK audit row (routes/moderation.ts:167)
    // =============================================================================================
    public async Task<bool> UnblockUserAsync(
        RequestContext context, string blockerId, string blockedId, string actorEmail, string clientIp,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Soft-remove, keeping history. `"blockerId" = @blockerId` is what stops one user clearing another
        // user's block row: "user_blocks" has NO production RLS policy, so this WHERE clause is the entire
        // ownership check (ModerationCrossTenantRlsTests pins it, sabotage recorded).
        int affected;
        await using (var command = Command(session, """
            UPDATE "user_blocks"
            SET "isActive" = false, "updatedBy" = @blockerId, "updatedAt" = now()
            WHERE "blockerId" = @blockerId AND "blockedId" = @blockedId AND "isActive" = true
            """))
        {
            AddParameter(command, "blockerId", blockerId);
            AddParameter(command, "blockedId", blockedId);
            affected = await command.ExecuteNonQueryAsync(cancellationToken);
        }

        var removed = affected > 0;

        // `removed` goes into the audit row too: an unblock that cleared nothing is not the same event as
        // one that lifted a real block, and without it the trail cannot be replayed to a coherent block
        // state (routes/moderation.ts:162). Key order matches legacy's `{ blockerId: userId, removed }`.
        await WriteAuditAsync(
            session, blockerId, actorEmail, "USER_UNBLOCK", "User", blockedId, clientIp,
            new Dictionary<string, object?> { ["blockerId"] = blockerId, ["removed"] = removed },
            cancellationToken);

        await session.CommitAsync(cancellationToken);
        return removed;
    }

    // ---- helpers ----

    private static async Task<bool> ShareAConversationAsync(
        FormMapsDatabaseSession session, string a, string b, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT 1 FROM "conversations"
            WHERE ("participantAId" = @a AND "participantBId" = @b)
               OR ("participantAId" = @b AND "participantBId" = @a)
            LIMIT 1
            """);
        AddParameter(command, "a", a);
        AddParameter(command, "b", b);
        return await command.ExecuteScalarAsync(cancellationToken) is not null;
    }

    /// <summary>
    /// The LEGACY <c>audit_logs</c> row, written INSIDE the caller's transaction.
    ///
    /// <para>audit_logs, not audit_events: while both backends are live they must write the same table or
    /// the moderation history splits in two. Same call the route makes through lib/audit.ts →
    /// adminService.auditLog, and the same precedent as SchoolUsersWriter.cs:214 — including the
    /// seven-positional-parameter hazard that wrapper exists to prevent, which is why this is a named
    /// method with the resourceType/resourceId pair adjacent rather than an inline INSERT per call site.</para>
    ///
    /// <para>DELIBERATE SUPERSET DIVERGENCE, same one SchoolUsersWriter documents: legacy writes the audit
    /// row AFTER its own write has committed, and <c>auditLog</c> swallows its own errors — so legacy can
    /// leave a block unaudited and say nothing. Here "moderation action happened ⇒ it was audited" is an
    /// invariant the database enforces. Identical committed end-state on the happy path, strictly safer on
    /// partial failure.</para>
    ///
    /// <para>audit_logs is deliberately UNPOLICIED (005-sensitive.sql's list; formmaps#77 group 2 is still
    /// an open owner decision), so the caller's Identity session may insert into it. The role's GRANT is
    /// INSERT-only (dotnet-service-role.sql section 4.6) and nothing here reads the table back.</para>
    /// </summary>
    private static async Task WriteAuditAsync(
        FormMapsDatabaseSession session, string actorId, string actorEmail, string action, string resourceType,
        string? resourceId, string clientIp, IReadOnlyDictionary<string, object?> details,
        CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            INSERT INTO "audit_logs"
                ("id","actorId","actorEmail","action","resourceType","resourceId","details","ipAddress","updatedAt")
            VALUES (gen_random_uuid()::text, @actorId, @actorEmail, @action, @resourceType, @resourceId,
                    CAST(@details AS jsonb), @ip, now())
            """);
        AddParameter(command, "actorId", actorId);
        // legacy: `req.userEmail || ""` — an absent email is the empty string, never NULL (actorEmail is NOT NULL).
        AddParameter(command, "actorEmail", actorEmail);
        AddParameter(command, "action", action);
        AddParameter(command, "resourceType", resourceType);
        AddParameter(command, "resourceId", (object?)resourceId ?? DBNull.Value);
        AddParameter(command, "details", JsonSerializer.Serialize(details));
        // req.ip is undefined-able in legacy → NULL. GetClientIp returns "" when unknown; map that to NULL
        // rather than storing an empty string that reads like a real address.
        AddParameter(command, "ip", string.IsNullOrEmpty(clientIp) ? DBNull.Value : clientIp);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];

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
