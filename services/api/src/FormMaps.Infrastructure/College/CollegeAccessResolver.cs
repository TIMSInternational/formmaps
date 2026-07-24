using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.College;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.College;

/// <summary>
/// Boolean access gate for college.ts <c>getStudentAccess</c> (college.ts:14-30). All three queries (caller role read,
/// counselor-assignment check, target-school read) run under the CALLER's single read-only RLS session — never
/// re-scoped to the target, never bypassing RLS. The caller's role + schoolId come from a FRESH users read (matching
/// the legacy <c>prisma.user.findUnique({ where: { id: req.userId } })</c>), NOT the JWT claim. The role branches are
/// sequential if-statements (as in legacy), lower-cased; an unknown / null role denies.
/// </summary>
public sealed class CollegeAccessResolver(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : ICollegeAccessResolver
{
    private const string CallerSql = """
        SELECT "schoolId", "roleName" FROM "users" WHERE "id" = @callerId LIMIT 1
        """;

    private const string AssignmentSql = """
        SELECT 1 FROM "counselor_student_assignments"
        WHERE "counselorId" = @callerId AND "studentId" = @studentId AND "isActive" = true
        LIMIT 1
        """;

    private const string TargetSchoolSql = """
        SELECT "schoolId" FROM "users" WHERE "id" = @studentId LIMIT 1
        """;

    public async Task<bool> CanAccessAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default)
    {
        if (context.Actor is null)
        {
            return false;
        }

        var callerId = context.Actor.UserId;

        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // Fresh caller read (schoolId + roleName). No schoolId → legacy returns { error: "No school" } → 404.
        string? schoolId;
        string? roleName;
        await using (var callerCommand = Command(session, CallerSql))
        {
            AddParameter(callerCommand, "callerId", callerId);
            await using var reader = await callerCommand.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return false;
            }

            schoolId = reader.IsDBNull(0) ? null : reader.GetString(0);
            roleName = reader.IsDBNull(1) ? null : reader.GetString(1);
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return false;
        }

        var role = roleName?.ToLowerInvariant();

        // Sequential guards, mirroring legacy exactly (NOT else-if): a role that passes its specific check falls
        // through to the final membership test; the four known roles are all members → allowed.
        if (role == "student" && callerId != studentId)
        {
            return false;
        }

        if (role == "counselor" && !await HasActiveAssignmentAsync(session, callerId, studentId, cancellationToken))
        {
            return false;
        }

        if (role == "school_admin" && !await TargetSharesSchoolAsync(session, studentId, schoolId, cancellationToken))
        {
            return false;
        }

        if (role != "student" && role != "counselor" && role != "school_admin" && role != "super admin")
        {
            return false;
        }

        return true;
    }

    private static async Task<bool> HasActiveAssignmentAsync(
        FormMapsDatabaseSession session, string callerId, string studentId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, AssignmentSql);
        AddParameter(command, "callerId", callerId);
        AddParameter(command, "studentId", studentId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is not null and not DBNull;
    }

    private static async Task<bool> TargetSharesSchoolAsync(
        FormMapsDatabaseSession session, string studentId, string callerSchoolId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, TargetSchoolSql);
        AddParameter(command, "studentId", studentId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        if (result is null or DBNull)
        {
            return false;
        }

        return string.Equals((string)result, callerSchoolId, StringComparison.Ordinal);
    }

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, string value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
