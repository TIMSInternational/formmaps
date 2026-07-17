using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Faithful port of legacy assembleCompleteProfile (api/src/lib/assessmentProfile.ts): the server-
/// authoritative read that folds LIA (cognitive), PCA (DISC + competences), 360, and student academics/
/// preferences into one typed profile. All 10 queries run under ONE caller read-only RLS session;
/// authorization is the caller's responsibility (the legacy lib takes a bare userId). The tims-parity LIA
/// engine supersedes the legacy per-exam rows: a completed lia_assessment_session with percentiles drives
/// the mil percents / accuracy / time; otherwise the pca_exam_sessions history does. Pure normalization,
/// scoring, and the fingerprint live in the Application helpers.
/// </summary>
public sealed partial class CompleteProfileAssembler(IFormMapsDatabaseSessionFactory databaseSessionFactory)
    : ICompleteProfileAssembler
{
    // LIA domain -> (canonical ExamType, legacy exam id). Iteration order IS the mil / perExam order.
    private static readonly (string Key, string Type, string Id)[] MilMap =
    [
        ("milReasoning", "VerbalReasoning", "verbal-reasoning-001"),
        ("milDetection", "PatternRecognition", "feature-detection-001"),
        ("milNumeric", "NumericVelocity", "numerical-speed-accuracy-001"),
        ("milMemory", "WorkingMemory", "working-memory-001"),
        ("milOrientation", "VisualRotation", "spatial-orientation-001"),
    ];

    private static readonly IReadOnlyDictionary<string, string> ParitySubtestByType =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["VerbalReasoning"] = "verbal_reasoning",
            ["PatternRecognition"] = "pattern_recognition",
            ["NumericVelocity"] = "numerical_speed",
            ["WorkingMemory"] = "working_memory",
            ["VisualRotation"] = "visual_rotation",
        };

    // Confirmed 4.0-scale grade points (unweighted). Grades absent from the map are ignored.
    private static readonly IReadOnlyDictionary<string, double> GradePoints =
        new Dictionary<string, double>(StringComparer.Ordinal)
        {
            ["A+"] = 4.0, ["A"] = 4.0, ["A-"] = 3.7,
            ["B+"] = 3.3, ["B"] = 3.0, ["B-"] = 2.7,
            ["C+"] = 2.3, ["C"] = 2.0, ["C-"] = 1.7,
            ["D+"] = 1.3, ["D"] = 1.0, ["F"] = 0,
        };

    [GeneratedRegex("(captain|president|leader|founder|head|chair)", RegexOptions.IgnoreCase)]
    private static partial Regex LeaderRegex();

    private sealed record SessionRow(string ExamType, string ExamId, double ScorePercentage, double AccuracyPercentage, int? TotalTimeSpent);

    private sealed record GradeRow(string? Grade, string? CourseLevel);

    private sealed record TestScoreRow(string TestType, int? SatTotal, int? ActComposite);

    private sealed record PortfolioRow(string ActivityCategory, string? Role, string? Type);

    public async Task<CompleteAssessmentProfile> AssembleAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var sessions = await ReadSessionsAsync(session, userId, cancellationToken);
        var (parityPercentiles, parityCounts, parityTimes) = await ReadParityAsync(session, userId, cancellationToken);
        var (discResult, competencesJson) = await ReadPcaResultAsync(session, userId, cancellationToken);
        var feedbacks = await ReadFeedbacksAsync(session, userId, cancellationToken);
        var questions = await ReadQuestionsAsync(session, cancellationToken);
        var grades = await ReadGradesAsync(session, userId, cancellationToken);
        var testScores = await ReadTestScoresAsync(session, userId, cancellationToken);
        var portfolio = await ReadPortfolioAsync(session, userId, cancellationToken);
        var preferences = await ReadPreferencesAsync(session, userId, cancellationToken);

        // milEntries / categoryEntries keep the legacy insertion order for the fingerprint; the profile
        // exposes them as (insertion-order-preserving) dictionaries — the legacy object / Record shape.
        var (milEntries, perExam, composite) = BuildLia(sessions, parityPercentiles, parityCounts, parityTimes);
        var pca = new PcaProfile(
            PcaNormalization.NormalizeDisc(discResult),
            PcaNormalization.NormalizeCompetences(competencesJson));
        var categoryEntries = Evaluation360Scoring.CategoryAverages(
            Evaluation360Scoring.CategoryScoresFromFeedback(feedbacks, questions));
        var academics = BuildAcademics(grades, testScores, portfolio);

        var parityPresent = parityPercentiles is { ValueKind: not JsonValueKind.Null };
        var fingerprint = ProfileFingerprint.Compute(milEntries, pca.Disc, pca.Competences, categoryEntries);

        return new CompleteAssessmentProfile(
            UserId: userId,
            Lia: new LiaProfile(ToOrderedDictionary(milEntries), perExam, composite),
            Pca: pca,
            ThreeSixty: new ThreeSixtyProfile(ToOrderedDictionary(categoryEntries), feedbacks.Count),
            Academics: academics,
            Preferences: preferences,
            Completeness: new ProfileCompleteness(
                Lia: parityPresent || AllExamsPresent(sessions),
                Pca: pca.Disc is not null,
                ThreeSixty: categoryEntries.Count > 0),
            Fingerprint: fingerprint);
    }

    private static Dictionary<string, T> ToOrderedDictionary<T>(IReadOnlyList<KeyValuePair<string, T>> entries)
    {
        // Dictionary preserves insertion order (no removals) -> the legacy object/Record iteration order.
        var dict = new Dictionary<string, T>(entries.Count, StringComparer.Ordinal);
        foreach (var entry in entries)
        {
            dict[entry.Key] = entry.Value;
        }

        return dict;
    }

    // ---------------------------------------------------------------- LIA assembly (parity-aware)

    private static (IReadOnlyList<KeyValuePair<string, int>> Mil, IReadOnlyList<LiaExamEntry> PerExam, MilCompositeResult Composite) BuildLia(
        IReadOnlyList<SessionRow> sessions, JsonElement? parityPct, JsonElement? parityCounts, JsonElement? parityTimes)
    {
        var hasParity = parityPct is { ValueKind: not JsonValueKind.Null };

        var mil = new List<KeyValuePair<string, int>>(MilMap.Length);
        var perExam = new List<LiaExamEntry>(MilMap.Length);
        var perDomainPercent = new Dictionary<string, double>(StringComparer.Ordinal);

        foreach (var (key, type, id) in MilMap)
        {
            var percent = PercentFor(sessions, hasParity, parityPct, type, id);
            var accuracy = AccuracyFor(sessions, hasParity, parityCounts, type, id);
            var time = TimeFor(sessions, hasParity, parityTimes, type, id);

            mil.Add(new KeyValuePair<string, int>(key, JsRound(percent)));
            perExam.Add(new LiaExamEntry(key, type, JsRound(percent), JsRound(accuracy), time));
            perDomainPercent[type] = percent;
        }

        return (mil, perExam, MilComposite.Compute(perDomainPercent));
    }

    private static bool AllExamsPresent(IReadOnlyList<SessionRow> sessions) =>
        MilMap.All(m => Pick(sessions, m.Type, m.Id) is not null);

    private static SessionRow? Pick(IReadOnlyList<SessionRow> sessions, string type, string id)
    {
        // sessions are ordered endTime DESC NULLS FIRST (Prisma's `orderBy: { endTime: "desc" }` inherits
        // the Postgres default, which for DESC is NULLS FIRST — a NULL endTime sorts as most-recent) ->
        // FirstOrDefault matches the most recent (legacy .find).
        foreach (var s in sessions)
        {
            if (s.ExamType == type || s.ExamId == id)
            {
                return s;
            }
        }

        return null;
    }

    private static double PercentFor(
        IReadOnlyList<SessionRow> sessions, bool hasParity, JsonElement? parityPct, string type, string id)
    {
        if (hasParity)
        {
            return NumOrZero(parityPct!.Value, ParitySubtestByType[type]);
        }

        return Pick(sessions, type, id)?.ScorePercentage ?? 0;
    }

    private static double AccuracyFor(
        IReadOnlyList<SessionRow> sessions, bool hasParity, JsonElement? parityCounts, string type, string id)
    {
        if (!hasParity)
        {
            return Pick(sessions, type, id)?.AccuracyPercentage ?? 0;
        }

        var counts = ObjectFor(parityCounts, ParitySubtestByType[type]);
        var correct = counts is null ? 0 : NumOrZero(counts.Value, "correct");
        var incorrect = counts is null ? 0 : NumOrZero(counts.Value, "incorrect");
        var answered = correct + incorrect;
        return answered > 0 ? correct / answered * 100 : 0;
    }

    private static int? TimeFor(
        IReadOnlyList<SessionRow> sessions, bool hasParity, JsonElement? parityTimes, string type, string id)
    {
        if (!hasParity)
        {
            return Pick(sessions, type, id)?.TotalTimeSpent;
        }

        var times = ObjectFor(parityTimes, ParitySubtestByType[type]);
        if (times is not null
            && times.Value.TryGetProperty("durationMs", out var ms)
            && ms.ValueKind == JsonValueKind.Number)
        {
            return (int)Math.Round(ms.GetDouble() / 1000, MidpointRounding.AwayFromZero);
        }

        return null;
    }

    // ---------------------------------------------------------------- academics assembly

    private static AcademicsProfile BuildAcademics(
        IReadOnlyList<GradeRow> grades, IReadOnlyList<TestScoreRow> testScores, IReadOnlyList<PortfolioRow> portfolio)
    {
        var points = grades
            .Select(g => GradePoints.TryGetValue((g.Grade ?? string.Empty).Trim(), out var p) ? (double?)p : null)
            .Where(p => p is not null)
            .Select(p => p!.Value)
            .ToList();
        double? gpaUnweighted = points.Count > 0 ? JsNumber.ToFixed2(points.Sum() / points.Count) : null;

        int ap = 0, honors = 0, ib = 0;
        foreach (var g in grades)
        {
            switch (g.CourseLevel?.ToLowerInvariant())
            {
                case "ap": ap++; break;
                case "honors": honors++; break;
                case "ib": ib++; break;
            }
        }

        // testScores are ordered testDate DESC NULLS LAST (take 10) -> first match is the latest.
        var latestSat = testScores.FirstOrDefault(t => t.TestType == "SAT");
        var latestAct = testScores.FirstOrDefault(t => t.TestType == "ACT");

        var items = portfolio.Where(a => a.Type == "activity" || string.IsNullOrEmpty(a.Type)).ToList();
        var leadershipRoles = items.Count(a => a.Role is not null && LeaderRegex().IsMatch(a.Role));
        var hasWork = items.Any(a => a.ActivityCategory == "work");

        return new AcademicsProfile(
            GpaUnweighted: gpaUnweighted,
            SatTotal: latestSat?.SatTotal,
            ActComposite: latestAct?.ActComposite,
            ApCourseCount: ap,
            HonorsCourseCount: honors,
            IbCourseCount: ib,
            TotalCourses: grades.Count,
            Activities: new ActivitiesSummary(items.Count, leadershipRoles, hasWork));
    }

    // ---------------------------------------------------------------- reads

    private static async Task<IReadOnlyList<SessionRow>> ReadSessionsAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT "examType"::text AS "examType", "examId", "scorePercentage", "accuracyPercentage", "totalTimeSpent"
            FROM "pca_exam_sessions"
            WHERE "userId" = @uid AND "isActive" = true AND "isCompleted" = true
            ORDER BY "endTime" DESC NULLS FIRST
            """);
        AddParameter(command, "uid", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<SessionRow>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new SessionRow(
                ExamType: reader.GetString(0),
                ExamId: reader.GetString(1),
                ScorePercentage: reader.GetDouble(2),
                AccuracyPercentage: reader.GetDouble(3),
                TotalTimeSpent: reader.IsDBNull(4) ? null : reader.GetInt32(4)));
        }

        return rows;
    }

    private static async Task<(JsonElement? Percentiles, JsonElement? Counts, JsonElement? Times)> ReadParityAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT "percentiles"::text, "response_counts"::text, "subtest_times"::text
            FROM "lia_assessment_sessions"
            WHERE "user_id" = @uid AND "status" = 'completed' AND "is_active" = true
            ORDER BY "completed_at" DESC NULLS FIRST
            LIMIT 1
            """);
        AddParameter(command, "uid", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return (null, null, null);
        }

        return (ReadJson(reader, 0), ReadJson(reader, 1), ReadJson(reader, 2));
    }

    private static async Task<(JsonElement Disc, JsonElement Competences)> ReadPcaResultAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT "discResult"::text, "competences"::text FROM "pca_results" WHERE "userId" = @uid LIMIT 1
            """);
        AddParameter(command, "uid", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return (JsonNull(), JsonNull());
        }

        return (ReadJson(reader, 0), ReadJson(reader, 1));
    }

    private static async Task<IReadOnlyList<FeedbackRow>> ReadFeedbacksAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        // Deterministic order (legacy has none) so the derived category insertion order — which feeds the
        // fingerprint — is stable. A faithful superset of the nondeterministic legacy read.
        await using var command = Command(session, """
            SELECT f."relation", f."groupType", f."feedbackItems"::text
            FROM "evaluation_feedbacks" f
            JOIN "evaluation_groups" g ON g."id" = f."evaluationGroupId"
            WHERE g."evaluatedUserId" = @uid AND f."isCompleted" = true
            ORDER BY f."id" ASC
            """);
        AddParameter(command, "uid", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<FeedbackRow>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new FeedbackRow(
                Relation: reader.IsDBNull(0) ? null : reader.GetString(0),
                GroupType: reader.IsDBNull(1) ? null : reader.GetString(1),
                FeedbackItems: ReadJson(reader, 2)));
        }

        return rows;
    }

    private static async Task<IReadOnlyList<Question360Lite>> ReadQuestionsAsync(
        FormMapsDatabaseSession session, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT "questionNumber", "category", "relationType"
            FROM "questions_360" WHERE "isActive" = true ORDER BY "questionNumber" ASC
            """);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<Question360Lite>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new Question360Lite(reader.GetInt32(0), reader.GetString(1), reader.GetString(2)));
        }

        return rows;
    }

    private static async Task<IReadOnlyList<GradeRow>> ReadGradesAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT "grade", "courseLevel" FROM "student_grades" WHERE "studentId" = @uid AND "isActive" = true
            """);
        AddParameter(command, "uid", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<GradeRow>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new GradeRow(
                Grade: reader.IsDBNull(0) ? null : reader.GetString(0),
                CourseLevel: reader.IsDBNull(1) ? null : reader.GetString(1)));
        }

        return rows;
    }

    private static async Task<IReadOnlyList<TestScoreRow>> ReadTestScoresAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT "testType", "satTotal", "actComposite" FROM "student_test_scores"
            WHERE "userId" = @uid AND "isActive" = true
            ORDER BY "testDate" DESC NULLS LAST
            LIMIT 10
            """);
        AddParameter(command, "uid", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<TestScoreRow>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new TestScoreRow(
                TestType: reader.GetString(0),
                SatTotal: reader.IsDBNull(1) ? null : reader.GetInt32(1),
                ActComposite: reader.IsDBNull(2) ? null : reader.GetInt32(2)));
        }

        return rows;
    }

    private static async Task<IReadOnlyList<PortfolioRow>> ReadPortfolioAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT "activityCategory"::text, "role", "type" FROM "student_portfolio_items"
            WHERE "studentId" = @uid AND "isActive" = true
            """);
        AddParameter(command, "uid", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<PortfolioRow>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new PortfolioRow(
                ActivityCategory: reader.GetString(0),
                Role: reader.IsDBNull(1) ? null : reader.GetString(1),
                Type: reader.IsDBNull(2) ? null : reader.GetString(2)));
        }

        return rows;
    }

    private static async Task<PreferencesProfile> ReadPreferencesAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT "preferredFields", "targetCareers", "preferredCountries"
            FROM "user_preferences" WHERE "userId" = @uid LIMIT 1
            """);
        AddParameter(command, "uid", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return new PreferencesProfile([], [], []);
        }

        return new PreferencesProfile(
            PreferredFields: reader.GetFieldValue<string[]>(0),
            TargetCareers: reader.GetFieldValue<string[]>(1),
            PreferredCountries: reader.GetFieldValue<string[]>(2));
    }

    // ---------------------------------------------------------------- primitives

    // JS Math.round (half toward +∞); all inputs here are ≥ 0 so AwayFromZero is equivalent.
    private static int JsRound(double value) => (int)Math.Round(value, MidpointRounding.AwayFromZero);

    // JS `obj[key] ?? 0` with numeric-string coercion (matching the legacy `num`-style read of jsonb).
    private static double NumOrZero(JsonElement obj, string key)
    {
        if (obj.ValueKind != JsonValueKind.Object || !obj.TryGetProperty(key, out var value))
        {
            return 0;
        }

        return value.ValueKind switch
        {
            JsonValueKind.Number => value.GetDouble(),
            JsonValueKind.String when double.TryParse(value.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed) => parsed,
            _ => 0,
        };
    }

    private static JsonElement? ObjectFor(JsonElement? parent, string key)
    {
        if (parent is { ValueKind: JsonValueKind.Object } obj
            && obj.TryGetProperty(key, out var value)
            && value.ValueKind == JsonValueKind.Object)
        {
            return value;
        }

        return null;
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

    // jsonb-as-text -> JsonElement (verbatim; SQL NULL and jsonb 'null' both surface as a JSON-null element).
    private static JsonElement ReadJson(DbDataReader reader, int ordinal)
    {
        var raw = reader.IsDBNull(ordinal) ? "null" : reader.GetString(ordinal);
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.Clone();
    }

    private static JsonElement JsonNull()
    {
        using var document = JsonDocument.Parse("null");
        return document.RootElement.Clone();
    }
}
