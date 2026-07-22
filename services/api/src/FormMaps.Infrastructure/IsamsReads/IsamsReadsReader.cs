using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.IsamsReads;

namespace FormMaps.Infrastructure.IsamsReads;

/// <summary>
/// iSAMS integration READS (FM-DOTNET-053 — routes/school.ts GET /integrations/isams/status and
/// /integrations/isams/jobs). Faithful port of schoolService.ts getIsamsStatus / getIsamsSyncJobs. READS-ONLY:
/// configure/sync/test stay in Node (vendor boundary) — no vendor HTTP client, no field-encryption code here.
/// Runs under the caller's read-only RLS session; every query is explicitly school-scoped on "schoolId".
///
/// <para>Status: <c>SELECT "endpoint","lastSyncAt" FROM "isams_configs" WHERE "schoolId"=@sid</c> (unique) —
/// 0 rows ⇒ null (endpoint renders the 2-key no-config shape); 1 row ⇒ raw endpoint + lastSyncAt (ISO-Z|null).
/// Jobs: <c>SELECT &lt;all columns&gt; ... ORDER BY "createdDate" DESC, "id" ASC LIMIT 20</c> — the id-ASC
/// tie-break is a documented deterministic superset of the legacy single-field orderBy (FM-032). Timestamps are
/// ISO-Z (Prisma Date→JSON); nullable startedAt/finishedAt → null; the native SyncJobStatus enum is read as its
/// string label via <c>"status"::text</c> (the PcaExam / Lia native-enum precedent).</para>
/// </summary>
public sealed class IsamsReadsReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IIsamsReadsReader
{
    public async Task<IsamsConfigStatus?> GetStatusAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        await using var command = Command(session, """
            SELECT "endpoint", "lastSyncAt" FROM "isams_configs" WHERE "schoolId" = @school
            """);
        AddParameter(command, "school", schoolId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new IsamsConfigStatus(
            Endpoint: reader.IsDBNull(0) ? null : reader.GetString(0),
            LastSyncAt: reader.IsDBNull(1) ? null : IsoZ(reader.GetDateTime(1)));
    }

    public async Task<IReadOnlyList<IsamsSyncJobRow>> GetSyncJobsAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        await using var command = Command(session, """
            SELECT "id", "schoolId", "initiatedBy", "status"::text AS "status", "details",
                   "startedAt", "finishedAt", "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
            FROM "isams_sync_jobs"
            WHERE "schoolId" = @school
            ORDER BY "createdDate" DESC, "id" ASC
            LIMIT 20
            """);
        AddParameter(command, "school", schoolId);

        var rows = new List<IsamsSyncJobRow>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new IsamsSyncJobRow(
                Id: reader.GetString(0),
                SchoolId: reader.GetString(1),
                InitiatedBy: reader.GetString(2),
                Status: reader.GetString(3),
                Details: reader.IsDBNull(4) ? null : reader.GetString(4),
                StartedAt: reader.IsDBNull(5) ? null : IsoZ(reader.GetDateTime(5)),
                FinishedAt: reader.IsDBNull(6) ? null : IsoZ(reader.GetDateTime(6)),
                IsActive: reader.GetBoolean(7),
                CreatedBy: reader.IsDBNull(8) ? null : reader.GetString(8),
                CreatedDate: IsoZ(reader.GetDateTime(9)),
                UpdatedBy: reader.IsDBNull(10) ? null : reader.GetString(10),
                UpdatedAt: IsoZ(reader.GetDateTime(11))));
        }

        return rows;
    }

    // ---------------------------------------------------------------- helpers

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

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
