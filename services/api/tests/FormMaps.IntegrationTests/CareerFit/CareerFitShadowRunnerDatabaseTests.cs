using FormMaps.Application.Auth;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;
using FormMaps.Application.CareerFit.Shadow;
using FormMaps.Application.Data;
using FormMaps.Domain.Auth;
using FormMaps.Infrastructure.CareerFit;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.CareerFit;

/// <summary>
/// FM-CF-013's JOB, end to end on the real tables and as the restricted NOSUPERUSER NOBYPASSRLS login:
/// <see cref="CareerFitShadowRunner"/> behind the REAL <see cref="LegacyCareerScoreReader"/>,
/// <see cref="CareerFitEvaluator"/>, <see cref="CareerFitRunReader"/> and
/// <see cref="CareerFitShadowWriter"/>, on a same-school counselor's session — the operator the slice's
/// own header describes.
///
/// WHY THIS FILE EXISTS. The review found the runner had NO test of any kind, and the first one written
/// against it failed: all three pre-scoring arms (LEGACY_ABSENT, LEGACY_LOCKED, ENGINE_NOT_SCORABLE)
/// built their row with <c>schoolId: null</c>, and careerfit_shadow_comparisons' WITH CHECK — careerfit_runs'
/// predicate verbatim — refuses a NULL-tenant row about someone else's student on every non-bypass
/// session. The job therefore threw <c>42501</c> on the first student in a cohort with no cached legacy
/// answer, which is exactly the population the design says must be recorded. Observed RED here, from the
/// production writer, before the fix:
///
///   Npgsql.PostgresException : 42501: new row violates row-level security policy for table
///   "careerfit_shadow_comparisons"  at CareerFitShadowWriter.WriteAsync ← CareerFitShadowRunner.MeasureAsync
///
/// The repair is the one the run writer already makes: resolve the STUDENT's tenant from the policied
/// users row, on the caller's own session, BEFORE anything else is read, and carry it on every row. That
/// read is also the gate — a caller who cannot see the student gets no row at all, and the pair is not
/// measured.
///
/// The shadow PROJECTION is incomplete by design (INCOMPLETE_PENDING_LEGACY_CLUSTER_VOCABULARY), so a
/// scorable pair here comes back TAXONOMY_UNMAPPED with no metrics. That is the real behaviour of a real
/// run today and the tests assert it rather than substituting a complete synthetic projection: what is
/// under test is the JOB — its order of operations, its tenant, its run reuse — not the comparator, which
/// CareerFitShadowComparatorTests covers over synthetic pairs.
/// </summary>
public sealed class CareerFitShadowRunnerDatabaseTests : IClassFixture<CareerFitDatabaseFixture>, IAsyncLifetime
{
    private const string RulesVersion = "1.0.0-draft.1";

    private const string SchoolA = "school-a";
    private const string SchoolB = "school-b";
    private const string StudentA1 = "student-a1";      // complete: PCA + LIA + personality — the engine can score
    private const string StudentA2 = "student-a2";      // PCA + personality, NO LIA — the engine fails closed on MIL
    private const string CounselorA = "counselor-a";
    private const string CounselorB = "counselor-b";
    private const string SuperAdmin = "super-admin";

    private static readonly string[] AllTables =
    [
        "careerfit_shadow_comparisons", "careerfit_family_results", "careerfit_runs",
        "user_career_profiles",
        "vocational_responses", "evaluation_groups",
        "personality_assessment_sessions", "lia_assessment_sessions", "pca_results",
        "student_parent_links", "counselor_student_assignments", "users", "schools",
    ];

    private static readonly CareerFitRulesProvider Provider = new(RulesVersion);

    private readonly CareerFitDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;        // restricted login — everything under test
    private NpgsqlDataSource _adminDataSource = null!;   // superuser — seeding and assertions only

    public CareerFitShadowRunnerDatabaseTests(CareerFitDatabaseFixture fixture) => _fixture = fixture;

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

    // ---- the three pre-scoring arms, on the operator's own session ----

    /// <summary>
    /// RED FIRST, and the blocker itself: a student with no cached legacy answer. The row must be written
    /// (the denominator has to count "we looked at 40 students, 12 had no legacy answer") and it must carry
    /// the STUDENT's tenant, or the policy refuses it on the very session the writer documents as the only
    /// one it ever uses. Before the fix this threw PostgresException 42501 out of MeasureAsync.
    /// </summary>
    [Fact]
    public async Task Legacy_absent_is_recorded_with_the_students_tenant_on_the_operators_own_session()
    {
        var comparison = await Runner().MeasureAsync(Counselor(CounselorA, SchoolA), StudentA1);

        Assert.Equal(CareerFitShadowCause.LegacyAbsent, comparison.PrimaryCause);
        Assert.False(comparison.Comparable);
        Assert.Equal(SchoolA, comparison.SchoolId);
        Assert.Null(comparison.RunId);

        // it landed, and the operator who ran the cohort can read their own evidence back
        Assert.Equal(1L, await AdminCountAsync($"""SELECT count(*) FROM "careerfit_shadow_comparisons" WHERE "userId" = '{StudentA1}' """));
        Assert.Equal(1L, await VisibleShadowsAsync(Counselor(CounselorA, SchoolA)));
        Assert.Equal(0L, await VisibleShadowsAsync(Counselor(CounselorB, SchoolB)));

        // and nothing was scored: the legacy verdict is decided before the engine runs.
        Assert.Equal(0L, await AdminCountAsync("""SELECT count(*) FROM "careerfit_runs" """));
    }

    /// <summary>
    /// The same shape for legacy's own locked state. <c>isAnalysisComplete = false</c> is what legacy would
    /// answer for this student today, so the shadow must not compare against whatever stale matches the
    /// cache still holds — and the row that records it needs the same tenant as any other.
    /// </summary>
    [Fact]
    public async Task Legacy_locked_is_recorded_with_the_students_tenant_and_nothing_is_scored()
    {
        await SeedLegacyProfileAsync(StudentA1, TwoClusterMatches, analysisComplete: false);

        var comparison = await Runner().MeasureAsync(Counselor(CounselorA, SchoolA), StudentA1);

        Assert.Equal(CareerFitShadowCause.LegacyLocked, comparison.PrimaryCause);
        Assert.Equal(SchoolA, comparison.SchoolId);
        Assert.Equal(0L, await AdminCountAsync("""SELECT count(*) FROM "careerfit_runs" """));
        Assert.Equal(1L, await VisibleShadowsAsync(Counselor(CounselorA, SchoolA)));
    }

    /// <summary>
    /// The finding the slice most wants to count: legacy could score this student and the engine refuses to.
    /// StudentA2 has no completed LIA session, so CareerFitInputReader fails closed on MIL, and the runner
    /// records ENGINE_NOT_SCORABLE with the instrument PERSISTED on the row's note rather than logged.
    /// </summary>
    [Fact]
    public async Task Engine_not_scorable_is_recorded_with_the_students_tenant_and_names_the_instrument()
    {
        await SeedLegacyProfileAsync(StudentA2, TwoClusterMatches, analysisComplete: true);

        var comparison = await Runner().MeasureAsync(Counselor(CounselorA, SchoolA), StudentA2);

        Assert.Equal(CareerFitShadowCause.EngineNotScorable, comparison.PrimaryCause);
        Assert.Equal(SchoolA, comparison.SchoolId);
        Assert.Contains(InputInstruments.Mil, comparison.Note);
        Assert.Contains(InputWarningCodes.MilPercentilesMissing, comparison.Note);
        Assert.Equal(1L, await VisibleShadowsAsync(Counselor(CounselorA, SchoolA)));
        Assert.Equal(0L, await AdminCountAsync("""SELECT count(*) FROM "careerfit_runs" """));
    }

    /// <summary>
    /// NO ROW IS EVER WRITTEN WITH A NULL TENANT FOR A STUDENT WHO HAS ONE. Stated over all three pre-run
    /// arms at once, because the defect was identical in all three and a fix applied to one of them would
    /// otherwise stay green here.
    /// </summary>
    [Fact]
    public async Task No_pre_run_arm_ever_writes_a_null_tenant_for_a_student_who_has_one()
    {
        await Runner().MeasureAsync(Counselor(CounselorA, SchoolA), StudentA1);              // LEGACY_ABSENT

        await SeedLegacyProfileAsync(StudentA2, TwoClusterMatches, analysisComplete: false);
        await Runner().MeasureAsync(Counselor(CounselorA, SchoolA), StudentA2);              // LEGACY_LOCKED

        await SeedLegacyProfileAsync(StudentA2, TwoClusterMatches, analysisComplete: true, replace: true);
        await Runner().MeasureAsync(Counselor(CounselorA, SchoolA), StudentA2);              // ENGINE_NOT_SCORABLE

        Assert.Equal(3L, await AdminCountAsync("""SELECT count(*) FROM "careerfit_shadow_comparisons" """));
        Assert.Equal(0L, await AdminCountAsync("""SELECT count(*) FROM "careerfit_shadow_comparisons" WHERE "schoolId" IS NULL"""));
        Assert.Equal(3L, await VisibleShadowsAsync(Counselor(CounselorA, SchoolA)));
    }

    // ---- the tenant read is also the gate ----

    /// <summary>
    /// A cross-school operator does not produce a smaller cohort by accident, and does not produce a row
    /// about a student they cannot see either: the tenant read is the policied users row, it runs FIRST, and
    /// its failure short-circuits — the same gate, in the same position, as CareerFitInputReader's.
    /// </summary>
    [Fact]
    public async Task A_student_the_operator_cannot_see_is_refused_before_anything_is_read_or_written()
    {
        await SeedLegacyProfileAsync(StudentA1, TwoClusterMatches, analysisComplete: true);

        var refused = await Assert.ThrowsAsync<CareerFitInputException>(
            () => Runner().MeasureAsync(Counselor(CounselorB, SchoolB), StudentA1));

        Assert.Equal(InputInstruments.Student, refused.Instrument);
        Assert.Equal(InputWarningCodes.StudentNotVisible, refused.Code);
        Assert.Equal(0L, await AdminCountAsync("""SELECT count(*) FROM "careerfit_shadow_comparisons" """));
        Assert.Equal(0L, await AdminCountAsync("""SELECT count(*) FROM "careerfit_runs" """));
    }

    /// <summary>
    /// A super-admin operator runs under bypass and has no tenant of its own; the row must still carry the
    /// STUDENT's, or the school staff who asked for the cohort cannot read the evidence it produced. Same
    /// claim CareerFitEvaluatorDatabaseTests makes for the run, on the row that measures it.
    /// </summary>
    [Fact]
    public async Task A_super_admin_operator_still_records_the_students_tenant()
    {
        var comparison = await Runner().MeasureAsync(SuperAdminContext(), StudentA1);

        Assert.Equal(SchoolA, comparison.SchoolId);
        Assert.Equal(1L, await VisibleShadowsAsync(Counselor(CounselorA, SchoolA)));
    }

    // ---- the run-reuse rule ----

    /// <summary>
    /// The reuse rule, which shipped covered by the compiler alone: a run scored under the process's ACTIVE
    /// rules version on DISC graph 1 is the thing the shadow measures, so a second measurement reuses it
    /// instead of doubling the run table. <c>reuseExistingRun: false</c> forces a fresh evaluation, which is
    /// what FM-CF-014's recut will want.
    /// </summary>
    [Fact]
    public async Task A_usable_run_is_reused_and_reuse_can_be_turned_off()
    {
        await SeedLegacyProfileAsync(StudentA1, TwoClusterMatches, analysisComplete: true);

        var first = await Runner().MeasureAsync(Counselor(CounselorA, SchoolA), StudentA1);
        var second = await Runner().MeasureAsync(Counselor(CounselorA, SchoolA), StudentA1);

        Assert.NotNull(first.RunId);
        Assert.Equal(first.RunId, second.RunId);
        Assert.Equal(1L, await AdminCountAsync("""SELECT count(*) FROM "careerfit_runs" """));

        var third = await Runner().MeasureAsync(Counselor(CounselorA, SchoolA), StudentA1, reuseExistingRun: false);
        Assert.NotEqual(first.RunId, third.RunId);
        Assert.Equal(2L, await AdminCountAsync("""SELECT count(*) FROM "careerfit_runs" """));

        // The projection is INCOMPLETE, so a scorable pair is honestly recorded as unmapped with no metrics
        // rather than correlated over whatever happened to map. Both halves of the CHECK constraint hold.
        Assert.Equal(CareerFitShadowCause.TaxonomyUnmapped, first.PrimaryCause);
        Assert.False(first.Comparable);
        Assert.Null(first.SpearmanRho);
        Assert.Equal(SchoolA, first.SchoolId);
    }

    // ---- seeding and wiring ----

    /// <summary>Two legacy careers in two different clusters — enough to parse, never enough to project (the projection carries one evidenced entry).</summary>
    private const string TwoClusterMatches =
        """
        [
          {"programId":"SOC-021","programTitle":"Psicología","cluster":"Social_and_Behavioral_Sciences","totalScore":88.4},
          {"programId":"ENG-004","programTitle":"Ingeniería Civil","cluster":"Engineering_and_Technology","totalScore":81.0}
        ]
        """;

    private CareerFitShadowRunner Runner()
    {
        var factory = Factory();
        return new CareerFitShadowRunner(
            new CareerFitEvaluator(
                new CareerFitInputReader(factory), new CareerFitRunWriter(factory), Provider, new VocationalV360Adapter(Provider)),
            new CareerFitRunReader(factory),
            new LegacyCareerScoreReader(factory),
            new CareerFitStudentTenantReader(factory),
            new CareerFitShadowWriter(factory),
            Provider);
    }

    private IFormMapsDatabaseSessionFactory Factory() =>
        new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());

    private async Task<long> VisibleShadowsAsync(RequestContext context)
    {
        await using var session = await Factory().OpenReadOnlyAsync(context);
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = """SELECT count(*) FROM "careerfit_shadow_comparisons" """;
        return Convert.ToInt64(await command.ExecuteScalarAsync());
    }

    private async Task<long> AdminCountAsync(string sql)
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, admin);
        return Convert.ToInt64(await command.ExecuteScalarAsync());
    }

    private async Task SeedLegacyProfileAsync(string userId, string careerMatches, bool analysisComplete, bool replace = false)
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        if (replace)
        {
            await using var delete = new NpgsqlCommand("""DELETE FROM "user_career_profiles" WHERE "userId" = @uid""", admin);
            delete.Parameters.AddWithValue("uid", userId);
            await delete.ExecuteNonQueryAsync();
        }

        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "user_career_profiles" ("id", "userId", "isAnalysisComplete", "careerMatches")
            VALUES (@id, @uid, @done, @matches::jsonb)
            """, admin);
        cmd.Parameters.AddWithValue("id", $"ucp-{userId}-{Guid.NewGuid():N}");
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("done", analysisComplete);
        cmd.Parameters.AddWithValue("matches", careerMatches);
        await cmd.ExecuteNonQueryAsync();
    }

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
                ('csa-a', '{{CounselorA}}', '{{StudentA1}}');
            """);

        var competences = CareerFitSampleStudent.CompetencesJson(Provider.Rules);
        await SeedPcaResultAsync(admin, "pca-a1", StudentA1, CareerFitSampleStudent.DiscJson, competences);
        await SeedPcaResultAsync(admin, "pca-a2", StudentA2, CareerFitSampleStudent.DiscJson, competences);
        await SeedLiaSessionAsync(admin, "lia-a1", StudentA1, CareerFitSampleStudent.PercentilesJson);
        await SeedPersonalitySessionAsync(admin, "pers-a1", StudentA1, CareerFitSampleStudent.DimensionScoresJson());
        await SeedPersonalitySessionAsync(admin, "pers-a2", StudentA2, CareerFitSampleStudent.DimensionScoresJson());
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

    private static async Task SeedLiaSessionAsync(NpgsqlConnection admin, string id, string userId, string percentiles)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "lia_assessment_sessions" ("id", "user_id", "status", "completed_at", "percentiles", "is_active")
            VALUES (@id, @uid, 'completed'::"LiaSessionStatus", '2026-09-01 10:00:00'::timestamp, @pct::jsonb, true)
            """, admin);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("pct", percentiles);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedPersonalitySessionAsync(NpgsqlConnection admin, string id, string userId, string dimensionScores)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "personality_assessment_sessions" ("id", "user_id", "variant", "status", "resolved_type", "dimension_scores", "completed_at", "is_active")
            VALUES (@id, @uid, 'estudiantil', 'completed', 'ENTJ', @scores::jsonb, '2026-09-01 11:00:00'::timestamp, true)
            """, admin);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("scores", dimensionScores);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task ExecAsync(NpgsqlConnection connection, string sql)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync();
    }

    // ---- contexts ----

    private static RequestContext Counselor(string userId, string schoolId) => Ctx(userId, FormMapsRoles.Counselor, schoolId);

    private static RequestContext SuperAdminContext() => Ctx(SuperAdmin, FormMapsRoles.SuperAdmin, schoolId: null);

    private static RequestContext Ctx(string userId, string role, string? schoolId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, role, $"{userId}@e.st", userId),
            schoolId, permissions: [],
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);
}
