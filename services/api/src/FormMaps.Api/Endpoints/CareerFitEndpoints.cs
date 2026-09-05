using FormMaps.Api.Contracts.CareerFit;
using FormMaps.Application.Auth;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;

namespace FormMaps.Api.Endpoints;

// FM-CF-012. The seven HTTP routes over the CareerFit bounded context, mounted at /api/v1/careerfit and
// dark from the frontend until FORMMAPS_ROUTE_CAREERFIT_TO_DOTNET is turned on (apps/web/next.config.ts).
//
// WHAT THIS IMPLEMENTS
//
//   POST /api/v1/careerfit/evaluate/{userId}                 score the student now and persist the run
//   GET  /api/v1/careerfit/results/{userId}                  the newest run's RANKING
//   GET  /api/v1/careerfit/results/{userId}/explanation      the newest run's FM-CF-011 explanation
//   GET  /api/v1/careerfit/results/{userId}/runs             the student's run history, newest first
//   GET  /api/v1/careerfit/runs/{runId}                      one persisted run's RANKING
//   GET  /api/v1/careerfit/runs/{runId}/explanation          one persisted run's FM-CF-011 explanation
//   GET  /api/v1/careerfit/families                          the active rule set's families
//
// WHERE THE SEVEN COME FROM. The legacy career surface, as apps/web actually calls it, is eleven
// method+path pairs in two files (apps/web/src/services/careerService.ts, apps/web/src/services/timsService.ts).
// Exactly one of them is a CareerFit question: POST /api/v1/careers/score (careerService.ts:84,
// timsService.ts:8) — the manifest's own legacyBaseline and FM-CF-013's shadow target. The other ten are
// the 370-role CATALOGUE and its admin CRUD and favourites (/careers/catalog :21, /careers/{id} :33/:65/:73,
// /careers/clusters :42, /careers/admin :52, POST /careers :57, /careers/favorites :98/:107/:116). V1
// CareerFit scores fourteen FAMILIES and has no career catalogue at all (infra/aws/sql/careerfit-schema.sql:
// "no per-career / per-subfamily rows"), so those ten stay on Node and are NOT rewritten. The seven above
// are that one legacy question split along the seams the CareerFit engine actually has:
//
//   * legacy /careers/score both SCORES and RETURNS, and every caller of it in apps/web uses it as a READ
//     on mount (dashboard/_components/CareerMatches.tsx:25, StatCards.tsx:106, CareerMatchHub.tsx:45,
//     careers/compare/page.tsx:16, counselor/reports/_components/PCAReports.tsx:48). A CareerFit run is
//     IMMUTABLE and a re-evaluation is a NEW run, so scoring is a POST and reading is a GET, and the read
//     never writes. That split is routes 1, 2 and 5.
//   * the legacy response's explanatory half (`profileSummary`, `breakdown` — apps/web/src/types/tims.ts:25,
//     :38) is FM-CF-011's CareerFitExplanation, served over the same two subjects: routes 3 and 6.
//   * immutability makes "which run produced the advice this student was shown" a real question, and the
//     schema carries careerfit_runs_userId_createdAt_idx for exactly that read: route 4.
//   * legacy GET /careers/clusters (careerService.ts:42) is "what are the groupings" — in CareerFit that is
//     the rule set's family list, and it is the one route with no student in it: route 7.
//
// AUTH, the surrounding files' convention (MilEndpoints, VocationalEndpoints). Per-user routes run
// RequireIdentity -> RequireSubscription -> CanAccessUser({userId}); denial of the last is the uniform
// IDOR-safe 404, never a 403, so a caller cannot probe which students exist. /families is catalogue
// metadata about the rule set and carries no student data, so it is authenticate-only — the treatment
// VocationalEndpoints gives /instrument. The RLS session is the CALLER's throughout: the evaluator reads,
// scores and writes on it (CareerFitInputReader / CareerFitRunWriter) and CareerFitRunReader reads on it,
// so a caller who cannot see the student's rows gets "not ready" or 404 and never a score. No endpoint here
// ever opens a bypass session.
//
// WHAT IT DELIBERATELY DOES NOT DO
//
//   * It serves NO fit scalar to a browser. The ranking view carries the ordinal rank and the categorical
//     gate / convergence / confidence labels and nothing else; the explanation view is FM-CF-011's payload,
//     which carries no family-level scalar by construction. careerfit_absolute, careerfit_relative,
//     pca_index, mil_fit and the route scores stay in the database and in the audit ledger, where an
//     auditor reads them. Manifest guardrail 3 is that CareerFitAbsolute is never presented as a
//     percentage; exposing it on the very endpoints a UI binds to would defeat the guardrail that
//     FM-CF-011 was written to hold.
//   * It does not serve the per-formula audit ledger (F01-F23). It is ~700 records per run, it is evidence
//     for an auditor rather than copy for a student, and no caller has asked for it over HTTP; the reader
//     carries it on the run so FM-CF-013's shadow comparison can use it in-process.
//   * It does not touch any legacy /api/v1/careers path, and next.config.ts rewrites none of them. The
//     catalogue, favourites and admin CRUD remain Node's, and "shadow then replace" (FM-CF-013 then
//     FM-CF-015) is what decides when /careers/score itself moves — not this slice.
//   * It writes no audit_events row. The run IS the audit record: immutable, tenant-scoped, carrying the
//     rule-set version, the exact inputs, the adapters' repairs and the whole formula ledger. A second
//     record of "someone evaluated" beside it would duplicate what careerfit_runs already proves.
//   * It maps no DELETE and no re-run-of-a-run: the service role has SELECT + INSERT on these tables
//     (infra/aws/sql/dotnet-service-role.sql section 4.7) and a re-evaluation is a new run.

/// <summary>The seven CareerFit routes (FM-CF-012), behind FORMMAPS_ROUTE_CAREERFIT_TO_DOTNET at the edge.</summary>
public static class CareerFitEndpoints
{
    /// <summary>How many runs the history route returns at most. A student accumulates one run per evaluation, forever.</summary>
    private const int HistoryLimit = 20;

    /// <summary>Maps the seven routes onto <paramref name="app"/>.</summary>
    public static IEndpointRouteBuilder MapCareerFitEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/careerfit")
            .WithTags("CareerFit");

        // The literal /families is mapped BEFORE anything that could match it at the same depth; there is
        // no single-segment {param} route in this group, so nothing can shadow it — pinned by the tests.
        group.MapGet("/families", GetFamiliesAsync);

        // Per-student: the sub-paths precede nothing ambiguous (all three are distinct literals under
        // /results/{userId}), and the write is the only POST in the group.
        group.MapPost("/evaluate/{userId}", EvaluateAsync);
        group.MapGet("/results/{userId}/explanation", GetLatestExplanationAsync);
        group.MapGet("/results/{userId}/runs", GetRunHistoryAsync);
        group.MapGet("/results/{userId}", GetLatestResultsAsync);

        // Per-run: /runs/{runId}/explanation before /runs/{runId} for the same first-match reason.
        group.MapGet("/runs/{runId}/explanation", GetRunExplanationAsync);
        group.MapGet("/runs/{runId}", GetRunAsync);

        return app;
    }

    // ------------------------------------------------------------------ 1. POST /evaluate/{userId}

    /// <summary>
    /// Scores the student against every scorable family under the process's active rule set and persists the
    /// run, on the caller's own RLS session. A missing or unreadable instrument is not an error page: the
    /// engine's typed <see cref="CareerFitInputException"/> becomes a 409 naming the instrument, because
    /// "this student has not finished the LIA yet" is a state of the world the UI must render, not a fault.
    /// </summary>
    private static async Task<IResult> EvaluateAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IUserAccessGuard userAccessGuard,
        ICareerFitEvaluator evaluator,
        ICareerFitRulesProvider rulesProvider,
        string userId,
        CancellationToken cancellationToken)
    {
        var (context, denied, targetId) = await AuthorizeUserAsync(
            requestContextAccessor, protectedRequestGuard, subscriptionGuard, userAccessGuard, userId, cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        CareerFitRun run;
        try
        {
            run = await evaluator.EvaluateAsync(context, targetId, cancellationToken: cancellationToken);
        }
        catch (CareerFitInputException ex)
        {
            return NotReady(ex);
        }

        return Ok(RankingView.From(run, rulesProvider));
    }

    // ------------------------------------------------------------------ 2. GET /results/{userId}

    /// <summary>The student's newest persisted run as a ranking. Reads only — it never scores, so a dashboard that mounts this on every render writes nothing.</summary>
    private static async Task<IResult> GetLatestResultsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IUserAccessGuard userAccessGuard,
        ICareerFitRunReader runReader,
        ICareerFitRulesProvider rulesProvider,
        string userId,
        CancellationToken cancellationToken)
    {
        var (context, denied, targetId) = await AuthorizeUserAsync(
            requestContextAccessor, protectedRequestGuard, subscriptionGuard, userAccessGuard, userId, cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        var run = await runReader.ReadNewestForUserAsync(context, targetId, cancellationToken);
        return run is null ? NotFound() : Ok(RankingView.From(run, rulesProvider));
    }

    // ------------------------------------------------------------------ 3. GET /results/{userId}/explanation

    /// <summary>The FM-CF-011 explainability payload for the student's newest run, projected unchanged.</summary>
    private static async Task<IResult> GetLatestExplanationAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IUserAccessGuard userAccessGuard,
        ICareerFitRunReader runReader,
        string userId,
        CancellationToken cancellationToken)
    {
        var (context, denied, targetId) = await AuthorizeUserAsync(
            requestContextAccessor, protectedRequestGuard, subscriptionGuard, userAccessGuard, userId, cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        var run = await runReader.ReadNewestForUserAsync(context, targetId, cancellationToken);
        return run is null ? NotFound() : Ok(CareerFitExplanation.From(run));
    }

    // ------------------------------------------------------------------ 4. GET /results/{userId}/runs

    /// <summary>
    /// The student's run history, newest first — id, when, which rule-set version, and which family ranked
    /// first. Runs are immutable, so this is how "which run produced the advice the student was shown" is
    /// answered; two runs are only comparable when their rules_version matches, which is why it is here.
    /// </summary>
    private static async Task<IResult> GetRunHistoryAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IUserAccessGuard userAccessGuard,
        ICareerFitRunReader runReader,
        ICareerFitRulesProvider rulesProvider,
        string userId,
        CancellationToken cancellationToken)
    {
        var (context, denied, targetId) = await AuthorizeUserAsync(
            requestContextAccessor, protectedRequestGuard, subscriptionGuard, userAccessGuard, userId, cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        var runs = await runReader.ListForUserAsync(context, targetId, HistoryLimit, cancellationToken);

        // An empty history is a 200 with an empty list, not a 404: "this student has never been evaluated"
        // is a fact about the student the caller is already allowed to see, and the UI renders it.
        return Ok(new CareerFitRunHistoryView(
            [.. runs.Select(r => new CareerFitRunListItem(
                r.RunId, r.EvaluatedAt, r.RulesVersion, r.TopFamilyId, FamilyName(rulesProvider, r.TopFamilyId)))]));
    }

    // ------------------------------------------------------------------ 5. GET /runs/{runId}

    /// <summary>One persisted run as a ranking, by its id.</summary>
    private static async Task<IResult> GetRunAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IUserAccessGuard userAccessGuard,
        ICareerFitRunReader runReader,
        ICareerFitRulesProvider rulesProvider,
        string runId,
        CancellationToken cancellationToken)
    {
        var (run, denied) = await AuthorizeRunAsync(
            requestContextAccessor, protectedRequestGuard, subscriptionGuard, userAccessGuard, runReader, runId, cancellationToken);
        return denied ?? Ok(RankingView.From(run!, rulesProvider));
    }

    // ------------------------------------------------------------------ 6. GET /runs/{runId}/explanation

    /// <summary>The FM-CF-011 explainability payload for one persisted run, by its id.</summary>
    private static async Task<IResult> GetRunExplanationAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IUserAccessGuard userAccessGuard,
        ICareerFitRunReader runReader,
        string runId,
        CancellationToken cancellationToken)
    {
        var (run, denied) = await AuthorizeRunAsync(
            requestContextAccessor, protectedRequestGuard, subscriptionGuard, userAccessGuard, runReader, runId, cancellationToken);
        return denied ?? Ok(CareerFitExplanation.From(run!));
    }

    // ------------------------------------------------------------------ 7. GET /families

    /// <summary>
    /// The active rule set's families and which of them score. Catalogue metadata about the rule set — no
    /// student, no run, no database read — so it is authenticate-only, the treatment VocationalEndpoints
    /// gives /instrument. Non-scorable families are listed rather than hidden: family 15 inherits its
    /// occupation and a client that silently dropped it would show thirteen families and no reason.
    /// </summary>
    private static IResult GetFamiliesAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ICareerFitRulesProvider rulesProvider)
    {
        var context = requestContextAccessor.Current;
        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var rules = rulesProvider.Rules;
        return Ok(new CareerFitFamilyCatalogView(
            rules.RulesVersion,
            rules.Status,
            [.. rules.Families.Select(f => new CareerFitFamilyView(f.FamilyId, f.FamilyName, f.Scorable))]));
    }

    // ------------------------------------------------------------------ guards

    /// <summary>
    /// The per-user gate, in the surrounding files' order: RequireIdentity -> RequireSubscription ->
    /// CanAccessUser. The id is length-bounded before it reaches the guard, as VocationalEndpoints does.
    /// </summary>
    private static async Task<(RequestContext Context, IResult? Denied, string TargetId)> AuthorizeUserAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IUserAccessGuard userAccessGuard,
        string userId,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;

        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return (context, Deny(identity), string.Empty);
        }

        var subscription = await subscriptionGuard.RequireSubscriptionAsync(context, cancellationToken);
        if (!subscription.Allowed)
        {
            return (context, Deny(subscription), string.Empty);
        }

        var targetId = userId.Length > 100 ? userId[..100] : userId;
        if (!await userAccessGuard.CanAccessUserAsync(context, targetId, cancellationToken))
        {
            return (context, NotFound(), targetId);
        }

        return (context, null, targetId);
    }

    /// <summary>
    /// The per-run gate. A run id is not a user id, so the chain is: identity, subscription, read the run
    /// (RLS decides visibility), then run the SAME CanAccessUser gate on the run's OWNER. Both halves are
    /// load-bearing and neither is redundant: RLS admits every caller in the row's tenant — the schema's own
    /// header says so — so without the owner gate a same-school caller with no relationship to the student
    /// could read their run by id, which is precisely the hole
    /// CareerFitRlsTests.Same_school_caller_is_admitted_by_the_policy_so_the_endpoint_gate_is_not_optional
    /// exists to name. An unparseable id, an invisible run and a run whose owner this caller may not see all
    /// answer the same 404.
    /// </summary>
    private static async Task<(CareerFitRun? Run, IResult? Denied)> AuthorizeRunAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IUserAccessGuard userAccessGuard,
        ICareerFitRunReader runReader,
        string runId,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;

        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return (null, Deny(identity));
        }

        var subscription = await subscriptionGuard.RequireSubscriptionAsync(context, cancellationToken);
        if (!subscription.Allowed)
        {
            return (null, Deny(subscription));
        }

        if (!Guid.TryParse(runId, out var parsed))
        {
            return (null, NotFound());
        }

        var run = await runReader.ReadAsync(context, parsed, cancellationToken);
        if (run is null)
        {
            return (null, NotFound());
        }

        if (!await userAccessGuard.CanAccessUserAsync(context, run.UserId, cancellationToken))
        {
            return (null, NotFound());
        }

        return (run, null);
    }

    // ------------------------------------------------------------------ responses

    /// <summary>
    /// Every response in this group is serialised with FM-CF-011's own options — snake_case, dictionary keys
    /// left alone, nulls kept — so one CareerFit payload does not speak two spellings. The envelope keys
    /// (success / data) are already snake-safe.
    /// </summary>
    private static IResult Ok<T>(T data) =>
        Results.Json(new CareerFitEnvelope<T>(true, data), CareerFitExplanation.SerializerOptions);

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);

    // IDOR defense: denial reveals nothing about existence — always 404 "Not found", never 403.
    private static IResult NotFound() =>
        Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);

    /// <summary>
    /// A missing instrument is a 409, not a 422 or a 500: the request was well formed and the caller is
    /// allowed, the STUDENT is simply not ready. The instrument and the stable warning code travel in the
    /// body so a UI can say which assessment is outstanding instead of "something went wrong".
    /// </summary>
    private static IResult NotReady(CareerFitInputException exception) =>
        Results.Json(
            new
            {
                success = false,
                code = exception.Code,
                instrument = exception.Instrument,
                message = exception.Message,
            },
            statusCode: StatusCodes.Status409Conflict);

    private static string? FamilyName(ICareerFitRulesProvider rulesProvider, int? familyId) =>
        familyId is int id ? rulesProvider.Rules.Families.FirstOrDefault(f => f.FamilyId == id)?.FamilyName : null;
}

/// <summary>The platform's { success, data } envelope, typed so the CareerFit serializer options apply to the payload.</summary>
/// <typeparam name="T">The payload type.</typeparam>
public sealed record CareerFitEnvelope<T>(bool Success, T Data);

/// <summary>
/// A run reduced to what may be shown beside a career family: the ORDINAL rank and the categorical labels.
/// No fit scalar of any kind — see this file's header and FM-CF-011's.
/// </summary>
public sealed record RankingView(
    Guid RunId,
    DateTimeOffset EvaluatedAt,
    string RulesVersion,
    IReadOnlyList<RankedFamilyView> Families)
{
    /// <summary>Project a run into its ranking. The family NAME comes from the rule set the run names, so a run scored under an older version still labels correctly when that version is the one loaded.</summary>
    public static RankingView From(CareerFitRun run, ICareerFitRulesProvider rulesProvider)
    {
        ArgumentNullException.ThrowIfNull(run);
        ArgumentNullException.ThrowIfNull(rulesProvider);

        var names = rulesProvider.Rules.Families.ToDictionary(f => f.FamilyId, f => f.FamilyName);
        return new RankingView(
            run.Id,
            run.CreatedAt,
            run.RulesVersion,
            [.. run.Families.Select(f => new RankedFamilyView(
                FamilyId: f.OwnerId,
                FamilyName: names.TryGetValue(f.OwnerId, out var name) ? name : null,
                Rank: f.RankPosition,
                CompetencyGate: f.CompetencyGate.ToReferenceValue(),
                MilGate: f.MilGate.ToReferenceValue(),
                FinalGate: f.FinalGate.ToReferenceValue(),
                Convergence: f.ConvergenceLevel.ToReferenceValue(),
                V360Confidence: f.CareerFit360Confidence.ToReferenceValue()))]);
    }
}

/// <summary>One family's place in a run: its rank and its four categorical labels. Deliberately carries no number that could be read as a likelihood.</summary>
public sealed record RankedFamilyView(
    int FamilyId,
    string? FamilyName,
    int? Rank,
    string CompetencyGate,
    string MilGate,
    string FinalGate,
    string Convergence,
    string V360Confidence);

/// <summary>The student's run history, newest first.</summary>
public sealed record CareerFitRunHistoryView(IReadOnlyList<CareerFitRunListItem> Runs);

/// <summary>One history entry: enough to choose a run, not enough to render one.</summary>
public sealed record CareerFitRunListItem(
    Guid RunId,
    DateTimeOffset EvaluatedAt,
    string RulesVersion,
    int? TopFamilyId,
    string? TopFamilyName);

/// <summary>The active rule set's family catalogue and the version / ratification status it carries.</summary>
public sealed record CareerFitFamilyCatalogView(
    string RulesVersion,
    string Status,
    IReadOnlyList<CareerFitFamilyView> Families);

/// <summary>One family of the rule set. <see cref="Scorable"/> false means the rule set refuses to score it (family 15 inherits its occupation).</summary>
public sealed record CareerFitFamilyView(int FamilyId, string FamilyName, bool Scorable);
