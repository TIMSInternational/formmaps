using FormMaps.Application.Auth;

namespace FormMaps.Application.Recommendations;

/// <summary>
/// Data access for the letters-of-recommendation port (formmaps#59 — services/recommendationsService.ts). Every
/// method runs under the CALLER's RLS session (<c>OpenReadOnlyAsync</c> / <c>OpenWritableAsync</c> with the supplied
/// <see cref="RequestContext"/>), never a bypass session — the same posture legacy has, where the Prisma extension
/// sets app.current_user_id / app.current_school_id from <c>authenticate</c>.
///
/// <para>NOTE ON THE POLICY, inherited not introduced: 003-fk-users.sql policies
/// <c>recommendation_requests</c> on the STUDENT (row visible when studentId = app.current_user_id, or when the
/// student's school = app.current_school_id). A coach recommender has no school, so under the caller's session a
/// coach cannot see a request addressed to them. That is production behaviour today in Node for exactly the same
/// reason; this port does not change it, and does not bypass RLS to "fix" it.</para>
/// </summary>
public interface IRecommendationsRepository
{
    // ---- createRequest ----

    /// <summary>
    /// The daily-cap count: rows for this student with status 'requested' whose createdDate OR updatedAt is at or
    /// after <paramref name="todayStart"/>. Counts reactivations as well as new rows, so the reactivation path
    /// cannot be used to bypass the cap (recommendationsService.ts:77-88).
    /// </summary>
    Task<int> CountTodaysRequestedAsync(
        RequestContext context, string studentId, DateTime todayStart, CancellationToken cancellationToken = default);

    /// <summary>A single user row (name/email/roleName/schoolId/isActive), or null when not visible/absent.</summary>
    Task<RecommendationUser?> FindUserAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// The coach branch of isEligibleRecommender: does a coach row exist for <paramref name="recommenderUserId"/>
    /// AND an active booking between that coach and the student? NOTE the coach row itself is looked up with NO
    /// isActive filter here (legacy's <c>prisma.coach.findUnique({ where: { userId } })</c>) — unlike the /staff
    /// search, which does filter it. Ported as-is.
    /// </summary>
    Task<bool> HasCoachBookingAsync(
        RequestContext context, string studentId, string recommenderUserId, CancellationToken cancellationToken = default);

    /// <summary>The canonical row for the (studentId, recommenderId) pair, or null.</summary>
    Task<RecommendationRequestRow?> FindByPairAsync(
        RequestContext context, string studentId, string recommenderId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Reactivate a declined/soft-deleted row in place: status 'requested', new relationship/message/dueDate, and
    /// declineReason / submittedAt / letter* cleared (recommendationsService.ts:122-138).
    /// </summary>
    Task<RecommendationRequestRow> ReactivateAsync(
        RequestContext context, string id, CreateRequestInput input, DateTime? dueDate,
        CancellationToken cancellationToken = default);

    /// <summary>Insert a fresh request. A unique violation on (studentId, recommenderId) → Duplicate (Prisma P2002).</summary>
    Task<CreateRowResult> CreateAsync(
        RequestContext context, CreateRequestInput input, DateTime? dueDate, CancellationToken cancellationToken = default);

    // ---- reads ----

    /// <summary>GET / — the student's own active requests, newest first, with recommender + links.</summary>
    Task<IReadOnlyList<StudentRequestRow>> ListForStudentAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default);

    /// <summary>GET /received — active requests addressed to this recommender, newest first, with student + links.</summary>
    Task<IReadOnlyList<ReceivedRequestRow>> ListReceivedAsync(
        RequestContext context, string recommenderId, CancellationToken cancellationToken = default);

    /// <summary>Same-school active staff in STAFF_ROLES, optionally name/email filtered, name ascending, capped.</summary>
    Task<IReadOnlyList<EligibleRecommender>> SearchStaffAsync(
        RequestContext context, string schoolId, string search, int limit, CancellationToken cancellationToken = default);

    /// <summary>Active users behind an active coach the student has an active booking with, name ascending, capped.</summary>
    Task<IReadOnlyList<EligibleRecommender>> SearchBookedCoachesAsync(
        RequestContext context, string studentId, string search, int limit, CancellationToken cancellationToken = default);

    /// <summary>GET /dashboard — the scoped request set with both user includes + links, newest first.</summary>
    Task<IReadOnlyList<DashboardRequestRow>> ListDashboardAsync(
        RequestContext context, DashboardScope scope, string userId, string schoolId,
        CancellationToken cancellationToken = default);

    /// <summary>findUnique by id with the student + recommender includes; null when the row does not exist.</summary>
    Task<OwnedRequest?> FindByIdWithUsersAsync(
        RequestContext context, string id, CancellationToken cancellationToken = default);

    /// <summary>Bare findUnique by id (the letter download + link-applications paths).</summary>
    Task<RecommendationRequestRow?> FindByIdAsync(
        RequestContext context, string id, CancellationToken cancellationToken = default);

    // ---- recommender writes ----

    /// <summary>
    /// respond(): status → accepted|declined, updatedBy = caller. declineReason is written ONLY on decline
    /// (legacy passes <c>undefined</c> on accept, so Prisma leaves the column untouched — a prior decline reason
    /// survives an accept).
    /// </summary>
    Task<RecommendationRequestRow> RespondAsync(
        RequestContext context, string id, string recommenderId, string newStatus, bool writeDeclineReason,
        string? declineReason, CancellationToken cancellationToken = default);

    /// <summary>updateStatus(): status + updatedBy, plus submittedAt when moving to 'submitted'.</summary>
    Task<RecommendationRequestRow> UpdateStatusAsync(
        RequestContext context, string id, string recommenderId, string status, CancellationToken cancellationToken = default);

    /// <summary>uploadLetter()'s DB half: letter key/name/uploadedAt + status 'submitted' + submittedAt + updatedBy.</summary>
    Task<RecommendationRequestRow> SetLetterAsync(
        RequestContext context, string id, string recommenderId, string letterFileKey, string letterFileName,
        CancellationToken cancellationToken = default);

    // ---- link-applications ----

    /// <summary>
    /// The ids among <paramref name="applicationIds"/> that are active applications owned by
    /// <paramref name="studentId"/>. The caller compares the COUNT (legacy's <c>apps.length !== ids.length</c>).
    /// </summary>
    Task<IReadOnlyList<string>> FindOwnedActiveApplicationsAsync(
        RequestContext context, string studentId, IReadOnlyList<string> applicationIds,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Upsert one link per id, in the order given (legacy maps over applicationIds under Promise.all and returns
    /// that array). A pre-existing link is returned unchanged apart from its updatedAt.
    /// </summary>
    Task<IReadOnlyList<RecommendationApplicationLinkRow>> UpsertApplicationLinksAsync(
        RequestContext context, string requestId, IReadOnlyList<string> applicationIds, string studentId,
        CancellationToken cancellationToken = default);

    // ---- misc ----

    /// <summary>resolveSchoolId's fallback read: the caller's own users."schoolId".</summary>
    Task<string?> GetCallerSchoolIdAsync(RequestContext context, CancellationToken cancellationToken = default);
}
