using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using Microsoft.Extensions.Logging;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// The once-loaded, process-wide <c>lia_questions</c> id catalog. Registered as a SINGLETON so the
/// natural-key -> uuid map survives across requests (the resolver itself stays Scoped, like every other
/// reader/writer in this assembly, because it depends on the Scoped
/// <see cref="IFormMapsDatabaseSessionFactory"/>).
///
/// A <see cref="SemaphoreSlim"/> — not a <c>Lazy&lt;Task&lt;…&gt;&gt;</c> — guards the load: the loader
/// needs the CALLER's <see cref="RequestContext"/> (to open an RLS session the same way every other read
/// in this codebase does), which a <c>Lazy</c> captured at construction time cannot supply. The
/// double-checked read of <see cref="_catalog"/> means the semaphore is touched only on the very first
/// call of a process; every later call is a plain volatile field read.
///
/// A failed load is NOT cached — <see cref="_catalog"/> is only assigned on success, so a transient DB
/// error during startup does not permanently poison the resolver for the process's lifetime.
/// </summary>
public sealed class LiaQuestionCatalogCache
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private volatile LiaQuestionCatalog? _catalog;

    public async Task<LiaQuestionCatalog> GetOrLoadAsync(
        Func<CancellationToken, Task<LiaQuestionCatalog>> loader, CancellationToken cancellationToken)
    {
        var cached = _catalog;
        if (cached is not null)
        {
            return cached;
        }

        await _gate.WaitAsync(cancellationToken);
        try
        {
            // Re-check: a concurrent first caller may have loaded it while this one waited.
            if (_catalog is { } loadedByOther)
            {
                return loadedByOther;
            }

            var loaded = await loader(cancellationToken);
            _catalog = loaded;
            return loaded;
        }
        finally
        {
            _gate.Release();
        }
    }
}

/// <summary>Both directions of the <c>lia_questions</c> natural-key &lt;-&gt; real-id mapping.</summary>
public sealed record LiaQuestionCatalog(
    IReadOnlyDictionary<LiaQuestionKey, string> IdByKey,
    IReadOnlyDictionary<string, LiaQuestionKey> KeyById);

/// <summary>
/// Reads the live <c>lia_questions</c> table once per process and answers natural-key &lt;-&gt; real-id
/// lookups from the cached result. See <see cref="ILiaQuestionIdResolver"/> for WHY runtime resolution
/// is mandatory rather than baking ids into an embedded resource.
///
/// <c>lia_questions</c> is a plain, non-tenant-scoped static content catalog: it carries no row-level
/// security policy in any migration, so an ordinary read on the caller's own RLS session sees every row.
///
/// The load takes a connection of its own, so callers must <see cref="WarmAsync"/> BEFORE opening their
/// own session — see that method's contract for why that is mandatory rather than merely tidy
/// (<c>MaxPoolSize</c> is 10, and a nested acquisition under concurrent cold-start load would exhaust the
/// pool and fail every in-flight request). Once warm, <see cref="ResolveAsync"/> and
/// <see cref="ResolveReverseAsync"/> touch no connection at all and are safe to call from inside a
/// transaction.
/// </summary>
public sealed class LiaQuestionIdResolver(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    LiaQuestionCatalogCache cache,
    ILogger<LiaQuestionIdResolver> logger) : ILiaQuestionIdResolver
{
    // "is_active" = true mirrors legacy, which filters isActive on every lia_questions fetch
    // (lia-session-service.ts:106/226/321/374). The (subtest, item_number, is_practice) UNIQUE index
    // ignores is_active, so at most one row exists per key either way — but without this filter .NET
    // would serve a question legacy has deactivated. With it, deactivating a question instead surfaces
    // as the loud catalog-drift error at serve time, which is the behaviour we want.
    private const string SelectQuestionIdsSql = """
        SELECT "id", "subtest"::text AS "subtest", "item_number" AS "itemNumber",
               "is_practice" AS "isPractice"
        FROM "lia_questions"
        WHERE "is_active" = true
        """;

    public Task WarmAsync(RequestContext context, CancellationToken cancellationToken = default) =>
        LoadAsync(context, cancellationToken);

    public async Task<string?> ResolveAsync(
        RequestContext context, string subtest, int itemNumber, bool isPractice,
        CancellationToken cancellationToken = default)
    {
        var catalog = await LoadAsync(context, cancellationToken);
        return catalog.IdByKey.TryGetValue(new LiaQuestionKey(subtest, itemNumber, isPractice), out var id)
            ? id
            : null;
    }

    public async Task<LiaQuestionKey?> ResolveReverseAsync(
        RequestContext context, string questionId, CancellationToken cancellationToken = default)
    {
        var catalog = await LoadAsync(context, cancellationToken);
        return catalog.KeyById.TryGetValue(questionId, out var key) ? key : null;
    }

    private Task<LiaQuestionCatalog> LoadAsync(RequestContext context, CancellationToken cancellationToken) =>
        cache.GetOrLoadAsync(ct => QueryCatalogAsync(context, ct), cancellationToken);

    private async Task<LiaQuestionCatalog> QueryCatalogAsync(
        RequestContext context, CancellationToken cancellationToken)
    {
        var idByKey = new Dictionary<LiaQuestionKey, string>();
        var keyById = new Dictionary<string, LiaQuestionKey>(StringComparer.Ordinal);

        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = SelectQuestionIdsSql;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var id = reader.GetString(0);
            var key = new LiaQuestionKey(reader.GetString(1), reader.GetInt32(2), reader.GetBoolean(3));

            // The (subtest, item_number, is_practice) UNIQUE index guarantees at most one row per key,
            // so a natural-key lookup can never be ambiguous. Ordinal-last-wins would be a schema
            // violation, not a business case — log loudly rather than silently pick one.
            if (!idByKey.TryAdd(key, id))
            {
                logger.LogError(
                    "lia.questions.catalog duplicate natural key subtest={Subtest} itemNumber={ItemNumber} isPractice={IsPractice}",
                    key.Subtest, key.ItemNumber, key.IsPractice);
            }

            keyById[id] = key;
        }

        logger.LogInformation("lia.questions.catalog loaded questionCount={QuestionCount}", idByKey.Count);
        return new LiaQuestionCatalog(idByKey, keyById);
    }
}
