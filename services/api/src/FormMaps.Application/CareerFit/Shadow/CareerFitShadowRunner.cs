using FormMaps.Application.Auth;
using FormMaps.Application.CareerFit.Adapters;

namespace FormMaps.Application.CareerFit.Shadow;

// FM-CF-013. The shadow JOB: for one student, read the legacy answer the platform already cached,
// score the same student through the .NET engine, compare, and append one row. Out of band from start
// to finish.
//
// "NEVER AFFECTING THE RESPONSE THE USER SEES", stated as the three things this does not do rather
// than as a claim. (1) It never calls legacy POST /api/v1/careers/score — it reads
// user_career_profiles."careerMatches", the row the platform already writes, so no user request is
// issued, delayed, retried or re-billed on its behalf. (2) It is not mounted on any route: FM-CF-012
// mapped seven endpoints and none of them reaches this class, so no browser can reach it and no
// request path can be slowed by it. (3) The only row it writes that a user could ever see is a
// careerfit_run — the same immutable run POST /careerfit/evaluate would have written, under the same
// writer, on the caller's own RLS session — and the shadow row itself is served by nothing.
//
// WHOSE SESSION. The caller's, always, exactly like every other CareerFit class: the evaluator, the
// run reader, the legacy reader, the tenant reader and the shadow writer all take the RequestContext
// they are given and open their own RLS session with it. There is no bypass session anywhere in this
// slice. A shadow operator therefore sees exactly the students their own credential can see, and a
// mis-scoped operator produces a smaller cohort rather than a leak. (This is the difference from
// BillingShadowRepository, which does use RequestContext.System(): its shadow tables hold no
// tenant-scoped student data and carry no policy, and this one's do and does.)
//
// THE STUDENT'S TENANT IS THE FIRST READ, AND IT IS ALSO THE GATE. Every row this job writes carries
// the STUDENT's "schoolId", because careerfit_shadow_comparisons' WITH CHECK is careerfit_runs'
// predicate verbatim: bypass, OR the row is the caller's own, OR its "schoolId" is the caller's tenant.
// A comparable pair takes that value off the run it measured; the three PRE-SCORING arms have no run to
// take it from, so they read it here — from the policied users row, on the caller's own session,
// exactly the query CareerFitInputReader opens with. This was a defect and not a refinement: those
// three arms shipped writing "schoolId" NULL, and a NULL-tenant row about someone else's student is
// refused (42501) on every non-bypass session, so the job aborted on the first student in a cohort with
// no cached legacy answer -- the very population the design says must be recorded. Under a bypass
// operator it did write, and then the row was invisible to the school staff who had run the cohort.
// Because the read is the policied one, it is the gate too: a student this caller cannot see is refused
// BEFORE the legacy cache is touched, so no row is written about someone the operator may not read.
//
// WHY A RUN IS REUSED WHEN THERE IS A USABLE ONE. Runs are immutable and a re-evaluation is a new
// row; measuring a cohort twice would otherwise double the run table for no new information. A run is
// usable when it was scored under the process's ACTIVE rules version and on DISC graph 1 — anything
// else is not the thing the shadow is measuring, so it is re-scored rather than compared. Set
// reuseExistingRun: false to force a fresh evaluation (what FM-CF-014's recut will want, since a
// recut changes the rules version and every run must be new anyway).
//
// Deliberately NOT here: any scheduling (no worker, no cron — invocation is the operator's, see
// docs/careerfit/careerfit-shadow-report.md), any logging (the Application layer has no logging
// dependency and this slice does not add one -- every fact worth knowing is persisted on the row
// instead, which is what a report can count), any cohort selection query (the operator supplies the
// user ids, so the job cannot silently widen its own scope), any retry or backoff (a failure is a
// finding, not something to paper over), and any aggregation (tools/careerfit/shadow_report.py).

/// <summary>Measures one student's engine ranking against their cached legacy ranking and records the comparison.</summary>
public interface ICareerFitShadowRunner
{
    /// <summary>
    /// Compare one student and append the result. Returns the comparison that was written — including the
    /// incomparable ones, which are recorded rather than skipped so a report's denominator counts every
    /// student that was looked at.
    /// </summary>
    /// <exception cref="CareerFitInputException">
    /// STUDENT / STUDENT_NOT_VISIBLE when no <c>users</c> row for <paramref name="userId"/> is visible to
    /// this caller's session. Nothing is read and nothing is written: a pair the operator may not see is
    /// not a pair to measure, and a row about them could not be read back afterwards either.
    /// </exception>
    Task<CareerFitShadowComparison> MeasureAsync(
        RequestContext context,
        string userId,
        bool reuseExistingRun = true,
        CancellationToken cancellationToken = default);
}

/// <inheritdoc cref="ICareerFitShadowRunner"/>
public sealed class CareerFitShadowRunner : ICareerFitShadowRunner
{
    private readonly ICareerFitEvaluator _evaluator;
    private readonly ICareerFitRunReader _runReader;
    private readonly ILegacyCareerScoreReader _legacyReader;
    private readonly ICareerFitStudentTenantReader _tenantReader;
    private readonly ICareerFitShadowWriter _shadowWriter;
    private readonly ICareerFitRulesProvider _rulesProvider;
    private readonly CareerFitShadowProjection _projection;

    /// <summary>Family id → the competency ids that family's rules score. Built once: the rule set is immutable per process.</summary>
    private readonly IReadOnlyDictionary<int, IReadOnlyList<int>> _familyScoredCompetencies;

    /// <summary>Wires the job. <paramref name="projection"/> defaults to the embedded one; tests pass a complete synthetic projection.</summary>
    public CareerFitShadowRunner(
        ICareerFitEvaluator evaluator,
        ICareerFitRunReader runReader,
        ILegacyCareerScoreReader legacyReader,
        ICareerFitStudentTenantReader tenantReader,
        ICareerFitShadowWriter shadowWriter,
        ICareerFitRulesProvider rulesProvider,
        CareerFitShadowProjection? projection = null)
    {
        _evaluator = evaluator;
        _runReader = runReader;
        _legacyReader = legacyReader;
        _tenantReader = tenantReader;
        _shadowWriter = shadowWriter;
        _rulesProvider = rulesProvider;
        _projection = projection ?? CareerFitShadowProjection.Embedded;

        // Fails the job at construction rather than mid-cohort: a projection that names a family the rule
        // set does not declare, or names one differently, would put a stale family name in a report and a
        // meaningless assignment in every row.
        _projection.AssertAgreesWith(rulesProvider.Rules);

        _familyScoredCompetencies = rulesProvider.Rules.Families
            .Where(f => f.Scorable)
            .ToDictionary(
                f => f.FamilyId,
                f => (IReadOnlyList<int>)f.CompetencyRules.Select(c => c.CompetencyId).Distinct().ToList());
    }

    /// <summary>
    /// The projection every row this runner writes was measured through. Exposed rather than logged
    /// because the fact that matters — <see cref="CareerFitShadowProjection.IsIncomplete"/> — must reach a
    /// REPORT, and a log line is not evidence a report can count. While it is incomplete the job is still
    /// useful (it records ENGINE_NOT_SCORABLE, LEGACY_LOCKED and the unmapped-cluster work list, which is
    /// how the projection gets completed) but every scorable pair will come back TAXONOMY_UNMAPPED and no
    /// rank correlation exists to read.
    /// </summary>
    public CareerFitShadowProjection Projection => _projection;

    /// <inheritdoc />
    public async Task<CareerFitShadowComparison> MeasureAsync(
        RequestContext context,
        string userId,
        bool reuseExistingRun = true,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentException.ThrowIfNullOrWhiteSpace(userId);

        // FIRST, and before the legacy cache is touched: the student's own tenant, off the policied users
        // row. It is what every row this method writes must carry (see the header) and, because that row
        // is policied, it is also the gate — an invisible student is refused here rather than measured.
        var tenant = await _tenantReader.ReadAsync(context, userId, cancellationToken)
            ?? throw new CareerFitInputException(
                InputInstruments.Student,
                InputWarningCodes.StudentNotVisible,
                $"No users row for student '{userId}' is visible to this session; the pair cannot be measured "
                + "and no shadow comparison may be recorded for them.");

        var legacy = await _legacyReader.ReadAsync(context, userId, cancellationToken);

        // The legacy-side verdicts are decided BEFORE the engine runs. Scoring a student legacy has no
        // answer for would write a run nobody asked for, to produce a comparison that cannot exist.
        if (legacy is null)
        {
            return await RecordAsync(
                context,
                CareerFitShadowComparator.NotComparable(
                    userId, tenant.SchoolId, CareerFitShadowCause.LegacyAbsent,
                    _projection.Version, _rulesProvider.RulesVersion),
                cancellationToken);
        }

        if (legacy.Locked || legacy.Careers.Count == 0)
        {
            return await RecordAsync(
                context,
                CareerFitShadowComparator.NotComparable(
                    userId, tenant.SchoolId, CareerFitShadowCause.LegacyLocked,
                    _projection.Version, _rulesProvider.RulesVersion, legacy.ObservedAt),
                cancellationToken);
        }

        CareerFitRun run;
        try
        {
            run = await ResolveRunAsync(context, userId, reuseExistingRun, cancellationToken);
        }
        catch (CareerFitInputException exception)
        {
            // A student legacy could score and the engine cannot is a FINDING, not an error to swallow:
            // it is the population the port would refuse to serve on the day of the flip. The instrument
            // that failed closed is PERSISTED on the row's note, not logged, because the report has to be
            // able to count it and say which instrument.
            return await RecordAsync(
                context,
                CareerFitShadowComparator.NotComparable(
                    userId, tenant.SchoolId, CareerFitShadowCause.EngineNotScorable,
                    _projection.Version, _rulesProvider.RulesVersion, legacy.ObservedAt,
                    note: $"The engine refused to score this student: instrument {exception.Instrument}, "
                        + $"code {exception.Code}. Legacy had an answer for them."),
                cancellationToken);
        }

        var comparison = CareerFitShadowComparator.Compare(run, legacy, _projection, _familyScoredCompetencies);
        return await RecordAsync(context, comparison, cancellationToken);
    }

    /// <summary>
    /// The newest run when it is the thing being measured — same active rules version, DISC graph 1 —
    /// otherwise a fresh evaluation. Graph is checked here as well as in the comparator: catching it here
    /// turns a stale graph-2 run into a correct measurement, while the comparator's check catches the case
    /// where a caller passed a graph override to the evaluator itself.
    /// </summary>
    private async Task<CareerFitRun> ResolveRunAsync(
        RequestContext context, string userId, bool reuseExistingRun, CancellationToken cancellationToken)
    {
        if (reuseExistingRun)
        {
            var newest = await _runReader.ReadNewestForUserAsync(context, userId, cancellationToken);
            if (newest is not null
                && string.Equals(newest.RulesVersion, _rulesProvider.RulesVersion, StringComparison.Ordinal)
                && newest.DiscGraph == DiscGraphChoice.WorkAdaptation)
            {
                return newest;
            }
        }

        return await _evaluator.EvaluateAsync(
            context, userId, DiscGraphChoice.WorkAdaptation, cancellationToken);
    }

    private async Task<CareerFitShadowComparison> RecordAsync(
        RequestContext context, CareerFitShadowComparison comparison, CancellationToken cancellationToken)
    {
        await _shadowWriter.WriteAsync(context, comparison, cancellationToken);
        return comparison;
    }
}
