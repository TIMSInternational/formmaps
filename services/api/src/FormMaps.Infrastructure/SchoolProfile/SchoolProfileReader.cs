using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolProfile;

namespace FormMaps.Infrastructure.SchoolProfile;

/// <summary>
/// school:manage profile + settings READS (FM-DOTNET-051 — routes/school.ts GET /school/profile, GET /settings).
/// Faithful port of schoolService.ts getSchoolProfile / getSettings. Runs under the caller's read-only RLS
/// session, explicitly scoped by schoolId (and the caller's own id for the settings admin identity). All SQL
/// parameterized.
///
/// <para>getSettings coalescing is JS-exact: <c>maxStudents || 300</c> and <c>timezone || default</c> are
/// TRUTHINESS defaults (0 / "" fall back), while the notify / self-registration flags use <c>?? default</c>
/// (null-only — an explicit <c>false</c> stays false). There is no <c>plan</c> column on the School model, so
/// <c>plan</c> is always "Standard" (legacy casts a non-existent field and falls back). studentCount counts
/// active users whose roleName is 'Student' or 'student' (both-case).</para>
/// </summary>
public sealed class SchoolProfileReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ISchoolProfileReader
{
    private const int MaxStudentsDefault = 300;
    private const string TimezoneDefault = "America/New_York";

    public async Task<SchoolProfileDto?> GetSchoolProfileAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        await using var command = Command(session, $"""
            SELECT {SchoolProfileRowMapper.Projection} FROM "schools" WHERE "id" = @id
            """);
        AddParameter(command, "id", schoolId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null; // school not found → legacy returns null → endpoint emits data:null
        }

        return SchoolProfileRowMapper.Read(reader);
    }

    public async Task<SchoolSettings?> GetSettingsAsync(
        RequestContext context, string userId, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // school row (null → 404 "Not found").
        string name;
        int maxStudents;
        bool? notifyOnStudentSignup, notifyOnAssessmentComplete, allowStudentSelfRegistration;
        string? timezone;
        await using (var command = Command(session, """
            SELECT "name", "maxStudents", "notifyOnStudentSignup", "notifyOnAssessmentComplete",
                   "allowStudentSelfRegistration", "timezone"
            FROM "schools" WHERE "id" = @id
            """))
        {
            AddParameter(command, "id", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return null;
            }

            name = reader.GetString(0);
            maxStudents = reader.GetInt32(1);
            notifyOnStudentSignup = reader.IsDBNull(2) ? null : reader.GetBoolean(2);
            notifyOnAssessmentComplete = reader.IsDBNull(3) ? null : reader.GetBoolean(3);
            allowStudentSelfRegistration = reader.IsDBNull(4) ? null : reader.GetBoolean(4);
            timezone = reader.IsDBNull(5) ? null : reader.GetString(5);
        }

        // admin = the authenticated caller {id, name, email} (legacy findUnique on req.userId). If the row is
        // somehow absent, legacy `admin?.x` yields undefined → the keys drop; we surface null (unreachable in
        // practice — the schoolId was just resolved from this same user row).
        string? adminId = null, adminName = null, adminEmail = null;
        await using (var command = Command(session, """
            SELECT "id", "name", "email" FROM "users" WHERE "id" = @uid
            """))
        {
            AddParameter(command, "uid", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                adminId = reader.GetString(0);
                adminName = reader.GetString(1);
                adminEmail = reader.GetString(2);
            }
        }

        // studentCount = active users with roleName ∈ {'Student','student'} in this school.
        var studentCount = await ScalarIntAsync(session, """
            SELECT COUNT(*)::int FROM "users"
            WHERE "schoolId" = @id AND "roleName" IN ('Student', 'student') AND "isActive" = true
            """, schoolId, cancellationToken);

        // `|| 300` / `|| default` are JS truthiness (0 / "" fall back); `?? default` is null-only.
        var resolvedMaxStudents = maxStudents == 0 ? MaxStudentsDefault : maxStudents;
        var resolvedTimezone = string.IsNullOrEmpty(timezone) ? TimezoneDefault : timezone;

        return new SchoolSettings(
            Name: name,
            CurrentStudents: studentCount,
            MaxStudents: resolvedMaxStudents,
            Plan: "Standard",
            AdminId: adminId,
            AdminName: adminName,
            AdminEmail: adminEmail,
            NotifyOnStudentSignup: notifyOnStudentSignup ?? true,
            NotifyOnAssessmentComplete: notifyOnAssessmentComplete ?? true,
            AllowStudentSelfRegistration: allowStudentSelfRegistration ?? false,
            Timezone: resolvedTimezone);
    }

    // ---------------------------------------------------------------- helpers

    private static async Task<int> ScalarIntAsync(
        FormMapsDatabaseSession session, string sql, string schoolId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, sql);
        AddParameter(command, "id", schoolId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is null or DBNull ? 0 : Convert.ToInt32(result, CultureInfo.InvariantCulture);
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
}
