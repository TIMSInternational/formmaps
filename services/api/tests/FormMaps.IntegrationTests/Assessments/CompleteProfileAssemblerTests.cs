using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="CompleteProfileAssembler"/> — the port of legacy
/// assembleCompleteProfile. Ports the TS behaviour suite (LIA per-exam + parity-supersedes, PCA DISC 3
/// graphs + competences, 360 weighted self-excluded, academics/preferences) and pins the fingerprint's
/// stability + input-sensitivity end-to-end. Byte-exact fingerprint parity vs Node is pinned separately in
/// the unit-test AssessmentProfileMathTests gold hashes.
/// </summary>
public sealed class CompleteProfileAssemblerTests : IClassFixture<AssessmentProfileDatabaseFixture>, IAsyncLifetime
{
    private readonly AssessmentProfileDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CompleteProfileAssemblerTests(AssessmentProfileDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            TRUNCATE "pca_exam_sessions","lia_assessment_sessions","pca_results","evaluation_groups",
                     "evaluation_feedbacks","questions_360","student_grades","student_test_scores",
                     "student_portfolio_items","user_preferences"
            """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---------------------------------------------------------------- LIA

    [Fact]
    public async Task Lia_maps_five_completed_exams_to_mil_and_composite()
    {
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedExamAsync(conn, user, "VerbalReasoning", "verbal-reasoning-001", 80, 90, 300);
        await SeedExamAsync(conn, user, "PatternRecognition", "feature-detection-001", 60, 70, 200);
        await SeedExamAsync(conn, user, "NumericVelocity", "numerical-speed-accuracy-001", 50, 60, 100);
        await SeedExamAsync(conn, user, "WorkingMemory", "working-memory-001", 50, 55, 120);
        await SeedExamAsync(conn, user, "VisualRotation", "spatial-orientation-001", 40, 45, 90);

        var p = await Assemble(user);

        Assert.Equal(80, Mil(p, "milReasoning"));
        Assert.Equal(60, Mil(p, "milDetection"));
        Assert.Equal(50, Mil(p, "milNumeric"));
        Assert.Equal(50, Mil(p, "milMemory"));
        Assert.Equal(40, Mil(p, "milOrientation"));
        Assert.Equal(5, p.Lia.PerExam.Count);
        Assert.True(p.Lia.Composite.Raw > 0);
        Assert.True(p.Lia.Composite.Percent > 0);
        Assert.True(p.Completeness.Lia);
    }

    [Fact]
    public async Task Lia_is_incomplete_and_zeroes_missing_domains_when_under_five_exams()
    {
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedExamAsync(conn, user, "VerbalReasoning", "verbal-reasoning-001", 80, 90, 300);

        var p = await Assemble(user);

        Assert.Equal(80, Mil(p, "milReasoning"));
        Assert.Equal(0, Mil(p, "milMemory"));
        Assert.False(p.Completeness.Lia);
    }

    [Fact]
    public async Task Lia_parity_session_supersedes_per_exam_rows()
    {
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        // A stale per-exam row that must be ignored once a completed parity session exists.
        await SeedExamAsync(conn, user, "VerbalReasoning", "verbal-reasoning-001", 10, 10, 999);
        await SeedParityAsync(
            conn, user,
            percentiles: """{"verbal_reasoning":82.4,"pattern_recognition":50,"numerical_speed":60,"working_memory":70,"visual_rotation":40}""",
            responseCounts: """{"verbal_reasoning":{"correct":8,"incorrect":2}}""",
            subtestTimes: """{"verbal_reasoning":{"durationMs":300000}}""");

        var p = await Assemble(user);

        Assert.Equal(82, Mil(p, "milReasoning")); // round(82.4), from parity — NOT the per-exam 10
        Assert.Equal(70, Mil(p, "milMemory"));
        var reasoning = p.Lia.PerExam.Single(e => e.Domain == "milReasoning");
        Assert.Equal(80, reasoning.Accuracy);     // 8/(8+2)*100
        Assert.Equal(300, reasoning.TimeSpent);   // 300000ms / 1000
        Assert.True(p.Completeness.Lia);          // parity present -> complete even with 1 per-exam row
    }

    [Fact]
    public async Task Lia_pick_treats_a_null_endTime_completed_exam_as_most_recent()
    {
        // Prisma `orderBy: { endTime: "desc" }` inherits Postgres DESC default = NULLS FIRST, so a completed
        // exam with a NULL endTime outranks a dated one of the same type. Red-if-regressed guard against a
        // NULLS LAST inversion.
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedExamAsync(conn, user, "VerbalReasoning", "verbal-reasoning-001", 40, 40, 100); // dated
        await SeedExamWithNullEndTimeAsync(conn, user, "VerbalReasoning", "verbal-reasoning-001", 88); // NULL endTime -> most recent

        var p = await Assemble(user);

        Assert.Equal(88, Mil(p, "milReasoning"));
    }

    [Fact]
    public async Task Lia_parity_coerces_a_numeric_string_percentile()
    {
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedParityAsync(
            conn, user,
            percentiles: """{"verbal_reasoning":"82.4"}""", // string, as JS Number()/legacy would coerce
            responseCounts: "{}",
            subtestTimes: "{}");

        var p = await Assemble(user);

        Assert.Equal(82, Mil(p, "milReasoning")); // round(82.4)
    }

    // ---------------------------------------------------------------- PCA

    [Fact]
    public async Task Pca_normalizes_three_disc_graphs_and_competences()
    {
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedPcaResultAsync(
            conn, user,
            disc: """
                {"PcaD1":89,"PcaI1":18,"PcaS1":18,"PcaC1":21,
                 "PcaD2":87,"PcaI2":87,"PcaS2":26,"PcaC2":25,
                 "PcaD3":90,"PcaI3":60,"PcaS3":25,"PcaC3":25}
                """,
            competences: """{"PcaCmps":[{"CmpNom":"COMUNICACIÓN","Level":1},{"CmpNom":"MOTIVACIÓN","Level":4}]}""");

        var p = await Assemble(user);

        Assert.NotNull(p.Pca.Disc);
        Assert.Equal(new DiscGraph(89, 18, 18, 21), p.Pca.Disc!.WorkAdaptation);
        Assert.Equal(new DiscGraph(87, 87, 26, 25), p.Pca.Disc.UnderPressure);
        Assert.Equal(new DiscGraph(90, 60, 25, 25), p.Pca.Disc.SelfImage);
        Assert.Equal(new DiscGraph(87, 87, 26, 25), p.Pca.Disc.Primary);
        Assert.Equal(
            new[] { new CompetenceEntry("COMUNICACIÓN", 1), new CompetenceEntry("MOTIVACIÓN", 4) },
            p.Pca.Competences);
        Assert.True(p.Completeness.Pca);
    }

    [Fact]
    public async Task Pca_accepts_camelCase_keys_and_is_null_without_a_result()
    {
        var withDisc = NewUser();
        var withoutDisc = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedPcaResultAsync(
            conn, withDisc,
            disc: """
                {"pcaD1":1,"pcaI1":2,"pcaS1":3,"pcaC1":4,
                 "pcaD2":5,"pcaI2":6,"pcaS2":7,"pcaC2":8,
                 "pcaD3":9,"pcaI3":10,"pcaS3":11,"pcaC3":12}
                """,
            competences: null);

        var p1 = await Assemble(withDisc);
        Assert.Equal(new DiscGraph(1, 2, 3, 4), p1.Pca.Disc!.WorkAdaptation);
        Assert.Equal(new DiscGraph(5, 6, 7, 8), p1.Pca.Disc.Primary);
        Assert.Null(p1.Pca.Competences);

        var p2 = await Assemble(withoutDisc);
        Assert.Null(p2.Pca.Disc);
        Assert.False(p2.Completeness.Pca);
    }

    // ---------------------------------------------------------------- 360

    [Fact]
    public async Task ThreeSixty_aggregates_non_self_feedback_into_weighted_averages()
    {
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var group = await SeedGroupAsync(conn, user);
        await SeedFeedbackAsync(conn, group, "teacher", "teacher", """[{"category":"Arts","rating":4,"isAnswered":true}]""");
        await SeedFeedbackAsync(conn, group, "parent", "parent", """[{"category":"Arts","rating":5,"isAnswered":true}]""");
        await SeedFeedbackAsync(conn, group, "friend", "sibling_friend", """[{"category":"Arts","rating":3,"isAnswered":true}]""");
        await SeedFeedbackAsync(conn, group, "self", "self", """[{"category":"Arts","rating":1,"isAnswered":true}]""");

        var p = await Assemble(user);

        // (4*1.1 + 5*0.9 + 3*0.8)/3 = 3.77 ; the self rating (1) is excluded.
        Assert.Equal(3.77, p.ThreeSixty.Categories["Arts"]);
        Assert.Equal(4, p.ThreeSixty.EvaluatorCount); // counts ALL feedbacks incl. self
        Assert.True(p.Completeness.ThreeSixty);
    }

    // ---------------------------------------------------------------- academics + preferences

    [Fact]
    public async Task Academics_computes_gpa_latest_scores_rigor_and_activities()
    {
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedGradeAsync(conn, user, "A", "ap");
        await SeedGradeAsync(conn, user, "B", "honors");
        await SeedTestScoreAsync(conn, user, "SAT", 1300, null, new DateTime(2024, 3, 1));
        await SeedTestScoreAsync(conn, user, "SAT", 1400, null, new DateTime(2025, 3, 1)); // latest
        await SeedPortfolioAsync(conn, user, "activity", "Captain", "academic");
        await SeedPreferencesAsync(conn, user, ["Computer Science"], ["Software Engineer"], ["United States"]);

        var p = await Assemble(user);

        Assert.Equal(3.5, p.Academics.GpaUnweighted); // (4.0 + 3.0)/2
        Assert.Equal(1400, p.Academics.SatTotal);     // latest by testDate DESC
        Assert.Null(p.Academics.ActComposite);
        Assert.Equal(1, p.Academics.ApCourseCount);
        Assert.Equal(1, p.Academics.HonorsCourseCount);
        Assert.Equal(2, p.Academics.TotalCourses);
        Assert.Equal(1, p.Academics.Activities.Total);
        Assert.Equal(1, p.Academics.Activities.LeadershipRoles);
        Assert.False(p.Academics.Activities.HasWorkExperience);
        Assert.Equal(new[] { "Computer Science" }, p.Preferences.PreferredFields);
        Assert.Equal(new[] { "Software Engineer" }, p.Preferences.TargetCareers);
        Assert.Equal(new[] { "United States" }, p.Preferences.PreferredCountries);
    }

    [Fact]
    public async Task Academics_include_empty_type_activities_and_flag_work_experience()
    {
        // type "" (empty) satisfies the legacy `type === "activity" || !type` inclusion; a "work" category
        // flips hasWorkExperience.
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedPortfolioAsync(conn, user, "", "Member", "work");

        var p = await Assemble(user);

        Assert.Equal(1, p.Academics.Activities.Total);
        Assert.Equal(0, p.Academics.Activities.LeadershipRoles);
        Assert.True(p.Academics.Activities.HasWorkExperience);
    }

    [Fact]
    public async Task Academics_degrade_gracefully_with_no_data()
    {
        var p = await Assemble(NewUser());

        Assert.Null(p.Academics.GpaUnweighted);
        Assert.Null(p.Academics.SatTotal);
        Assert.Equal(0, p.Academics.ApCourseCount);
        Assert.Empty(p.Preferences.PreferredFields);
    }

    // ---------------------------------------------------------------- fingerprint

    [Fact]
    public async Task Fingerprint_is_stable_for_identical_data_and_changes_when_a_source_changes()
    {
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedExamAsync(conn, user, "VerbalReasoning", "verbal-reasoning-001", 80, 90, 1);

        var a = await Assemble(user);
        var b = await Assemble(user);
        Assert.Equal(a.Fingerprint, b.Fingerprint);
        Assert.NotEqual(string.Empty, a.Fingerprint);

        await using (var update = new NpgsqlCommand(
            """UPDATE "pca_exam_sessions" SET "scorePercentage" = 81 WHERE "userId" = @uid""", conn))
        {
            update.Parameters.AddWithValue("uid", user);
            await update.ExecuteNonQueryAsync();
        }

        var c = await Assemble(user);
        Assert.NotEqual(a.Fingerprint, c.Fingerprint);
    }

    // ---------------------------------------------------------------- helpers

    private CompleteProfileAssembler MakeAssembler() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private Task<CompleteAssessmentProfile> Assemble(string userId) =>
        MakeAssembler().AssembleAsync(Ctx(userId), userId);

    private static string NewUser() => "u-" + Guid.NewGuid().ToString("N");

    private static int Mil(CompleteAssessmentProfile p, string key) => p.Lia.Mil[key];

    private static RequestContext Ctx(string userId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "counselor", $"{userId}@e.st", "Test User"),
            schoolId: null, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task SeedExamAsync(
        NpgsqlConnection conn, string userId, string examType, string examId,
        double score, double accuracy, int timeSpent)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "pca_exam_sessions"
                ("id","examId","userId","examType","endTime","totalTimeSpent","scorePercentage",
                 "accuracyPercentage","isCompleted","isActive")
            VALUES (@id, @examId, @uid, @examType::"ExamType", CURRENT_TIMESTAMP, @time, @score, @accuracy, true, true)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("examId", examId);
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("examType", examType);
        cmd.Parameters.AddWithValue("time", timeSpent);
        cmd.Parameters.AddWithValue("score", score);
        cmd.Parameters.AddWithValue("accuracy", accuracy);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedExamWithNullEndTimeAsync(
        NpgsqlConnection conn, string userId, string examType, string examId, double score)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "pca_exam_sessions"
                ("id","examId","userId","examType","endTime","scorePercentage","accuracyPercentage","isCompleted","isActive")
            VALUES (@id, @examId, @uid, @examType::"ExamType", NULL, @score, 0, true, true)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("examId", examId);
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("examType", examType);
        cmd.Parameters.AddWithValue("score", score);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedParityAsync(
        NpgsqlConnection conn, string userId, string percentiles, string responseCounts, string subtestTimes)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "lia_assessment_sessions"
                ("id","user_id","status","completed_at","subtest_times","percentiles","response_counts","is_active")
            VALUES (@id, @uid, 'completed', CURRENT_TIMESTAMP, @times::jsonb, @pct::jsonb, @counts::jsonb, true)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("times", subtestTimes);
        cmd.Parameters.AddWithValue("pct", percentiles);
        cmd.Parameters.AddWithValue("counts", responseCounts);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedPcaResultAsync(NpgsqlConnection conn, string userId, string disc, string? competences)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "pca_results" ("id","userId","discResult","competences","isActive")
            VALUES (@id, @uid, @disc::jsonb, @competences::jsonb, true)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("disc", disc);
        cmd.Parameters.AddWithValue("competences", (object?)competences ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task<string> SeedGroupAsync(NpgsqlConnection conn, string evaluatedUserId)
    {
        var id = Guid.NewGuid().ToString();
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "evaluation_groups" ("id","evaluatedUserId") VALUES (@id, @uid)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("uid", evaluatedUserId);
        await cmd.ExecuteNonQueryAsync();
        return id;
    }

    private static async Task SeedFeedbackAsync(
        NpgsqlConnection conn, string groupId, string relation, string groupType, string items)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "evaluation_feedbacks"
                ("id","evaluationGroupId","relation","groupType","feedbackItems","isCompleted")
            VALUES (@id, @gid, @relation, @groupType, @items::jsonb, true)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("gid", groupId);
        cmd.Parameters.AddWithValue("relation", relation);
        cmd.Parameters.AddWithValue("groupType", groupType);
        cmd.Parameters.AddWithValue("items", items);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedGradeAsync(NpgsqlConnection conn, string studentId, string grade, string courseLevel)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_grades" ("id","studentId","grade","courseLevel","isActive")
            VALUES (@id, @uid, @grade, @level, true)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("uid", studentId);
        cmd.Parameters.AddWithValue("grade", grade);
        cmd.Parameters.AddWithValue("level", courseLevel);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedTestScoreAsync(
        NpgsqlConnection conn, string userId, string testType, int? satTotal, int? actComposite, DateTime testDate)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_test_scores" ("id","userId","testType","testDate","satTotal","actComposite","isActive")
            VALUES (@id, @uid, @type, @date, @sat, @act, true)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("type", testType);
        cmd.Parameters.AddWithValue("date", DateTime.SpecifyKind(testDate, DateTimeKind.Unspecified));
        cmd.Parameters.AddWithValue("sat", (object?)satTotal ?? DBNull.Value);
        cmd.Parameters.AddWithValue("act", (object?)actComposite ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedPortfolioAsync(
        NpgsqlConnection conn, string studentId, string type, string role, string activityCategory)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_portfolio_items" ("id","studentId","type","role","activityCategory","isActive")
            VALUES (@id, @uid, @type, @role, @cat::"StudentActivityCategory", true)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("uid", studentId);
        cmd.Parameters.AddWithValue("type", type);
        cmd.Parameters.AddWithValue("role", role);
        cmd.Parameters.AddWithValue("cat", activityCategory);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedPreferencesAsync(
        NpgsqlConnection conn, string userId, string[] fields, string[] careers, string[] countries)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "user_preferences" ("id","userId","preferredFields","targetCareers","preferredCountries","isActive")
            VALUES (@id, @uid, @fields, @careers, @countries, true)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("fields", fields);
        cmd.Parameters.AddWithValue("careers", careers);
        cmd.Parameters.AddWithValue("countries", countries);
        await cmd.ExecuteNonQueryAsync();
    }
}
