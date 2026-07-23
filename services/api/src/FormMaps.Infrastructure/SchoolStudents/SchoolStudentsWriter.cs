using System.Data;
using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolStudents;

namespace FormMaps.Infrastructure.SchoolStudents;

/// <summary>
/// school:manage school-students WRITES (FM-DOTNET-065 — deleteStudent / updateCourseRequestDeadline). Each write
/// runs under ONE writable RLS session and commits. Timestamps are bound tz-independently (Kind=Unspecified,
/// ms-truncated) and updatedAt is always set (Prisma @updatedAt). SET/INSERT column names are fixed literals
/// (never caller keys) — the mass-assignment guard.
/// </summary>
public sealed class SchoolStudentsWriter(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ISchoolStudentsWriter
{
    public async Task<bool> DeleteStudentAsync(
        RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Ownership check (findUnique + schoolId compare): missing OR cross-school → no write, false → 404.
        string? studentSchoolId;
        await using (var lookup = Command(session, """SELECT "schoolId" FROM "users" WHERE "id" = @id"""))
        {
            AddParameter(lookup, "id", studentId);
            var result = await lookup.ExecuteScalarAsync(cancellationToken);
            studentSchoolId = result is null or DBNull ? null : (string)result;
        }

        if (studentSchoolId != schoolId)
        {
            return false;
        }

        // Soft delete (Prisma update({data:{isActive:false}}) → also bumps @updatedAt).
        await using (var update = Command(session, """UPDATE "users" SET "isActive" = false, "updatedAt" = @now WHERE "id" = @id"""))
        {
            AddTimestamp(update, "now", Now());
            AddParameter(update, "id", studentId);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return true;
    }

    public async Task<string?> UpdateCourseRequestDeadlineAsync(
        RequestContext context, string schoolId, DateTime? deadline, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Prisma upsert on the unique schoolId: create {schoolId, courseRequestDeadline} / update
        // {courseRequestDeadline}. id is a client-generated uuid (no DB default) → gen_random_uuid()::text; the other
        // scalar columns carry DB defaults. updatedAt/createdDate set on insert; updatedAt bumped on the update path.
        var deadlineParam = deadline is { } d
            ? (object)DateTime.SpecifyKind(TruncateToMs(d), DateTimeKind.Unspecified)
            : DBNull.Value;

        await using var command = Command(session, """
            INSERT INTO "school_assessment_settings" ("id", "schoolId", "courseRequestDeadline", "createdDate", "updatedAt")
            VALUES (gen_random_uuid()::text, @school, @deadline, @now, @now)
            ON CONFLICT ("schoolId") DO UPDATE SET
                "courseRequestDeadline" = EXCLUDED."courseRequestDeadline",
                "updatedAt" = @now
            RETURNING "courseRequestDeadline"
            """);
        AddParameter(command, "school", schoolId);
        AddDateTime(command, "deadline", deadlineParam);
        AddTimestamp(command, "now", Now());

        string? stored;
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            await reader.ReadAsync(cancellationToken); // RETURNING always yields the upserted row
            stored = reader.IsDBNull(0) ? null : IsoZ(reader.GetDateTime(0));
        }

        await session.CommitAsync(cancellationToken);
        return stored;
    }

    // ---------------------------------------------------------------- helpers

    private static DateTime Now() => DateTime.UtcNow;

    private static DateTime TruncateToMs(DateTime value) =>
        new(value.Ticks - value.Ticks % TimeSpan.TicksPerMillisecond, value.Kind);

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

    private static void AddDateTime(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    // tz-independent write: Kind=Unspecified + DbType.DateTime2, ms-truncated (matches Prisma @db.Timestamp(3)).
    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = DateTime.SpecifyKind(TruncateToMs(value), DateTimeKind.Unspecified);
        command.Parameters.Add(parameter);
    }

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
