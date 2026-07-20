using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Calendar;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Calendar;

/// <summary>
/// School academic-calendar reads — faithful port of routes/school-grades.ts calendar GETs
/// (schoolGradesService getAcademicYears / getAssessmentPeriods / getHolidays). Runs under the caller's
/// read-only session. Explicit WHERE "schoolId" (these tables carry no RLS policy — the filter is load-bearing).
/// Full-row passthrough (camelCase via the Web policy); timestamps ISO-Z; assessmentTypes text[] -> JSON array;
/// nullable Holiday.endDate -> null.
/// </summary>
public sealed class CalendarReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ICalendarReader
{
    public async Task<IReadOnlyList<AcademicYearRow>> GetAcademicYearsAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // years: where schoolId+isActive, orderBy startDate DESC (startDate non-null -> no NULLS concern).
        var yearOrder = new List<string>();
        var yearFields = new Dictionary<string, (string Id, string SchoolId, string Name, string StartDate,
            string EndDate, bool IsCurrent, bool IsActive, string? CreatedBy, string CreatedDate, string? UpdatedBy,
            string UpdatedAt)>(StringComparer.Ordinal);
        await using (var command = Command(session, """
            SELECT "id", "schoolId", "name", "startDate", "endDate", "isCurrent", "isActive",
                   "createdBy", "createdDate", "updatedBy", "updatedAt"
            FROM "academic_years"
            WHERE "schoolId" = @school AND "isActive" = true
            ORDER BY "startDate" DESC
            """))
        {
            AddParameter(command, "school", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var id = reader.GetString(0);
                yearOrder.Add(id);
                yearFields[id] = (
                    id,
                    reader.GetString(1),
                    reader.GetString(2),
                    IsoZ(reader.GetDateTime(3)),
                    IsoZ(reader.GetDateTime(4)),
                    reader.GetBoolean(5),
                    reader.GetBoolean(6),
                    reader.IsDBNull(7) ? null : reader.GetString(7),
                    IsoZ(reader.GetDateTime(8)),
                    reader.IsDBNull(9) ? null : reader.GetString(9),
                    IsoZ(reader.GetDateTime(10)));
            }
        }

        // terms for those years (isActive), sortOrder ASC -> per-year list built in query order preserves it
        // (matches the Prisma include's orderBy sortOrder asc).
        var termsByYear = new Dictionary<string, List<AcademicTermRow>>(StringComparer.Ordinal);
        if (yearOrder.Count > 0)
        {
            await using var command = Command(session, """
                SELECT "id", "academicYearId", "name", "startDate", "endDate", "sortOrder", "isActive",
                       "createdBy", "createdDate", "updatedBy", "updatedAt"
                FROM "academic_terms"
                WHERE "academicYearId" = ANY(@ids) AND "isActive" = true
                ORDER BY "sortOrder" ASC
                """);
            AddParameter(command, "ids", yearOrder.ToArray());
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var term = new AcademicTermRow(
                    Id: reader.GetString(0),
                    AcademicYearId: reader.GetString(1),
                    Name: reader.GetString(2),
                    StartDate: IsoZ(reader.GetDateTime(3)),
                    EndDate: IsoZ(reader.GetDateTime(4)),
                    SortOrder: reader.GetInt32(5),
                    IsActive: reader.GetBoolean(6),
                    CreatedBy: reader.IsDBNull(7) ? null : reader.GetString(7),
                    CreatedDate: IsoZ(reader.GetDateTime(8)),
                    UpdatedBy: reader.IsDBNull(9) ? null : reader.GetString(9),
                    UpdatedAt: IsoZ(reader.GetDateTime(10)));
                if (!termsByYear.TryGetValue(term.AcademicYearId, out var list))
                {
                    list = [];
                    termsByYear[term.AcademicYearId] = list;
                }

                list.Add(term);
            }
        }

        var years = new List<AcademicYearRow>(yearOrder.Count);
        foreach (var id in yearOrder)
        {
            var f = yearFields[id];
            IReadOnlyList<AcademicTermRow> terms =
                termsByYear.TryGetValue(id, out var list) ? list : [];
            years.Add(new AcademicYearRow(
                f.Id, f.SchoolId, f.Name, f.StartDate, f.EndDate, f.IsCurrent, f.IsActive,
                f.CreatedBy, f.CreatedDate, f.UpdatedBy, f.UpdatedAt, terms));
        }

        return years;
    }

    public async Task<IReadOnlyList<AssessmentPeriodRow>> GetAssessmentPeriodsAsync(
        RequestContext context, string schoolId, string? academicYearId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // GATE quirk (getAssessmentPeriods): yearId = param || the school's current-year id || "". If empty -> [].
        // The resolved yearId is ONLY this gate; the query itself is NOT filtered by year.
        var yearId = academicYearId;
        if (string.IsNullOrEmpty(yearId))
        {
            await using var lookup = Command(session, """
                SELECT "id" FROM "academic_years" WHERE "schoolId" = @school AND "isCurrent" = true LIMIT 1
                """);
            AddParameter(lookup, "school", schoolId);
            var current = await lookup.ExecuteScalarAsync(cancellationToken);
            yearId = current as string ?? string.Empty;
        }

        if (string.IsNullOrEmpty(yearId))
        {
            return [];
        }

        var periods = new List<AssessmentPeriodRow>();
        await using (var command = Command(session, """
            SELECT "id", "schoolId", "termId", "name", "startDate", "endDate", "assessmentTypes", "isActive",
                   "createdBy", "createdDate", "updatedBy", "updatedAt"
            FROM "assessment_periods"
            WHERE "schoolId" = @school AND "isActive" = true
            ORDER BY "startDate" ASC
            """))
        {
            AddParameter(command, "school", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                periods.Add(new AssessmentPeriodRow(
                    Id: reader.GetString(0),
                    SchoolId: reader.GetString(1),
                    TermId: reader.GetString(2),
                    Name: reader.GetString(3),
                    StartDate: IsoZ(reader.GetDateTime(4)),
                    EndDate: IsoZ(reader.GetDateTime(5)),
                    AssessmentTypes: reader.IsDBNull(6) ? [] : reader.GetFieldValue<string[]>(6),
                    IsActive: reader.GetBoolean(7),
                    CreatedBy: reader.IsDBNull(8) ? null : reader.GetString(8),
                    CreatedDate: IsoZ(reader.GetDateTime(9)),
                    UpdatedBy: reader.IsDBNull(10) ? null : reader.GetString(10),
                    UpdatedAt: IsoZ(reader.GetDateTime(11))));
            }
        }

        return periods;
    }

    public async Task<IReadOnlyList<HolidayRow>> GetHolidaysAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var holidays = new List<HolidayRow>();
        await using (var command = Command(session, """
            SELECT "id", "schoolId", "academicYearId", "name", "date", "endDate", "type", "isActive",
                   "createdBy", "createdDate", "updatedBy", "updatedAt"
            FROM "holidays"
            WHERE "schoolId" = @school AND "isActive" = true
            ORDER BY "date" ASC
            """))
        {
            AddParameter(command, "school", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                holidays.Add(new HolidayRow(
                    Id: reader.GetString(0),
                    SchoolId: reader.GetString(1),
                    AcademicYearId: reader.GetString(2),
                    Name: reader.GetString(3),
                    Date: IsoZ(reader.GetDateTime(4)),
                    EndDate: reader.IsDBNull(5) ? null : IsoZ(reader.GetDateTime(5)),
                    Type: reader.GetString(6),
                    IsActive: reader.GetBoolean(7),
                    CreatedBy: reader.IsDBNull(8) ? null : reader.GetString(8),
                    CreatedDate: IsoZ(reader.GetDateTime(9)),
                    UpdatedBy: reader.IsDBNull(10) ? null : reader.GetString(10),
                    UpdatedAt: IsoZ(reader.GetDateTime(11))));
            }
        }

        return holidays;
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

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
