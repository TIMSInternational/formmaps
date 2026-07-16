using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Domain.Auth;

namespace FormMaps.Infrastructure.Auth;

/// <summary>
/// Boolean access gate mirroring the legacy <c>canAccessUser</c> (api/src/lib/access.ts):
/// non-privileged callers may only read their own record; a caller reading their own id is
/// always allowed; Super Admin is unrestricted; a counselor needs an active assignment to the
/// target; a school admin needs the target to share their school. The counselor-assignment and
/// same-school lookups run under the CALLER's read-only RLS session — never re-scoped to the
/// target and never bypassing RLS.
/// </summary>
public sealed class UserAccessGuard(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : IUserAccessGuard
{
    private const string CounselorAssignmentSql = """
        SELECT 1
        FROM "counselor_student_assignments"
        WHERE "counselorId" = @callerId
          AND "studentId" = @targetId
          AND "isActive" = true
        LIMIT 1
        """;

    private const string TargetSchoolSql = """
        SELECT "schoolId"
        FROM "users"
        WHERE "id" = @targetId
        LIMIT 1
        """;

    public async Task<bool> CanAccessUserAsync(
        RequestContext caller,
        string targetUserId,
        CancellationToken cancellationToken = default)
    {
        if (caller.Actor is null)
        {
            return false;
        }

        var callerUserId = caller.Actor.UserId;

        // Legacy canAccessUser (access.ts) branches on the RAW role string, matching exactly
        // against PRIVILEGED_ROLES = ["Super Admin", "school_admin", "counselor"]. We compare the
        // raw Actor.Role (NOT NormalizedRole) with Ordinal equality so alias values like "admin"
        // are NOT collapsed into Super Admin and therefore remain own-record-only, exactly as
        // legacy grants them. The FormMapsRoles constants are the canonical raw strings.
        var rawRole = caller.Actor.Role;

        var isPrivileged =
            string.Equals(rawRole, FormMapsRoles.SuperAdmin, StringComparison.Ordinal) ||
            string.Equals(rawRole, FormMapsRoles.SchoolAdmin, StringComparison.Ordinal) ||
            string.Equals(rawRole, FormMapsRoles.Counselor, StringComparison.Ordinal);

        if (!isPrivileged)
        {
            return targetUserId == callerUserId;
        }

        if (targetUserId == callerUserId)
        {
            return true;
        }

        if (string.Equals(rawRole, FormMapsRoles.Counselor, StringComparison.Ordinal))
        {
            return await HasActiveCounselorAssignmentAsync(caller, callerUserId, targetUserId, cancellationToken);
        }

        if (string.Equals(rawRole, FormMapsRoles.SchoolAdmin, StringComparison.Ordinal))
        {
            var callerSchoolId = caller.Tenant?.SchoolId;
            if (string.IsNullOrWhiteSpace(callerSchoolId))
            {
                return false;
            }

            return await TargetShareSchoolAsync(caller, targetUserId, callerSchoolId, cancellationToken);
        }

        // Super Admin — unrestricted.
        return true;
    }

    private async Task<bool> HasActiveCounselorAssignmentAsync(
        RequestContext caller,
        string callerUserId,
        string targetUserId,
        CancellationToken cancellationToken)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(caller, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = CounselorAssignmentSql;

        AddParameter(command, "callerId", callerUserId);
        AddParameter(command, "targetId", targetUserId);

        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is not null and not DBNull;
    }

    private async Task<bool> TargetShareSchoolAsync(
        RequestContext caller,
        string targetUserId,
        string callerSchoolId,
        CancellationToken cancellationToken)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(caller, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = TargetSchoolSql;

        AddParameter(command, "targetId", targetUserId);

        var result = await command.ExecuteScalarAsync(cancellationToken);
        if (result is null or DBNull)
        {
            return false;
        }

        return string.Equals((string)result, callerSchoolId, StringComparison.Ordinal);
    }

    private static void AddParameter(System.Data.Common.DbCommand command, string name, string value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
