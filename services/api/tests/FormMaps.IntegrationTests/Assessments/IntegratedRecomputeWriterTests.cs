using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Data;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="VocationalWriter.RecomputeIntegratedAsync"/> — the port of
/// legacy recomputeIntegratedResult. Wires the FM-033 360 read + FM-035 profile (PCA competences + MIL) into
/// the FM-028 integration engine and upserts vocational_integrated_results. Pins: never_computed (no active
/// instrument, no write), not_ready (missing channel, no write), ready (upsert with numeric Decimals +
/// camelCase weightsApplied), and upsert idempotency.
/// </summary>
public sealed class IntegratedRecomputeWriterTests : IClassFixture<IntegratedRecomputeDatabaseFixture>, IAsyncLifetime
{
    private readonly IntegratedRecomputeDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public IntegratedRecomputeWriterTests(IntegratedRecomputeDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            TRUNCATE "vocational_instruments","vocational_results","vocational_integrated_results",
                     "pca_results","pca_exam_sessions","lia_assessment_sessions","evaluation_groups",
                     "evaluation_feedbacks","questions_360","student_grades","student_test_scores",
                     "student_portfolio_items","user_preferences"
            """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    private const string Weights = """{"threeSixty":0.5,"pca":0.3,"mil":0.2}""";
    private const string Bands = """{"strong":80,"moderateHigh":60,"medium":40}""";

    [Fact]
    public async Task Recompute_is_never_computed_without_an_active_instrument()
    {
        var user = NewUser();
        var outcome = await Writer().RecomputeIntegratedAsync(Ctx(user), user);

        Assert.Null(outcome);
        Assert.Null(await Reader().GetIntegratedAsync(Ctx(user), user)); // no write
    }

    [Fact]
    public async Task Recompute_is_not_ready_when_channels_are_missing()
    {
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedInstrumentAsync(conn, "v1"); // instrument only: no 360 score, no competences, no LIA

        var outcome = await Writer().RecomputeIntegratedAsync(Ctx(user), user);

        var notReady = Assert.IsType<IntegrationNotReady>(outcome);
        Assert.Equal(new[] { "360", "pca", "mil" }, notReady.Missing); // ordered
        Assert.Null(await Reader().GetIntegratedAsync(Ctx(user), user)); // nothing persisted
    }

    [Fact]
    public async Task Recompute_ready_upserts_the_integrated_result()
    {
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedInstrumentAsync(conn, "v1");
        await SeedVocationalScoreAsync(conn, user, "v1", composite: 70m);           // 360 channel = 70
        await SeedCompetencesAsync(conn, user, levels: [4, 4, 4]);                  // pca channel = 100
        await SeedFiveExamsAsync(conn, user, scorePercentage: 60);                  // mil channel = 60, lia complete

        var outcome = await Writer().RecomputeIntegratedAsync(Ctx(user), user);

        var payload = Assert.IsType<IntegratedResultPayload>(outcome);
        Assert.Equal("v1", payload.InstrumentVersion);
        Assert.Equal(70, payload.ThreeSixtyScore);
        Assert.Equal(100, payload.PcaScore);
        Assert.Equal(60, payload.MilScore);
        Assert.Equal(77, payload.IntegratedComposite);   // 70*0.5 + 100*0.3 + 60*0.2
        Assert.Equal("moderateHigh", payload.Band);       // 60 <= 77 < 80

        // Persisted + read back as JSON numbers with camelCase weightsApplied (Decimal->number regression guard).
        var read = await Reader().GetIntegratedAsync(Ctx(user), user);
        Assert.NotNull(read);
        Assert.Equal(77d, read!.IntegratedComposite);
        Assert.Equal(70d, read.ThreeSixtyScore);
        Assert.Equal(100d, read.PcaScore);
        Assert.Equal(60d, read.MilScore);
        Assert.Equal("moderateHigh", read.Band);
        Assert.Equal(0.5d, read.WeightsApplied.GetProperty("threeSixty").GetDouble());
        Assert.Equal(0.3d, read.WeightsApplied.GetProperty("pca").GetDouble());
        Assert.Equal(0.2d, read.WeightsApplied.GetProperty("mil").GetDouble());
    }

    [Fact]
    public async Task Recompute_is_idempotent_on_the_unique_key()
    {
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedInstrumentAsync(conn, "v1");
        await SeedVocationalScoreAsync(conn, user, "v1", composite: 70m);
        await SeedCompetencesAsync(conn, user, levels: [4, 4, 4]);
        await SeedFiveExamsAsync(conn, user, scorePercentage: 60);

        await Writer().RecomputeIntegratedAsync(Ctx(user), user);
        await Writer().RecomputeIntegratedAsync(Ctx(user), user);

        await using var count = new NpgsqlCommand(
            """SELECT COUNT(*) FROM "vocational_integrated_results" WHERE "evaluatedUserId" = @uid""", conn);
        count.Parameters.AddWithValue("uid", user);
        Assert.Equal(1L, (long)(await count.ExecuteScalarAsync())!); // upsert, not a second row

        var read = await Reader().GetIntegratedAsync(Ctx(user), user);
        Assert.Equal(77d, read!.IntegratedComposite);
    }

    [Fact]
    public async Task Recompute_normalizes_integration_weights_before_persisting()
    {
        // Un-normalized instrument weights {50,30,20} must be renormalized to sum 1 both for the composite
        // and the stored weightsApplied — a regression that persisted the raw weights would still balance.
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedInstrumentAsync(conn, "v1", weights: """{"threeSixty":50,"pca":30,"mil":20}""");
        await SeedVocationalScoreAsync(conn, user, "v1", composite: 70m);
        await SeedCompetencesAsync(conn, user, levels: [4, 4, 4]);  // pca 100
        await SeedFiveExamsAsync(conn, user, scorePercentage: 60);  // mil 60

        var payload = Assert.IsType<IntegratedResultPayload>(await Writer().RecomputeIntegratedAsync(Ctx(user), user));

        Assert.Equal(0.5, payload.WeightsApplied.ThreeSixty);
        Assert.Equal(0.3, payload.WeightsApplied.Pca);
        Assert.Equal(0.2, payload.WeightsApplied.Mil);
        Assert.Equal(77, payload.IntegratedComposite); // 70*0.5 + 100*0.3 + 60*0.2 (normalized)

        var read = await Reader().GetIntegratedAsync(Ctx(user), user);
        Assert.Equal(0.5d, read!.WeightsApplied.GetProperty("threeSixty").GetDouble());
        Assert.Equal(0.3d, read.WeightsApplied.GetProperty("pca").GetDouble());
    }

    [Fact]
    public async Task Recompute_not_ready_reports_only_the_missing_channel()
    {
        // 360 + pca present, but no LIA exams -> completeness.lia false -> only "mil" is missing (not all three).
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedInstrumentAsync(conn, "v1");
        await SeedVocationalScoreAsync(conn, user, "v1", composite: 70m);
        await SeedCompetencesAsync(conn, user, levels: [4, 4, 4]);

        var notReady = Assert.IsType<IntegrationNotReady>(await Writer().RecomputeIntegratedAsync(Ctx(user), user));

        Assert.Equal(new[] { "mil" }, notReady.Missing);
        Assert.Null(await Reader().GetIntegratedAsync(Ctx(user), user)); // nothing persisted
    }

    [Fact]
    public async Task Recompute_treats_a_zero_channel_score_as_present_not_missing()
    {
        // pcaScore 0 (all competences level 1 -> (1-1)/3*100 = 0) must count as PRESENT, so the run is ready.
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedInstrumentAsync(conn, "v1");
        await SeedVocationalScoreAsync(conn, user, "v1", composite: 70m);
        await SeedCompetencesAsync(conn, user, levels: [1, 1, 1]);   // pca 0, but present
        await SeedFiveExamsAsync(conn, user, scorePercentage: 60);

        var payload = Assert.IsType<IntegratedResultPayload>(await Writer().RecomputeIntegratedAsync(Ctx(user), user));

        Assert.Equal(0, payload.PcaScore);                 // 0, not null/missing
        Assert.Equal(47, payload.IntegratedComposite);     // 70*0.5 + 0*0.3 + 60*0.2 = 47
    }

    [Fact]
    public async Task Recompute_advances_computedAt_on_the_upsert()
    {
        // Prisma computedAt is @default(now()) @updatedAt -> the upsert must bump it on every write.
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedInstrumentAsync(conn, "v1");
        await SeedVocationalScoreAsync(conn, user, "v1", composite: 70m);
        await SeedCompetencesAsync(conn, user, levels: [4, 4, 4]);
        await SeedFiveExamsAsync(conn, user, scorePercentage: 60);
        // Pre-existing row with a stale computedAt that the recompute must overwrite.
        await using (var seed = new NpgsqlCommand(
            """
            INSERT INTO "vocational_integrated_results"
                ("id","evaluatedUserId","instrumentVersion","integratedComposite","band",
                 "threeSixtyScore","pcaScore","milScore","weightsApplied","computedAt")
            VALUES (@id, @uid, 'v1', 1, 'low', 1, 1, 1, '{}'::jsonb, TIMESTAMP '2020-01-01 00:00:00.000')
            """, conn))
        {
            seed.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
            seed.Parameters.AddWithValue("uid", user);
            await seed.ExecuteNonQueryAsync();
        }

        await Writer().RecomputeIntegratedAsync(Ctx(user), user);

        var read = await Reader().GetIntegratedAsync(Ctx(user), user);
        Assert.DoesNotContain("2020", read!.ComputedAt);  // bumped off the stale value
        Assert.Equal(77d, read.IntegratedComposite);      // and the row is the fresh recompute
    }

    // ---------------------------------------------------------------- helpers

    private VocationalWriter Writer()
    {
        var factory = new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());
        return new VocationalWriter(factory, new VocationalReader(factory), new CompleteProfileAssembler(factory), NullLogger<VocationalWriter>.Instance);
    }

    private VocationalReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static string NewUser() => "u-" + Guid.NewGuid().ToString("N");

    private static RequestContext Ctx(string userId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "counselor", $"{userId}@e.st", "Test User"),
            schoolId: null, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task SeedInstrumentAsync(NpgsqlConnection conn, string version, string? weights = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "vocational_instruments" ("id","version","status","integrationWeights","interpretationBands","isActive")
            VALUES (@id, @version, 'active', @weights::jsonb, @bands::jsonb, true)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("version", version);
        cmd.Parameters.AddWithValue("weights", weights ?? Weights);
        cmd.Parameters.AddWithValue("bands", Bands);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedVocationalScoreAsync(NpgsqlConnection conn, string userId, string version, decimal composite)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "vocational_results"
                ("id","evaluatedUserId","instrumentVersion","composite","band","respondentCount",
                 "groupsIncluded","dimensionScores","rankings","weightsApplied","computedAt")
            VALUES (@id, @uid, @version, @composite, 'moderateHigh', 2, @groups,
                    '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, TIMESTAMP '2026-06-15 12:00:00.000')
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("version", version);
        cmd.Parameters.AddWithValue("composite", composite);
        cmd.Parameters.AddWithValue("groups", new[] { "self", "parent" });
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedCompetencesAsync(NpgsqlConnection conn, string userId, int[] levels)
    {
        var items = string.Join(",", levels.Select((l, i) => $$"""{"CmpNom":"C{{i}}","Level":{{l}}}"""));
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "pca_results" ("id","userId","competences","isActive")
            VALUES (@id, @uid, @competences::jsonb, true)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("competences", $$"""{"PcaCmps":[{{items}}]}""");
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedFiveExamsAsync(NpgsqlConnection conn, string userId, double scorePercentage)
    {
        var exams = new (string Type, string Id)[]
        {
            ("VerbalReasoning", "verbal-reasoning-001"),
            ("PatternRecognition", "feature-detection-001"),
            ("NumericVelocity", "numerical-speed-accuracy-001"),
            ("WorkingMemory", "working-memory-001"),
            ("VisualRotation", "spatial-orientation-001"),
        };
        foreach (var (type, id) in exams)
        {
            await using var cmd = new NpgsqlCommand(
                """
                INSERT INTO "pca_exam_sessions"
                    ("id","examId","userId","examType","endTime","scorePercentage","accuracyPercentage","isCompleted","isActive")
                VALUES (@id, @examId, @uid, @examType::"ExamType", CURRENT_TIMESTAMP, @score, 0, true, true)
                """, conn);
            cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
            cmd.Parameters.AddWithValue("examId", id);
            cmd.Parameters.AddWithValue("uid", userId);
            cmd.Parameters.AddWithValue("examType", type);
            cmd.Parameters.AddWithValue("score", scorePercentage);
            await cmd.ExecuteNonQueryAsync();
        }
    }
}
