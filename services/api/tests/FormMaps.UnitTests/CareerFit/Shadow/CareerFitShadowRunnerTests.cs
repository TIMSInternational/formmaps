using FormMaps.Application.Auth;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;
using FormMaps.Application.CareerFit.Shadow;
using FormMaps.Domain.Auth;
using FormMaps.Infrastructure.CareerFit;

namespace FormMaps.UnitTests.CareerFit.Shadow;

/// <summary>
/// FM-CF-013's JOB, over fakes — the arms a database test cannot reach cheaply.
///
/// THE RUNNER SHIPPED WITH NO TEST OF ANY KIND. The review said so and the first test written against it
/// found a blocker (the three pre-scoring arms wrote <c>schoolId: null</c> and the policy refused them —
/// reproduced against real Postgres in CareerFitShadowRunnerDatabaseTests, which is where the tenant and
/// the RLS claims belong). What is left over for fakes is the part that depends on a run the evaluator
/// would never produce on its own: the REUSE rule's two rejections. A run scored under a different rules
/// version, or on DISC graph 2 or 3, is not the thing the shadow is measuring, so it must be re-scored
/// rather than compared — and neither branch was reachable through the real evaluator, which always
/// writes the active version on graph 1.
///
/// Every fake here counts its calls, because most of these claims are about what the runner did NOT do.
/// </summary>
public class CareerFitShadowRunnerTests
{
    private const string RulesVersion = "1.0.0-draft.1";
    private const string StudentId = "student-1";
    private const string SchoolA = "school-a";

    private static readonly CareerFitRulesProvider Provider = new(RulesVersion);

    private static readonly IReadOnlyDictionary<int, double> Absolutes =
        ShadowPairs.ScorableFamilies.ToDictionary(id => id, id => 90.0 - id);

    // ---- the reuse rule ----

    [Fact]
    public async Task A_run_on_the_active_rules_version_and_graph_1_is_reused_and_nothing_is_scored()
    {
        var existing = ShadowPairs.Run(Absolutes);
        var harness = new Harness { Newest = existing };

        var comparison = await harness.Runner().MeasureAsync(Context(), StudentId);

        Assert.Equal(existing.Id, comparison.RunId);
        Assert.Equal(1, harness.RunReader.NewestCallCount);
        Assert.Equal(0, harness.Evaluator.CallCount);
        Assert.Equal(1, harness.Writer.CallCount);
    }

    /// <summary>
    /// A run scored under a DIFFERENT rules version is not the thing being measured: a shadow row that
    /// compared it would attribute a disagreement to the port when it belongs to the rule set. Covered by
    /// the compiler alone until now — the real evaluator only ever writes the active version.
    /// </summary>
    [Fact]
    public async Task A_run_from_another_rules_version_is_re_scored_rather_than_compared()
    {
        var stale = ShadowPairs.Run(Absolutes) with { RulesVersion = "0.9.0-draft.0" };
        var harness = new Harness { Newest = stale };

        var comparison = await harness.Runner().MeasureAsync(Context(), StudentId);

        Assert.Equal(1, harness.Evaluator.CallCount);
        Assert.NotEqual(stale.Id, comparison.RunId);
        Assert.Equal(harness.Evaluator.Produced!.Id, comparison.RunId);
    }

    /// <summary>
    /// The same for the DISC graph. Legacy is fed graph 1 and DiscAdapter defaults to graph 1 for exactly
    /// this reason: a run on graph 2 or 3 measures the GRAPH, not the port. The runner checks it here as
    /// well as in the comparator — this check turns a stale graph-2 run into a correct measurement, while
    /// the comparator's catches a caller who passed a graph override to the evaluator itself.
    /// </summary>
    [Theory]
    [InlineData(DiscGraphChoice.UnderPressure)]
    [InlineData(DiscGraphChoice.Natural)]
    public async Task A_run_on_a_graph_other_than_1_is_re_scored_rather_than_compared(DiscGraphChoice graph)
    {
        var offGraph = ShadowPairs.Run(Absolutes, graph: graph);
        var harness = new Harness { Newest = offGraph };

        var comparison = await harness.Runner().MeasureAsync(Context(), StudentId);

        Assert.Equal(1, harness.Evaluator.CallCount);
        Assert.Equal(DiscGraphChoice.WorkAdaptation, harness.Evaluator.RequestedGraph);
        Assert.NotEqual(offGraph.Id, comparison.RunId);
    }

    [Fact]
    public async Task Reuse_can_be_turned_off_and_then_the_newest_run_is_not_even_read()
    {
        var harness = new Harness { Newest = ShadowPairs.Run(Absolutes) };

        await harness.Runner().MeasureAsync(Context(), StudentId, reuseExistingRun: false);

        Assert.Equal(0, harness.RunReader.NewestCallCount);
        Assert.Equal(1, harness.Evaluator.CallCount);
    }

    // ---- the tenant read is first, and it is the gate ----

    /// <summary>
    /// The order of operations, stated as call counts: the tenant read runs BEFORE the legacy cache read,
    /// so a student this operator cannot see is refused without the job even establishing whether legacy
    /// has an answer for them — and without a row being appended about them.
    /// </summary>
    [Fact]
    public async Task An_invisible_student_is_refused_before_the_legacy_cache_is_touched()
    {
        var harness = new Harness { Tenant = null };

        var refused = await Assert.ThrowsAsync<CareerFitInputException>(
            () => harness.Runner().MeasureAsync(Context(), StudentId));

        Assert.Equal(InputInstruments.Student, refused.Instrument);
        Assert.Equal(InputWarningCodes.StudentNotVisible, refused.Code);
        Assert.Equal(0, harness.Legacy.CallCount);
        Assert.Equal(0, harness.Evaluator.CallCount);
        Assert.Equal(0, harness.Writer.CallCount);
    }

    /// <summary>
    /// A student who genuinely has no school is NOT the same as one who is invisible: the row is written
    /// with a null tenant, which the policy admits on the student's own session (the self branch) —
    /// CareerFitRlsTests pins both halves of that on the real table.
    /// </summary>
    [Fact]
    public async Task A_student_with_no_school_at_all_is_still_measured_and_the_row_carries_null()
    {
        var harness = new Harness { Tenant = new CareerFitStudentTenant(StudentId, SchoolId: null), Legacy = new FakeLegacy(null) };

        var comparison = await harness.Runner().MeasureAsync(Context(), StudentId);

        Assert.Equal(CareerFitShadowCause.LegacyAbsent, comparison.PrimaryCause);
        Assert.Null(comparison.SchoolId);
        Assert.Equal(1, harness.Writer.CallCount);
    }

    // ---- fakes ----

    private static RequestContext Context() =>
        RequestContext.Authenticated(
            new RequestActor("counselor-1", FormMapsRoles.Counselor, "c@e.st", "Counselor"),
            SchoolA, permissions: [],
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private sealed class Harness
    {
        public CareerFitRun? Newest { get; init; }

        public CareerFitStudentTenant? Tenant { get; init; } = new(StudentId, SchoolA);

        public FakeLegacy Legacy { get; init; } = new(
            new LegacyCareerRanking(
                StudentId, Locked: false,
                Careers: [.. ShadowPairs.ScorableFamilies.Select(id =>
                    new LegacyCareerScore($"P-{id}", $"Program {id}", $"Cluster_{id}", 90.0 - id))],
                ObservedAt: null));

        public FakeEvaluator Evaluator { get; } = new();

        public FakeShadowWriter Writer { get; } = new();

        public FakeRunReader RunReader { get; private set; } = null!;

        public CareerFitShadowRunner Runner()
        {
            RunReader = new FakeRunReader(Newest);
            return new CareerFitShadowRunner(
                Evaluator, RunReader, Legacy, new FakeTenantReader(Tenant), Writer, Provider,
                ShadowPairs.CompleteProjection());
        }
    }

    private sealed class FakeTenantReader(CareerFitStudentTenant? tenant) : ICareerFitStudentTenantReader
    {
        public Task<CareerFitStudentTenant?> ReadAsync(RequestContext context, string userId, CancellationToken cancellationToken = default) =>
            Task.FromResult(tenant);
    }

    private sealed class FakeLegacy(LegacyCareerRanking? ranking) : ILegacyCareerScoreReader
    {
        public int CallCount { get; private set; }

        public Task<LegacyCareerRanking?> ReadAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
        {
            CallCount++;
            return Task.FromResult(ranking);
        }
    }

    private sealed class FakeRunReader(CareerFitRun? newest) : ICareerFitRunReader
    {
        public int NewestCallCount { get; private set; }

        public Task<CareerFitRun?> ReadNewestForUserAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
        {
            NewestCallCount++;
            return Task.FromResult(newest);
        }

        public Task<CareerFitRun?> ReadAsync(RequestContext context, Guid runId, CancellationToken cancellationToken = default) =>
            Task.FromResult<CareerFitRun?>(null);

        public Task<IReadOnlyList<CareerFitRunSummary>> ListForUserAsync(
            RequestContext context, string userId, int limit, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<CareerFitRunSummary>>([]);
    }

    private sealed class FakeEvaluator : ICareerFitEvaluator
    {
        public int CallCount { get; private set; }

        public DiscGraphChoice? RequestedGraph { get; private set; }

        public CareerFitRun? Produced { get; private set; }

        public Task<CareerFitRun> EvaluateAsync(
            RequestContext context, string userId, DiscGraphChoice? graphOverride = null, CancellationToken cancellationToken = default)
        {
            CallCount++;
            RequestedGraph = graphOverride;
            Produced = ShadowPairs.Run(Absolutes) with { Id = Guid.NewGuid() };
            return Task.FromResult(Produced);
        }
    }

    private sealed class FakeShadowWriter : ICareerFitShadowWriter
    {
        public int CallCount { get; private set; }

        public CareerFitShadowComparison? Written { get; private set; }

        public Task<Guid> WriteAsync(RequestContext context, CareerFitShadowComparison comparison, CancellationToken cancellationToken = default)
        {
            CallCount++;
            Written = comparison;
            return Task.FromResult(Guid.NewGuid());
        }
    }
}
