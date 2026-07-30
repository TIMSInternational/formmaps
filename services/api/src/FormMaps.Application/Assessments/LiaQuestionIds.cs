using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Natural key of one row in the static <c>lia_questions</c> catalog — the
/// <c>@@unique([subtest, itemNumber, isPractice])</c> index declared in schema.prisma. This is the ONLY
/// stable, source-controlled way to name a question: <c>lia_questions.id</c> itself is
/// <c>String @id @default(uuid())</c>, so its value is generated fresh on every seed run and differs
/// between prod, staging, and every developer's local database.
/// </summary>
public readonly record struct LiaQuestionKey(string Subtest, int ItemNumber, bool IsPractice);

/// <summary>
/// Resolves the REAL, environment-specific <c>lia_questions.id</c> for a question the static
/// <see cref="LiaAnswerScoring.BuildQuestionBank"/> content bank describes.
///
/// Why this exists: <c>lia_responses.question_id</c> carries a real foreign key
/// (<c>lia_responses_question_id_fkey REFERENCES lia_questions(id) ON DELETE RESTRICT</c>, created in
/// prisma/migrations/20260703000000_lia_tims_parity and never dropped since). Any value this backend
/// writes into that column MUST already exist as a row in the live <c>lia_questions</c> table of
/// whatever database it is pointed at, or Postgres raises 23503 and the request 500s. The embedded
/// static bank supplies question CONTENT and scoring keys — which are genuinely static and safely
/// baked in — but it can NOT supply ids, because they are non-deterministic per seed. So ids are
/// resolved at runtime through the natural key and cached in-process (the catalog is static/
/// append-only in practice, so a load-once cache costs one query per process, not one per answer).
/// </summary>
public interface ILiaQuestionIdResolver
{
    /// <summary>
    /// Load the catalog into cache if it is not there yet, taking and releasing a connection of its own.
    /// Callers MUST invoke this BEFORE opening their own database session.
    ///
    /// This is a hard requirement, not an optimization. <c>MaxPoolSize</c> is 10 (see
    /// <c>FormMapsDatabaseOptions</c>), and every LIA entry point holds a pooled connection — usually
    /// inside a writable transaction holding <c>FOR UPDATE</c> on the session row — for the duration of
    /// the request. If the first catalog load happened lazily from INSIDE that transaction it would need
    /// a SECOND connection while the first is still held; with 10 or more concurrent LIA requests against
    /// a cold process (precisely the post-deploy case, when a cohort starts assessments at once) all
    /// pooled connections are held by in-flight requests, the load blocks until the connection timeout,
    /// and every one of those requests fails. Warming first guarantees at most one connection is held
    /// per request at any moment.
    /// </summary>
    Task WarmAsync(RequestContext context, CancellationToken cancellationToken = default);

    /// <summary>
    /// Forward lookup: the real <c>lia_questions.id</c> for a natural key, or null when the live
    /// catalog has no such row. Null means the embedded static bank and the live <c>lia_questions</c>
    /// table have DRIFTED — callers must treat it as a hard error, never silently tolerate it, because
    /// serving a question whose id does not exist would produce an FK violation on the first answer.
    /// </summary>
    Task<string?> ResolveAsync(
        RequestContext context,
        string subtest,
        int itemNumber,
        bool isPractice,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Reverse lookup: the natural key behind a real <c>lia_questions.id</c>, or null when the id is
    /// unknown (a malformed/forged/stale question_id from a client — the uniform "question not found"
    /// outcome). Needed because a real uuid carries no parseable subtest/item information, so an
    /// incoming <c>question_id</c> can only be mapped back onto the static bank through the catalog.
    /// </summary>
    Task<LiaQuestionKey?> ResolveReverseAsync(
        RequestContext context,
        string questionId,
        CancellationToken cancellationToken = default);
}
