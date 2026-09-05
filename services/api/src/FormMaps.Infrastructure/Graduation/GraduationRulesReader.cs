using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Graduation;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Gradebook;

namespace FormMaps.Infrastructure.Graduation;

/// <summary>
/// Reads for the graduation half of routes/school-grades.ts (issue #55), faithful to
/// <c>services/schoolGradesService.ts</c> lines 198-473. Runs under the caller's read-only RLS session.
///
/// Two shapes recur and both are legacy quirks worth naming:
///   * every Decimal on the rule-set tree is emitted UNCOERCED, i.e. as a decimal.js string
///     (<see cref="PrismaDecimalText"/>), while the derived progress/gap numbers ARE plain JS numbers because
///     they go through <c>Number()</c> in the service;
///   * per-category credit buckets are keyed by category NAME, so two requirements sharing a name share a
///     bucket. Reproduced with a name-keyed dictionary rather than quietly de-duplicated.
/// </summary>
public sealed class GraduationRulesReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IGraduationRulesReader
{
    private static readonly string[] StudentRoleNames = ["Student", "student"];

    // ---------------------------------------------------------------- GET /graduation/rules

    public async Task<GraduationRuleSetRow?> GetRulesAsync(
        RequestContext context, string schoolId, string? academicYearId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var yearId = academicYearId;
        if (string.IsNullOrEmpty(yearId))
        {
            yearId = await CurrentAcademicYearIdAsync(session, schoolId, cancellationToken);
        }

        // `yearId = current?.id || ""` then `if (!yearId) return null` — no current year means no rules.
        if (string.IsNullOrEmpty(yearId))
        {
            return null;
        }

        return await LoadRuleSetAsync(session, schoolId, yearId, cancellationToken);
    }

    // ---------------------------------------------------------------- GET /graduation/progress

    public async Task<GraduationProgressPage> GetProgressListAsync(
        RequestContext context, string schoolId, int page, int limit, string? status, string? sortBy,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var empty = new GraduationProgressPage([], 0, page, limit, 0);

        var yearId = await CurrentAcademicYearIdAsync(session, schoolId, cancellationToken);
        if (string.IsNullOrEmpty(yearId))
        {
            return empty;
        }

        var creditsRequired = await ActiveRuleSetTotalCreditsAsync(session, schoolId, yearId, cancellationToken);
        if (creditsRequired is null)
        {
            return empty;
        }

        // users(schoolId, roleName IN ('Student','student')) — no ORDER BY in legacy, so none here: the sort
        // below is what orders the page, and ties keep whatever order the scan produced (JS sort is stable).
        var students = new List<(string Id, string Name, int? GradeLevel)>();
        await using (var command = Command(session, """
            SELECT "id", "name", "gradeLevel" FROM "users"
            WHERE "schoolId" = @school AND "roleName" = ANY(@roles)
            """))
        {
            AddParameter(command, "school", schoolId);
            AddParameter(command, "roles", StudentRoleNames);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                students.Add((
                    reader.GetString(0),
                    reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
                    reader.IsDBNull(2) ? null : reader.GetInt32(2)));
            }
        }

        if (students.Count == 0)
        {
            return new GraduationProgressPage([], 0, page, limit, 0);
        }

        var studentIds = students.Select(s => s.Id).ToArray();

        // Completed, active grades for the whole roster; then the school's WHOLE course catalog (no isActive /
        // status filter here — legacy's courseCreditMap is unfiltered, unlike gap-analysis' candidate list).
        var grades = new List<(string StudentId, string? CourseId, double Credits)>();
        await using (var command = Command(session, """
            SELECT "studentId", "courseId", "credits"::double precision
            FROM "student_grades"
            WHERE "schoolId" = @school AND "studentId" = ANY(@ids) AND "status" = 'completed' AND "isActive" = true
            """))
        {
            AddParameter(command, "school", schoolId);
            AddParameter(command, "ids", studentIds);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                grades.Add((
                    reader.GetString(0),
                    reader.IsDBNull(1) ? null : reader.GetString(1),
                    reader.IsDBNull(2) ? 0d : reader.GetDouble(2)));
            }
        }

        var courseCredits = new Dictionary<string, double>(StringComparer.Ordinal);
        await using (var command = Command(session, """
            SELECT "id", "credits"::double precision FROM "school_courses" WHERE "schoolId" = @school
            """))
        {
            AddParameter(command, "school", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                courseCredits[reader.GetString(0)] = reader.IsDBNull(1) ? 0d : reader.GetDouble(1);
            }
        }

        var gradesByStudent = grades
            .GroupBy(g => g.StudentId, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.Ordinal);

        var results = new List<GraduationProgressListRow>(students.Count);
        foreach (var student in students)
        {
            var owned = gradesByStudent.TryGetValue(student.Id, out var list) ? list : [];

            // Number(g.credits) > 0 ? that : (courseCreditMap.get(g.courseId) || 0) — the grade's own credits win
            // when positive, otherwise the catalog's, otherwise nothing.
            var creditsCompleted = owned.Sum(g => g.Credits > 0
                ? g.Credits
                : g.CourseId is not null && courseCredits.TryGetValue(g.CourseId, out var c) ? c : 0d);

            var progressPercent = creditsRequired.Value > 0
                ? (int)Math.Min(100d, JsRound(creditsCompleted / creditsRequired.Value * 100d))
                : 0;

            results.Add(new GraduationProgressListRow(
                student.Id,
                student.Name,
                student.GradeLevel,
                creditsCompleted,
                creditsRequired.Value,
                progressPercent,
                progressPercent >= 75 ? "on_track" : progressPercent >= 50 ? "at_risk" : "off_track"));
        }

        IEnumerable<GraduationProgressListRow> filtered = results;
        if (!string.IsNullOrEmpty(status))
        {
            filtered = filtered.Where(r => string.Equals(r.Status, status, StringComparison.Ordinal));
        }

        var list2 = filtered.ToList();

        // sortBy === "name" -> localeCompare, else progressPercent DESC. LINQ OrderBy is stable, as is JS sort.
        // InvariantCulture is the closest .NET equivalent of Node's default (ICU root) collation; the ordering
        // difference is confined to non-ASCII names and is documented rather than silently normalized.
        var sorted = string.Equals(sortBy, "name", StringComparison.Ordinal)
            ? list2.OrderBy(r => r.StudentName ?? string.Empty, StringComparer.InvariantCulture).ToList()
            : list2.OrderByDescending(r => r.ProgressPercent).ToList();

        var total = sorted.Count;
        var paged = sorted.Skip((page - 1) * limit).Take(limit).ToList();

        return new GraduationProgressPage(paged, total, page, limit, (int)Math.Ceiling((double)total / limit));
    }

    // ---------------------------------------------------------------- GET /graduation/progress/:studentId

    public async Task<StudentGraduationProgress> GetStudentProgressAsync(
        RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var student = await LoadStudentAsync(session, studentId, schoolId, cancellationToken);
        if (student is null)
        {
            return NotFoundProgress();
        }

        var yearId = await CurrentAcademicYearIdAsync(session, schoolId, cancellationToken);
        if (string.IsNullOrEmpty(yearId))
        {
            return MessageProgress(studentId, "No active academic year");
        }

        var ruleSet = await LoadRuleSetAsync(session, schoolId, yearId, cancellationToken);
        if (ruleSet is null)
        {
            return MessageProgress(studentId, "No graduation rules");
        }

        var (catCredits, totalCreditsEarned) = await RollUpCategoryCreditsAsync(
            session, schoolId, studentId, ruleSet.CategoryRequirements, cancellationToken);

        var totalCreditsRequired = ToNumber(ruleSet.TotalCreditsRequired);
        var overallProgress = totalCreditsRequired > 0
            ? JsRound(totalCreditsEarned / totalCreditsRequired * 1000d) / 10d
            : 0d;

        var categoryProgress = ruleSet.CategoryRequirements.Select(c =>
        {
            var earned = catCredits.TryGetValue(c.Category, out var e) ? e : 0d;
            var required = ToNumber(c.MinCredits);
            return new CategoryProgress(
                c.Category,
                earned,
                required,
                required > 0 ? JsRound(earned / required * 1000d) / 10d : 0d,
                earned >= required);
        }).ToList();

        var specialProgress = ruleSet.SpecialRequirements
            .Select(s => new SpecialRequirementProgress(
                s.Id, s.Name, s.Type, ToNumber(s.Value), s.Unit, false, "Manual tracking"))
            .ToList();

        return new StudentGraduationProgress(
            GraduationProgressOutcome.Ok,
            student.Value.Id,
            null,
            student.Value.Name,
            ruleSet.Id,
            totalCreditsEarned,
            totalCreditsRequired,
            overallProgress,
            overallProgress >= 75 && categoryProgress.All(c => c.Met),
            categoryProgress,
            specialProgress);
    }

    // ---------------------------------------------------------------- GET /graduation/gap-analysis/:studentId

    public async Task<GapAnalysis> GetGapAnalysisAsync(
        RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var student = await LoadStudentAsync(session, studentId, schoolId, cancellationToken);
        if (student is null)
        {
            return new GapAnalysis(GapAnalysisOutcome.NotFound, null, null, null, [], [], null);
        }

        var yearId = await CurrentAcademicYearIdAsync(session, schoolId, cancellationToken);
        if (string.IsNullOrEmpty(yearId))
        {
            return EmptyGap(studentId);
        }

        // Legacy's gap-analysis include names only categoryRequirements. The shared loader also fetches the
        // special requirements, which costs one query this route does not need — but gap-analysis never puts
        // them in its response, so the OUTPUT is identical and one rule-set loader stays one loader.
        var ruleSet = await LoadRuleSetAsync(session, schoolId, yearId, cancellationToken);
        if (ruleSet is null)
        {
            return EmptyGap(studentId);
        }

        var (catCredits, _, completedCourseIds) = await RollUpWithCompletedIdsAsync(
            session, schoolId, studentId, ruleSet.CategoryRequirements, cancellationToken);

        var gaps = ruleSet.CategoryRequirements
            .Select(c =>
            {
                var earned = catCredits.TryGetValue(c.Category, out var e) ? e : 0d;
                var required = ToNumber(c.MinCredits);
                return new { c.Category, Earned = earned, Required = required, Needed = required - earned };
            })
            .Where(g => g.Needed > 0)
            .Select(g => new CategoryGap(g.Category, g.Earned, g.Required, g.Needed, g.Needed >= 2 ? "high" : "medium"))
            .ToList();

        // The candidate catalog IS filtered (isActive + status='active'), unlike the progress list's credit map.
        var catalog = new List<(string Id, string Code, string Name, double Credits, string? Department)>();
        await using (var command = Command(session, """
            SELECT "id", "code", "name", "credits"::double precision, "department"
            FROM "school_courses"
            WHERE "schoolId" = @school AND "isActive" = true AND "status" = 'active'
            """))
        {
            AddParameter(command, "school", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                catalog.Add((
                    reader.GetString(0),
                    reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
                    reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                    reader.IsDBNull(3) ? 0d : reader.GetDouble(3),
                    reader.IsDBNull(4) ? null : reader.GetString(4)));
            }
        }

        var recommendations = gaps
            .Select(gap =>
            {
                // `categories.find(c => c.category === gap.category)!` — the FIRST requirement with that name,
                // which matters when two requirements share one (see the bucket note on this class).
                var requirement = ruleSet.CategoryRequirements.First(c =>
                    string.Equals(c.Category, gap.Category, StringComparison.Ordinal));

                var candidates = catalog
                    .Where(c => !completedCourseIds.Contains(c.Id)
                        && GradMatch.CourseMatchesCategory(c.Code, c.Department, requirement.Category, requirement.RequiredCourses))
                    .Take(5)
                    .Select(c => new SuggestedCourse(c.Id, c.Code, c.Name, c.Credits, c.Department))
                    .ToList();

                return new GapRecommendation(gap.Category, gap.Needed, candidates);
            })
            .Where(r => r.SuggestedCourses.Count > 0)
            .ToList();

        return new GapAnalysis(
            GapAnalysisOutcome.Ok,
            student.Value.Id,
            student.Value.Name,
            ruleSet.Id,
            gaps,
            recommendations,
            gaps.Count == 0
                ? "On track for all categories"
                : $"Needs attention in {gaps.Count} categor{(gaps.Count == 1 ? "y" : "ies")}");
    }

    // ---------------------------------------------------------------- shared query pieces

    internal static async Task<string?> CurrentAcademicYearIdAsync(
        FormMapsDatabaseSession session, string schoolId, CancellationToken cancellationToken)
    {
        // findFirst({ where:{ schoolId, isCurrent:true } }) — no ORDER BY in legacy either.
        await using var command = Command(session, """
            SELECT "id" FROM "academic_years" WHERE "schoolId" = @school AND "isCurrent" = true LIMIT 1
            """);
        AddParameter(command, "school", schoolId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? reader.GetString(0) : null;
    }

    private static async Task<double?> ActiveRuleSetTotalCreditsAsync(
        FormMapsDatabaseSession session, string schoolId, string yearId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT "totalCreditsRequired"::double precision FROM "graduation_rule_sets"
            WHERE "schoolId" = @school AND "academicYearId" = @year AND "isActive" = true LIMIT 1
            """);
        AddParameter(command, "school", schoolId);
        AddParameter(command, "year", yearId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return reader.IsDBNull(0) ? 0d : reader.GetDouble(0);
    }

    private static async Task<GraduationRuleSetRow?> LoadRuleSetAsync(
        FormMapsDatabaseSession session, string schoolId, string yearId, CancellationToken cancellationToken)
    {
        string id, totalCredits, createdDate, updatedAt;
        string? createdBy, updatedBy;
        bool isActive;

        await using (var command = Command(session, """
            SELECT "id", "totalCreditsRequired"::text, "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
            FROM "graduation_rule_sets"
            WHERE "schoolId" = @school AND "academicYearId" = @year AND "isActive" = true
            LIMIT 1
            """))
        {
            AddParameter(command, "school", schoolId);
            AddParameter(command, "year", yearId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return null;
            }

            id = reader.GetString(0);
            totalCredits = PrismaDecimalText.Normalize(reader.GetString(1));
            isActive = reader.GetBoolean(2);
            createdBy = reader.IsDBNull(3) ? null : reader.GetString(3);
            createdDate = TranscriptDataQuery.IsoZ(reader.GetDateTime(4));
            updatedBy = reader.IsDBNull(5) ? null : reader.GetString(5);
            updatedAt = TranscriptDataQuery.IsoZ(reader.GetDateTime(6));
        }

        var categories = new List<CategoryRequirementRow>();
        await using (var command = Command(session, """
            SELECT "id", "ruleSetId", "category", "minCredits"::text, "requiredCourses", "electivesAllowed",
                   "sortOrder", "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
            FROM "category_requirements"
            WHERE "ruleSetId" = @id AND "isActive" = true
            ORDER BY "sortOrder" ASC
            """))
        {
            AddParameter(command, "id", id);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                categories.Add(new CategoryRequirementRow(
                    reader.GetString(0),
                    reader.GetString(1),
                    reader.GetString(2),
                    PrismaDecimalText.Normalize(reader.GetString(3)),
                    reader.IsDBNull(4) ? [] : reader.GetFieldValue<string[]>(4),
                    reader.GetBoolean(5),
                    reader.GetInt32(6),
                    reader.GetBoolean(7),
                    reader.IsDBNull(8) ? null : reader.GetString(8),
                    TranscriptDataQuery.IsoZ(reader.GetDateTime(9)),
                    reader.IsDBNull(10) ? null : reader.GetString(10),
                    TranscriptDataQuery.IsoZ(reader.GetDateTime(11))));
            }
        }

        // specialRequirements has NO orderBy in legacy's include, so none here (the model has no sortOrder).
        var specials = new List<SpecialRequirementRow>();
        await using (var command = Command(session, """
            SELECT "id", "ruleSetId", "name", "type", "value"::text, "unit", "description",
                   "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
            FROM "special_requirements"
            WHERE "ruleSetId" = @id AND "isActive" = true
            """))
        {
            AddParameter(command, "id", id);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                specials.Add(new SpecialRequirementRow(
                    reader.GetString(0),
                    reader.GetString(1),
                    reader.GetString(2),
                    reader.GetString(3),
                    PrismaDecimalText.Normalize(reader.GetString(4)),
                    reader.IsDBNull(5) ? null : reader.GetString(5),
                    reader.IsDBNull(6) ? null : reader.GetString(6),
                    reader.GetBoolean(7),
                    reader.IsDBNull(8) ? null : reader.GetString(8),
                    TranscriptDataQuery.IsoZ(reader.GetDateTime(9)),
                    reader.IsDBNull(10) ? null : reader.GetString(10),
                    TranscriptDataQuery.IsoZ(reader.GetDateTime(11))));
            }
        }

        return new GraduationRuleSetRow(
            id, schoolId, yearId, totalCredits, isActive, createdBy, createdDate, updatedBy, updatedAt,
            categories, specials);
    }

    // findUnique(users) then `!student || student.schoolId !== schoolId` -> not_found. Note this is an EXISTENCE
    // + school check on users, NOT a roleName check: a counselor id in the same school reaches the Ok branch
    // with zero grades. Ported as written.
    private static async Task<(string Id, string Name)?> LoadStudentAsync(
        FormMapsDatabaseSession session, string studentId, string schoolId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "id", "name", "schoolId" FROM "users" WHERE "id" = @id""");
        AddParameter(command, "id", studentId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        var rowSchool = reader.IsDBNull(2) ? null : reader.GetString(2);
        if (!string.Equals(rowSchool, schoolId, StringComparison.Ordinal))
        {
            return null;
        }

        return (reader.GetString(0), reader.IsDBNull(1) ? string.Empty : reader.GetString(1));
    }

    private static async Task<(Dictionary<string, double> CatCredits, double Total)> RollUpCategoryCreditsAsync(
        FormMapsDatabaseSession session, string schoolId, string studentId,
        IReadOnlyList<CategoryRequirementRow> categories, CancellationToken cancellationToken)
    {
        var (credits, total, _) = await RollUpWithCompletedIdsAsync(
            session, schoolId, studentId, categories, cancellationToken);
        return (credits, total);
    }

    /// <summary>
    /// The credit rollup both /progress/:studentId and /gap-analysis/:studentId run, verbatim: completed+active
    /// grades joined to their school_courses row (a grade whose course is missing is SKIPPED entirely, so it
    /// contributes to neither the category nor the total), the grade's own credits when positive else the
    /// course's, first matching category wins, unmatched credits fall into the elective category when one exists.
    /// </summary>
    private static async Task<(Dictionary<string, double> CatCredits, double Total, HashSet<string> CompletedCourseIds)>
        RollUpWithCompletedIdsAsync(
            FormMapsDatabaseSession session, string schoolId, string studentId,
            IReadOnlyList<CategoryRequirementRow> categories, CancellationToken cancellationToken)
    {
        var catCredits = new Dictionary<string, double>(StringComparer.Ordinal);
        foreach (var category in categories)
        {
            catCredits[category.Category] = 0d;
        }

        // `categories.find(c => c.electivesAllowed && c.category.toLowerCase().includes("elective"))`.
        var electiveCategory = categories.FirstOrDefault(c =>
            c.ElectivesAllowed && c.Category.Contains("elective", StringComparison.OrdinalIgnoreCase))?.Category;

        var completedCourseIds = new HashSet<string>(StringComparer.Ordinal);
        var rows = new List<(string? CourseId, double Credits)>();
        await using (var command = Command(session, """
            SELECT "courseId", "credits"::double precision FROM "student_grades"
            WHERE "schoolId" = @school AND "studentId" = @student AND "status" = 'completed' AND "isActive" = true
            """))
        {
            AddParameter(command, "school", schoolId);
            AddParameter(command, "student", studentId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var courseId = reader.IsDBNull(0) ? null : reader.GetString(0);
                if (courseId is not null)
                {
                    completedCourseIds.Add(courseId);
                }

                rows.Add((courseId, reader.IsDBNull(1) ? 0d : reader.GetDouble(1)));
            }
        }

        var courses = new Dictionary<string, (string Code, string? Department, double Credits)>(StringComparer.Ordinal);
        if (completedCourseIds.Count > 0)
        {
            // findMany({ where:{ id: { in: courseIds } } }) — NOT scoped to the school, exactly as legacy has it.
            await using var command = Command(session, """
                SELECT "id", "code", "department", "credits"::double precision
                FROM "school_courses" WHERE "id" = ANY(@ids)
                """);
            AddParameter(command, "ids", completedCourseIds.ToArray());
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                courses[reader.GetString(0)] = (
                    reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
                    reader.IsDBNull(2) ? null : reader.GetString(2),
                    reader.IsDBNull(3) ? 0d : reader.GetDouble(3));
            }
        }

        var total = 0d;
        foreach (var (courseId, gradeCredits) in rows)
        {
            if (courseId is null || !courses.TryGetValue(courseId, out var course))
            {
                continue;
            }

            var credits = gradeCredits > 0 ? gradeCredits : course.Credits;
            total += credits;

            var matched = false;
            foreach (var category in categories)
            {
                if (GradMatch.CourseMatchesCategory(course.Code, course.Department, category.Category, category.RequiredCourses))
                {
                    catCredits[category.Category] = (catCredits.TryGetValue(category.Category, out var c) ? c : 0d) + credits;
                    matched = true;
                    break;
                }
            }

            if (!matched && electiveCategory is not null)
            {
                catCredits[electiveCategory] = (catCredits.TryGetValue(electiveCategory, out var e) ? e : 0d) + credits;
            }
        }

        return (catCredits, total, completedCourseIds);
    }

    // ---------------------------------------------------------------- helpers

    private static StudentGraduationProgress NotFoundProgress() =>
        new(GraduationProgressOutcome.NotFound, null, null, null, null, 0, 0, 0, false, [], []);

    private static StudentGraduationProgress MessageProgress(string studentId, string message) =>
        new(GraduationProgressOutcome.Message, studentId, message, null, null, 0, 0, 0, false, [], []);

    private static GapAnalysis EmptyGap(string studentId) =>
        new(GapAnalysisOutcome.Empty, studentId, null, null, [], [], null);

    // The rule-set Decimals are carried as their wire STRING; the derived arithmetic needs the number back.
    private static double ToNumber(string decimalText) =>
        double.TryParse(decimalText, System.Globalization.NumberStyles.Float,
            System.Globalization.CultureInfo.InvariantCulture, out var value)
            ? value
            : 0d;

    // JS Math.round: half UP (toward +Infinity), not away-from-zero. Every value rounded here is non-negative,
    // where the two agree, but the floor form is written out so a future negative input cannot drift silently.
    private static double JsRound(double value) => Math.Floor(value + 0.5d);

    private static DbCommand Command(FormMapsDatabaseSession session, string sql) =>
        TranscriptDataQuery.Command(session, sql);

    private static void AddParameter(DbCommand command, string name, object? value) =>
        TranscriptDataQuery.AddParameter(command, name, value);
}
