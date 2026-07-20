using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolAdmin;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolAdmin;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="SchoolAdminReader"/> + <see cref="SchoolAdminScopeResolver"/>.
/// Pins the school-scoping rail, the six reads' derived shapes, the JS-Math.round (AwayFromZero) rounding,
/// the per-endpoint isActive divergence, config defaults/passthrough, and the pca-status IDOR-null.
/// </summary>
public sealed class SchoolAdminReaderTests : IClassFixture<SchoolAdminDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";

    private readonly SchoolAdminDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public SchoolAdminReaderTests(SchoolAdminDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "users","evaluation_groups","pca_evaluations","pca_exam_sessions","lia_assessment_sessions","school_assessment_settings","assessment_schedules" """,
            conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---------------------------------------------------------------- scope rail

    [Fact]
    public async Task ScopeResolver_returns_school_for_a_user_with_one()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, "admin-1", School, role: "SchoolAdmin");

        Assert.Equal(School, await Resolver().ResolveSchoolIdAsync(Ctx("admin-1")));
    }

    [Fact]
    public async Task ScopeResolver_returns_null_for_missing_user_or_null_school()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, "no-school", schoolId: null, role: "SchoolAdmin");

        Assert.Null(await Resolver().ResolveSchoolIdAsync(Ctx("no-school")));  // null schoolId
        Assert.Null(await Resolver().ResolveSchoolIdAsync(Ctx("ghost")));      // no row
    }

    // ---------------------------------------------------------------- overview

    [Fact]
    public async Task Overview_aggregates_only_students_with_groups_active_only()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, "s-a", School);
        await SeedUserAsync(conn, "s-b", School);
        await SeedUserAsync(conn, "s-c", School, isActive: false);   // inactive -> excluded from studentIds
        await SeedUserAsync(conn, "s-d", School);                    // no groups -> not in output
        await SeedUserAsync(conn, "x-other", OtherSchool);           // other school -> excluded

        await SeedGroupAsync(conn, "s-a", "self", isCompleted: true);
        await SeedGroupAsync(conn, "s-a", "Parent", isCompleted: false);
        await SeedGroupAsync(conn, "s-b", "teacher", isCompleted: true);
        await SeedGroupAsync(conn, "s-c", "self", isCompleted: true);        // inactive student -> excluded
        await SeedGroupAsync(conn, "x-other", "self", isCompleted: true);    // other school -> excluded

        var rows = await Reader().GetEvaluationsOverviewAsync(Ctx("admin-1"), School);

        Assert.Equal(new[] { "s-a", "s-b" }, rows.Select(r => r.StudentId).ToArray()); // ordered, only-with-groups
        Assert.Equal(2, rows[0].TotalEvaluators);
        Assert.Equal(1, rows[0].CompletedEvaluators);
        Assert.True(rows[0].SelfCompleted);                 // "self" completed
        Assert.Equal(1, rows[1].TotalEvaluators);
        Assert.False(rows[1].SelfCompleted);                // teacher only
    }

    [Fact]
    public async Task Overview_self_not_flagged_when_self_group_incomplete()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, "s-a", School);
        await SeedGroupAsync(conn, "s-a", "self", isCompleted: false);

        var rows = await Reader().GetEvaluationsOverviewAsync(Ctx("admin-1"), School);
        Assert.False(rows.Single().SelfCompleted);
    }

    // ---------------------------------------------------------------- results

    [Fact]
    public async Task Results_paginates_orders_by_name_and_derives_fields()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, "u-charlie", School, name: "Charlie", gradeLevel: 11);
        await SeedUserAsync(conn, "u-alice", School, name: "Alice", gradeLevel: 12);
        await SeedUserAsync(conn, "u-bob", School, name: "Bob", gradeLevel: null, isActive: false); // still listed (no isActive)
        await SeedUserAsync(conn, "x", OtherSchool, name: "Zed");

        await SeedPcaEvalAsync(conn, "u-alice", isCompleted: true);
        await SeedExamAsync(conn, "u-alice", 90);
        await SeedExamAsync(conn, "u-alice", 80);
        await SeedExamAsync(conn, "u-alice", 70, isCompleted: false); // not completed -> ignored

        var page1 = await Reader().GetResultsListAsync(Ctx("admin-1"), School, new ResultsListQuery(1, 2, 0, null, null));

        Assert.Equal(3, page1.Total);
        Assert.Equal(2, page1.TotalPages);
        Assert.Equal(new[] { "Alice", "Bob" }, page1.Data.Select(r => r.Name).ToArray()); // name asc
        var alice = page1.Data[0];
        Assert.Equal(85d, alice.AverageScore);          // mean(90,80)=85
        Assert.Equal("completed", alice.PcaStatus);
        Assert.Equal(3, alice.CompletedAssessments);    // 1 pca + 2 exams
        var bob = page1.Data[1];
        Assert.Equal(0d, bob.AverageScore);
        Assert.Equal("not_started", bob.PcaStatus);
        Assert.Null(bob.GradeLevel);

        var page2 = await Reader().GetResultsListAsync(Ctx("admin-1"), School, new ResultsListQuery(2, 2, 2, null, null));
        Assert.Equal(new[] { "Charlie" }, page2.Data.Select(r => r.Name).ToArray());
    }

    [Fact]
    public async Task Results_averageScore_rounds_half_away_from_zero()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, "u-1", School, name: "One");
        await SeedExamAsync(conn, "u-1", 85.5);
        await SeedExamAsync(conn, "u-1", 85.0); // mean 85.25 -> *10 = 852.5 -> AwayFromZero 853 -> 85.3 (banker's would be 85.2)

        var result = await Reader().GetResultsListAsync(Ctx("admin-1"), School, new ResultsListQuery(1, 20, 0, null, null));
        Assert.Equal(85.3d, result.Data.Single().AverageScore);
    }

    [Fact]
    public async Task Results_search_and_gradeLevel_filter()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, "u-1", School, name: "Alice Ng", email: "alice@e.st", gradeLevel: 11);
        await SeedUserAsync(conn, "u-2", School, name: "Bob Lee", email: "bob@e.st", gradeLevel: 12);

        var bySearch = await Reader().GetResultsListAsync(Ctx("admin-1"), School, new ResultsListQuery(1, 20, 0, "alice", null));
        Assert.Equal(new[] { "u-1" }, bySearch.Data.Select(r => r.StudentId).ToArray()); // case-insensitive on name

        var byGrade = await Reader().GetResultsListAsync(Ctx("admin-1"), School, new ResultsListQuery(1, 20, 0, null, 12));
        Assert.Equal(new[] { "u-2" }, byGrade.Data.Select(r => r.StudentId).ToArray());
    }

    // ---------------------------------------------------------------- pca-status

    [Fact]
    public async Task PcaStatus_null_for_missing_inactive_or_cross_school()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, "in-school", School);
        await SeedUserAsync(conn, "inactive", School, isActive: false);
        await SeedUserAsync(conn, "elsewhere", OtherSchool);

        Assert.Null(await Reader().GetStudentPcaCompletionAsync(Ctx("admin-1"), School, "ghost"));      // missing
        Assert.Null(await Reader().GetStudentPcaCompletionAsync(Ctx("admin-1"), School, "inactive"));   // inactive
        Assert.Null(await Reader().GetStudentPcaCompletionAsync(Ctx("admin-1"), School, "elsewhere"));  // cross-school
    }

    [Fact]
    public async Task PcaStatus_completed_reflects_a_completed_pca_evaluation()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, "with", School);
        await SeedUserAsync(conn, "without", School);
        await SeedPcaEvalAsync(conn, "with", isCompleted: true);
        await SeedPcaEvalAsync(conn, "without", isCompleted: false); // exists but not completed

        Assert.True((await Reader().GetStudentPcaCompletionAsync(Ctx("admin-1"), School, "with"))!.Completed);
        Assert.False((await Reader().GetStudentPcaCompletionAsync(Ctx("admin-1"), School, "without"))!.Completed);
    }

    [Fact]
    public async Task PcaStatus_super_admin_is_scoped_to_own_db_school_not_the_token_claim()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        // Super-admin's OWN users.schoolId = School (A); their token claim says OtherSchool (B).
        await SeedUserAsync(conn, "super-1", School, role: "Super Admin");
        await SeedUserAsync(conn, "a-student", School);        // own school
        await SeedUserAsync(conn, "b-student", OtherSchool);   // foreign school
        await SeedPcaEvalAsync(conn, "a-student", isCompleted: true);

        var ctx = CtxWithClaim("super-1", claimSchool: OtherSchool);

        // The rail resolves the DB schoolId (A), NOT the token claim (B).
        var resolved = await Resolver().ResolveSchoolIdAsync(ctx);
        Assert.Equal(School, resolved);

        // A privileged role cannot escape its own DB-school scope: the foreign student -> 404 (no cross-school
        // read/leak, now enforced in the query); the own-school student -> the real result.
        Assert.Null(await Reader().GetStudentPcaCompletionAsync(ctx, resolved!, "b-student"));
        Assert.True((await Reader().GetStudentPcaCompletionAsync(ctx, resolved!, "a-student"))!.Completed);
    }

    [Fact]
    public async Task StudentReport_super_admin_is_scoped_to_own_db_school_not_the_token_claim()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        // Super-admin's OWN users.schoolId = School (A); their token claim says OtherSchool (B).
        await SeedUserAsync(conn, "super-1", School, role: "Super Admin");
        await SeedUserAsync(conn, "a-student", School, name: "Ana");     // own school
        await SeedUserAsync(conn, "b-student", OtherSchool, name: "Bee"); // foreign school (full report data)
        await SeedLiaAsync(conn, "b-student", "completed");
        await SeedPcaEvalAsync(conn, "b-student", isCompleted: true);

        var ctx = CtxWithClaim("super-1", claimSchool: OtherSchool);
        var resolved = await Resolver().ResolveSchoolIdAsync(ctx);
        Assert.Equal(School, resolved);

        // The rich report's student lookup is school-scoped IN the query: even under a super-admin RLS bypass,
        // a foreign-school student -> null -> 404 (no cross-school data leak, despite that student having data);
        // the own-school student -> the real report.
        Assert.Null(await Reader().GetStudentReportAsync(ctx, resolved!, "b-student"));
        Assert.NotNull(await Reader().GetStudentReportAsync(ctx, resolved!, "a-student"));
    }

    [Fact]
    public async Task Both_role_spellings_are_counted_and_listed()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, "upper", School, role: "Student", name: "Upper");
        await SeedUserAsync(conn, "lower", School, role: "student", name: "Lower"); // lowercase spelling
        await SeedGroupAsync(conn, "upper", "self", isCompleted: true);
        await SeedGroupAsync(conn, "lower", "self", isCompleted: true);

        var status = await Reader().GetAssessmentStatusAsync(Ctx("admin-1"), School);
        Assert.Equal(2, status.TotalStudents); // both "Student" and "student" counted

        var results = await Reader().GetResultsListAsync(Ctx("admin-1"), School, new ResultsListQuery(1, 20, 0, null, null));
        Assert.Equal(new[] { "Lower", "Upper" }, results.Data.Select(r => r.Name).ToArray()); // both listed (name asc)

        var overview = await Reader().GetEvaluationsOverviewAsync(Ctx("admin-1"), School);
        Assert.Equal(2, overview.Count); // both appear in overview
    }

    // ---------------------------------------------------------------- config

    [Fact]
    public async Task Config_returns_defaults_when_no_settings_row()
    {
        var config = await Reader().GetAssessmentConfigAsync(Ctx("admin-1"), School);

        Assert.Equal("2026-03-01", config.AssessmentWindowStart);
        Assert.Equal("2026-06-30", config.AssessmentWindowEnd);
        Assert.Equal("once_per_semester", config.RetakePolicy);
        Assert.True(config.AllowSelfSchedule);
        Assert.Equal(7, config.ReminderDaysBefore);
        Assert.Equal(0.4, config.AiWeights.GetProperty("academic").GetDouble());
        Assert.Equal(0.3, config.AiWeights.GetProperty("career").GetDouble());
    }

    [Fact]
    public async Task Config_echoes_stored_values_and_falls_back_on_empty_string()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        // empty windowStart -> falsy -> default; windowEnd stored; custom aiWeights passthrough; allowSelfSchedule false verbatim.
        await SeedSettingsAsync(conn, School, windowStart: "", windowEnd: "2027-01-15", retakePolicy: "none",
            allowSelfSchedule: false, reminderDaysBefore: 3, aiWeightsJson: """{"academic":0.5,"social":0.25,"career":0.25}""");

        var config = await Reader().GetAssessmentConfigAsync(Ctx("admin-1"), School);

        Assert.Equal("2026-03-01", config.AssessmentWindowStart); // empty -> default
        Assert.Equal("2027-01-15", config.AssessmentWindowEnd);
        Assert.False(config.AllowSelfSchedule);
        Assert.Equal(3, config.ReminderDaysBefore);
        Assert.Equal(0.5, config.AiWeights.GetProperty("academic").GetDouble());
    }

    [Fact]
    public async Task Config_falls_back_to_default_weights_on_invalid_json()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedSettingsAsync(conn, School, windowStart: "2026-03-01", windowEnd: "2026-06-30", retakePolicy: "none",
            allowSelfSchedule: true, reminderDaysBefore: 7, aiWeightsJson: "not-json{");

        var config = await Reader().GetAssessmentConfigAsync(Ctx("admin-1"), School);
        Assert.Equal(0.4, config.AiWeights.GetProperty("academic").GetDouble()); // default
    }

    // ---------------------------------------------------------------- status

    [Fact]
    public async Task Status_counts_all_students_and_pca_existence_ignoring_isCompleted()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, "a", School);
        await SeedUserAsync(conn, "b", School, isActive: false); // counted (no isActive filter)
        await SeedUserAsync(conn, "c", School);
        await SeedUserAsync(conn, "z", OtherSchool);             // excluded
        await SeedPcaEvalAsync(conn, "a", isCompleted: false);   // existence counts as "completed"
        await SeedPcaEvalAsync(conn, "a", isCompleted: true);    // duplicate -> still one distinct user

        var status = await Reader().GetAssessmentStatusAsync(Ctx("admin-1"), School);

        Assert.Equal(3, status.TotalStudents);
        Assert.Equal(1, status.Completed);       // only "a" has a pca row
        Assert.Equal(2, status.NotStarted);
        Assert.Equal(0, status.InProgress);
        Assert.Equal(Math.Round(1 * 100d / 3 * 100, MidpointRounding.AwayFromZero) / 100, status.CompletionRate); // 33.33
    }

    [Fact]
    public async Task Status_completionRate_rounds_half_away_from_zero()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        for (var i = 0; i < 32; i++)
        {
            await SeedUserAsync(conn, $"u-{i}", School);
        }

        await SeedPcaEvalAsync(conn, "u-0", isCompleted: true); // 1/32 -> 100/32=3.125 -> *100=312.5 -> 313 -> 3.13 (banker's 3.12)

        var status = await Reader().GetAssessmentStatusAsync(Ctx("admin-1"), School);
        Assert.Equal(3.13d, status.CompletionRate);
    }

    // ---------------------------------------------------------------- schedule

    [Fact]
    public async Task Schedule_returns_active_full_rows_with_isoZ()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedScheduleAsync(conn, "sch-1", School, 11, "PCA",
            new DateTime(2026, 3, 1, 8, 0, 0), new DateTime(2026, 6, 30, 17, 0, 0), isActive: true);
        await SeedScheduleAsync(conn, "sch-2", School, 12, "MIL",
            new DateTime(2026, 3, 1, 8, 0, 0), new DateTime(2026, 6, 30, 17, 0, 0), isActive: false); // excluded
        await SeedScheduleAsync(conn, "sch-3", OtherSchool, 11, "PCA",
            new DateTime(2026, 3, 1, 8, 0, 0), new DateTime(2026, 6, 30, 17, 0, 0), isActive: true);   // other school

        var rows = await Reader().GetSchedulesAsync(Ctx("admin-1"), School);

        Assert.Single(rows);
        Assert.Equal("sch-1", rows[0].Id);
        Assert.Equal(School, rows[0].SchoolId);
        Assert.Equal(11, rows[0].GradeLevel);
        Assert.Equal("PCA", rows[0].AssessmentType);
        Assert.Equal("2026-03-01T08:00:00.000Z", rows[0].StartDate);
        Assert.Equal("2026-06-30T17:00:00.000Z", rows[0].EndDate);
        Assert.True(rows[0].IsActive);
    }

    // ---------------------------------------------------------------- helpers

    // ---------------------------------------------------------------- sub-slice 2: student report

    [Fact]
    public async Task StudentReport_parity_lia_and_thresholds_make_overall_done()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, "stu-1", School, name: "Ana", email: "ana@e.st", gradeLevel: 11);
        await SeedLiaAsync(conn, "stu-1", "completed");                        // parity -> all 5 subtests
        await SeedGroupAsync(conn, "stu-1", "self", isCompleted: true);
        await SeedGroupAsync(conn, "stu-1", "parent", isCompleted: true);
        await SeedGroupAsync(conn, "stu-1", "teacher", isCompleted: true);     // 3 completed -> min(3,3)
        await SeedPcaEvalAsync(conn, "stu-1", isCompleted: true);
        await SeedExamDetailAsync(conn, "stu-1", "PatternRecognition", "Completed", isCompleted: true, scorePercentage: 90);

        var report = (await Reader().GetStudentReportAsync(Ctx("admin-1"), School, "stu-1"))!;

        Assert.Equal("1", report.Version);
        Assert.Matches(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$", report.GeneratedAt); // ISO-Z shape, non-deterministic value
        Assert.True(report.Completion.Lia);      // parity LIA => liaCompleted 5
        Assert.True(report.Completion.Disc);
        Assert.True(report.Completion.Eval360);  // 3 >= min(3,3)
        Assert.True(report.Completion.Overall);
        Assert.True(report.Pca.Completed);
        Assert.Equal(1, report.Pca.EvaluationCount);
        Assert.NotNull(report.Pca.LastCompletedDate);
        Assert.Equal(1, report.Mil.CompletedCount);
        Assert.Equal(90d, report.Mil.AverageScore);
        Assert.Equal(3, report.Evaluation360.Total);
        Assert.Equal(3, report.Evaluation360.Completed);
    }

    [Fact]
    public async Task StudentReport_averageScore_rounds_away_from_zero_and_sessions_desc()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, "stu-1", School);
        await SeedExamDetailAsync(conn, "stu-1", "PatternRecognition", "Completed", isCompleted: true,
            scorePercentage: 85.2, startTime: new DateTime(2026, 1, 1));
        await SeedExamDetailAsync(conn, "stu-1", "VerbalReasoning", "Completed", isCompleted: true,
            scorePercentage: 85.3, startTime: new DateTime(2026, 3, 1));   // newer -> first (desc)

        var report = (await Reader().GetStudentReportAsync(Ctx("admin-1"), School, "stu-1"))!;

        Assert.Equal(85.3d, report.Mil.AverageScore);                       // mean 85.25 -> AwayFromZero 85.3 (banker's=85.2)
        Assert.Equal(2, report.Mil.Sessions.Count);
        Assert.Equal(new DateTime(2026, 3, 1).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'"), report.Mil.Sessions[0].StartTime); // newest first (desc)
        Assert.False(report.Completion.Lia);                                // only 2 distinct exam types (<5)
    }

    [Fact]
    public async Task StudentReport_cross_school_or_missing_returns_null()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, "other", OtherSchool);

        Assert.Null(await Reader().GetStudentReportAsync(Ctx("admin-1"), School, "other"));  // cross-school
        Assert.Null(await Reader().GetStudentReportAsync(Ctx("admin-1"), School, "ghost"));  // missing
    }

    // ---------------------------------------------------------------- sub-slice 2: CSV export

    [Fact]
    public async Task Export_has_exact_header_csvSafe_and_no_isActive_filter()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, "s-1", School, name: "=SUM(A1)", email: "ok@e.st", gradeLevel: 11);   // formula-leading name
        await SeedUserAsync(conn, "s-2", School, name: "Bob", email: "bob@e.st", isActive: false);      // inactive -> still exported
        await SeedExamDetailAsync(conn, "s-1", "PatternRecognition", "Completed", isCompleted: true, scorePercentage: 85.2);
        await SeedExamDetailAsync(conn, "s-1", "VerbalReasoning", "Completed", isCompleted: true, scorePercentage: 85.3);
        await SeedPcaEvalAsync(conn, "s-1", isCompleted: false);   // existence -> "completed" (PCA status = row exists)

        var csv = await Reader().ExportResultsCsvAsync(Ctx("admin-1"), School);
        var lines = csv.Split('\n');

        Assert.Equal("Name,Email,Grade Level,PCA Status,MIL Average Score,Completed Exams", lines[0]);
        Assert.Equal(3, lines.Length);                                       // header + 2 students (incl. inactive)
        Assert.Contains("\"'=SUM(A1)\",\"ok@e.st\",11,completed,85.3,2", csv); // csvSafe prefix + avg 85.3 + count 2
        Assert.Contains("\"Bob\",\"bob@e.st\",,not_started,0,0", csv);        // no grade -> empty; no pca -> not_started
    }

    [Theory]
    [InlineData("=")]
    [InlineData("+")]
    [InlineData("-")]
    [InlineData("@")]
    [InlineData("\t")]
    [InlineData("\r")]
    public async Task Export_csvSafe_prefixes_every_formula_leading_char(string trigger)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        var name = trigger + "danger";
        await SeedUserAsync(conn, "s-1", School, name: name, email: "ok@e.st");

        var csv = await Reader().ExportResultsCsvAsync(Ctx("admin-1"), School);

        // csvSafe prefixes a leading ' so a spreadsheet can't evaluate the cell as a formula.
        Assert.Contains($"\"'{name}\"", csv);
    }

    // ---------------------------------------------------------------- sub-slice 2: pipeline

    [Fact]
    public async Task Pipeline_status_precedence_lia_overlay_states_and_filters()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, "a", School, name: "Ana", gradeLevel: 11);
        await SeedUserAsync(conn, "b", School, name: "Bob", gradeLevel: 11);
        await SeedUserAsync(conn, "c", School, name: "Cy", gradeLevel: 12);

        // A: completed parity LIA -> all 5 pca done, mil done; 2 groups both completed -> eval360 done => fully done.
        await SeedLiaAsync(conn, "a", "completed");
        await SeedGroupAsync(conn, "a", "self", isCompleted: true);
        await SeedGroupAsync(conn, "a", "parent", isCompleted: true);
        // B: PatternRecognition InProgress then Completed (precedence -> done); others not_started -> incomplete.
        await SeedExamDetailAsync(conn, "b", "PatternRecognition", "InProgress", isCompleted: false);
        await SeedExamDetailAsync(conn, "b", "PatternRecognition", "Completed", isCompleted: true);
        // C (grade 12): nothing.

        var all = await Reader().GetAssessmentPipelineAsync(Ctx("admin-1"), School, null, "");
        Assert.Equal(new[] { "a", "b", "c" }, all.Select(r => r.Id).ToArray());        // gradeLevel asc, name asc
        var a = all.Single(r => r.Id == "a");
        Assert.All(a.Pca.Values, v => Assert.Equal("done", v));                        // parity -> all done
        Assert.Equal("done", a.Mil);
        Assert.Equal("done", a.Eval360);
        Assert.Equal(2, a.Eval360Detail.Total);
        var b = all.Single(r => r.Id == "b");
        Assert.Equal("done", b.Pca["PatternRecognition"]);                             // Completed wins over InProgress
        Assert.Equal("not_started", b.Pca["VerbalReasoning"]);
        Assert.Equal("not_started", b.Mil);
        Assert.Equal("not_started", b.Eval360);

        var incomplete = await Reader().GetAssessmentPipelineAsync(Ctx("admin-1"), School, null, "incomplete");
        Assert.Equal(new[] { "b", "c" }, incomplete.Select(r => r.Id).ToArray());      // A fully done -> excluded

        var grade12 = await Reader().GetAssessmentPipelineAsync(Ctx("admin-1"), School, 12, "");
        Assert.Equal(new[] { "c" }, grade12.Select(r => r.Id).ToArray());
    }

    [Fact]
    public async Task Pipeline_active_lia_marks_in_progress_unless_completed()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, "a", School, gradeLevel: 11);
        await SeedLiaAsync(conn, "a", "in_progress");   // active run -> all 5 InProgress

        var rows = await Reader().GetAssessmentPipelineAsync(Ctx("admin-1"), School, null, "");
        Assert.All(rows.Single().Pca.Values, v => Assert.Equal("in_progress", v));
        Assert.Equal("not_started", rows.Single().Mil);  // not all Completed
    }

    private SchoolAdminReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System);

    private SchoolAdminScopeResolver Resolver() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx(string userId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "school-admin", $"{userId}@e.st", "Admin"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    // A context whose token/tenant claim schoolId DIVERGES from the caller's DB users.schoolId — proves the
    // scoping rail reads the DB value, not the claim.
    private static RequestContext CtxWithClaim(string userId, string? claimSchool) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "Super Admin", $"{userId}@e.st", "Super"),
            schoolId: claimSchool, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task SeedUserAsync(
        NpgsqlConnection conn, string id, string? schoolId, string role = "Student",
        string name = "Student", string email = "s@e.st", int? gradeLevel = null, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users" ("id","name","email","roleName","schoolId","gradeLevel","isActive") VALUES (@id,@n,@e,@r,@s,@g,@a)""",
            conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("n", name);
        cmd.Parameters.AddWithValue("e", email);
        cmd.Parameters.AddWithValue("r", role);
        cmd.Parameters.AddWithValue("s", (object?)schoolId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("g", (object?)gradeLevel ?? DBNull.Value);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedGroupAsync(NpgsqlConnection conn, string evaluatedUserId, string groupType, bool isCompleted, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "evaluation_groups" ("id","evaluatedUserId","groupType","isEvaluationCompleted","isActive","updatedAt") VALUES (@id,@u,@t,@c,@a,CURRENT_TIMESTAMP)""",
            conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("u", evaluatedUserId);
        cmd.Parameters.AddWithValue("t", groupType);
        cmd.Parameters.AddWithValue("c", isCompleted);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedPcaEvalAsync(NpgsqlConnection conn, string userId, bool isCompleted)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "pca_evaluations" ("id","userId","isCompleted") VALUES (@id,@u,@c)""", conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("u", userId);
        cmd.Parameters.AddWithValue("c", isCompleted);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedExamAsync(NpgsqlConnection conn, string userId, double scorePercentage, bool isCompleted = true)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "pca_exam_sessions" ("id","userId","examId","scorePercentage","isCompleted") VALUES (@id,@u,@ex,@s,@c)""",
            conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("u", userId);
        cmd.Parameters.AddWithValue("ex", "exam-a");
        cmd.Parameters.AddWithValue("s", scorePercentage);
        cmd.Parameters.AddWithValue("c", isCompleted);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedExamDetailAsync(
        NpgsqlConnection conn, string userId, string examType, string status, bool isCompleted,
        double scorePercentage = 0, string examName = "Exam", bool isActive = true,
        DateTime? startTime = null, DateTime? endTime = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "pca_exam_sessions"
              ("id","userId","examName","examType","status","scorePercentage","isCompleted","isActive","startTime","endTime")
            VALUES (@id,@u,@en,@et,@st,@s,@c,@a,@sd,@ed)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("u", userId);
        cmd.Parameters.AddWithValue("en", examName);
        cmd.Parameters.AddWithValue("et", examType);
        cmd.Parameters.AddWithValue("st", status);
        cmd.Parameters.AddWithValue("s", scorePercentage);
        cmd.Parameters.AddWithValue("c", isCompleted);
        cmd.Parameters.AddWithValue("a", isActive);
        cmd.Parameters.AddWithValue("sd", DateTime.SpecifyKind(startTime ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
        cmd.Parameters.AddWithValue("ed", endTime is null ? DBNull.Value : DateTime.SpecifyKind(endTime.Value, DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedLiaAsync(NpgsqlConnection conn, string userId, string status, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "lia_assessment_sessions" ("id","user_id","status","is_active") VALUES (@id,@u,@st,@a)""", conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("u", userId);
        cmd.Parameters.AddWithValue("st", status);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedSettingsAsync(
        NpgsqlConnection conn, string schoolId, string? windowStart, string? windowEnd, string retakePolicy,
        bool allowSelfSchedule, int reminderDaysBefore, string? aiWeightsJson)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "school_assessment_settings"
              ("id","schoolId","assessmentWindowStart","assessmentWindowEnd","retakePolicy","allowSelfSchedule","reminderDaysBefore","aiWeightsJson")
            VALUES (@id,@s,@ws,@we,@rp,@asl,@rd,@aw)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("ws", (object?)windowStart ?? DBNull.Value);
        cmd.Parameters.AddWithValue("we", (object?)windowEnd ?? DBNull.Value);
        cmd.Parameters.AddWithValue("rp", retakePolicy);
        cmd.Parameters.AddWithValue("asl", allowSelfSchedule);
        cmd.Parameters.AddWithValue("rd", reminderDaysBefore);
        cmd.Parameters.AddWithValue("aw", (object?)aiWeightsJson ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedScheduleAsync(
        NpgsqlConnection conn, string id, string schoolId, int gradeLevel, string assessmentType,
        DateTime startDate, DateTime endDate, bool isActive)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "assessment_schedules" ("id","schoolId","gradeLevel","assessmentType","startDate","endDate","isActive")
            VALUES (@id,@s,@g,@t,@sd,@ed,@a)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("g", gradeLevel);
        cmd.Parameters.AddWithValue("t", assessmentType);
        cmd.Parameters.AddWithValue("sd", DateTime.SpecifyKind(startDate, DateTimeKind.Unspecified));
        cmd.Parameters.AddWithValue("ed", DateTime.SpecifyKind(endDate, DateTimeKind.Unspecified));
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }
}
