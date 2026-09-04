using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;
using FormMaps.Application.Data;
using FormMaps.Domain.Auth;
using FormMaps.Infrastructure.CareerFit;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.CareerFit;

/// <summary>
/// FM-CF-010 (P1–P3) end to end on the real tables: a student seeded with the rows the platform's own writers
/// persist (pca_results discResult + competences, a completed lia_assessment_sessions row with percentiles, a
/// completed personality_assessment_sessions row with dimension_scores + resolved_type) is evaluated through
/// <see cref="CareerFitEvaluator"/> → <see cref="CareerFitInputReader"/> / <see cref="CareerFitRunWriter"/> on the
/// REAL session factory as the restricted NOSUPERUSER NOBYPASSRLS login, and the run lands in careerfit_runs /
/// careerfit_family_results exactly as the schema and the engine say it should. Every access claim has its
/// negative control on the same seed (formmaps#125): the other-school counselor who can neither read the run nor
/// evaluate the student. Seeding and row-state assertions are on the admin connection. The pipeline's session
/// identity is not taken on trust either: <c>SessionSpy</c> reads the tenant GUCs the DATABASE reports on the
/// connection each session actually ran on, so a reader or writer silently switched to a system/bypass session
/// turns a test red instead of producing identical rows.
/// </summary>
public sealed class CareerFitEvaluatorDatabaseTests : IClassFixture<CareerFitDatabaseFixture>, IAsyncLifetime
{
    private const string RulesVersion = "1.0.0-draft.1";

    private const string SchoolA = "school-a";
    private const string SchoolB = "school-b";
    private const string StudentA1 = "student-a1";      // complete: PCA + LIA + personality
    private const string StudentA2 = "student-a2";      // PCA + personality, NO LIA
    private const string CounselorA = "counselor-a";
    private const string CounselorB = "counselor-b";
    private const string SuperAdmin = "super-admin";

    private const string PcaRowA1 = "pca-a1";
    private const string LiaSessionA1 = "lia-a1";
    private const string PersonalitySessionA1 = "pers-a1";

    private static readonly string[] AllTables =
    [
        "careerfit_family_results", "careerfit_runs",
        "vocational_responses", "evaluation_groups",
        "personality_assessment_sessions", "lia_assessment_sessions", "pca_results",
        "student_parent_links", "counselor_student_assignments", "users", "schools",
    ];

    private static readonly CareerFitRulesProvider Provider = new(RulesVersion);

    private readonly CareerFitDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;        // restricted login — everything under test
    private NpgsqlDataSource _adminDataSource = null!;   // superuser — seeding and assertions only

    public CareerFitEvaluatorDatabaseTests(CareerFitDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        await _fixture.TruncateAsync(AllTables);
        await SeedAsync();
    }

    public async Task DisposeAsync()
    {
        await _dataSource.DisposeAsync();
        await _adminDataSource.DisposeAsync();
    }

    // ---- the happy path, persisted ----

    [Fact]
    public async Task Student_evaluates_self_and_fourteen_ranked_families_land_with_the_quality_record()
    {
        var run = await Evaluator().EvaluateAsync(Student(StudentA1, SchoolA), StudentA1);

        // The returned run: 14 families in rank order, the identity the database assigned.
        Assert.NotEqual(Guid.Empty, run.Id);
        Assert.Equal(StudentA1, run.UserId);
        Assert.Equal(SchoolA, run.SchoolId);
        Assert.Equal(RulesVersion, run.RulesVersion);
        Assert.Equal(DiscGraphChoice.WorkAdaptation, run.DiscGraph);
        Assert.Equal(14, run.Families.Count);
        Assert.Equal(Enumerable.Range(1, 14), run.Families.Select(f => f.RankPosition!.Value));
        Assert.Equal(new CareerFitInputSources(PcaRowA1, LiaSessionA1, PersonalitySessionA1), run.Sources);

        await using var admin = await _adminDataSource.OpenConnectionAsync();

        // careerfit_runs: one row, the student's tenant, the version, the graph, both jsonb documents.
        await using (var cmd = new NpgsqlCommand(
            """
            SELECT "userId", "schoolId", "rulesVersion", "discGraph", "inputs"::text, "inputQuality"::text
            FROM "careerfit_runs" WHERE "id" = @id
            """, admin))
        {
            cmd.Parameters.AddWithValue("id", run.Id);
            await using var reader = await cmd.ExecuteReaderAsync();
            Assert.True(await reader.ReadAsync());
            Assert.Equal(StudentA1, reader.GetString(0));
            Assert.Equal(SchoolA, reader.GetString(1));
            Assert.Equal(RulesVersion, reader.GetString(2));
            Assert.Equal((short)1, reader.GetInt16(3));

            var inputs = JsonDocument.Parse(reader.GetString(4)).RootElement;
            Assert.Equal(89.0, inputs.GetProperty("pca").GetProperty("D").GetDouble());     // graph 1 of the seed
            Assert.Equal(72, inputs.GetProperty("mil").GetProperty("DC").GetInt32());        // pattern_recognition
            Assert.Equal(24, inputs.GetProperty("competencies").EnumerateObject().Count());
            Assert.Equal("NOT_DETERMINABLE", inputs.GetProperty("careerfit360_confidence").GetString());
            var parsed = CareerFitRunJson.ParseInputs(inputs);                                      // re-derivable
            Assert.Equal(run.Inputs.Pca, parsed.Pca);
            Assert.Equal(run.Inputs.Mil, parsed.Mil);
            Assert.Equal(run.Inputs.Personality, parsed.Personality);
            Assert.Equal(run.Inputs.Competencies.OrderBy(kv => kv.Key), parsed.Competencies.OrderBy(kv => kv.Key));

            var quality = JsonDocument.Parse(reader.GetString(5)).RootElement;
            Assert.Equal(1, quality.GetProperty("disc_graph").GetInt32());
            Assert.Equal(V360Sources.NoData, quality.GetProperty("v360_source").GetString());
            Assert.False(quality.GetProperty("evidence").GetProperty("360").GetBoolean());
            Assert.False(quality.GetProperty("has_repairs").GetBoolean());
            Assert.Contains(quality.GetProperty("warnings").EnumerateArray(), w => w.GetProperty("code").GetString() == InputWarningCodes.V360NoData);
            Assert.Equal(LiaSessionA1, quality.GetProperty("sources").GetProperty("lia_session_id").GetString());
            Assert.Equal(PersonalitySessionA1, quality.GetProperty("sources").GetProperty("personality_session_id").GetString());
            Assert.Equal(PcaRowA1, quality.GetProperty("sources").GetProperty("pca_result_id").GetString());
        }

        // careerfit_family_results: 14 rows, ranks 1..14 unique, values identical to what the engine returned.
        await using (var cmd = new NpgsqlCommand(
            """
            SELECT "familyId", "rank_position", "careerfit_absolute", "careerfit_relative", "pca_winning_route",
                   "final_gate", "convergence_level", "careerfit360", "careerfit360_confidence", "audit"::text
            FROM "careerfit_family_results" WHERE "runId" = @id ORDER BY "rank_position"
            """, admin))
        {
            cmd.Parameters.AddWithValue("id", run.Id);
            await using var reader = await cmd.ExecuteReaderAsync();
            var rows = 0;
            while (await reader.ReadAsync())
            {
                var expected = run.Families[rows];
                rows++;
                Assert.Equal(expected.OwnerId, (int)reader.GetInt16(0));
                Assert.Equal((short)rows, reader.GetInt16(1));
                Assert.Equal(expected.CareerFitAbsolute, reader.GetDouble(2)); // exact: float8 round-trips a double
                Assert.Equal(expected.CareerFitRelative!.Value, reader.GetDouble(3));
                Assert.Equal(expected.PcaWinningRoute, reader.GetString(4));
                Assert.Equal(expected.FinalGate.ToReferenceValue(), reader.GetString(5));
                Assert.Equal(expected.ConvergenceLevel.ToReferenceValue(), reader.GetString(6));
                Assert.Equal(0.0, reader.GetDouble(7));                                    // 360 NoData
                Assert.Equal("NOT_DETERMINABLE", reader.GetString(8));
                Assert.NotEqual("VERY_HIGH", reader.GetString(6));                         // three instruments at most

                var audit = JsonDocument.Parse(reader.GetString(9)).RootElement;
                Assert.Equal("DIVERGENT", audit.GetProperty("convergence_detail").GetProperty("supports").GetProperty("360").GetString());
                Assert.Equal(expected.AuditInputs.PcaRoutes.Count, audit.GetProperty("audit_inputs").GetProperty("pca_routes").GetArrayLength());
            }

            Assert.Equal(14, rows);
        }

        Assert.Equal(14L, await ScalarAsync(admin, $"""SELECT count(DISTINCT "rank_position") FROM "careerfit_family_results" WHERE "runId" = '{run.Id}' """));
        Assert.Equal(100.0, await DoubleAsync(admin, $"""SELECT "careerfit_relative" FROM "careerfit_family_results" WHERE "runId" = '{run.Id}' AND "rank_position" = 1"""));
        Assert.Equal(0.0, await DoubleAsync(admin, $"""SELECT "careerfit_relative" FROM "careerfit_family_results" WHERE "runId" = '{run.Id}' AND "rank_position" = 14"""));
    }

    [Fact]
    public async Task A_re_evaluation_is_a_new_run_and_the_first_is_untouched()
    {
        var first = await Evaluator().EvaluateAsync(Student(StudentA1, SchoolA), StudentA1);
        var second = await Evaluator().EvaluateAsync(Student(StudentA1, SchoolA), StudentA1, DiscGraphChoice.UnderPressure);

        Assert.NotEqual(first.Id, second.Id);
        Assert.Equal(DiscGraphChoice.UnderPressure, second.DiscGraph);
        Assert.Equal(new PcaInput(87, 87, 26, 25), second.Inputs.Pca); // graph 2 of the seed

        await using var admin = await _adminDataSource.OpenConnectionAsync();
        Assert.Equal(2L, await ScalarAsync(admin, $"""SELECT count(*) FROM "careerfit_runs" WHERE "userId" = '{StudentA1}' """));
        Assert.Equal(28L, await ScalarAsync(admin, """SELECT count(*) FROM "careerfit_family_results" """));
        Assert.Equal(1L, await ScalarAsync(admin, $"""SELECT "discGraph" FROM "careerfit_runs" WHERE "id" = '{first.Id}' """));
        Assert.Equal(2L, await ScalarAsync(admin, $"""SELECT "discGraph" FROM "careerfit_runs" WHERE "id" = '{second.Id}' """));
    }

    // ---- who may read the run, who may produce it (restricted login, negative controls) ----

    [Fact]
    public async Task Other_school_counselor_cannot_read_the_run_and_same_school_counselor_can()
    {
        var run = await Evaluator().EvaluateAsync(Student(StudentA1, SchoolA), StudentA1);

        // Positive controls first: the owner and a same-school counselor see the run and its families.
        Assert.Equal(new[] { run.Id }, await VisibleRunsAsync(Student(StudentA1, SchoolA)));
        Assert.Equal(new[] { run.Id }, await VisibleRunsAsync(Counselor(CounselorA, SchoolA)));
        Assert.Equal(14L, await VisibleFamilyRowsAsync(Counselor(CounselorA, SchoolA), run.Id));

        // The negative control on the same seed: school B's counselor sees neither table's rows.
        Assert.Empty(await VisibleRunsAsync(Counselor(CounselorB, SchoolB)));
        Assert.Equal(0L, await VisibleFamilyRowsAsync(Counselor(CounselorB, SchoolB), run.Id));

        // And the row really is there — the admin sees it — so "empty" above means invisible, not absent.
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        Assert.Equal(1L, await ScalarAsync(admin, $"""SELECT count(*) FROM "careerfit_runs" WHERE "id" = '{run.Id}' """));
    }

    [Fact]
    public async Task Other_school_counselor_is_denied_by_the_GATE_before_any_unpolicied_table_is_read()
    {
        // The reader's FIRST read is its authorization gate: users, policied by 005-sensitive.sql (self OR the
        // caller's school). Denial therefore names the gate, not an instrument — and it does so BEFORE the
        // reader touches lia_assessment_sessions or personality_assessment_sessions, which are policied by
        // NOTHING (still on formmaps#77's PENDING list).
        //
        // This test goes red on any reordering. Remove the gate and the reader falls through to pca_results and
        // names PCA/DISC_MISSING; hoist the LIA or the personality read above it and it names MIL/PERSONALITY,
        // having already read another school's student. The block below proves that is a real hazard and not a
        // hypothetical: under school B's own session those two tables really do hand the rows over.
        var ex = await Assert.ThrowsAsync<CareerFitInputException>(
            () => Evaluator().EvaluateAsync(Counselor(CounselorB, SchoolB), StudentA1));

        Assert.Equal(InputInstruments.Student, ex.Instrument);
        Assert.Equal(InputWarningCodes.StudentNotVisible, ex.Code);

        // Which of the reader's four tables actually deny school B's counselor, measured on this seed under that
        // caller's own RLS session. The two POLICIED tables deny; the two SESSION tables do not. Only the gate's
        // position stands between "denied" and "another school's LIA percentiles".
        var counselorB = Counselor(CounselorB, SchoolB);
        Assert.Equal(0L, await VisibleRowsAsync(counselorB, $"""SELECT count(*) FROM "users" WHERE "id" = '{StudentA1}' """));
        Assert.Equal(0L, await VisibleRowsAsync(counselorB, $"""SELECT count(*) FROM "pca_results" WHERE "userId" = '{StudentA1}' """));
        Assert.Equal(1L, await VisibleRowsAsync(counselorB, $"""SELECT count(*) FROM "lia_assessment_sessions" WHERE "user_id" = '{StudentA1}' """));
        Assert.Equal(1L, await VisibleRowsAsync(counselorB, $"""SELECT count(*) FROM "personality_assessment_sessions" WHERE "user_id" = '{StudentA1}' """));

        await using var admin = await _adminDataSource.OpenConnectionAsync();
        Assert.Equal(0L, await ScalarAsync(admin, """SELECT count(*) FROM "careerfit_runs" """));

        // Positive control: the same-school counselor CAN evaluate, and the run carries the student's tenant.
        var run = await Evaluator().EvaluateAsync(Counselor(CounselorA, SchoolA), StudentA1);
        Assert.Equal(SchoolA, run.SchoolId);
        Assert.Equal(new[] { run.Id }, await VisibleRunsAsync(Student(StudentA1, SchoolA)));
    }

    [Fact]
    public async Task Super_admin_evaluates_under_bypass_and_the_run_still_carries_the_students_school()
    {
        // A super-admin request has no tenant of its own; the run's "schoolId" must still be the STUDENT's so
        // the student's school staff can read it afterwards. This is why the reader snapshots users."schoolId".
        var run = await Evaluator().EvaluateAsync(SuperAdminContext(), StudentA1);

        Assert.Equal(SchoolA, run.SchoolId);
        Assert.Equal(new[] { run.Id }, await VisibleRunsAsync(Counselor(CounselorA, SchoolA)));
        Assert.Empty(await VisibleRunsAsync(Counselor(CounselorB, SchoolB)));
    }

    [Fact]
    public async Task The_run_is_written_under_the_callers_OWN_session_never_a_bypass_one()
    {
        // The claim in this file and in CareerFitRunWriter's header — "the caller's writable RLS session", so the
        // policy's WITH CHECK is what scopes the write — was true in code and unproven by any test: a writer that
        // opened a system/bypass session would have produced identical rows and every assertion above would still
        // be green. This test reads the GUCs the DATABASE actually had in force on the connection each INSERT ran
        // on, which is the only thing a bypass switch cannot fake. Switch CareerFitRunWriter to
        // RequestContext.System() (or any Bypass plan) and the three GUC assertions below turn red: bypass_rls is
        // 'on' and both identity GUCs come back unset.
        var factory = new SessionSpy(Factory());
        var evaluator = new CareerFitEvaluator(
            new CareerFitInputReader(factory), new CareerFitRunWriter(factory), Provider, new VocationalV360Adapter(Provider));

        // A COUNSELOR, not the student: the caller's identity and the run's subject differ, so a writer that
        // silently ran as the subject (or as nobody) is distinguishable from one that ran as the caller.
        var run = await evaluator.EvaluateAsync(Counselor(CounselorA, SchoolA), StudentA1);

        // Exactly two sessions, in this order: the reader's read-only one, then the writer's writable one. A
        // writer that opened its own connection instead of the injected factory would not appear here at all.
        Assert.Equal([true, false], factory.Sessions.Select(s => s.ReadOnly).ToArray());

        var writerSession = factory.Sessions.Single(s => !s.ReadOnly);
        Assert.Equal(CounselorA, writerSession.CurrentUserId);                      // what the DATABASE had
        Assert.Equal(SchoolA, writerSession.CurrentSchoolId);
        Assert.NotEqual("on", writerSession.BypassRls);
        Assert.Equal(TenantGucPlanMode.Identity, writerSession.Plan.Mode);          // and what the factory planned

        // And the reader ran under the same identity, so "the caller's context" is the whole pipeline's, not the
        // writer's alone.
        var readerSession = factory.Sessions.Single(s => s.ReadOnly);
        Assert.Equal(CounselorA, readerSession.CurrentUserId);
        Assert.Equal(SchoolA, readerSession.CurrentSchoolId);
        Assert.NotEqual("on", readerSession.BypassRls);

        // The row really landed (a green GUC assertion over a write that never happened would prove nothing).
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        Assert.Equal(1L, await ScalarAsync(admin, $"""SELECT count(*) FROM "careerfit_runs" WHERE "id" = '{run.Id}' """));
    }

    // ---- fail closed on a missing instrument ----

    [Fact]
    public async Task Missing_LIA_throws_a_typed_exception_naming_MIL_and_writes_nothing()
    {
        var ex = await Assert.ThrowsAsync<CareerFitInputException>(
            () => Evaluator().EvaluateAsync(Student(StudentA2, SchoolA), StudentA2));

        Assert.Equal(InputInstruments.Mil, ex.Instrument);
        Assert.Equal(InputWarningCodes.MilPercentilesMissing, ex.Code);

        await using var admin = await _adminDataSource.OpenConnectionAsync();
        Assert.Equal(0L, await ScalarAsync(admin, """SELECT count(*) FROM "careerfit_runs" """));
        Assert.Equal(0L, await ScalarAsync(admin, """SELECT count(*) FROM "careerfit_family_results" """));
    }

    [Fact]
    public async Task Missing_personality_and_missing_PCA_are_named_too()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();

        // A2 gets a LIA session but loses its personality session: PERSONALITY is the missing instrument.
        await SeedLiaSessionAsync(admin, "lia-a2", StudentA2, SampleStudent.PercentilesJson, "2026-09-01 10:00:00");
        await ExecAsync(admin, $"""DELETE FROM "personality_assessment_sessions" WHERE "user_id" = '{StudentA2}' """);
        var personality = await Assert.ThrowsAsync<CareerFitInputException>(
            () => Evaluator().EvaluateAsync(Student(StudentA2, SchoolA), StudentA2));
        Assert.Equal(InputInstruments.Personality, personality.Instrument);

        // Then loses its PCA row: PCA is the first INSTRUMENT read (the gate is first overall), so PCA is named.
        await ExecAsync(admin, $"""DELETE FROM "pca_results" WHERE "userId" = '{StudentA2}' """);
        var pca = await Assert.ThrowsAsync<CareerFitInputException>(
            () => Evaluator().EvaluateAsync(Student(StudentA2, SchoolA), StudentA2));
        Assert.Equal(InputInstruments.Pca, pca.Instrument);

        Assert.Equal(0L, await ScalarAsync(admin, """SELECT count(*) FROM "careerfit_runs" """));
    }

    // ---- which row the reader picks ----

    [Fact]
    public async Task Reader_takes_the_newest_completed_active_LIA_session_and_ignores_others()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        // Newer but abandoned; newer but inactive; older completed — none of these may win over the newest completed+active.
        await SeedLiaSessionAsync(admin, "lia-a1-abandoned", StudentA1, """{"pattern_recognition":5,"verbal_reasoning":5,"numerical_speed":5,"working_memory":5,"visual_rotation":5}""", "2026-09-02 12:00:00", status: "abandoned");
        await SeedLiaSessionAsync(admin, "lia-a1-inactive", StudentA1, """{"pattern_recognition":6,"verbal_reasoning":6,"numerical_speed":6,"working_memory":6,"visual_rotation":6}""", "2026-09-02 13:00:00", isActive: false);
        await SeedLiaSessionAsync(admin, "lia-a1-older", StudentA1, """{"pattern_recognition":7,"verbal_reasoning":7,"numerical_speed":7,"working_memory":7,"visual_rotation":7}""", "2026-08-01 10:00:00");
        await SeedLiaSessionAsync(admin, "lia-a1-newest", StudentA1, """{"pattern_recognition":90,"verbal_reasoning":91,"numerical_speed":92,"working_memory":93,"visual_rotation":94}""", "2026-09-02 11:00:00");

        var run = await Evaluator().EvaluateAsync(Student(StudentA1, SchoolA), StudentA1);

        Assert.Equal("lia-a1-newest", run.Sources.LiaSessionId);
        Assert.Equal(new MilInput(90, 91, 92, 93, 94), run.Inputs.Mil);
    }

    [Fact]
    public async Task Reader_mirrors_PersonalityResultReader_a_newest_completed_session_without_a_resolved_type_is_no_results()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await SeedPersonalitySessionAsync(admin, "pers-a1-untyped", StudentA1, SampleStudent.DimensionScoresJson(), "2026-09-02 09:00:00", resolvedType: null);

        var ex = await Assert.ThrowsAsync<CareerFitInputException>(
            () => Evaluator().EvaluateAsync(Student(StudentA1, SchoolA), StudentA1));

        Assert.Equal(InputInstruments.Personality, ex.Instrument);
        Assert.Equal(InputWarningCodes.PersonalityScoresMissing, ex.Code);
        Assert.Equal(0L, await ScalarAsync(admin, """SELECT count(*) FROM "careerfit_runs" """));
    }

    [Fact]
    public async Task Repairs_made_by_the_adapters_are_on_the_persisted_quality_record()
    {
        // A1's LIA gets tail percentiles (0 and 100) and its PCA loses a competency: both are repaired, scored,
        // and recorded — never silently, never a throw.
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await SeedLiaSessionAsync(admin, "lia-a1-tails", StudentA1, """{"pattern_recognition":0,"verbal_reasoning":100,"numerical_speed":50,"working_memory":50,"visual_rotation":50}""", "2026-09-02 11:00:00");
        await ExecAsync(admin, $$"""UPDATE "pca_results" SET "competences" = '{"PcaCmps":[{"CmpNom":"COMUNICACIÓN","Level":3}]}'::jsonb WHERE "userId" = '{{StudentA1}}' """);

        var run = await Evaluator().EvaluateAsync(Student(StudentA1, SchoolA), StudentA1);

        Assert.Equal(new MilInput(1, 99, 50, 50, 50), run.Inputs.Mil);
        Assert.True(run.Quality.HasRepairs);
        Assert.Equal(23, run.Quality.DefaultedCompetencyIds.Count);

        var quality = JsonDocument.Parse(await StringAsync(admin, $"""SELECT "inputQuality"::text FROM "careerfit_runs" WHERE "id" = '{run.Id}' """)).RootElement;
        Assert.True(quality.GetProperty("has_repairs").GetBoolean());
        Assert.Equal(23, quality.GetProperty("defaulted_competency_ids").GetArrayLength());
        Assert.Equal(2, quality.GetProperty("warnings").EnumerateArray().Count(w => w.GetProperty("code").GetString() == InputWarningCodes.MilPercentileClamped));
    }

    // ---- 360 (FM-CF-007/008) ----

    /// <summary>
    /// The whole 360 path on the real tables: rows written the way the vocational chassis writes them, read
    /// back through the chassis's OWN loader, aggregated to variable level, and scored per family from the
    /// rule set's relevance weights. The item TEXTS do not exist (FM-CF-006 is blocked on TIMS) and none is
    /// invented here — only the codes, which are the rule set's own, and synthetic ratings.
    ///
    /// This is the SELF-ONLY shape V1 ships, so every claim about a single rater is made against the
    /// database: real scores, no consensus, NOT_DETERMINABLE, and 360 never counted as a fourth STRONG
    /// instrument. IND is seeded deliberately and must not appear.
    /// </summary>
    [Fact]
    public async Task Seeded_360_item_responses_score_at_variable_level_with_self_only_confidence()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await SeedRaterGroupAsync(admin, "eg-a1-self", StudentA1, "self",
            [(1, "AN", 5), (2, "AN", 4), (3, "AST", 5), (7, "OA", 3), (27, "EA", 5), (36, "IND", 5)]);

        var run = await Evaluator().EvaluateAsync(Student(StudentA1, SchoolA), StudentA1);

        // Variable level: one aggregate per seeded code, IND excluded by name (FM-CF-008).
        Assert.Equal(["AN", "AST", "OA", "EA"], run.Inputs.V360Aggregates.Keys.ToArray());
        Assert.Equal(87.5, run.Inputs.V360Aggregates["AN"].Score);    // mean(100, 75), SELF alone
        Assert.Equal(100.0, run.Inputs.V360Aggregates["AST"].Score);
        Assert.Equal(50.0, run.Inputs.V360Aggregates["OA"].Score);

        // One rater: consensus is undefined, and nothing manufactures one.
        Assert.All(run.Inputs.V360Aggregates.Values, a => Assert.Null(a.Consensus));
        Assert.All(run.Inputs.V360Aggregates.Values, a => Assert.Null(a.ConfidenceIndex));
        Assert.Equal(Confidence.NotDeterminable, run.Inputs.CareerFit360Confidence);

        Assert.Equal(V360Sources.VocationalResponses, run.Quality.V360Source);
        Assert.Contains(run.Quality.Warnings, w => w.Code == InputWarningCodes.V360SingleRater);
        Assert.Contains(run.Quality.Warnings, w => w.Code == InputWarningCodes.V360IndExcluded);
        Assert.DoesNotContain(run.Quality.Warnings, w => w.Code == InputWarningCodes.V360NoData);

        // Family level: family 1's rules carry AN, AST, OA, MR, EA and IND. Four of them are scored, IND is
        // not, MR was never answered — so F06's weighted mean runs over exactly those four.
        var family1 = run.Families.Single(f => f.OwnerId == 1);
        Assert.True(family1.CareerFit360 > 0.0);
        var expected = CareerFitFormulas.CalculateCareerFit360(run.Inputs.V360Aggregates, Provider.Rules.Family(1).V360Rules);
        Assert.Equal(expected.Score, family1.CareerFit360);
        Assert.Equal(["AN", "AST", "OA", "EA"], expected.Variables.Keys.ToArray());

        // Persisted, and still not a fourth STRONG instrument: NOT_DETERMINABLE downgrades a STRONG 360.
        Assert.Equal(
            family1.CareerFit360,
            await DoubleAsync(admin, $"""SELECT "careerfit360" FROM "careerfit_family_results" WHERE "runId" = '{run.Id}' AND "familyId" = 1"""));
        Assert.DoesNotContain(run.Families, f => f.ConvergenceLevel == Convergence.VeryHigh);

        var quality = JsonDocument.Parse(await StringAsync(admin, $"""SELECT "inputQuality"::text FROM "careerfit_runs" WHERE "id" = '{run.Id}' """)).RootElement;
        Assert.Equal(V360Sources.VocationalResponses, quality.GetProperty("v360_source").GetString());
        Assert.True(quality.GetProperty("evidence").GetProperty("360").GetBoolean());
    }

    /// <summary>
    /// The fallback is a DECISION, made on the real rows: a student whose chassis rows exist but carry no
    /// 360 variable code (every student until FM-CF-006 seeds the items) gets today's run — empty
    /// aggregates, NOT_DETERMINABLE, careerfit360 0.0 on every family, v360_source NO_DATA.
    /// </summary>
    [Fact]
    public async Task Rater_groups_with_no_360_variable_code_still_produce_the_NO_DATA_run()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await SeedRaterGroupAsync(admin, "eg-a1-legacy", StudentA1, "self",
            [(1, "communication", 5), (2, "leadership", 4)]);   // legacy vocational dimensions, not 360 variables

        var run = await Evaluator().EvaluateAsync(Student(StudentA1, SchoolA), StudentA1);

        Assert.Empty(run.Inputs.V360Aggregates);
        Assert.Equal(Confidence.NotDeterminable, run.Inputs.CareerFit360Confidence);
        Assert.Equal(V360Sources.NoData, run.Quality.V360Source);
        Assert.Contains(run.Quality.Warnings, w => w.Code == InputWarningCodes.V360NoData);
        Assert.All(run.Families, f => Assert.Equal(0.0, f.CareerFit360));
    }

    /// <summary>An INCOMPLETE rater group is not evidence: the chassis's own loader filters on isEvaluationCompleted, and CareerFit inherits that rather than deciding it again.</summary>
    [Fact]
    public async Task An_incomplete_rater_group_is_not_read_as_360_evidence()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await SeedRaterGroupAsync(admin, "eg-a1-open", StudentA1, "self", [(1, "AN", 5)], completed: false);

        var run = await Evaluator().EvaluateAsync(Student(StudentA1, SchoolA), StudentA1);

        Assert.Empty(run.Inputs.V360Aggregates);
        Assert.Equal(V360Sources.NoData, run.Quality.V360Source);
    }

    // ---- contexts ----

    private static RequestContext Student(string userId, string? schoolId) => Ctx(userId, FormMapsRoles.Student, schoolId);

    private static RequestContext Counselor(string userId, string schoolId) => Ctx(userId, FormMapsRoles.Counselor, schoolId);

    private static RequestContext SuperAdminContext() => Ctx(SuperAdmin, FormMapsRoles.SuperAdmin, schoolId: null);

    private static RequestContext Ctx(string userId, string role, string? schoolId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, role, $"{userId}@e.st", userId),
            schoolId, permissions: [],
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    // ---- wiring under test ----

    private IFormMapsDatabaseSessionFactory Factory() =>
        new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());

    private CareerFitEvaluator Evaluator()
    {
        var factory = Factory();
        return new CareerFitEvaluator(
            new CareerFitInputReader(factory),
            new CareerFitRunWriter(factory),
            Provider,
            // The registered adapter (FM-CF-007), not the NoData one: with no 360 item seeded for this
            // student it must SELECT NoData itself and produce today's run byte for byte. That is the whole
            // claim of "keep NoData as the fallback", and swapping in NoDataV360Adapter here would hide it.
            new VocationalV360Adapter(Provider));
    }

    private async Task<Guid[]> VisibleRunsAsync(RequestContext context)
    {
        await using var session = await Factory().OpenReadOnlyAsync(context);
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = """SELECT "id" FROM "careerfit_runs" """;
        var ids = new List<Guid>();
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            ids.Add(reader.GetGuid(0));
        }

        return ids.OrderBy(g => g).ToArray();
    }

    private async Task<long> VisibleFamilyRowsAsync(RequestContext context, Guid runId)
    {
        await using var session = await Factory().OpenReadOnlyAsync(context);
        var command = (NpgsqlCommand)session.Connection.CreateCommand();
        command.Transaction = (NpgsqlTransaction)session.Transaction;
        command.CommandText = """SELECT count(*) FROM "careerfit_family_results" WHERE "runId" = @runId""";
        command.Parameters.AddWithValue("runId", runId);
        return (long)(await command.ExecuteScalarAsync())!;
    }

    /// <summary>
    /// A pass-through <see cref="IFormMapsDatabaseSessionFactory"/> that records, for every session the code under
    /// test opens, the plan the factory resolved AND the three tenant GUCs the database reports on that session's
    /// own connection once the applier has run. The GUCs are the evidence: a plan can be inspected without proving
    /// the connection carries it, and a session opened outside this factory never shows up at all.
    /// </summary>
    private sealed class SessionSpy(IFormMapsDatabaseSessionFactory inner) : IFormMapsDatabaseSessionFactory
    {
        private const string GucSql =
            """
            SELECT current_setting('app.current_user_id', true),
                   current_setting('app.current_school_id', true),
                   current_setting('app.bypass_rls', true)
            """;

        private readonly List<OpenedSession> _sessions = [];

        public IReadOnlyList<OpenedSession> Sessions => _sessions;

        public async Task<FormMapsDatabaseSession> OpenReadOnlyAsync(RequestContext context, CancellationToken cancellationToken = default) =>
            await RecordAsync(await inner.OpenReadOnlyAsync(context, cancellationToken), cancellationToken);

        public async Task<FormMapsDatabaseSession> OpenWritableAsync(RequestContext context, CancellationToken cancellationToken = default) =>
            await RecordAsync(await inner.OpenWritableAsync(context, cancellationToken), cancellationToken);

        private async Task<FormMapsDatabaseSession> RecordAsync(FormMapsDatabaseSession session, CancellationToken cancellationToken)
        {
            await using var command = session.Connection.CreateCommand();
            command.Transaction = session.Transaction;
            command.CommandText = GucSql;
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            await reader.ReadAsync(cancellationToken);
            _sessions.Add(new OpenedSession(
                session.IsReadOnly,
                session.TenantGucPlan,
                reader.IsDBNull(0) ? null : reader.GetString(0),
                reader.IsDBNull(1) ? null : reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetString(2)));
            return session;
        }

        /// <summary>One opened session: the plan asked for, and what the connection actually reports.</summary>
        internal sealed record OpenedSession(
            bool ReadOnly, TenantGucPlan Plan, string? CurrentUserId, string? CurrentSchoolId, string? BypassRls);
    }

    /// <summary>A count under the CALLER's own RLS session (the app login) — what that caller can actually see.</summary>
    private async Task<long> VisibleRowsAsync(RequestContext context, string sql)
    {
        await using var session = await Factory().OpenReadOnlyAsync(context);
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return Convert.ToInt64(await command.ExecuteScalarAsync());
    }

    // ---- seed: the rows the real writers persist ----

    private async Task SeedAsync()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await ExecAsync(admin,
            $$"""
            INSERT INTO "schools" ("id", "name") VALUES ('{{SchoolA}}', 'School A'), ('{{SchoolB}}', 'School B');

            INSERT INTO "users" ("id", "email", "schoolId") VALUES
                ('{{StudentA1}}',  '{{StudentA1}}@e.st',  '{{SchoolA}}'),
                ('{{StudentA2}}',  '{{StudentA2}}@e.st',  '{{SchoolA}}'),
                ('{{CounselorA}}', '{{CounselorA}}@e.st', '{{SchoolA}}'),
                ('{{CounselorB}}', '{{CounselorB}}@e.st', '{{SchoolB}}'),
                ('{{SuperAdmin}}', '{{SuperAdmin}}@e.st', NULL);

            INSERT INTO "counselor_student_assignments" ("id", "counselorId", "studentId") VALUES
                ('csa-a', '{{CounselorA}}', '{{StudentA1}}'),
                ('csa-b', '{{CounselorB}}', '{{StudentA1}}');   -- cross-school: the row exists, the policy must still deny
            """);

        var competences = SampleStudent.CompetencesJson(Provider.Rules);
        await SeedPcaResultAsync(admin, PcaRowA1, StudentA1, SampleStudent.DiscJson, competences);
        await SeedPcaResultAsync(admin, "pca-a2", StudentA2, SampleStudent.DiscJson, competences);
        await SeedLiaSessionAsync(admin, LiaSessionA1, StudentA1, SampleStudent.PercentilesJson, "2026-09-01 10:00:00");
        await SeedPersonalitySessionAsync(admin, PersonalitySessionA1, StudentA1, SampleStudent.DimensionScoresJson(), "2026-09-01 11:00:00", resolvedType: "ENTJ");
        await SeedPersonalitySessionAsync(admin, "pers-a2", StudentA2, SampleStudent.DimensionScoresJson(), "2026-09-01 11:00:00", resolvedType: "ENTJ");
    }

    private static async Task SeedPcaResultAsync(NpgsqlConnection admin, string id, string userId, string disc, string competences)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "pca_results" ("id", "userId", "discResult", "competences", "isActive")
            VALUES (@id, @uid, @disc::jsonb, @competences::jsonb, true)
            """, admin);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("disc", disc);
        cmd.Parameters.AddWithValue("competences", competences);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedLiaSessionAsync(
        NpgsqlConnection admin, string id, string userId, string percentiles, string completedAt, string status = "completed", bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            $"""
            INSERT INTO "lia_assessment_sessions" ("id", "user_id", "status", "completed_at", "percentiles", "is_active")
            VALUES (@id, @uid, '{status}'::"LiaSessionStatus", '{completedAt}'::timestamp, @pct::jsonb, @active)
            """, admin);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("pct", percentiles);
        cmd.Parameters.AddWithValue("active", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedPersonalitySessionAsync(
        NpgsqlConnection admin, string id, string userId, string dimensionScores, string completedAt, string? resolvedType)
    {
        await using var cmd = new NpgsqlCommand(
            $"""
            INSERT INTO "personality_assessment_sessions" ("id", "user_id", "variant", "status", "resolved_type", "dimension_scores", "completed_at", "is_active")
            VALUES (@id, @uid, 'estudiantil', 'completed', @type, @scores::jsonb, '{completedAt}'::timestamp, true)
            """, admin);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("type", (object?)resolvedType ?? DBNull.Value);
        cmd.Parameters.AddWithValue("scores", dimensionScores);
        await cmd.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// One completed vocational rater group with its item responses, written exactly as the chassis writes
    /// them (evaluation_groups + vocational_responses, instrument 'vocational'). The variable code goes in
    /// vocational_responses."dimensionKey" — the carrier FM-CF-007 reads and FM-CF-006 will seed; see
    /// V360Aggregation's header for what happens if TIMS seeds it somewhere else.
    /// </summary>
    private static async Task SeedRaterGroupAsync(
        NpgsqlConnection admin,
        string groupId,
        string userId,
        string groupType,
        IReadOnlyList<(int Question, string Code, int? Rating)> responses,
        bool completed = true)
    {
        await using (var cmd = new NpgsqlCommand(
            """
            INSERT INTO "evaluation_groups" ("id", "groupType", "evaluatedUserId", "instrument", "isEvaluationCompleted", "isActive")
            VALUES (@id, @type, @uid, 'vocational', @done, true)
            """, admin))
        {
            cmd.Parameters.AddWithValue("id", groupId);
            cmd.Parameters.AddWithValue("type", groupType);
            cmd.Parameters.AddWithValue("uid", userId);
            cmd.Parameters.AddWithValue("done", completed);
            await cmd.ExecuteNonQueryAsync();
        }

        foreach (var (question, code, rating) in responses)
        {
            await using var cmd = new NpgsqlCommand(
                """
                INSERT INTO "vocational_responses"
                    ("id", "evaluationGroupId", "instrumentVersion", "group", "questionNumber", "dimensionKey", "type", "ratingValue", "isActive")
                VALUES (@id, @gid, 'v360-careerfit', @grp, @q, @code, 'likert', @rating, true)
                """, admin);
            cmd.Parameters.AddWithValue("id", $"{groupId}-{question}");
            cmd.Parameters.AddWithValue("gid", groupId);
            cmd.Parameters.AddWithValue("grp", groupType);
            cmd.Parameters.AddWithValue("q", question);
            cmd.Parameters.AddWithValue("code", code);
            cmd.Parameters.AddWithValue("rating", (object?)rating ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync();
        }
    }

    private static async Task ExecAsync(NpgsqlConnection connection, string sql)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<long> ScalarAsync(NpgsqlConnection connection, string sql)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        return Convert.ToInt64(await command.ExecuteScalarAsync());
    }

    private static async Task<double> DoubleAsync(NpgsqlConnection connection, string sql)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        return (double)(await command.ExecuteScalarAsync())!;
    }

    private static async Task<string> StringAsync(NpgsqlConnection connection, string sql)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        return (string)(await command.ExecuteScalarAsync())!;
    }

    /// <summary>
    /// The student the platform's writers would have produced — byte-identical to the unit tests'
    /// SampleStudentRows so the pure and the persisted paths score the same person.
    /// </summary>
    private static class SampleStudent
    {
        public const string DiscJson = """
            {"PcaD1":89,"PcaI1":18,"PcaS1":18,"PcaC1":21,
             "PcaD2":87,"PcaI2":87,"PcaS2":26,"PcaC2":25,
             "PcaD3":90,"PcaI3":60,"PcaS3":25,"PcaC3":25}
            """;

        public const string PercentilesJson = """
            {"pattern_recognition":72,"verbal_reasoning":58,"numerical_speed":81,"working_memory":47,"visual_rotation":63,"global":64.2}
            """;

        public static string CompetencesJson(CareerFitRules rules)
        {
            var entries = rules.Competencies
                .Select(c => $$"""{"CmpNom":"{{c.Name.ToUpperInvariant()}}","Level":{{1 + (c.CompetencyId - 1) % 4}}}""");
            return $$"""{"PcaCmps":[{{string.Join(",", entries)}}]}""";
        }

        public static string DimensionScoresJson()
        {
            var answers = new List<PersonalityAnswer>();
            var n = 1;
            foreach (var (dimension, aCount) in new[] { ("EI", 14), ("SN", 8), ("TF", 17), ("JP", 11) })
            {
                for (var i = 0; i < 20; i++)
                {
                    answers.Add(new PersonalityAnswer(dimension, n++, i < aCount ? "A" : "B"));
                }
            }

            return JsonSerializer.Serialize(PersonalityScoring.ScorePersonality("estudiantil", answers).Dimensions);
        }
    }
}
