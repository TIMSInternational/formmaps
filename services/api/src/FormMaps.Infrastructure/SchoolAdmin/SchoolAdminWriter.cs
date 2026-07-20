using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolAdmin;

namespace FormMaps.Infrastructure.SchoolAdmin;

/// <summary>
/// School-admin assessment WRITE surface (FM-DOTNET-044), faithful port of updateAssessmentConfig +
/// upsertSchedules (services/schoolAssessmentsService.ts). Runs under the caller's WRITABLE RLS session,
/// scoped by the schoolId the endpoint already resolved. Config = upsert on the schoolId unique; PATCH
/// semantics (only provided columns are written, non-provided keep their DB default on create / prior value
/// on update); the read-back applies the SAME `settings.x || DEFAULT` coalescing + parseAiWeights as the
/// reader. Schedule = per-item upsert on the (schoolId, gradeLevel, assessmentType) composite, RETURNING the
/// full row (same shape as GetSchedulesAsync). Timestamps bound tz-independently (Kind=Unspecified, ms-trunc)
/// like the other writers. All SQL parameterized.
/// </summary>
public sealed class SchoolAdminWriter(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : ISchoolAdminWriter
{
    // parseAiWeights(null) / parse-failure fall back to this exact default object (byte-stable, matches the reader).
    private const string AiWeightsDefaultJson = """{"academic":0.4,"social":0.3,"career":0.3}""";

    public async Task<AssessmentConfig> UpdateAssessmentConfigAsync(
        RequestContext context,
        string schoolId,
        string userId,
        AssessmentConfigPatch patch,
        CancellationToken cancellationToken = default)
    {
        // Provided data columns (PATCH): included in the INSERT column list AND SET on conflict via EXCLUDED, so
        // both create and update write exactly the fields the caller sent. Omitted columns take their DB default
        // on create (retakePolicy 'none', allowSelfSchedule false, reminderDaysBefore 7) and are preserved on
        // update — mirroring legacy `data.x = body.x` / prisma upsert.
        var columns = new List<string>();
        var updateSets = new List<string>();
        var parameters = new List<(string Name, object Value)>();

        void Provide(string column, object? value)
        {
            columns.Add($"\"{column}\"");
            updateSets.Add($"\"{column}\" = EXCLUDED.\"{column}\"");
            parameters.Add((column, value ?? DBNull.Value));
        }

        if (patch.HasWindowStart) { Provide("assessmentWindowStart", patch.WindowStart); }
        if (patch.HasWindowEnd) { Provide("assessmentWindowEnd", patch.WindowEnd); }
        if (patch.HasRetakePolicy) { Provide("retakePolicy", patch.RetakePolicy); }
        if (patch.HasAllowSelfSchedule) { Provide("allowSelfSchedule", patch.AllowSelfSchedule); }
        if (patch.HasReminderDaysBefore) { Provide("reminderDaysBefore", patch.ReminderDaysBefore); }
        if (patch.HasAiWeights) { Provide("aiWeightsJson", patch.AiWeightsJson); }

        var now = Now();
        var insertCols = string.Join(", ", new[] { "\"id\"", "\"schoolId\"", "\"createdBy\"", "\"updatedBy\"", "\"updatedAt\"" }.Concat(columns));
        var insertVals = string.Join(", ", new[] { "@id", "@sid", "@uid", "@uid", "@now" }.Concat(columns.Select(c => "@" + c.Trim('"'))));
        var conflictSets = string.Join(", ", new[] { "\"updatedBy\" = @uid", "\"updatedAt\" = @now" }.Concat(updateSets));

        var sql = $"""
            INSERT INTO "school_assessment_settings" ({insertCols})
            VALUES ({insertVals})
            ON CONFLICT ("schoolId") DO UPDATE SET {conflictSets}
            RETURNING "assessmentWindowStart", "assessmentWindowEnd", "retakePolicy",
                      "allowSelfSchedule", "reminderDaysBefore", "aiWeightsJson"
            """;

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, sql);
        AddParameter(command, "id", Guid.NewGuid().ToString());
        AddParameter(command, "sid", schoolId);
        AddParameter(command, "uid", userId);
        AddTimestamp(command, "now", now);
        foreach (var (name, value) in parameters)
        {
            AddParameter(command, name, value);
        }

        AssessmentConfig result;
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            await reader.ReadAsync(cancellationToken);
            // Legacy updateAssessmentConfig (schoolAssessmentsService.ts:250-257) returns the window/retakePolicy
            // fields RAW from the DB — NO `|| DEFAULT` coalescing (that is the GET-only path, getAssessmentConfig).
            // So a first save omitting windows returns null (not "2026-03-01"), and retakePolicy:"" returns ""
            // (not "once_per_semester"). aiWeights IS parsed in the write (parseAiWeights), so keep that.
            var windowStart = reader.IsDBNull(0) ? null : reader.GetString(0);
            var windowEnd = reader.IsDBNull(1) ? null : reader.GetString(1);
            var retakePolicy = reader.IsDBNull(2) ? null : reader.GetString(2);
            var allowSelfSchedule = reader.GetBoolean(3);
            var reminderDaysBefore = reader.GetInt32(4);
            var aiWeightsJson = reader.IsDBNull(5) ? null : reader.GetString(5);
            result = new AssessmentConfig(
                windowStart, windowEnd, retakePolicy, allowSelfSchedule, reminderDaysBefore, ParseAiWeights(aiWeightsJson));
        }

        await session.CommitAsync(cancellationToken);
        return result;
    }

    public async Task<IReadOnlyList<AssessmentScheduleRow>> UpsertSchedulesAsync(
        RequestContext context,
        string schoolId,
        string? userId,
        IReadOnlyList<ScheduleUpsertItem> items,
        CancellationToken cancellationToken = default)
    {
        var results = new List<AssessmentScheduleRow>();
        if (items.Count == 0)
        {
            return results;
        }

        // One writable session; each item upserts on the composite key, RETURNING the full row (create sets
        // createdBy + updatedAt, leaves updatedBy null; conflict-update sets startDate/endDate/updatedBy/updatedAt).
        // Legacy runs each upsert as its own prisma call (non-atomic across items); a single committed session is
        // a deterministic superset — validation (incomplete-skip + date-parse) happens BEFORE any write upstream,
        // so there is no mid-loop failure to leave partial state.
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        const string sql = """
            INSERT INTO "assessment_schedules"
                ("id", "schoolId", "gradeLevel", "assessmentType", "startDate", "endDate", "createdBy", "updatedAt")
            VALUES (@id, @sid, @grade, @type, @start, @end, @uid, @now)
            ON CONFLICT ("schoolId", "gradeLevel", "assessmentType") DO UPDATE SET
                "startDate" = EXCLUDED."startDate",
                "endDate" = EXCLUDED."endDate",
                "updatedBy" = @uid,
                "updatedAt" = @now
            RETURNING "id", "schoolId", "gradeLevel", "assessmentType", "startDate", "endDate", "isActive",
                      "createdBy", "createdDate", "updatedBy", "updatedAt"
            """;

        foreach (var item in items)
        {
            var now = Now();
            await using var command = Command(session, sql);
            AddParameter(command, "id", Guid.NewGuid().ToString());
            AddParameter(command, "sid", schoolId);
            AddParameter(command, "grade", item.GradeLevel);
            AddParameter(command, "type", item.AssessmentType);
            AddTimestamp(command, "start", item.StartDate);
            AddTimestamp(command, "end", item.EndDate);
            AddParameter(command, "uid", (object?)userId ?? DBNull.Value);
            AddTimestamp(command, "now", now);

            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            await reader.ReadAsync(cancellationToken);
            results.Add(new AssessmentScheduleRow(
                Id: reader.GetString(0),
                SchoolId: reader.GetString(1),
                GradeLevel: reader.GetInt32(2),
                AssessmentType: reader.GetString(3),
                StartDate: IsoZ(reader.GetDateTime(4)),
                EndDate: IsoZ(reader.GetDateTime(5)),
                IsActive: reader.GetBoolean(6),
                CreatedBy: reader.IsDBNull(7) ? null : reader.GetString(7),
                CreatedDate: IsoZ(reader.GetDateTime(8)),
                UpdatedBy: reader.IsDBNull(9) ? null : reader.GetString(9),
                UpdatedAt: IsoZ(reader.GetDateTime(10))));
        }

        await session.CommitAsync(cancellationToken);
        return results;
    }

    // ---- helpers (mirror SchoolAdminReader / the write-rail writers) ----

    private static JsonElement ParseAiWeights(string? json)
    {
        if (string.IsNullOrEmpty(json))
        {
            return DefaultAiWeights();
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return DefaultAiWeights();
        }
    }

    private static JsonElement DefaultAiWeights()
    {
        using var document = JsonDocument.Parse(AiWeightsDefaultJson);
        return document.RootElement.Clone();
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
