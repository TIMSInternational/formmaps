using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.CourseImport;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.CourseImport;

/// <summary>
/// course-import job READ (FM-DOTNET-059 — schoolCoursesService.ts getImportJob). Runs under the caller's read-only
/// RLS session. Loads the job by id; a missing job OR a job whose schoolId != the caller's yields null (endpoint →
/// 404 "Job not found"). status is read via ::text; completedAt is emitted ISO-Z (…fffZ) or null; validationErrors is
/// deserialized from the stored jsonb into the structured [{row,errors}] list (NOT ::text — jsonb::text adds ": "/", "
/// spacing that diverges from Node res.json) and re-emitted structured by the endpoint.
/// </summary>
public sealed class CourseImportReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ICourseImportReader
{
    private static readonly JsonSerializerOptions JsonbOptions = new(JsonSerializerDefaults.Web);

    public async Task<ImportJobView?> GetImportJobAsync(
        RequestContext context, string schoolId, string jobId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        await using var command = Command(session, """
            SELECT "id", "schoolId", "status"::text AS "status", "totalRows", "processedRows", "failedRows",
                   "validationErrors"::text AS "validationErrors", "completedAt"
            FROM "school_course_import_jobs"
            WHERE "id" = @id
            """);
        AddParameter(command, "id", jobId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        // Cross-school (or foreign) job → null, same as legacy `job.schoolId !== schoolId`.
        var jobSchoolId = reader.GetString(1);
        if (!string.Equals(jobSchoolId, schoolId, StringComparison.Ordinal))
        {
            return null;
        }

        var validationErrors = reader.IsDBNull(6)
            ? []
            : JsonSerializer.Deserialize<List<ImportValidationError>>(reader.GetString(6), JsonbOptions) ?? [];

        var completedAt = reader.IsDBNull(7) ? null : IsoZ(reader.GetDateTime(7));

        return new ImportJobView(
            JobId: reader.GetString(0),
            Status: reader.GetString(2),
            TotalRows: reader.GetInt32(3),
            ProcessedRows: reader.GetInt32(4),
            FailedRows: reader.GetInt32(5),
            ValidationErrors: validationErrors,
            CompletedAt: completedAt);
    }

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

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
