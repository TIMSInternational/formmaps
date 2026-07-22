using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.DataMappings;

namespace FormMaps.Infrastructure.DataMappings;

/// <summary>
/// school:data-mapping READS (FM-DOTNET-056 — routes/school-courses.ts GET /data-mappings). Faithful port of
/// schoolCoursesService.ts listDataMappings. Runs under the caller's read-only RLS session. All SQL parameterized.
///
/// <para>WHERE schoolId=@sid AND isActive=true; an optional status adds <c>AND "status" = @status::"DataMappingStatus"</c>
/// — an invalid enum value is a cast error → 500 (faithful to legacy passing a bad enum straight to Prisma). ORDER BY
/// createdDate DESC with an appended id-ASC tie-break (deterministic-superset, FM-032 precedent). confidence is the
/// raw Prisma Decimal? → decimal.js JSON string via <c>trim_scale("confidence")::text</c> (FM-054/055 finding, NOT
/// ::double precision); source/status are the native-enum labels via ::text; timestamps ISO-Z.</para>
/// </summary>
public sealed class DataMappingsReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IDataMappingsReader
{
    // Full data_mappings projection (camelCase passthrough). confidence → decimal-string (or NULL); source/status →
    // enum labels; timestamps read as DateTime then emitted ISO-Z.
    internal const string Columns = """
        "id", "schoolId", "externalCode", "externalName", "externalSource", "internalCourseId",
        trim_scale("confidence")::text AS "confidence", "source"::text AS "source", "status"::text AS "status",
        "approvedBy", "approvedAt", "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
        """;

    public async Task<DataMappingsPage> ListAsync(
        RequestContext context, string schoolId, int page, int limit, long skip, string? status,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var where = "\"schoolId\" = @sid AND \"isActive\" = true";
        if (!string.IsNullOrEmpty(status))
        {
            // Bad enum value → cast error → 500 (faithful to legacy `where.status = status` into Prisma).
            where += " AND \"status\" = @status::\"DataMappingStatus\"";
        }

        int total;
        await using (var countCommand = Command(session, $"""SELECT COUNT(*)::int FROM "data_mappings" WHERE {where}"""))
        {
            AddParameter(countCommand, "sid", schoolId);
            AddStatus(countCommand, status);
            total = Convert.ToInt32(await countCommand.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
        }

        var rows = new List<DataMappingRow>();
        await using (var listCommand = Command(session, $"""
            SELECT {Columns}
            FROM "data_mappings"
            WHERE {where}
            ORDER BY "createdDate" DESC, "id" ASC
            OFFSET @skip LIMIT @limit
            """))
        {
            AddParameter(listCommand, "sid", schoolId);
            AddStatus(listCommand, status);
            AddParameter(listCommand, "skip", skip);
            AddParameter(listCommand, "limit", limit);
            await using var reader = await listCommand.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add(ReadRow(reader));
            }
        }

        var totalPages = (int)Math.Ceiling(total / (double)limit);
        return new DataMappingsPage(rows, total, page, limit, totalPages);
    }

    // Shared full-row reader — the same 16-column projection the writer's INSERT ... RETURNING emits.
    internal static DataMappingRow ReadRow(DbDataReader reader) => new(
        Id: reader.GetString(0),
        SchoolId: reader.GetString(1),
        ExternalCode: reader.GetString(2),
        ExternalName: reader.IsDBNull(3) ? null : reader.GetString(3),
        ExternalSource: reader.GetString(4),
        InternalCourseId: reader.GetString(5),
        Confidence: reader.IsDBNull(6) ? null : reader.GetString(6),
        Source: reader.GetString(7),
        Status: reader.GetString(8),
        ApprovedBy: reader.IsDBNull(9) ? null : reader.GetString(9),
        ApprovedAt: reader.IsDBNull(10) ? null : IsoZ(reader.GetDateTime(10)),
        IsActive: reader.GetBoolean(11),
        CreatedBy: reader.IsDBNull(12) ? null : reader.GetString(12),
        CreatedDate: IsoZ(reader.GetDateTime(13)),
        UpdatedBy: reader.IsDBNull(14) ? null : reader.GetString(14),
        UpdatedAt: IsoZ(reader.GetDateTime(15)));

    // ---------------------------------------------------------------- helpers

    private static void AddStatus(DbCommand command, string? status)
    {
        if (!string.IsNullOrEmpty(status))
        {
            AddParameter(command, "status", status);
        }
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

    internal static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
