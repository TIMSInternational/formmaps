using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Data;
using FormMaps.Application.Gradebook;

namespace FormMaps.Infrastructure.Gradebook;

/// <summary>
/// The shared body of legacy <c>services/transcriptService.ts</c> <c>getTranscriptData</c> /
/// <c>resolveGpaConfig</c> / <c>groupByAcademicYear</c> (transcriptService.ts:68-139).
///
/// EXTRACTED, NOT DUPLICATED (issue #55). <see cref="GradebookReader"/> already ported this exact query for
/// <c>routes/school-gradebook.ts</c> GET /gradebook/students/:studentId. <c>routes/transcript.ts</c> calls the
/// SAME <c>getTranscriptData</c> from two of its routes, so the query lives here and both readers call it — a
/// second, divergent GPA implementation is exactly what this refactor exists to prevent. The ONLY thing
/// GradebookReader keeps for itself is its <c>verifyStudentInSchool</c> gate, which transcript.ts does not have.
/// </summary>
public static class TranscriptDataQuery
{
    /// <summary>
    /// <c>prisma.studentGrade.findMany({ where:{ studentId, schoolId, isActive:true }, orderBy:[academicYear desc,
    /// semester asc] })</c>. credits Decimal -&gt; JSON number via ::double precision; timestamps ISO-Z.
    /// Postgres default NULL ordering (DESC =&gt; NULLS FIRST, ASC =&gt; NULLS LAST) matches Prisma's emitted SQL.
    /// </summary>
    public static async Task<List<TranscriptGradeRow>> LoadGradesAsync(
        FormMapsDatabaseSession session, string studentId, string schoolId, CancellationToken cancellationToken)
    {
        var grades = new List<TranscriptGradeRow>();
        await using var command = Command(session, """
            SELECT "id", "schoolId", "studentId", "courseId", "courseCode", "semester", "grade",
                   "credits"::double precision AS "credits", "status", "importJobId", "courseLevel",
                   "academicYear", "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
            FROM "student_grades"
            WHERE "studentId" = @sid AND "schoolId" = @school AND "isActive" = true
            ORDER BY "academicYear" DESC, "semester" ASC
            """);
        AddParameter(command, "sid", studentId);
        AddParameter(command, "school", schoolId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            grades.Add(new TranscriptGradeRow(
                Id: reader.GetString(0),
                SchoolId: reader.GetString(1),
                StudentId: reader.GetString(2),
                CourseId: reader.IsDBNull(3) ? null : reader.GetString(3),
                CourseCode: reader.IsDBNull(4) ? null : reader.GetString(4),
                Semester: reader.IsDBNull(5) ? null : reader.GetString(5),
                Grade: reader.IsDBNull(6) ? null : reader.GetString(6),
                Credits: reader.GetDouble(7),
                Status: reader.GetString(8),
                ImportJobId: reader.IsDBNull(9) ? null : reader.GetString(9),
                CourseLevel: reader.IsDBNull(10) ? null : reader.GetString(10),
                AcademicYear: reader.IsDBNull(11) ? null : reader.GetString(11),
                IsActive: reader.GetBoolean(12),
                CreatedBy: reader.IsDBNull(13) ? null : reader.GetString(13),
                CreatedDate: IsoZ(reader.GetDateTime(14)),
                UpdatedBy: reader.IsDBNull(15) ? null : reader.GetString(15),
                UpdatedAt: IsoZ(reader.GetDateTime(16))));
        }

        return grades;
    }

    /// <summary>
    /// <c>computeGpa</c> + <c>groupByAcademicYear</c> over an already-loaded grade list. byYear keys are in
    /// first-seen (query) order; a null/empty academicYear collapses to the literal key "Unknown".
    /// </summary>
    public static StudentTranscript BuildTranscript(
        IReadOnlyList<TranscriptGradeRow> grades,
        IReadOnlyDictionary<string, double> unweightedMap,
        IReadOnlyDictionary<string, double> weightBonuses)
    {
        var gpa = GpaComputation.ComputeGpa(
            grades.Select(g => new GpaGradeInput(g.Grade, g.Credits, g.CourseLevel)),
            unweightedMap,
            weightBonuses);

        var byYear = GroupByAcademicYear(grades);
        return new StudentTranscript(byYear, gpa.GpaUnweighted, gpa.GpaWeighted, gpa.TotalCredits);
    }

    /// <summary>
    /// <c>groupByAcademicYear</c>: null/empty academicYear -&gt; the literal key "Unknown"; keys in first-seen
    /// (query) order. Exposed separately because <c>computeAndPersistGpa</c> / <c>computeClassRanks</c> reuse
    /// the grouping to build <c>yearlyBreakdown</c> without needing a full transcript.
    /// </summary>
    public static Dictionary<string, IReadOnlyList<TranscriptGradeRow>> GroupByAcademicYear(
        IReadOnlyList<TranscriptGradeRow> grades)
    {
        var order = new List<string>();
        var buckets = new Dictionary<string, List<TranscriptGradeRow>>(StringComparer.Ordinal);
        foreach (var g in grades)
        {
            var key = string.IsNullOrEmpty(g.AcademicYear) ? "Unknown" : g.AcademicYear;
            if (!buckets.TryGetValue(key, out var list))
            {
                list = [];
                buckets[key] = list;
                order.Add(key);
            }

            list.Add(g);
        }

        var byYear = new Dictionary<string, IReadOnlyList<TranscriptGradeRow>>(StringComparer.Ordinal);
        foreach (var key in order)
        {
            byYear[key] = buckets[key];
        }

        return byYear;
    }

    /// <summary>
    /// <c>resolveGpaConfig</c>: use the stored jsonb when the column is present-and-non-null (even an empty
    /// object); fall back to the defaults when the row is missing or the column is SQL-null / jsonb 'null'.
    /// weightBonuses keys are lowercased (computeGpa looks them up by courseLevel.toLowerCase());
    /// unweightedMap keys are used verbatim.
    /// </summary>
    public static async Task<(IReadOnlyDictionary<string, double> Unweighted, IReadOnlyDictionary<string, double> Bonuses)>
        ResolveGpaConfigAsync(FormMapsDatabaseSession session, string schoolId, CancellationToken cancellationToken)
    {
        string? unweightedJson = null, bonusesJson = null;
        await using (var command = Command(session, """
            SELECT "unweightedMap"::text, "weightBonuses"::text FROM "gpa_configurations" WHERE "schoolId" = @school
            """))
        {
            AddParameter(command, "school", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                unweightedJson = reader.IsDBNull(0) ? null : reader.GetString(0);
                bonusesJson = reader.IsDBNull(1) ? null : reader.GetString(1);
            }
        }

        var unweighted = ParseNumberMap(unweightedJson) ?? GpaComputation.DefaultUnweightedMap;
        var rawBonuses = ParseNumberMap(bonusesJson) ?? GpaComputation.DefaultWeightBonuses;

        var bonuses = new Dictionary<string, double>(StringComparer.Ordinal);
        foreach (var (key, value) in rawBonuses)
        {
            bonuses[key.ToLowerInvariant()] = value;
        }

        return (unweighted, bonuses);
    }

    // Parse a jsonb number map. Returns null for a SQL-null / non-object (jsonb 'null') / parse failure — which
    // the caller treats as JS-falsy -> use the default map. A present object (even empty) is returned as-is.
    private static IReadOnlyDictionary<string, double>? ParseNumberMap(string? json)
    {
        if (string.IsNullOrEmpty(json))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            var map = new Dictionary<string, double>(StringComparer.Ordinal);
            foreach (var property in document.RootElement.EnumerateObject())
            {
                if (property.Value.ValueKind == JsonValueKind.Number && property.Value.TryGetDouble(out var number))
                {
                    map[property.Name] = number;
                }
                else if (property.Value.ValueKind == JsonValueKind.String
                    && double.TryParse(property.Value.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed))
                {
                    map[property.Name] = parsed;
                }
            }

            return map;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    // ---------------------------------------------------------------- npgsql helpers (shared)

    public static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    public static void AddParameter(DbCommand command, string name, object? value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value ?? DBNull.Value;
        command.Parameters.Add(parameter);
    }

    public static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
