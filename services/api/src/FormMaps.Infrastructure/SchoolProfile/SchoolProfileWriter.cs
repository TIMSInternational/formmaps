using System.Data;
using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolProfile;

namespace FormMaps.Infrastructure.SchoolProfile;

/// <summary>
/// school:manage profile + settings WRITES (FM-DOTNET-051 — routes/school.ts PUT /school/profile, PUT /settings).
/// Faithful port of schoolService.ts updateSchoolProfile / updateSettings. This slice is the .NET write-owner for
/// the schools table's profile/settings columns. Each write opens ONE writable session, UPDATEs only the provided
/// (allow-listed) columns plus <c>updatedAt</c> = Now(), and RETURNs the row in the SAME statement, then commits.
///
/// <para>Prisma's <c>@updatedAt</c> bumps <c>updatedAt</c> on EVERY update() call — even <c>update({ data: {} })</c>
/// (an empty patch) — and still returns the row. So both writes ALWAYS include <c>"updatedAt" = @now</c> and are a
/// no-op-still-returns-row when the caller sent no writable columns. The SET column names are ALWAYS fixed literals
/// (from <see cref="SchoolProfileUpdateBuilder"/> / the settings allow-list), never caller-supplied keys — the
/// mass-assignment guard. All values parameterized; the address jsonb is bound with a <c>::jsonb</c> cast; the
/// updatedAt timestamp is bound tz-independently (Kind=Unspecified, ms-truncated).</para>
/// </summary>
public sealed class SchoolProfileWriter(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ISchoolProfileWriter
{
    public async Task<SchoolProfileDto> UpdateSchoolProfileAsync(
        RequestContext context, string schoolId, IReadOnlyList<SchoolProfileColumn> columns, CancellationToken cancellationToken = default)
    {
        // Always bump updatedAt (Prisma @updatedAt fires on every update, incl. the empty-patch no-op).
        var sets = new List<string> { "\"updatedAt\" = @now" };
        foreach (var column in columns)
        {
            var placeholder = column.IsJsonb ? $"@{column.Column}::jsonb" : $"@{column.Column}";
            sets.Add($"\"{column.Column}\" = {placeholder}");
        }

        var sql = $"""
            UPDATE "schools" SET {string.Join(", ", sets)}
            WHERE "id" = @id
            RETURNING {SchoolProfileRowMapper.Projection}
            """;

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, sql);
        AddTimestamp(command, "now", Now());
        AddParameter(command, "id", schoolId);
        foreach (var column in columns)
        {
            AddParameter(command, column.Column, column.Value ?? DBNull.Value);
        }

        SchoolProfileDto result;
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            if (!await reader.ReadAsync(cancellationToken))
            {
                // The schoolId was resolved from the caller's own FK, so the row exists; a missing RETURNING row
                // means the id vanished mid-request — surface loudly rather than pretend success.
                throw new InvalidOperationException("school profile UPDATE RETURNING produced no row");
            }

            result = SchoolProfileRowMapper.Read(reader);
        }

        await session.CommitAsync(cancellationToken);
        return result;
    }

    public async Task<SchoolSettingsUpdateResult> UpdateSettingsAsync(
        RequestContext context, string schoolId, SchoolSettingsPatch patch, CancellationToken cancellationToken = default)
    {
        var sets = new List<string> { "\"updatedAt\" = @now" };
        var parameters = new List<(string Name, object Value)>();

        // A present flag with a null value writes SQL NULL (nullable Boolean? column); a present bool writes the bool.
        if (patch.HasNotifyOnStudentSignup)
        {
            sets.Add("\"notifyOnStudentSignup\" = @notifyOnStudentSignup");
            parameters.Add(("notifyOnStudentSignup", (object?)patch.NotifyOnStudentSignup ?? DBNull.Value));
        }

        if (patch.HasNotifyOnAssessmentComplete)
        {
            sets.Add("\"notifyOnAssessmentComplete\" = @notifyOnAssessmentComplete");
            parameters.Add(("notifyOnAssessmentComplete", (object?)patch.NotifyOnAssessmentComplete ?? DBNull.Value));
        }

        if (patch.HasAllowStudentSelfRegistration)
        {
            sets.Add("\"allowStudentSelfRegistration\" = @allowStudentSelfRegistration");
            parameters.Add(("allowStudentSelfRegistration", (object?)patch.AllowStudentSelfRegistration ?? DBNull.Value));
        }

        if (patch.HasTimezone)
        {
            sets.Add("\"timezone\" = @timezone");
            parameters.Add(("timezone", patch.Timezone ?? (object)DBNull.Value));
        }

        var sql = $"""
            UPDATE "schools" SET {string.Join(", ", sets)}
            WHERE "id" = @id
            RETURNING "notifyOnStudentSignup", "notifyOnAssessmentComplete", "allowStudentSelfRegistration",
                      "timezone", "maxStudents"
            """;

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, sql);
        AddTimestamp(command, "now", Now());
        AddParameter(command, "id", schoolId);
        foreach (var (name, value) in parameters)
        {
            AddParameter(command, name, value);
        }

        SchoolSettingsUpdateResult result;
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            if (!await reader.ReadAsync(cancellationToken))
            {
                throw new InvalidOperationException("school settings UPDATE RETURNING produced no row");
            }

            result = new SchoolSettingsUpdateResult(
                NotifyOnStudentSignup: reader.IsDBNull(0) ? null : reader.GetBoolean(0),
                NotifyOnAssessmentComplete: reader.IsDBNull(1) ? null : reader.GetBoolean(1),
                AllowStudentSelfRegistration: reader.IsDBNull(2) ? null : reader.GetBoolean(2),
                Timezone: reader.IsDBNull(3) ? null : reader.GetString(3),
                MaxStudents: reader.GetInt32(4));
        }

        await session.CommitAsync(cancellationToken);
        return result;
    }

    // ---- npgsql helpers (mirror CalendarWriter / SchoolAdminWriter) ----

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

    private static DateTime Now()
    {
        var utc = DateTime.SpecifyKind(DateTimeOffset.UtcNow.UtcDateTime, DateTimeKind.Unspecified);
        return new DateTime(utc.Ticks - (utc.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Unspecified);
    }
}
