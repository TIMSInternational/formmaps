using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolUsers;

namespace FormMaps.Infrastructure.SchoolUsers;

/// <summary>
/// school:users writes (FM-DOTNET-052 — routes/school.ts PUT /users/:userId/grade-level,
/// POST+DELETE /counselors/:counselorId/assign-students). Faithful port of schoolService.ts updateUserGradeLevel /
/// assignStudentsToCounselor / unassignStudentsFromCounselor. Each write runs under the caller's WRITABLE RLS
/// session (Identity GUCs) and commits. createdBy/updatedBy stay NULL (FM-048 precedent); assignedBy is set on
/// INSERT only (ON CONFLICT re-activation keeps the original). All SQL parameterized.
///
/// <para><b>Ratified single-transaction superset (assign):</b> legacy's deactivate-others <c>updateMany</c> +
/// per-id upserts run as two separate operations; we run both in ONE writable transaction. Same committed
/// end-state, strictly safer on partial failure. The counselor-in-school + student-validation reads run in that
/// same session (RLS identity unchanged) — a read-then-write consistency the legacy split does not guarantee.</para>
/// </summary>
public sealed class SchoolUsersWriter(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ISchoolUsersWriter
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
