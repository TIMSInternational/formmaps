using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.StudentCoursePlan;

namespace FormMaps.Infrastructure.StudentCoursePlan;

/// <summary>
/// The two course-plan.ts compute reads (FM-DOTNET-086 — L149-200). Read-only RLS session; parameterized SQL. The
/// recommendations path first resolves the completion verdict (checkAssessmentCompletion → computeStudentCompletion)
/// and only loads the catalog / enrollments / preferred fields when the student is done. The eligibility path loads
/// the caller's school catalog + completed grades and defers the map compute to <see cref="EligibilityMapComputer"/>.
/// </summary>
public sealed class CoursePlanComputeReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ICoursePlanComputeReader
{
    // A completed tims-parity LIA session covers all 5 cognitive subtests.
    private static readonly string[] ParityLiaSubtests =
        ["PatternRecognition", "VerbalReasoning", "NumericVelocity", "WorkingMemory", "VisualRotation"];

    private static readonly IReadOnlySet<string> EmptySet = new HashSet<string>(StringComparer.Ordinal);
    private static readonly JsonElement EmptyJsonArray = JsonDocument.Parse("[]").RootElement.Clone();

    // Task-6 language-parity fold (FM-DOTNET-086 porting report §3): raw catalog-vocabulary strings, ready to drop
    // straight into a `lower("language") = ANY(@langs)` WHERE clause (the case-insensitive equivalent of TS's
    // `mode: "insensitive"`). Mirrors TS's CATALOG_VALUES_BY_CODE (unverified against real prod distinct-language
    // values per the TS report's own top concern — re-verify before fully trusting this filter in production).
    private static readonly string[] EnglishCatalogValues = ["English"];
    private static readonly string[] SpanishCatalogValues = ["Spanish", "Español", "Espanol"];

    private const string CourseColumns =
        """
        "id", "title", "shortDescription", "fullDescription", "provider", "instructor", "category", "subcategory",
        "difficulty", "duration", "durationUnit", "estimatedHours", "thumbnailUrl", "videoUrl", "courseraUrl",
        "externalId", trim_scale("rating")::text, "rating"::double precision, "reviewCount", "enrollmentCount",
        "certificate", "language", "country", "region", "skills", "matchingCompetencies", "careerPaths",
        "learningObjectives", "prerequisites", "syllabus"::text, trim_scale("recommendedScore")::text, "sourceUrl",
        "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
        """;

    public async Task<RecommendationsData> GetRecommendationsAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // checkAssessmentCompletion: 4 loads → computeStudentCompletion.
        var completedExamTypes = new List<string>();
        await using (var command = Command(session, """
            SELECT "examType"::text FROM "pca_exam_sessions"
            WHERE "userId" = @u AND "isActive" = true AND "isCompleted" = true
            """))
        {
            AddParameter(command, "u", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                completedExamTypes.Add(reader.GetString(0));
            }
        }

        bool parityDone;
        await using (var command = Command(session, """
            SELECT 1 FROM "lia_assessment_sessions"
            WHERE "user_id" = @u AND "status"::text = 'completed' AND "is_active" = true LIMIT 1
            """))
        {
            AddParameter(command, "u", userId);
            parityDone = await command.ExecuteScalarAsync(cancellationToken) is not null;
        }

        var evalGroupsCompleted = new List<bool>();
        await using (var command = Command(session, """
            SELECT "isEvaluationCompleted" FROM "evaluation_groups" WHERE "evaluatedUserId" = @u AND "isActive" = true
            """))
        {
            AddParameter(command, "u", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                evalGroupsCompleted.Add(reader.GetBoolean(0));
            }
        }

        var pcaEvalsCompleted = new List<bool>();
        await using (var command = Command(session, """SELECT "isCompleted" FROM "pca_evaluations" WHERE "userId" = @u"""))
        {
            AddParameter(command, "u", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                pcaEvalsCompleted.Add(reader.GetBoolean(0));
            }
        }

        bool personalityCompleted;
        await using (var command = Command(session, """
            SELECT EXISTS(SELECT 1 FROM "personality_assessment_sessions"
                WHERE "user_id" = @u AND "status" = 'completed' AND "is_active" = true)
            """))
        {
            AddParameter(command, "u", userId);
            personalityCompleted = (bool)(await command.ExecuteScalarAsync(cancellationToken))!;
        }

        bool legacyUnlockGrandfathered;
        await using (var command = Command(session, """SELECT "legacyUnlockGrandfathered" FROM "users" WHERE "id" = @u"""))
        {
            AddParameter(command, "u", userId);
            legacyUnlockGrandfathered = (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
        }

        var liaExamTypes = parityDone ? ParityLiaSubtests : completedExamTypes.ToArray();
        var verdict = StudentCompletion.Compute(liaExamTypes, evalGroupsCompleted, pcaEvalsCompleted, personalityCompleted, legacyUnlockGrandfathered);
        if (!verdict.AllDone)
        {
            return new RecommendationsData(verdict, Done: false, [], EmptySet, [], []);
        }

        // Enrolled course ids (to exclude).
        var enrolled = new HashSet<string>(StringComparer.Ordinal);
        await using (var command = Command(session, """SELECT "courseId" FROM "course_enrollments" WHERE "studentId" = @u AND "isActive" = true"""))
        {
            AddParameter(command, "u", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                enrolled.Add(reader.GetString(0));
            }
        }

        // preferredFields || [] → lowercased.
        var preferredFieldsLower = new List<string>();
        await using (var command = Command(session, """SELECT "preferredFields" FROM "user_preferences" WHERE "userId" = @u"""))
        {
            AddParameter(command, "u", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken) && !reader.IsDBNull(0))
            {
                foreach (var f in reader.GetFieldValue<string[]>(0))
                {
                    preferredFieldsLower.Add(f.ToLowerInvariant());
                }
            }
        }

        // Task-6 language-parity fold (report §3): resolve the caller's allowed course languages, then load the
        // active catalog filtered to them (still ORDER BY id ASC LIMIT 100 — the pre-existing determinism superset,
        // untouched beyond the added WHERE term). If the language-filtered pool is sparse (&lt;10), widen to include
        // English and REPLACE the candidate list with the re-queried result (never append — mirrors the TS two-query
        // pattern exactly).
        var allowedLanguages = await ResolveAllowedCourseLanguagesAsync(session, userId, cancellationToken);
        var courses = await LoadCourseCatalogAsync(session, allowedLanguages, cancellationToken);
        if (courses.Count < 10)
        {
            var widenedLanguages = WidenLanguagesIfSparse(allowedLanguages, courses.Count);
            courses = await LoadCourseCatalogAsync(session, widenedLanguages, cancellationToken);
        }

        // Task-6 engine-career-alignment fold (report §4/§5): user_career_profiles.careerMatches → first-5 titles
        // (JSON-document order, see EngineCareerTitleExtractor) → lowercased for the scorer's substring predicate.
        // No row / schema-default "[]" → [] (never throws).
        JsonElement careerMatches = EmptyJsonArray;
        await using (var command = Command(session, """SELECT "careerMatches"::text FROM "user_career_profiles" WHERE "userId" = @u"""))
        {
            AddParameter(command, "u", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken) && !reader.IsDBNull(0))
            {
                careerMatches = ParseJson(reader.GetString(0));
            }
        }

        var engineCareersLower = EngineCareerTitleExtractor.Extract(careerMatches)
            .Select(t => t.ToLowerInvariant())
            .ToList();

        return new RecommendationsData(verdict, Done: true, courses, enrolled, preferredFieldsLower, engineCareersLower);
    }

    private async Task<List<CourseRow>> LoadCourseCatalogAsync(
        FormMapsDatabaseSession session, IReadOnlyList<string> allowedLanguages, CancellationToken cancellationToken)
    {
        var courses = new List<CourseRow>();
        await using var command = Command(session, $"""
            SELECT {CourseColumns} FROM "courses"
            WHERE "isActive" = true AND lower("language") = ANY(@langs)
            ORDER BY "id" ASC LIMIT 100
            """);
        AddParameter(command, "langs", allowedLanguages.Select(l => l.ToLowerInvariant()).ToArray());
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            courses.Add(MapCourseRow(reader));
        }

        return courses;
    }

    /// <summary>Ports resolveAllowedCourseLanguages (report §3). Priority: (1) UserPreferences.preferredLanguages, if
    /// any non-blank entries survive trimming — each entry maps en/english → English, es/spanish/español/espanol →
    /// {Spanish, Español, Espanol}, else the raw trimmed literal passes through (de-duped); (2) else the platform UI
    /// language via <see cref="ResolveUserLanguageAsync"/> mapped the same way. NEVER returns empty — branch 2 always
    /// yields a non-empty catalog-value list.</summary>
    private async Task<IReadOnlyList<string>> ResolveAllowedCourseLanguagesAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        string[]? preferredLanguages = null;
        await using (var command = Command(session, """SELECT "preferredLanguages" FROM "user_preferences" WHERE "userId" = @u"""))
        {
            AddParameter(command, "u", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken) && !reader.IsDBNull(0))
            {
                preferredLanguages = reader.GetFieldValue<string[]>(0);
            }
        }

        if (preferredLanguages is { Length: > 0 })
        {
            var mapped = new HashSet<string>(StringComparer.Ordinal);
            foreach (var raw in preferredLanguages)
            {
                foreach (var value in MapPreferredLanguageEntry(raw))
                {
                    mapped.Add(value);
                }
            }

            if (mapped.Count > 0)
            {
                return mapped.ToList();
            }
        }

        var platformLanguage = await ResolveUserLanguageAsync(session, userId, cancellationToken);
        return platformLanguage == "es" ? SpanishCatalogValues : EnglishCatalogValues;
    }

    private static IReadOnlyList<string> MapPreferredLanguageEntry(string raw)
    {
        var trimmed = raw.Trim();
        if (trimmed.Length == 0)
        {
            return [];
        }

        var lower = trimmed.ToLowerInvariant();
        if (lower is "en" or "english")
        {
            return EnglishCatalogValues;
        }

        if (lower is "es" or "spanish" or "español" or "espanol")
        {
            return SpanishCatalogValues;
        }

        return [trimmed]; // no en/es bucket match → pass the raw trimmed literal through (report §3)
    }

    /// <summary>Ports resolveUserLanguage(userId) (report's "Schema facts" section — no pre-existing .NET port;
    /// scoped here to just this reader's needs, not a general-purpose shared service). Returns "es" only on an EXACT
    /// "es" value in user_settings.language; a null row, any other value, or no row at all → "en". Never throws.</summary>
    private static async Task<string> ResolveUserLanguageAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "language" FROM "user_settings" WHERE "userId" = @u""");
        AddParameter(command, "u", userId);
        return await command.ExecuteScalarAsync(cancellationToken) is "es" ? "es" : "en";
    }

    /// <summary>Ports widenLanguagesIfSparse (report §3): pure decision, no DB access. &lt;10 candidates → union in
    /// English's catalog value (de-duped); otherwise unchanged.</summary>
    private static IReadOnlyList<string> WidenLanguagesIfSparse(
        IReadOnlyList<string> allowedLanguages, int candidateCount, int minCandidates = 10)
    {
        if (candidateCount >= minCandidates)
        {
            return allowedLanguages;
        }

        var widened = new HashSet<string>(allowedLanguages, StringComparer.Ordinal) { "English" };
        return widened.ToList();
    }

    public async Task<IReadOnlyList<EligibilityEntry>?> GetEligibilityAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // user { schoolId, gradeLevel }. No schoolId → the endpoint's { data:[] }.
        string schoolId;
        int? gradeLevel;
        await using (var command = Command(session, """SELECT "schoolId", "gradeLevel" FROM "users" WHERE "id" = @u"""))
        {
            AddParameter(command, "u", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken) || reader.IsDBNull(0))
            {
                return null;
            }

            schoolId = reader.GetString(0);
            gradeLevel = reader.IsDBNull(1) ? null : reader.GetInt32(1);
        }

        // FULL school catalog (incl inactive/draft — prereq resolution must see them). ORDER BY id (determinism superset).
        var catalog = new List<EligibilityMapComputer.CatalogCourse>();
        await using (var command = Command(session, """
            SELECT "id", "code", "gradeLevels", "prerequisites", "isActive", "status" FROM "school_courses"
            WHERE "schoolId" = @school ORDER BY "id" ASC
            """))
        {
            AddParameter(command, "school", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                catalog.Add(new EligibilityMapComputer.CatalogCourse(
                    Id: reader.GetString(0),
                    Code: reader.GetString(1),
                    GradeLevels: reader.IsDBNull(2) ? [] : reader.GetFieldValue<int[]>(2),
                    Prerequisites: reader.IsDBNull(3) ? [] : reader.GetFieldValue<string[]>(3),
                    IsActive: reader.GetBoolean(4),
                    Status: reader.GetString(5)));
            }
        }

        var completed = new HashSet<string>(StringComparer.Ordinal);
        await using (var command = Command(session, """
            SELECT "courseId" FROM "student_grades"
            WHERE "schoolId" = @school AND "studentId" = @u AND "status" = 'completed' AND "isActive" = true
            """))
        {
            AddParameter(command, "school", schoolId);
            AddParameter(command, "u", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                completed.Add(reader.GetString(0));
            }
        }

        return EligibilityMapComputer.Compute(catalog, completed, gradeLevel);
    }

    private static CourseRow MapCourseRow(DbDataReader r) => new(
        Id: r.GetString(0),
        Title: r.GetString(1),
        ShortDescription: r.GetString(2),
        FullDescription: r.GetString(3),
        Provider: r.GetString(4),
        Instructor: r.GetString(5),
        Category: r.GetString(6),
        Subcategory: r.GetString(7),
        Difficulty: r.GetString(8),
        Duration: r.GetInt32(9),
        DurationUnit: r.GetString(10),
        EstimatedHours: r.GetInt32(11),
        ThumbnailUrl: r.GetString(12),
        VideoUrl: r.GetString(13),
        CourseraUrl: r.GetString(14),
        ExternalId: r.GetString(15),
        Rating: r.GetString(16),
        RatingNumber: r.GetDouble(17),
        ReviewCount: r.GetInt32(18),
        EnrollmentCount: r.GetInt32(19),
        Certificate: r.GetBoolean(20),
        Language: r.GetString(21),
        Country: r.GetString(22),
        Region: r.GetString(23),
        Skills: r.IsDBNull(24) ? [] : r.GetFieldValue<string[]>(24),
        MatchingCompetencies: r.IsDBNull(25) ? [] : r.GetFieldValue<string[]>(25),
        CareerPaths: r.IsDBNull(26) ? [] : r.GetFieldValue<string[]>(26),
        LearningObjectives: r.IsDBNull(27) ? [] : r.GetFieldValue<string[]>(27),
        Prerequisites: r.IsDBNull(28) ? [] : r.GetFieldValue<string[]>(28),
        Syllabus: ParseJson(r.IsDBNull(29) ? "[]" : r.GetString(29)),
        RecommendedScore: r.GetString(30),
        SourceUrl: r.GetString(31),
        IsActive: r.GetBoolean(32),
        CreatedBy: r.IsDBNull(33) ? null : r.GetString(33),
        CreatedDate: IsoZ(r.GetDateTime(34)),
        UpdatedBy: r.IsDBNull(35) ? null : r.GetString(35),
        UpdatedAt: IsoZ(r.GetDateTime(36)));

    private static JsonElement ParseJson(string raw)
    {
        using var doc = JsonDocument.Parse(raw);
        return doc.RootElement.Clone();
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

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
