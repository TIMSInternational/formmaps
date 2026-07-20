using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Gradebook;

namespace FormMaps.Infrastructure.Gradebook;

/// <summary>
/// Gradebook transcript read — faithful port of routes/school-gradebook.ts GET /gradebook/students/:studentId
/// (gradebookService.listStudentGrades -> transcriptService.getTranscriptData). Runs under the caller's
/// read-only RLS session. Scoping (verifyStudentInSchool): the target's users.schoolId must equal the resolved
/// school AND roleName in {student,Student}, else null -> uniform 404. credits Decimal -> JSON number
/// (::double precision); GPA in double via <see cref="GpaComputation"/>; timestamps ISO-Z; grouped by
/// academicYear (null/empty -> "Unknown") in query order (academicYear DESC, semester ASC — Postgres default NULLS).
/// </summary>
public sealed class GradebookReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IGradebookReader
{
    // Legacy accepts both casings (case-sensitive equality against the literal set).
    private static readonly string[] StudentRoles = ["student", "Student"];

    public async Task<StudentTranscript?> GetStudentTranscriptAsync(
        RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // verifyStudentInSchool: !student || student.schoolId !== schoolId -> false; then roleName in {student,Student}.
        await using (var check = Command(session, """
            SELECT "schoolId", "roleName" FROM "users" WHERE "id" = @sid
            """))
        {
            AddParameter(check, "sid", studentId);
            await using var reader = await check.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return null;
            }

            var studentSchool = reader.IsDBNull(0) ? null : reader.GetString(0);
            var roleName = reader.IsDBNull(1) ? string.Empty : reader.GetString(1);
            if (studentSchool is null
                || !string.Equals(studentSchool, schoolId, StringComparison.Ordinal)
                || !StudentRoles.Contains(roleName, StringComparer.Ordinal))
            {
                return null;
            }
        }

        // grades: isActive only; academicYear DESC (NULLS FIRST), semester ASC (NULLS LAST) — Postgres defaults.
        var grades = new List<TranscriptGradeRow>();
        await using (var command = Command(session, """
            SELECT "id", "schoolId", "studentId", "courseId", "courseCode", "semester", "grade",
                   "credits"::double precision AS "credits", "status", "importJobId", "courseLevel",
                   "academicYear", "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
            FROM "student_grades"
            WHERE "studentId" = @sid AND "schoolId" = @school AND "isActive" = true
            ORDER BY "academicYear" DESC, "semester" ASC
            """))
        {
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
        }

        var (unweightedMap, weightBonuses) = await ResolveGpaConfigAsync(session, schoolId, cancellationToken);

        var gpa = GpaComputation.ComputeGpa(
            grades.Select(g => new GpaGradeInput(g.Grade, g.Credits, g.CourseLevel)),
            unweightedMap,
            weightBonuses);

        // groupByAcademicYear: null/empty -> "Unknown"; first-seen (query) order preserved for the object keys.
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

        return new StudentTranscript(byYear, gpa.GpaUnweighted, gpa.GpaWeighted, gpa.TotalCredits);
    }

    // resolveGpaConfig: use the stored jsonb when the column is present-and-non-null (even an empty object);
    // fall back to defaults when the row is missing or the column is SQL-null / jsonb 'null'. weightBonuses keys
    // are lowercased (values Number(v)); unweightedMap keys are used verbatim.
    private static async Task<(IReadOnlyDictionary<string, double> Unweighted, IReadOnlyDictionary<string, double> Bonuses)>
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
