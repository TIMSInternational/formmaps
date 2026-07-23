using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Prerequisites;

namespace FormMaps.Infrastructure.Prerequisites;

/// <summary>
/// Prerequisites reads (FM-DOTNET-057 — routes/school-courses.ts). Faithful port of schoolCoursesService.ts
/// getPrerequisiteChain / resolveCourse / checkEligibility / computeEligibilityMap. Read-only RLS session; all SQL
/// parameterized; credits raw Prisma Decimal → JSON STRING via <c>trim_scale("credits")::text</c> (decimal.js parity,
/// FM-054 precedent). text[] passthrough verbatim; catalog code keys are UPPER-cased (matching the eligibility engine).
/// </summary>
public sealed class PrerequisitesReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IPrerequisitesReader
{
    // ---------------------------------------------------------------- getPrerequisiteChain

    public async Task<PrerequisiteChainResult?> GetPrerequisiteChainAsync(
        RequestContext context, string schoolId, string courseId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // Course by id; null OR wrong school → 404 (return null). Need id, code, prerequisites.
        string courseCode;
        string[] rootPrereqs;
        await using (var command = Command(session, """
            SELECT "id", "schoolId", "code", "prerequisites" FROM "school_courses" WHERE "id" = @id
            """))
        {
            AddParameter(command, "id", courseId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return null;
            }

            if (reader.GetString(1) != schoolId)
            {
                return null;
            }

            courseCode = reader.GetString(2);
            rootPrereqs = reader.IsDBNull(3) ? [] : reader.GetFieldValue<string[]>(3);
        }

        // Active-catalog index by UPPER(code). credits as trim_scale STRING.
        var byCode = new Dictionary<string, CatalogNode>(StringComparer.Ordinal);
        await using (var command = Command(session, """
            SELECT "code", "name", "department", trim_scale("credits")::text AS "credits",
                   "prerequisites", "frameworkType", "isHonors"
            FROM "school_courses"
            WHERE "schoolId" = @sid AND "isActive" = true
            """))
        {
            AddParameter(command, "sid", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var node = new CatalogNode(
                    Code: reader.GetString(0),
                    Name: reader.GetString(1),
                    Department: reader.GetString(2),
                    Credits: reader.GetString(3),
                    Prerequisites: reader.IsDBNull(4) ? [] : reader.GetFieldValue<string[]>(4),
                    FrameworkType: reader.IsDBNull(5) ? null : reader.GetString(5),
                    IsHonors: reader.GetBoolean(6));
                byCode[node.Code.ToUpperInvariant()] = node; // last-wins on dup UPPER codes (JS Map semantics)
            }
        }

        // BFS from the root prerequisites (depth 1). visited keyed by UPPER; chain built in insertion order.
        var chain = new List<PrerequisiteChainEntry>();
        var visited = new HashSet<string>(StringComparer.Ordinal);
        var queue = new Queue<(string[] Codes, int Depth)>();
        queue.Enqueue((rootPrereqs, 1));

        while (queue.Count > 0)
        {
            var (codes, depth) = queue.Dequeue();
            foreach (var code in codes)
            {
                var upper = code.ToUpperInvariant();
                if (!visited.Add(upper))
                {
                    continue;
                }

                if (byCode.TryGetValue(upper, out var prereq))
                {
                    chain.Add(new PrerequisiteChainEntry(
                        Code: prereq.Code, Name: prereq.Name, Department: prereq.Department,
                        Credits: prereq.Credits, Depth: depth, FrameworkType: prereq.FrameworkType,
                        IsHonors: prereq.IsHonors));
                    if (prereq.Prerequisites.Length > 0)
                    {
                        queue.Enqueue((prereq.Prerequisites, depth + 1));
                    }
                }
                else
                {
                    // Unresolved code: name = code, department = "", credits = NUMBER 0 (not "0"), no framework, not honors.
                    chain.Add(new PrerequisiteChainEntry(
                        Code: code, Name: code, Department: "", Credits: 0, Depth: depth,
                        FrameworkType: null, IsHonors: false));
                }
            }
        }

        // depth DESC, STABLE (OrderByDescending is a stable sort → ties keep BFS insertion order, matching JS sort).
        var ordered = chain.OrderByDescending(c => c.Depth).ToList();
        var totalDepth = ordered.Count > 0 ? ordered.Max(c => c.Depth) : 0;
        return new PrerequisiteChainResult(courseId, courseCode, ordered, totalDepth);
    }

    // ---------------------------------------------------------------- checkEligibility (check + missing)

    public async Task<EligibilityResult> CheckEligibilityAsync(
        RequestContext context, string schoolId, string studentId, string courseIdOrCode,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var student = await LoadStudentAsync(session, studentId, schoolId, cancellationToken);
        if (student is null)
        {
            return EligibilityResult.StudentNotFound();
        }

        var course = await ResolveCourseAsync(session, schoolId, courseIdOrCode, cancellationToken);
        if (course is null)
        {
            return EligibilityResult.CourseNotFound();
        }

        var errors = new List<string>();
        var missing = new List<MissingPrerequisite>();

        AddGradeGateError(student.GradeLevel, course.GradeLevels, errors);

        if (course.Prerequisites.Length == 0)
        {
            return new EligibilityResult(
                PrerequisiteLookupOutcome.Ok, student.Id, course.Id, course.Code, course.Name,
                Eligible: errors.Count == 0, errors, missing);
        }

        var byCode = await LoadCatalogByCodeAsync(session, schoolId, cancellationToken);
        var completedIds = await LoadCompletedCourseIdsAsync(session, schoolId, student.Id, cancellationToken);

        EvaluatePrerequisites(course.Prerequisites, byCode, completedIds, missing, errors);

        return new EligibilityResult(
            PrerequisiteLookupOutcome.Ok, student.Id, course.Id, course.Code, course.Name,
            Eligible: errors.Count == 0 && missing.Count == 0, errors, missing);
    }

    // ---------------------------------------------------------------- computeEligibilityMap (eligible)

    public async Task<EligibleMapResult> ComputeEligibleAsync(
        RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var student = await LoadStudentAsync(session, studentId, schoolId, cancellationToken);
        if (student is null)
        {
            return EligibleMapResult.StudentNotFound();
        }

        // FULL catalog (resolution set — includes inactive/draft so a prereq completed via a retired course counts).
        var catalog = new List<EligibilityCourse>();
        await using (var command = Command(session, """
            SELECT "id", "code", "name", "department", trim_scale("credits")::text AS "credits",
                   "gradeLevels", "prerequisites", "isActive", "status"
            FROM "school_courses"
            WHERE "schoolId" = @sid
            """))
        {
            AddParameter(command, "sid", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                catalog.Add(new EligibilityCourse(
                    Id: reader.GetString(0),
                    Code: reader.GetString(1),
                    Name: reader.GetString(2),
                    Department: reader.GetString(3),
                    Credits: reader.GetString(4),
                    GradeLevels: reader.IsDBNull(5) ? [] : reader.GetFieldValue<int[]>(5),
                    Prerequisites: reader.IsDBNull(6) ? [] : reader.GetFieldValue<string[]>(6),
                    IsActive: reader.GetBoolean(7),
                    Status: reader.GetString(8)));
            }
        }

        var completedIds = await LoadCompletedCourseIdsAsync(session, schoolId, student.Id, cancellationToken);

        // Resolution index = ALL catalog by UPPER(code). Enumeration = active AND status='active' only.
        var byCode = new Dictionary<string, EligibilityCourse>(StringComparer.Ordinal);
        foreach (var c in catalog)
        {
            byCode[c.Code.ToUpperInvariant()] = c;
        }

        var candidates = new List<EligibleCandidate>();
        foreach (var course in catalog)
        {
            if (!(course.IsActive && course.Status == "active"))
            {
                continue;
            }

            var errors = new List<string>();
            var missing = new List<MissingPrerequisite>();
            AddGradeGateError(student.GradeLevel, course.GradeLevels, errors);
            EvaluatePrerequisites(course.Prerequisites, byCode, completedIds, missing, errors);

            candidates.Add(new EligibleCandidate(
                CourseId: course.Id, CourseCode: course.Code, CourseName: course.Name, Department: course.Department,
                Credits: course.Credits, GradeLevels: course.GradeLevels,
                Eligible: errors.Count == 0 && missing.Count == 0));
        }

        return new EligibleMapResult(PrerequisiteLookupOutcome.Ok, candidates);
    }

    // ---------------------------------------------------------------- shared eligibility helpers

    // JS `if (student.gradeLevel && course.gradeLevels?.length > 0 && !includes)` — gradeLevel 0/null is FALSY (skipped).
    private static void AddGradeGateError(int? gradeLevel, IReadOnlyList<int> gradeLevels, List<string> errors)
    {
        if (gradeLevel is not null && gradeLevel.Value != 0 && gradeLevels.Count > 0 && !gradeLevels.Contains(gradeLevel.Value))
        {
            errors.Add($"Not available for grade {gradeLevel.Value}");
        }
    }

    private static void EvaluatePrerequisites(
        IReadOnlyList<string> prerequisites,
        IReadOnlyDictionary<string, EligibilityCourse> byCode,
        IReadOnlySet<string> completedIds,
        List<MissingPrerequisite> missing,
        List<string> errors)
    {
        foreach (var prereqCode in prerequisites)
        {
            if (string.IsNullOrEmpty(prereqCode) || string.IsNullOrEmpty(prereqCode.Trim()))
            {
                continue;
            }

            if (!byCode.TryGetValue(prereqCode.Trim().ToUpperInvariant(), out var prereq))
            {
                missing.Add(new MissingPrerequisite(prereqCode, "Not in catalog"));
                errors.Add($"Missing: {prereqCode}");
                continue;
            }

            if (!completedIds.Contains(prereq.Id))
            {
                missing.Add(new MissingPrerequisite(prereq.Code, prereq.Name));
                errors.Add($"Missing: {prereq.Name}");
            }
        }
    }

    private static async Task<StudentRow?> LoadStudentAsync(
        FormMapsDatabaseSession session, string studentId, string callerSchoolId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT "id", "schoolId", "gradeLevel" FROM "users" WHERE "id" = @id
            """);
        AddParameter(command, "id", studentId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        var studentSchool = reader.IsDBNull(1) ? null : reader.GetString(1);
        if (studentSchool != callerSchoolId)
        {
            return null; // cross-school (or no school) → 404 "Student not found"
        }

        var gradeLevel = reader.IsDBNull(2) ? (int?)null : reader.GetInt32(2);
        return new StudentRow(reader.GetString(0), gradeLevel);
    }

    // resolveCourse: findUnique by id (any school) → if it belongs to THIS school, use it; else findFirst by EXACT
    // (case-sensitive) code in this school. null → 404.
    private static async Task<EligibilityCourse?> ResolveCourseAsync(
        FormMapsDatabaseSession session, string schoolId, string courseIdOrCode, CancellationToken cancellationToken)
    {
        await using (var byIdCommand = Command(session, $"""
            SELECT {ResolveColumns} FROM "school_courses" WHERE "id" = @id
            """))
        {
            AddParameter(byIdCommand, "id", courseIdOrCode);
            await using var reader = await byIdCommand.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken) && reader.GetString(SchoolIdOrdinal) == schoolId)
            {
                return ReadResolveRow(reader);
            }
        }

        await using (var byCodeCommand = Command(session, $"""
            SELECT {ResolveColumns} FROM "school_courses" WHERE "schoolId" = @sid AND "code" = @code LIMIT 1
            """))
        {
            AddParameter(byCodeCommand, "sid", schoolId);
            AddParameter(byCodeCommand, "code", courseIdOrCode);
            await using var reader = await byCodeCommand.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                return ReadResolveRow(reader);
            }
        }

        return null;
    }

    private static async Task<Dictionary<string, EligibilityCourse>> LoadCatalogByCodeAsync(
        FormMapsDatabaseSession session, string schoolId, CancellationToken cancellationToken)
    {
        var byCode = new Dictionary<string, EligibilityCourse>(StringComparer.Ordinal);
        await using var command = Command(session, """
            SELECT "id", "code", "name" FROM "school_courses" WHERE "schoolId" = @sid
            """);
        AddParameter(command, "sid", schoolId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var course = new EligibilityCourse(
                Id: reader.GetString(0), Code: reader.GetString(1), Name: reader.GetString(2),
                Department: "", Credits: "", GradeLevels: [], Prerequisites: [], IsActive: true, Status: "active");
            byCode[course.Code.ToUpperInvariant()] = course; // last-wins on dup UPPER codes (JS Map)
        }

        return byCode;
    }

    private static async Task<HashSet<string>> LoadCompletedCourseIdsAsync(
        FormMapsDatabaseSession session, string schoolId, string studentId, CancellationToken cancellationToken)
    {
        var completed = new HashSet<string>(StringComparer.Ordinal);
        await using var command = Command(session, """
            SELECT "courseId" FROM "student_grades"
            WHERE "schoolId" = @sid AND "studentId" = @student AND "status" = 'completed' AND "isActive" = true
            """);
        AddParameter(command, "sid", schoolId);
        AddParameter(command, "student", studentId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            completed.Add(reader.GetString(0));
        }

        return completed;
    }

    private const string ResolveColumns = "\"id\", \"schoolId\", \"code\", \"name\", \"gradeLevels\", \"prerequisites\"";
    private const int SchoolIdOrdinal = 1;

    private static EligibilityCourse ReadResolveRow(DbDataReader reader) => new(
        Id: reader.GetString(0),
        Code: reader.GetString(2),
        Name: reader.GetString(3),
        Department: "",
        Credits: "",
        GradeLevels: reader.IsDBNull(4) ? [] : reader.GetFieldValue<int[]>(4),
        Prerequisites: reader.IsDBNull(5) ? [] : reader.GetFieldValue<string[]>(5),
        IsActive: true,
        Status: "active");

    // ---------------------------------------------------------------- npgsql plumbing

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

    private sealed record CatalogNode(
        string Code, string Name, string Department, string Credits, string[] Prerequisites,
        string? FrameworkType, bool IsHonors);

    private sealed record StudentRow(string Id, int? GradeLevel);

    private sealed record EligibilityCourse(
        string Id, string Code, string Name, string Department, string Credits,
        int[] GradeLevels, string[] Prerequisites, bool IsActive, string Status);
}
