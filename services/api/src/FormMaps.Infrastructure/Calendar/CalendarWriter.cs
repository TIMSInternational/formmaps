using System.Data;
using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Calendar;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Calendar;

/// <summary>
/// School academic-calendar WRITE surface (FM-DOTNET-048), faithful port of the calendar mutations in
/// schoolGradesService.ts. Each operation opens ONE writable session and commits at the end (a deterministic
/// superset of legacy's per-call Prisma writes — validation happens up-front in the endpoint, so there is no
/// mid-op failure to leave partial state). Explicit "schoolId" in every academic_years / assessment_periods /
/// holidays statement (these tables carry no RLS policy). createdBy / updatedBy are NEVER written (legacy
/// omits them -> null); id = Guid, createdDate/updatedAt = Now() (Kind=Unspecified, ms-truncated, tz-independent).
/// All SQL parameterized.
/// </summary>
public sealed class CalendarWriter(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : ICalendarWriter
{
    // ---------------------------------------------------------------- academic years

    public async Task<CalendarCreatedRow> CreateAcademicYearAsync(
        RequestContext context, string schoolId, CreateAcademicYearInput input, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var now = Now();
        var yearId = Guid.NewGuid().ToString();

        // isCurrent / isActive omitted -> DB defaults (false / true), matching prisma create without those fields.
        await using (var command = Command(session, """
            INSERT INTO "academic_years" ("id", "schoolId", "name", "startDate", "endDate", "createdDate", "updatedAt")
            VALUES (@id, @sid, @name, @start, @end, @now, @now)
            """))
        {
            AddParameter(command, "id", yearId);
            AddParameter(command, "sid", schoolId);
            AddParameter(command, "name", input.Name);
            AddTimestamp(command, "start", input.StartDate);
            AddTimestamp(command, "end", input.EndDate);
            AddTimestamp(command, "now", now);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await InsertTermsAsync(session, yearId, input.Terms, cancellationToken);

        await session.CommitAsync(cancellationToken);
        return new CalendarCreatedRow(yearId, input.Name);
    }

    public async Task<bool> SetCurrentAcademicYearAsync(
        RequestContext context, string schoolId, string yearId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Ownership BEFORE any write: a foreign/nonexistent id must NOT clear the school's current-year flag
        // (destructive partial state — CORPUS PIN, the legacy comment calls this out explicitly).
        if (!await OwnedAsync(session, "academic_years", yearId, schoolId, cancellationToken))
        {
            return false;
        }

        var now = Now();

        // updateMany({ data:{ isCurrent:false } }) — @updatedAt bumps updatedAt on the cleared rows too.
        await using (var clear = Command(session, """
            UPDATE "academic_years" SET "isCurrent" = false, "updatedAt" = @now WHERE "schoolId" = @sid
            """))
        {
            AddTimestamp(clear, "now", now);
            AddParameter(clear, "sid", schoolId);
            await clear.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (var set = Command(session, """
            UPDATE "academic_years" SET "isCurrent" = true, "updatedAt" = @now WHERE "id" = @id AND "schoolId" = @sid
            """))
        {
            AddTimestamp(set, "now", now);
            AddParameter(set, "id", yearId);
            AddParameter(set, "sid", schoolId);
            await set.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteAcademicYearAsync(
        RequestContext context, string schoolId, string yearId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        if (!await OwnedAsync(session, "academic_years", yearId, schoolId, cancellationToken))
        {
            return false;
        }

        // Legacy deletes terms explicitly, then the year; holidays cascade via the FK ON DELETE CASCADE.
        await using (var terms = Command(session, """DELETE FROM "academic_terms" WHERE "academicYearId" = @id"""))
        {
            AddParameter(terms, "id", yearId);
            await terms.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (var year = Command(session, """DELETE FROM "academic_years" WHERE "id" = @id AND "schoolId" = @sid"""))
        {
            AddParameter(year, "id", yearId);
            AddParameter(year, "sid", schoolId);
            await year.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return true;
    }

    public async Task<bool> UpdateAcademicYearAsync(
        RequestContext context, string schoolId, string yearId, UpdateAcademicYearInput input, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Read existing (WHERE id AND schoolId) for the name-coalesce and the ownership gate.
        string existingName;
        await using (var read = Command(session, """
            SELECT "name" FROM "academic_years" WHERE "id" = @id AND "schoolId" = @sid
            """))
        {
            AddParameter(read, "id", yearId);
            AddParameter(read, "sid", schoolId);
            await using var reader = await read.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return false;
            }

            existingName = reader.GetString(0);
        }

        var now = Now();
        var name = input.Name ?? existingName; // body.name ?? ay.name (nullish)

        // Always SET name + updatedAt; startDate/endDate only when the truthy conditional provided them.
        var sets = new List<string> { "\"name\" = @name", "\"updatedAt\" = @now" };
        if (input.HasStartDate) { sets.Add("\"startDate\" = @start"); }
        if (input.HasEndDate) { sets.Add("\"endDate\" = @end"); }

        await using (var update = Command(session, $"""
            UPDATE "academic_years" SET {string.Join(", ", sets)} WHERE "id" = @id AND "schoolId" = @sid
            """))
        {
            AddParameter(update, "name", name);
            AddTimestamp(update, "now", now);
            if (input.HasStartDate) { AddTimestamp(update, "start", input.StartDate); }
            if (input.HasEndDate) { AddTimestamp(update, "end", input.EndDate); }
            AddParameter(update, "id", yearId);
            AddParameter(update, "sid", schoolId);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        if (input.HasTerms)
        {
            await using (var deleteTerms = Command(session, """DELETE FROM "academic_terms" WHERE "academicYearId" = @id"""))
            {
                AddParameter(deleteTerms, "id", yearId);
                await deleteTerms.ExecuteNonQueryAsync(cancellationToken);
            }

            await InsertTermsAsync(session, yearId, input.Terms, cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return true;
    }

    // ---------------------------------------------------------------- assessment periods

    public async Task<CalendarCreatedRow?> CreateAssessmentPeriodAsync(
        RequestContext context, string schoolId, CreateAssessmentPeriodInput input, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var termId = input.TermId;
        if (string.IsNullOrEmpty(termId))
        {
            // Fallback: the current academic year's FIRST term. Legacy uses include:{terms:{take:1}} with NO
            // term orderBy — Prisma's relation default order is unspecified. Faithful SUPERSET: pick a
            // deterministic first term ordered by (createdDate, id).
            await using var lookup = Command(session, """
                SELECT t."id"
                FROM "academic_terms" t
                JOIN "academic_years" y ON t."academicYearId" = y."id"
                WHERE y."schoolId" = @sid AND y."isCurrent" = true
                ORDER BY t."createdDate" ASC, t."id" ASC
                LIMIT 1
                """);
            AddParameter(lookup, "sid", schoolId);
            termId = (await lookup.ExecuteScalarAsync(cancellationToken)) as string ?? string.Empty;
        }

        if (string.IsNullOrEmpty(termId))
        {
            return null;
        }

        var now = Now();
        var periodId = Guid.NewGuid().ToString();

        await using (var command = Command(session, """
            INSERT INTO "assessment_periods"
                ("id", "schoolId", "termId", "name", "startDate", "endDate", "assessmentTypes", "createdDate", "updatedAt")
            VALUES (@id, @sid, @term, @name, @start, @end, @types, @now, @now)
            """))
        {
            AddParameter(command, "id", periodId);
            AddParameter(command, "sid", schoolId);
            AddParameter(command, "term", termId);
            AddParameter(command, "name", input.Name);
            AddTimestamp(command, "start", input.StartDate);
            AddTimestamp(command, "end", input.EndDate);
            AddParameter(command, "types", input.AssessmentTypes.ToArray());
            AddTimestamp(command, "now", now);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return new CalendarCreatedRow(periodId, input.Name);
    }

    public async Task<bool> DeleteAssessmentPeriodAsync(
        RequestContext context, string schoolId, string periodId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        if (!await OwnedAsync(session, "assessment_periods", periodId, schoolId, cancellationToken))
        {
            return false;
        }

        await using (var command = Command(session, """
            DELETE FROM "assessment_periods" WHERE "id" = @id AND "schoolId" = @sid
            """))
        {
            AddParameter(command, "id", periodId);
            AddParameter(command, "sid", schoolId);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return true;
    }

    public async Task<bool> UpdateAssessmentPeriodAsync(
        RequestContext context, string schoolId, string periodId, UpdateAssessmentPeriodInput input, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        string existingTermId;
        string existingName;
        await using (var read = Command(session, """
            SELECT "termId", "name" FROM "assessment_periods" WHERE "id" = @id AND "schoolId" = @sid
            """))
        {
            AddParameter(read, "id", periodId);
            AddParameter(read, "sid", schoolId);
            await using var reader = await read.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return false;
            }

            existingTermId = reader.GetString(0);
            existingName = reader.GetString(1);
        }

        var now = Now();
        var termId = input.HasTermId ? input.TermId ?? existingTermId : existingTermId; // body.termId ?? ap.termId
        var name = input.Name ?? existingName;                                          // body.name ?? ap.name

        var sets = new List<string> { "\"termId\" = @term", "\"name\" = @name", "\"updatedAt\" = @now" };
        if (input.HasStartDate) { sets.Add("\"startDate\" = @start"); }
        if (input.HasEndDate) { sets.Add("\"endDate\" = @end"); }
        if (input.HasAssessmentTypes) { sets.Add("\"assessmentTypes\" = @types"); }

        await using (var update = Command(session, $"""
            UPDATE "assessment_periods" SET {string.Join(", ", sets)} WHERE "id" = @id AND "schoolId" = @sid
            """))
        {
            AddParameter(update, "term", termId);
            AddParameter(update, "name", name);
            AddTimestamp(update, "now", now);
            if (input.HasStartDate) { AddTimestamp(update, "start", input.StartDate); }
            if (input.HasEndDate) { AddTimestamp(update, "end", input.EndDate); }
            if (input.HasAssessmentTypes) { AddParameter(update, "types", input.AssessmentTypes.ToArray()); }
            AddParameter(update, "id", periodId);
            AddParameter(update, "sid", schoolId);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return true;
    }

    // ---------------------------------------------------------------- holidays

    public async Task<int?> CreateHolidaysAsync(
        RequestContext context, string schoolId, IReadOnlyList<HolidayInputDto> holidays, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Resolve the academic year FIRST (current else latest by startDate DESC). No AY -> null (400),
        // regardless of holiday validity — the gate precedes normalization.
        var academicYearId = await ResolveAcademicYearAsync(session, schoolId, cancellationToken);
        if (academicYearId is null)
        {
            return null;
        }

        // Bound the batch to the first 500, normalize each, drop the invalid.
        var normalized = new List<NormalizedHoliday>();
        foreach (var raw in holidays.Take(500))
        {
            var value = Normalize(raw);
            if (value is not null)
            {
                normalized.Add(value);
            }
        }

        if (normalized.Count == 0)
        {
            // Legacy returns { count: 0 } (still 200) — a valid AY exists but nothing survived normalization.
            return 0;
        }

        foreach (var holiday in normalized)
        {
            var now = Now();
            await using var command = Command(session, """
                INSERT INTO "holidays"
                    ("id", "schoolId", "academicYearId", "name", "date", "endDate", "type", "createdDate", "updatedAt")
                VALUES (@id, @sid, @ayid, @name, @date, @end, @type, @now, @now)
                """);
            AddParameter(command, "id", Guid.NewGuid().ToString());
            AddParameter(command, "sid", schoolId);
            AddParameter(command, "ayid", academicYearId);
            AddParameter(command, "name", holiday.Name);
            AddTimestamp(command, "date", holiday.Date);
            if (holiday.EndDate is { } endDate)
            {
                AddTimestamp(command, "end", endDate);
            }
            else
            {
                AddNullTimestamp(command, "end");
            }

            AddParameter(command, "type", holiday.Type);
            AddTimestamp(command, "now", now);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return normalized.Count;
    }

    public async Task<bool> DeleteHolidayAsync(
        RequestContext context, string schoolId, string holidayId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        if (!await OwnedAsync(session, "holidays", holidayId, schoolId, cancellationToken))
        {
            return false;
        }

        await using (var command = Command(session, """
            DELETE FROM "holidays" WHERE "id" = @id AND "schoolId" = @sid
            """))
        {
            AddParameter(command, "id", holidayId);
            AddParameter(command, "sid", schoolId);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return true;
    }

    // ---------------------------------------------------------------- internals

    private static async Task InsertTermsAsync(
        FormMapsDatabaseSession session, string yearId, IReadOnlyList<AcademicTermInput> terms, CancellationToken cancellationToken)
    {
        for (var i = 0; i < terms.Count; i++)
        {
            var term = terms[i];
            var now = Now();
            await using var command = Command(session, """
                INSERT INTO "academic_terms"
                    ("id", "academicYearId", "name", "startDate", "endDate", "sortOrder", "createdDate", "updatedAt")
                VALUES (@id, @yid, @name, @start, @end, @sort, @now, @now)
                """);
            AddParameter(command, "id", Guid.NewGuid().ToString());
            AddParameter(command, "yid", yearId);
            AddParameter(command, "name", term.Name);
            AddTimestamp(command, "start", term.StartDate);
            AddTimestamp(command, "end", term.EndDate);
            AddParameter(command, "sort", i); // sortOrder = array index
            AddTimestamp(command, "now", now);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private static async Task<string?> ResolveAcademicYearAsync(
        FormMapsDatabaseSession session, string schoolId, CancellationToken cancellationToken)
    {
        await using (var current = Command(session, """
            SELECT "id" FROM "academic_years" WHERE "schoolId" = @sid AND "isCurrent" = true LIMIT 1
            """))
        {
            AddParameter(current, "sid", schoolId);
            if (await current.ExecuteScalarAsync(cancellationToken) is string currentId)
            {
                return currentId;
            }
        }

        await using var latest = Command(session, """
            SELECT "id" FROM "academic_years" WHERE "schoolId" = @sid ORDER BY "startDate" DESC LIMIT 1
            """);
        AddParameter(latest, "sid", schoolId);
        return (await latest.ExecuteScalarAsync(cancellationToken)) as string;
    }

    // Ownership check (WHERE id AND schoolId) — uniform IDOR gate: a foreign/nonexistent id is indistinguishable
    // from "not found" (missing == denied), returning false so the endpoint 404s with no write.
    private static async Task<bool> OwnedAsync(
        FormMapsDatabaseSession session, string table, string id, string schoolId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, $"""
            SELECT 1 FROM "{table}" WHERE "id" = @id AND "schoolId" = @sid LIMIT 1
            """);
        AddParameter(command, "id", id);
        AddParameter(command, "sid", schoolId);
        return await command.ExecuteScalarAsync(cancellationToken) is not null;
    }

    // Port of normalizeHolidayInput (schoolGradesService.ts): name trimmed+sliced(100) — reject if empty; date
    // parsed (drop on invalid); endDate parsed ONLY if valid AND strictly after date, else null; type default
    // "holiday", trimmed+sliced(50) with a final "holiday" fallback.
    private static NormalizedHoliday? Normalize(HolidayInputDto raw)
    {
        var name = (raw.Name ?? string.Empty).Trim();
        if (name.Length > 100) { name = name[..100]; }
        if (name.Length == 0) { return null; }

        if (!TryParseDate(raw.Date ?? string.Empty, out var date))
        {
            return null;
        }

        DateTime? endDate = null;
        if (!string.IsNullOrEmpty(raw.EndDate) && TryParseDate(raw.EndDate, out var parsedEnd) && parsedEnd > date)
        {
            endDate = parsedEnd;
        }

        var type = (string.IsNullOrEmpty(raw.Type) ? "holiday" : raw.Type).Trim();
        if (type.Length > 50) { type = type[..50]; }
        if (type.Length == 0) { type = "holiday"; }

        return new NormalizedHoliday(name, date, endDate, type);
    }

    // `new Date(s)` semantics: parse as an instant, normalized to UTC wall-clock (Kind=Unspecified for the
    // timestamp(3)-without-tz columns). Mirrors SchoolAdminEndpoints/CalendarEndpoints TryParseDate.
    private static bool TryParseDate(string raw, out DateTime value)
    {
        value = default;
        if (!DateTimeOffset.TryParse(raw, System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal, out var dto))
        {
            return false;
        }

        value = DateTime.SpecifyKind(dto.UtcDateTime, DateTimeKind.Unspecified);
        return true;
    }

    private sealed record NormalizedHoliday(string Name, DateTime Date, DateTime? EndDate, string Type);

    // ---- npgsql helpers (mirror CalendarReader / SchoolAdminWriter) ----

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

    private static void AddNullTimestamp(DbCommand command, string name)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = DBNull.Value;
        command.Parameters.Add(parameter);
    }

    private static DateTime Now()
    {
        var utc = DateTime.SpecifyKind(DateTimeOffset.UtcNow.UtcDateTime, DateTimeKind.Unspecified);
        return new DateTime(utc.Ticks - (utc.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Unspecified);
    }
}
