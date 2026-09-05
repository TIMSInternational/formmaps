using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Data;
using FormMaps.Application.Graduation;
using FormMaps.Infrastructure.Gradebook;

namespace FormMaps.Infrastructure.Graduation;

/// <summary>
/// The pieces of <c>services/graduationPlanService.ts</c> that BOTH the student repository and the counselor
/// repository call: <c>getCurrentPlan</c> (:130) and <c>planDto</c> (:114).
///
/// EXTRACTED, NOT DUPLICATED, for the same reason <see cref="TranscriptDataQuery"/> exists: legacy has exactly
/// one getCurrentPlan and four routes call it (GET /graduation-plan, POST /submit, the counselor GET and the
/// counselor review), so a second implementation is a second thing to keep in step. The one detail that would
/// drift first is the status set — <c>draft | proposed | approved | rejected</c>, deliberately EXCLUDING
/// <c>superseded</c>, which is what makes a regenerate hide the old plan rather than resurrect it.
/// </summary>
internal static class GraduationPlanDataQuery
{
    /// <summary><c>status: { in: [...] }</c> — note the absence of "superseded".</summary>
    internal static readonly string[] CurrentPlanStatuses = ["draft", "proposed", "approved", "rejected"];

    private static readonly JsonElement EmptyArray = JsonDocument.Parse("[]").RootElement.Clone();

    /// <summary>
    /// <c>getCurrentPlan(studentId)</c>. The <c>"studentId" = @sid</c> predicate is the ONLY thing scoping this
    /// to one student: <c>graduation_plans</c> is policied on schoolId alone (006-graduation-plans.sql), so a
    /// same-school peer's plan is fully visible to this session and RLS would happily return it.
    /// </summary>
    internal static async Task<GraduationPlanDto?> GetCurrentPlanAsync(
        FormMapsDatabaseSession session, string studentId, CancellationToken cancellationToken)
    {
        string id;
        string status;
        string templateKey;
        JsonElement gapReport;
        JsonElement warnings;
        string? rationale;
        double totalPlannedCredits;
        string? submittedAt;
        string? reviewNote;
        string createdDate;

        await using (var command = Command(session, """
            SELECT "id", "status", "templateKey", "gapReport", "warnings", "rationale",
                   "totalPlannedCredits"::double precision, "submittedAt", "reviewNote", "createdDate"
            FROM "graduation_plans"
            WHERE "studentId" = @sid AND "isActive" = true AND "status" = ANY(@statuses)
            ORDER BY "createdDate" DESC
            LIMIT 1
            """))
        {
            AddParameter(command, "sid", studentId);
            AddParameter(command, "statuses", CurrentPlanStatuses);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return null;
            }

            id = reader.GetString(0);
            status = reader.GetString(1);
            templateKey = reader.GetString(2);
            gapReport = ReadJson(reader, 3);
            warnings = ReadJson(reader, 4);
            rationale = reader.IsDBNull(5) ? null : reader.GetString(5);
            totalPlannedCredits = reader.IsDBNull(6) ? 0d : reader.GetDouble(6);
            submittedAt = reader.IsDBNull(7) ? null : TranscriptDataQuery.IsoZ(reader.GetDateTime(7));
            reviewNote = reader.IsDBNull(8) ? null : reader.GetString(8);
            createdDate = TranscriptDataQuery.IsoZ(reader.GetDateTime(9));
        }

        var items = new List<GraduationPlanItemDto>();
        await using (var command = Command(session, """
            SELECT "courseId", "courseCode", "courseName", "credits"::double precision, "gradeLevel", "term",
                   "category", "reason", "source", "sortOrder", "isActive"
            FROM "graduation_plan_items"
            WHERE "planId" = @pid
            ORDER BY "sortOrder" ASC
            """))
        {
            AddParameter(command, "pid", id);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                // `items.filter(i => i.isActive !== false)` — the include has no where clause, so soft-deleted
                // items are LOADED and dropped in the projection. Same result, same ordering.
                if (!reader.GetBoolean(10))
                {
                    continue;
                }

                items.Add(new GraduationPlanItemDto(
                    CourseId: reader.GetString(0),
                    CourseCode: reader.GetString(1),
                    CourseName: reader.GetString(2),
                    Credits: reader.IsDBNull(3) ? 0d : reader.GetDouble(3),
                    GradeLevel: reader.GetInt32(4),
                    Term: reader.IsDBNull(5) ? null : reader.GetString(5),
                    Category: reader.IsDBNull(6) ? null : reader.GetString(6),
                    Reason: reader.IsDBNull(7) ? null : reader.GetString(7),
                    Source: reader.GetString(8),
                    SortOrder: reader.GetInt32(9)));
            }
        }

        // `String(plan.templateKey).split(":")` -> [fieldKey, tier]; a key with no colon leaves tier undefined,
        // which the `|| "selective"` then supplies. A key with a THIRD segment is ignored, exactly as
        // destructuring two names off a longer array does.
        var parts = templateKey.Split(':');
        var fieldKey = parts[0];
        var tier = parts.Length > 1 && parts[1].Length > 0 ? parts[1] : RigorTemplates.TierSelective;

        return new GraduationPlanDto(
            Id: id,
            Status: status,
            TemplateKey: templateKey,
            TemplateLabel: RigorTemplates.ResolveTemplateLabel(fieldKey, tier),
            GapReport: gapReport,
            Warnings: warnings,
            Rationale: rationale,
            TotalPlannedCredits: totalPlannedCredits,
            SubmittedAt: submittedAt,
            ReviewNote: reviewNote,
            CreatedDate: createdDate,
            Items: items);
    }

    /// <summary>`plan.gapReport ?? []` — a SQL-NULL or a jsonb 'null' both become the empty array.</summary>
    internal static JsonElement ReadJson(DbDataReader reader, int ordinal)
    {
        if (reader.IsDBNull(ordinal))
        {
            return EmptyArray;
        }

        using var document = JsonDocument.Parse(reader.GetString(ordinal));
        return document.RootElement.ValueKind == JsonValueKind.Null
            ? EmptyArray
            : document.RootElement.Clone();
    }

    /// <summary>Same as <see cref="ReadJson"/> but null-preserving, for callers that need "absent" (gapReport
    /// on the supplemental rail, where a missing PLAN and an empty report are the same thing anyway).</summary>
    internal static JsonElement? ReadJsonOrNull(DbDataReader reader, int ordinal)
    {
        if (reader.IsDBNull(ordinal))
        {
            return null;
        }

        using var document = JsonDocument.Parse(reader.GetString(ordinal));
        return document.RootElement.ValueKind == JsonValueKind.Null ? null : document.RootElement.Clone();
    }

    internal static DbCommand Command(FormMapsDatabaseSession session, string sql) =>
        TranscriptDataQuery.Command(session, sql);

    internal static void AddParameter(DbCommand command, string name, object? value) =>
        TranscriptDataQuery.AddParameter(command, name, value);

    /// <summary>Same shape as SchoolStudentsReviewWriter's: TIMESTAMP(3) columns, so truncate to ms and strip
    /// the Kind (the column is `timestamp without time zone` and the value is already UTC).</summary>
    internal static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = System.Data.DbType.DateTime2;
        parameter.Value = DateTime.SpecifyKind(
            new DateTime(value.Ticks - (value.Ticks % TimeSpan.TicksPerMillisecond), value.Kind),
            DateTimeKind.Unspecified);
        command.Parameters.Add(parameter);
    }

    /// <summary>Prisma's <c>new Date()</c> / <c>now()</c> — UTC.</summary>
    internal static DateTime Now() => DateTime.UtcNow;

    /// <summary>JS <c>String.prototype.slice(0, n)</c> — UTF-16 code units, which is what C# indexes too.</summary>
    internal static string Slice(string value, int length) =>
        value.Length <= length ? value : value[..length];
}
