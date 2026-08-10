using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolUsers;
using FormMaps.Domain.Auth;

namespace FormMaps.Infrastructure.SchoolUsers;

/// <summary>
/// school:users writes (FM-DOTNET-052 — routes/school.ts PUT /users/:userId/grade-level,
/// PUT /users/:userId/role, POST+DELETE /counselors/:counselorId/assign-students). Faithful port of
/// schoolService.ts updateUserGradeLevel / updateUserRole / assignStudentsToCounselor /
/// unassignStudentsFromCounselor. Each write runs under the caller's WRITABLE RLS
/// session (Identity GUCs) and commits. createdBy/updatedBy stay NULL (FM-048 precedent); assignedBy is set on
/// INSERT only (ON CONFLICT re-activation keeps the original). All SQL parameterized.
///
/// <para><b>The one write here that does NOT run on the caller's session</b> is the role change's refresh-token
/// revocation (formmaps#120): it targets ANOTHER user's rows in the owner-only-policied "refresh_tokens", so it
/// goes through <see cref="IAuthRepository.RevokeAllRefreshTokensAsync"/>, which opens its own
/// <see cref="RequestContext.System"/> (Bypass) session. See <see cref="UpdateUserRoleAsync"/>.</para>
///
/// <para><b>Ratified single-transaction superset (assign):</b> legacy's deactivate-others <c>updateMany</c> +
/// per-id upserts run as two separate operations; we run both in ONE writable transaction. Same committed
/// end-state, strictly safer on partial failure. The counselor-in-school + student-validation reads run in that
/// same session (RLS identity unchanged) — a read-then-write consistency the legacy split does not guarantee.</para>
/// </summary>
public sealed class SchoolUsersWriter(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    IAuthRepository authRepository) : ISchoolUsersWriter
{
    // Legacy STUDENT_ROLE_NAMES = ["student","Student"] (case-sensitive set); validateSchoolStudentIds filters on it.
    private const string StudentRoleFilter = """ "roleName" IN ('student', 'Student') """;

    public async Task<GradeLevelUpdateStatus> UpdateUserGradeLevelAsync(
        RequestContext context, string callerId, string targetUserId, int? gradeLevel,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Read admin(caller) + target schoolIds. No isActive filter, no canAccessUser — school-equality ONLY
        // (a school_admin may set grade on ANY same-school user, incl. counselors — faithful to legacy).
        var adminSchoolId = await ReadSchoolIdAsync(session, callerId, cancellationToken);
        var targetSchoolId = await ReadSchoolIdAsync(session, targetUserId, cancellationToken);
        // Legacy: `!admin?.schoolId || !target?.schoolId || admin.schoolId !== target.schoolId` — a FALSY schoolId
        // (null OR empty string) fails the guard, so two users both carrying schoolId "" are NOT "same school".
        if (string.IsNullOrEmpty(adminSchoolId) || string.IsNullOrEmpty(targetSchoolId) || adminSchoolId != targetSchoolId)
        {
            return GradeLevelUpdateStatus.CrossSchool;
        }

        // Prisma `user.update` bumps `updatedAt` (@updatedAt) on every write — set it here too (else stale).
        await using var command = Command(session, """UPDATE "users" SET "gradeLevel" = @grade, "updatedAt" = now() WHERE "id" = @target""");
        AddParameter(command, "grade", (object?)gradeLevel ?? DBNull.Value);
        AddParameter(command, "target", targetUserId);
        var affected = await command.ExecuteNonQueryAsync(cancellationToken);
        if (affected == 0)
        {
            // The target existed a moment ago (we just read its schoolId), so 0 rows means it vanished mid-request.
            // Legacy prisma.update throws P2025 here → caught by the route → uniform 500. Replicate the throw.
            // Unreachable on ordinary app data.
            throw new InvalidOperationException("grade-level UPDATE affected no rows (target vanished mid-request)");
        }

        await session.CommitAsync(cancellationToken);
        return GradeLevelUpdateStatus.Updated;
    }

    // ---------------------------------------------------------------- PUT /users/{userId}/role (#114 + #120)

    public async Task<UserRoleUpdateResult> UpdateUserRoleAsync(
        RequestContext context, string callerId, string callerEmail, string targetUserId, string roleName,
        string clientIp, CancellationToken cancellationToken = default)
    {
        // G4 (destination allowlist) and G2 (self) both run BEFORE any DB read, exactly as legacy orders them.
        // Legacy trims+lowercases the incoming name here even though the route's zod already did; keep the
        // duplicate — the service is callable from anywhere, not only through the validated route.
        var requested = (roleName ?? string.Empty).Trim().ToLowerInvariant();
        if (Array.IndexOf(UserRoleValidation.AllowedRoles, requested) < 0)
        {
            return new UserRoleUpdateResult(RoleUpdateStatus.InvalidRole);
        }

        if (string.Equals(callerId, targetUserId, StringComparison.Ordinal))
        {
            // Also what stops the last school admin self-demoting.
            return new UserRoleUpdateResult(RoleUpdateStatus.SelfRoleChange);
        }

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var adminSchoolId = await ReadSchoolIdAsync(session, callerId, cancellationToken);
        var target = await ReadRoleTargetAsync(session, targetUserId, cancellationToken);
        if (target is null)
        {
            return new UserRoleUpdateResult(RoleUpdateStatus.TargetNotFound);
        }

        // G3 — copied verbatim from UpdateUserGradeLevelAsync, falsy-schoolId semantics included: two users both
        // carrying schoolId "" are NOT same-school. NO SuperAdmin exemption, deliberately (the sibling grade-level
        // route has none either, and a Super Admin already has PUT /authapi/change-role for cross-school work).
        if (string.IsNullOrEmpty(adminSchoolId) || string.IsNullOrEmpty(target.SchoolId) || adminSchoolId != target.SchoolId)
        {
            return new UserRoleUpdateResult(RoleUpdateStatus.CrossSchool);
        }

        // G5 — the guard on the target's CURRENT role. G4 constrains what you may SET; it says nothing about WHO
        // you may set it on. Membership is tested against the literal allowlist (fail-closed: anything
        // unrecognised is refused). FormMapsRoles.Normalize picks only the MESSAGE, never membership — it maps
        // "staff" → Parent and would wrongly reject an allowed source role if used for the test itself.
        var current = (target.RoleName ?? string.Empty).Trim().ToLowerInvariant();
        if (Array.IndexOf(UserRoleValidation.AllowedRoles, current) < 0)
        {
            var normalized = FormMapsRoles.Normalize(current);
            return new UserRoleUpdateResult(
                normalized is FormMapsRoles.SuperAdmin or FormMapsRoles.SchoolAdmin
                    ? RoleUpdateStatus.SourceIsAdministrator
                    : RoleUpdateStatus.SourceIsNotChangeable);
        }

        // Resolve the "roles" row by name. Legacy is `findFirst({ name: { equals: requested, mode: "insensitive" },
        // isActive: true })`, which Prisma renders as a wildcard-free ILIKE. `lower("name") = @name` is equivalent
        // for these four allowlisted names and does not carry ILIKE's `%`/`_` metacharacter behaviour. "roles" is
        // deliberately UNPOLICIED (005-sensitive.sql's global-catalog list), so the caller's Identity session reads
        // it fine. NOT inviteStaff's find-or-create fallback: auto-creating a Role row from a user-supplied name is
        // a write into the permission model itself. With G4 in front, a missing row is a seed defect → 400.
        string roleId;
        string storedRoleName;
        await using (var command = Command(session, """
            SELECT "id", "name" FROM "roles" WHERE lower("name") = @name AND "isActive" = true LIMIT 1
            """))
        {
            AddParameter(command, "name", requested);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return new UserRoleUpdateResult(RoleUpdateStatus.RoleNotFound);
            }

            roleId = reader.GetString(0);
            storedRoleName = reader.GetString(1);
        }

        // Idempotence is a 400 ("User already has this role"), matching authService.changeRole. Compared on
        // roleName — the authorization-bearing field — not roleId.
        if (current == storedRoleName.Trim().ToLowerInvariant())
        {
            return new UserRoleUpdateResult(RoleUpdateStatus.NoChange);
        }

        // BOTH columns, one statement. Prisma's @updatedAt bumps updatedAt on user.update; set it by hand here.
        // "users" IS policied (005-sensitive.sql) with a school branch, so the caller's Identity session both sees
        // and may write a same-school target — this write correctly stays on the caller's identity.
        await using (var command = Command(session, """
            UPDATE "users" SET "roleId" = @roleId, "roleName" = @roleName, "updatedAt" = now() WHERE "id" = @target
            """))
        {
            AddParameter(command, "roleId", roleId);
            AddParameter(command, "roleName", storedRoleName);
            AddParameter(command, "target", targetUserId);
            if (await command.ExecuteNonQueryAsync(cancellationToken) == 0)
            {
                // We read the target's row moments ago in this same transaction, so 0 rows means it vanished.
                // Legacy's prisma.user.update throws P2025 here → caught by the route → uniform 500. Replicate
                // the throw rather than reporting a success that did not happen (the updateMany trap: never infer
                // success from "it did not throw", and never infer it from a write you did not count either).
                throw new InvalidOperationException("role UPDATE affected no rows (target vanished mid-request)");
            }
        }

        // formmaps#120 — the audit row. Legacy writes it from the route via lib/audit.ts → adminService.auditLog,
        // AFTER the role write has already committed, and auditLog swallows its own errors — so legacy can leave a
        // role change unaudited and say nothing. We write it inside the SAME transaction as the role UPDATE, which
        // makes "role changed ⇒ audited" an invariant the database enforces. That is a deliberate superset
        // divergence in the same spirit as this class's assign path: identical committed end-state on the happy
        // path, strictly safer on partial failure. "audit_logs" is deliberately UNPOLICIED (005-sensitive.sql's
        // list; #77 group 2 is still an open owner decision), so the caller's Identity session may insert into it.
        await WriteRoleChangeAuditAsync(
            session, callerId, callerEmail, targetUserId, target.RoleName, storedRoleName, clientIp, cancellationToken);

        await session.CommitAsync(cancellationToken);

        // formmaps#120 — revoke the TARGET's refresh tokens. This deliberately runs OUTSIDE the writable session
        // above: RevokeAllRefreshTokensAsync opens its own session under RequestContext.System() → Bypass, which is
        // the only way it can touch another user's rows now that 007-self-scoped.sql policies "refresh_tokens"
        // owner-only. Running it on `session` (the caller's Identity GUCs) is exactly formmaps#117: the policy
        // matches none of the target's rows, the UPDATE affects zero, nothing throws, and the re-roled user keeps a
        // working session. Awaited, so the revocation is ordered before the response.
        //
        // Deliberately AFTER the commit, matching legacy's ordering: a revocation that fails must not roll back a
        // role change that already succeeded, and the two cannot share a transaction anyway — they run under
        // different RLS identities by necessity.
        await authRepository.RevokeAllRefreshTokensAsync(targetUserId, clientIp, cancellationToken);

        return new UserRoleUpdateResult(RoleUpdateStatus.Updated, storedRoleName, target.RoleName);
    }

    // audit(req, "USER_ROLE_CHANGE", "User", userId, { from, to }) — the seven-positional-parameter auditLog call
    // legacy wraps for exactly the reason this is a named method: a resourceId sitting in the resourceType column
    // is a row that looks fine and is useless. "details" is Prisma Json? → jsonb; the key order { from, to } is
    // preserved. "updatedAt" is @updatedAt with no database default — bound explicitly, same app-managed-timestamp
    // convention as every other write in this port. isActive/createdDate take their schema defaults.
    private static async Task WriteRoleChangeAuditAsync(
        FormMapsDatabaseSession session, string actorId, string actorEmail, string targetUserId,
        string? fromRole, string toRole, string clientIp, CancellationToken cancellationToken)
    {
        var details = JsonSerializer.Serialize(new Dictionary<string, string?>
        {
            ["from"] = fromRole,
            ["to"] = toRole,
        });

        await using var command = Command(session, """
            INSERT INTO "audit_logs"
                ("id","actorId","actorEmail","action","resourceType","resourceId","details","ipAddress","updatedAt")
            VALUES (gen_random_uuid(), @actorId, @actorEmail, 'USER_ROLE_CHANGE', 'User', @resourceId,
                    CAST(@details AS jsonb), @ip, now())
            """);
        AddParameter(command, "actorId", actorId);
        // legacy: `req.userEmail || ""` — an absent email is the empty string, never NULL (actorEmail is NOT NULL).
        AddParameter(command, "actorEmail", actorEmail);
        AddParameter(command, "resourceId", targetUserId);
        AddParameter(command, "details", details);
        // req.ip is undefined-able in legacy → NULL. GetClientIp returns "" when unknown; map that to NULL rather
        // than storing an empty string that reads like a real address.
        AddParameter(command, "ip", string.IsNullOrEmpty(clientIp) ? DBNull.Value : (object)clientIp);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private sealed record RoleTargetRow(string? SchoolId, string? RoleName);

    private static async Task<RoleTargetRow?> ReadRoleTargetAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "schoolId", "roleName" FROM "users" WHERE "id" = @uid""");
        AddParameter(command, "uid", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new RoleTargetRow(
            reader.IsDBNull(0) ? null : reader.GetString(0),
            reader.IsDBNull(1) ? null : reader.GetString(1));
    }

    public async Task<AssignStudentsResult> AssignStudentsAsync(
        RequestContext context, string adminSchoolId, string counselorId, IReadOnlyList<string> ids, string assignedBy,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var gate = await CounselorAndStudentsGateAsync(session, adminSchoolId, counselorId, ids, cancellationToken);
        if (gate is not null)
        {
            return new AssignStudentsResult(gate, 0, counselorId);
        }

        if (ids.Count == 0)
        {
            // 0 valid ids → { assigned: 0 } with NO write (nothing committed).
            return new AssignStudentsResult(null, 0, counselorId);
        }

        var idArray = ids.ToArray();

        // 1) Enforce one active counselor per student: deactivate each student's active assignment to OTHER counselors.
        // Legacy `updateMany` bumps `updatedAt` (@updatedAt) on the deactivated rows (CalendarWriter precedent) — set it.
        await using (var deactivate = Command(session, """
            UPDATE "counselor_student_assignments" SET "isActive" = false, "updatedAt" = now()
            WHERE "studentId" = ANY(@ids) AND "isActive" = true AND "counselorId" <> @c
            """))
        {
            AddParameter(deactivate, "ids", idArray);
            AddParameter(deactivate, "c", counselorId);
            await deactivate.ExecuteNonQueryAsync(cancellationToken);
        }

        // 2) Upsert-activate the (counselor, student) rows. assignedBy set on INSERT only; ON CONFLICT re-activates
        // and advances updatedAt but leaves assignedBy (and createdBy/updatedBy NULL) untouched.
        const string upsert = """
            INSERT INTO "counselor_student_assignments"
                ("id", "counselorId", "studentId", "assignedBy", "isActive", "assignedAt", "createdDate", "updatedAt")
            VALUES (gen_random_uuid(), @c, @sid, @assignedBy, true, now(), now(), now())
            ON CONFLICT ("counselorId", "studentId") DO UPDATE SET "isActive" = true, "updatedAt" = now()
            """;
        foreach (var sid in ids)
        {
            await using var command = Command(session, upsert);
            AddParameter(command, "c", counselorId);
            AddParameter(command, "sid", sid);
            AddParameter(command, "assignedBy", assignedBy);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return new AssignStudentsResult(null, ids.Count, counselorId);
    }

    public async Task<UnassignStudentsResult> UnassignStudentsAsync(
        RequestContext context, string adminSchoolId, string counselorId, IReadOnlyList<string> ids,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var gate = await CounselorAndStudentsGateAsync(session, adminSchoolId, counselorId, ids, cancellationToken);
        if (gate is not null)
        {
            return new UnassignStudentsResult(gate);
        }

        if (ids.Count == 0)
        {
            // 0 valid ids → { success: true } with NO write.
            return new UnassignStudentsResult(null);
        }

        // HARD delete (NOT soft, NOT filtered by isActive) — removes active AND inactive (counselor, student) rows.
        await using (var command = Command(session, """
            DELETE FROM "counselor_student_assignments" WHERE "counselorId" = @c AND "studentId" = ANY(@ids)
            """))
        {
            AddParameter(command, "c", counselorId);
            AddParameter(command, "ids", ids.ToArray());
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return new UnassignStudentsResult(null);
    }

    // ---------------------------------------------------------------- shared gate (counselor-in-school + validate)

    // Returns the error message (→ endpoint 400) or null when the gate passes. Mirrors legacy: counselor-in-school
    // check FIRST, then validateSchoolStudentIds (skipped when 0 ids — an empty list is always "valid").
    private async Task<string?> CounselorAndStudentsGateAsync(
        FormMapsDatabaseSession session, string adminSchoolId, string counselorId, IReadOnlyList<string> ids,
        CancellationToken cancellationToken)
    {
        var counselorExists = false;
        string? counselorSchoolId = null;
        await using (var command = Command(session, """SELECT "schoolId" FROM "users" WHERE "id" = @c"""))
        {
            AddParameter(command, "c", counselorId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                counselorExists = true;
                counselorSchoolId = reader.IsDBNull(0) ? null : reader.GetString(0);
            }
        }

        if (!counselorExists || counselorSchoolId != adminSchoolId)
        {
            return "Counselor not in your school";
        }

        if (ids.Count == 0)
        {
            return null; // validateSchoolStudentIds([]) → ok
        }

        // Distinct student ids in this school, active, with a student role. If the distinct-found count differs from
        // the requested id count, at least one id is not a valid same-school active student.
        var found = 0;
        await using (var command = Command(session, $"""
            SELECT COUNT(DISTINCT "id")::int FROM "users"
            WHERE "id" = ANY(@ids) AND "schoolId" = @sid AND "isActive" = true AND{StudentRoleFilter}
            """))
        {
            AddParameter(command, "ids", ids.ToArray());
            AddParameter(command, "sid", adminSchoolId);
            var result = await command.ExecuteScalarAsync(cancellationToken);
            if (result is not null and not DBNull)
            {
                found = Convert.ToInt32(result);
            }
        }

        return found != ids.Count ? "One or more students are not in your school" : null;
    }

    private static async Task<string?> ReadSchoolIdAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "schoolId" FROM "users" WHERE "id" = @uid""");
        AddParameter(command, "uid", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return reader.IsDBNull(0) ? null : reader.GetString(0);
    }

    // ---------------------------------------------------------------- npgsql helpers

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
