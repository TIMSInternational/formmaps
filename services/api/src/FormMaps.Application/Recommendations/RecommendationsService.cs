using System.Globalization;
using System.Text;
using FormMaps.Application.Auth;
using FormMaps.Application.Email;
using FormMaps.Application.Storage;
using FormMaps.Application.Uploads;

namespace FormMaps.Application.Recommendations;

/// <summary>
/// Typed service error the endpoint maps to an HTTP status. Messages are author-controlled fixed strings, safe to
/// surface to clients — the port of <c>RecommendationError</c> (recommendationsService.ts:21).
/// </summary>
public sealed class RecommendationException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

/// <summary>
/// Letters of recommendation — port of services/recommendationsService.ts (formmaps#59). Structured as a service
/// rather than folded into the endpoint because legacy is: the file carries the request lifecycle (rate limit →
/// eligibility → create-or-reactivate), the recommender-ownership 404 convention, the letter upload/download rules,
/// and the application-linking check, and each of those has behaviour worth pinning independently of HTTP.
///
/// <para>Every DB call goes through <see cref="IRecommendationsRepository"/> on the CALLER's RLS session.</para>
/// </summary>
public sealed class RecommendationsService(
    IRecommendationsRepository repository,
    IUserAccessGuard userAccessGuard,
    IObjectStorage storage,
    IEmailSender emailSender,
    RecommendationEmails emails,
    TimeProvider timeProvider)
{
    /// <summary>
    /// Roles a student may request a letter from. Must be active staff at the student's OWN school. Mirrored by the
    /// /staff search and the POST recommender check so the endpoint can never become an open email relay.
    /// </summary>
    public static readonly string[] StaffRoles = ["counselor", "school_admin", "teacher"];

    private const int MaxDailyRequests = 10;

    /// <summary>5 min — short-lived signed URL (LETTER_DOWNLOAD_TTL).</summary>
    private const int LetterDownloadTtlSeconds = 300;

    /// <summary>
    /// States from which a recommender may upload a letter. Uploading IS the submit action, so it is gated to a
    /// request the recommender has accepted and not yet fulfilled — never "requested" (pre-acceptance), "declined",
    /// or "submitted" (already has a letter; no silent post-submission replacement / S3 orphaning).
    /// </summary>
    private static readonly string[] UploadableStates = ["accepted", "in_progress"];

    // =========================================================================================================
    // Create / re-request (recommendationsService.ts:73)
    // =========================================================================================================

    public async Task<RecommendationRequestRow> CreateRequestAsync(
        RequestContext context, CreateRequestInput input, CancellationToken cancellationToken = default)
    {
        // Rate limit: max 10 request *emails* per day per student. Counts BOTH new requests and reactivations of
        // declined rows, so the reactivation path cannot be used to flood a recommender.
        //
        // Legacy computes `new Date(); setHours(0,0,0,0)` — LOCAL midnight of the API process. The deployed
        // containers run with TZ unset (UTC), so local midnight IS UTC midnight; this uses UTC midnight directly.
        // A non-UTC TZ would move the window, in either runtime.
        var todayStart = timeProvider.GetUtcNow().UtcDateTime.Date;
        var dailyCount = await repository.CountTodaysRequestedAsync(context, input.StudentId, todayStart, cancellationToken);
        if (dailyCount >= MaxDailyRequests)
        {
            throw new RecommendationException(429, "Daily recommendation request limit reached (max 10)");
        }

        var student = await repository.FindUserAsync(context, input.StudentId, cancellationToken);

        // input.SchoolId is the JWT claim; the fresh users read is the fallback (legacy: `input.schoolId || student?.schoolId || null`).
        var studentSchoolId = !string.IsNullOrEmpty(input.SchoolId) ? input.SchoolId : student?.SchoolId;
        var recommender = await repository.FindUserAsync(context, input.RecommenderId, cancellationToken);

        // 404 (not 403) so non-qualifying ids are indistinguishable from nonexistent.
        if (recommender is null ||
            !await IsEligibleRecommenderAsync(context, input.StudentId, studentSchoolId, recommender, cancellationToken))
        {
            throw new RecommendationException(404, "Recommender not found");
        }

        // dueDate is validated at the endpoint (parseable date string); guarded here too so an unparseable value
        // never reaches the column.
        var due = ParseDueDate(input.DueDate);

        var existing = await repository.FindByPairAsync(context, input.StudentId, input.RecommenderId, cancellationToken);

        RecommendationRequestRow request;
        if (existing is not null)
        {
            var reactivatable = !existing.IsActive || existing.Status == "declined";
            if (!reactivatable)
            {
                throw new RecommendationException(409, "A recommendation request already exists for this recommender");
            }

            request = await repository.ReactivateAsync(context, existing.Id, input, due, cancellationToken);
        }
        else
        {
            var created = await repository.CreateAsync(context, input, due, cancellationToken);
            if (created.Duplicate)
            {
                // Lost a race against a concurrent create for the same (student, recommender) — legacy's P2002 branch.
                throw new RecommendationException(409, "A recommendation request already exists for this recommender");
            }

            request = created.Row!;
        }

        // Email is isolated: a mailer failure must not undo the persisted request. (IEmailSender never throws by
        // contract; the catch mirrors legacy's try/catch and keeps a throwing double from failing the write.)
        try
        {
            var message = emails.BuildRequest(
                recommender.Name,
                string.IsNullOrEmpty(student?.Name) ? "A student" : student.Name,
                input.Relationship,
                input.RequestMessage,
                due);
            await emailSender.SendAsync(recommender.Email, message.Subject, message.Html, cancellationToken);
        }
        catch
        {
            // legacy: logger.warn(emailErr, "Recommendation request email failed (request still created)")
        }

        return request;
    }

    /// <summary>
    /// A recommender is eligible if they are active AND either (a) same-school staff in
    /// <see cref="StaffRoles"/>, or (b) a coach the student has at least one booking with.
    /// </summary>
    public async Task<bool> IsEligibleRecommenderAsync(
        RequestContext context, string studentId, string? studentSchoolId, RecommendationUser recommender,
        CancellationToken cancellationToken = default)
    {
        if (!recommender.IsActive)
        {
            return false;
        }

        var role = recommender.RoleName ?? "";
        if (StaffRoles.Contains(role, StringComparer.Ordinal))
        {
            return !string.IsNullOrEmpty(studentSchoolId) &&
                   string.Equals(recommender.SchoolId, studentSchoolId, StringComparison.Ordinal);
        }

        if (role == "coach")
        {
            return await repository.HasCoachBookingAsync(context, studentId, recommender.Id, cancellationToken);
        }

        return false;
    }

    // =========================================================================================================
    // Reads
    // =========================================================================================================

    public Task<IReadOnlyList<StudentRequestRow>> ListForStudentAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default) =>
        repository.ListForStudentAsync(context, studentId, cancellationToken);

    public Task<IReadOnlyList<ReceivedRequestRow>> ListReceivedAsync(
        RequestContext context, string recommenderId, CancellationToken cancellationToken = default) =>
        repository.ListReceivedAsync(context, recommenderId, cancellationToken);

    /// <summary>
    /// The full requestable set for a student: same-school staff (if the student has a school) PLUS coaches they
    /// have booked. Deduped by user id (staff wins a tie — insertion order), sorted by name, capped at limit.
    /// </summary>
    public async Task<IReadOnlyList<EligibleRecommender>> SearchEligibleRecommendersAsync(
        RequestContext context, string studentId, string? schoolId, string search, int limit,
        CancellationToken cancellationToken = default)
    {
        var staff = string.IsNullOrEmpty(schoolId)
            ? []
            : await repository.SearchStaffAsync(context, schoolId, search, limit, cancellationToken);
        var coaches = await repository.SearchBookedCoachesAsync(context, studentId, search, limit, cancellationToken);

        var byId = new Dictionary<string, EligibleRecommender>(StringComparer.Ordinal);
        foreach (var u in staff.Concat(coaches))
        {
            byId.TryAdd(u.Id, u);
        }

        // localeCompare on (name || "") — locale-aware, so "apple" sorts before "Banana" (ordinal would not).
        // InvariantCulture is the closest .NET equivalent of the default ICU collation Node uses.
        var sorted = byId.Values
            .OrderBy(u => u.Name ?? "", StringComparer.InvariantCulture)
            .ToList();

        // Array.prototype.slice(0, limit): a NEGATIVE limit drops the last |limit| entries rather than taking any.
        // `?limit=-5` reaches here intact, so the JS semantics are reproduced instead of clamped.
        var count = limit < 0 ? Math.Max(0, sorted.Count + limit) : Math.Min(limit, sorted.Count);
        return sorted.Take(count).ToList();
    }

    /// <summary>
    /// Oversight dashboard. Scope by role: counselor → their assigned students; school_admin / Super Admin → the
    /// whole school; teacher → ONLY requests directed at them (a teacher is a recommender, not an oversight role).
    /// </summary>
    public async Task<DashboardResult> GetDashboardAsync(
        RequestContext context, string role, string userId, string schoolId, CancellationToken cancellationToken = default)
    {
        var scope = role switch
        {
            "teacher" => DashboardScope.Recommender,
            "counselor" => DashboardScope.AssignedStudents,
            _ => DashboardScope.SchoolStudents,
        };

        var requests = await repository.ListDashboardAsync(context, scope, userId, schoolId, cancellationToken);

        // EMPTY_STATUS_COUNTS seeds these five keys in this order; an unrecognised status appends a new key.
        var countByStatus = new Dictionary<string, int>(StringComparer.Ordinal)
        {
            ["requested"] = 0,
            ["accepted"] = 0,
            ["in_progress"] = 0,
            ["submitted"] = 0,
            ["declined"] = 0,
        };
        foreach (var r in requests)
        {
            countByStatus[r.Request.Status] = countByStatus.GetValueOrDefault(r.Request.Status) + 1;
        }

        return new DashboardResult(requests.Count, countByStatus, requests);
    }

    // =========================================================================================================
    // Recommender actions
    // =========================================================================================================

    /// <summary>
    /// findUnique by id + the two ownership gates. Both a missing row and a row owned by someone else raise the
    /// SAME 404 so a probing caller cannot distinguish "exists but not yours" from "does not exist" (IDOR
    /// enumeration defense) — recommendationsService.ts:334.
    /// </summary>
    private async Task<OwnedRequest> LoadOwnedByRecommenderAsync(
        RequestContext context, string id, string recommenderId, CancellationToken cancellationToken)
    {
        var owned = await repository.FindByIdWithUsersAsync(context, id, cancellationToken);
        if (owned is null || !owned.Request.IsActive)
        {
            throw new RecommendationException(404, "Recommendation request not found");
        }

        if (owned.Request.RecommenderId != recommenderId)
        {
            throw new RecommendationException(404, "Recommendation request not found");
        }

        return owned;
    }

    public async Task<RecommendationRequestRow> RespondAsync(
        RequestContext context, string id, string recommenderId, string action, string? declineReason,
        CancellationToken cancellationToken = default)
    {
        var request = await LoadOwnedByRecommenderAsync(context, id, recommenderId, cancellationToken);
        var accepted = action == "accept";
        var newStatus = accepted ? "accepted" : "declined";

        // On ACCEPT legacy passes `declineReason: undefined`, which Prisma omits — so a prior decline reason is
        // left in place rather than cleared. Ported as-is (WriteDeclineReason = false on accept).
        var updated = await repository.RespondAsync(
            context, id, recommenderId, newStatus, writeDeclineReason: !accepted, declineReason, cancellationToken);

        // NOT wrapped in try/catch in legacy — but sendEmail itself never throws, and neither does IEmailSender.
        var message = emails.BuildRespond(request.Student.Name, request.Recommender.Name, accepted, declineReason);
        await emailSender.SendAsync(request.Student.Email, message.Subject, message.Html, cancellationToken);

        return updated;
    }

    public async Task<RecommendationRequestRow> UpdateStatusAsync(
        RequestContext context, string id, string recommenderId, string status, CancellationToken cancellationToken = default)
    {
        var request = await LoadOwnedByRecommenderAsync(context, id, recommenderId, cancellationToken);

        // Invariant: a request is "submitted" ONLY when a letter file exists. This endpoint may re-affirm submitted,
        // but never fabricate it without a file — otherwise the download endpoint would 404 on a "complete" request.
        if (status == "submitted" && string.IsNullOrEmpty(request.Request.LetterFileKey))
        {
            throw new RecommendationException(409, "Upload a letter before marking the request submitted");
        }

        var updated = await repository.UpdateStatusAsync(context, id, recommenderId, status, cancellationToken);

        if (status == "submitted")
        {
            await NotifyLetterSubmittedAsync(request.Student, request.Recommender.Name, cancellationToken);
        }

        return updated;
    }

    // =========================================================================================================
    // Letter file (upload + download)
    // =========================================================================================================

    /// <summary>
    /// PDF-only: the locked decision is that the recommender uploads the actual letter as a PDF. Requires the
    /// declared mimetype AND a full <c>%PDF-&lt;version&gt;</c> header (not just the 4-byte <c>%PDF</c> prefix, which
    /// a polyglot could fake) — this is STRICTER than the shared FileUploadValidation.ValidateMagicBytes, which is
    /// why it lives here rather than reusing it. Stored objects are also served Content-Disposition: attachment.
    /// </summary>
    public static bool IsPdf(LetterUpload file)
    {
        if (file.MimeType != "application/pdf" || file.Buffer.Length < 8)
        {
            return false;
        }

        var head = Encoding.ASCII.GetString(file.Buffer, 0, 8);
        return head.Length >= 6 && head.StartsWith("%PDF-", StringComparison.Ordinal) && char.IsAsciiDigit(head[5]);
    }

    /// <summary>
    /// Recommender uploads the letter PDF. Only the owning recommender, and only from an accepted/in_progress
    /// request. On success the request flips to "submitted" and the student is emailed. If the DB write fails after
    /// the S3 put, the freshly uploaded object is best-effort deleted so a failed upload leaves no orphan.
    /// </summary>
    public async Task<RecommendationRequestRow> UploadLetterAsync(
        RequestContext context, string id, string recommenderId, LetterUpload file,
        CancellationToken cancellationToken = default)
    {
        var request = await LoadOwnedByRecommenderAsync(context, id, recommenderId, cancellationToken);
        if (!UploadableStates.Contains(request.Request.Status, StringComparer.Ordinal))
        {
            throw new RecommendationException(
                409, "A letter can only be uploaded after the request is accepted and before it is submitted");
        }

        if (!IsPdf(file))
        {
            throw new RecommendationException(400, "Only PDF letters are accepted");
        }

        // Legacy builds the key by hand as `recommendations/letters/{Date.now()}-{6 base36}.pdf`; IObjectStorage's
        // UploadAndGetUrlAsync generates exactly that shape from (folder, filename) — the extension comes from the
        // filename, hence the literal "letter.pdf" rather than the caller's originalname. Reusing the existing S3
        // rail rather than adding a second storage path.
        var stored = await storage.UploadAndGetUrlAsync(
            "recommendations/letters", "letter.pdf", file.Buffer, "application/pdf", cancellationToken);

        RecommendationRequestRow updated;
        try
        {
            // sanitizeFilename(originalname) || "letter.pdf" — the shared lib/sanitize.ts port.
            var name = FileUploadValidation.SanitizeFilename(file.OriginalName);
            updated = await repository.SetLetterAsync(
                context, id, recommenderId, stored.Key, string.IsNullOrEmpty(name) ? "letter.pdf" : name, cancellationToken);
        }
        catch
        {
            try
            {
                await storage.DeleteAsync(stored.Key, cancellationToken);
            }
            catch
            {
                // legacy: logger.warn(cleanupErr, "Failed to clean up orphaned letter object after DB write failure")
            }

            throw;
        }

        await NotifyLetterSubmittedAsync(request.Student, request.Recommender.Name, cancellationToken);
        return updated;
    }

    /// <summary>
    /// Returns a short-TTL signed download URL for the letter. Authorized: the owning student, the recommender, an
    /// assigned counselor, or a same-school admin (via <see cref="IUserAccessGuard"/>, the canAccessUser port). A
    /// 404 hides existence from everyone else.
    ///
    /// <para><b>THE SUBJECT OF THE LETTER IS ON THAT LIST.</b> See the header comment on
    /// <c>RecommendationsEndpoints.DownloadLetterAsync</c> for decision D9 and what would have to change to close
    /// it. Do not "fix" it here without changing that decision.</para>
    /// </summary>
    public async Task<LetterDownload> GetLetterDownloadUrlAsync(
        RequestContext context, string id, CancellationToken cancellationToken = default)
    {
        var request = await repository.FindByIdAsync(context, id, cancellationToken);
        if (request is null || !request.IsActive || string.IsNullOrEmpty(request.LetterFileKey))
        {
            throw new RecommendationException(404, "Letter not found");
        }

        var isRecommender = request.RecommenderId == context.Actor!.UserId;
        var allowed = isRecommender ||
                      await userAccessGuard.CanAccessUserAsync(context, request.StudentId, cancellationToken);
        if (!allowed)
        {
            throw new RecommendationException(404, "Letter not found");
        }

        // getFileUrl(key, 300, { contentType: "application/pdf" }) — no inline flag, so the object keeps its
        // stored Content-Disposition: attachment.
        var url = await storage.GetPresignedReadUrlAsync(
            request.LetterFileKey, LetterDownloadTtlSeconds, inline: false, "application/pdf", cancellationToken);
        return new LetterDownload(url, string.IsNullOrEmpty(request.LetterFileName) ? "letter.pdf" : request.LetterFileName);
    }

    // =========================================================================================================
    // Applications linking
    // =========================================================================================================

    public async Task<IReadOnlyList<RecommendationApplicationLinkRow>> LinkApplicationsAsync(
        RequestContext context, string id, string studentId, IReadOnlyList<string> applicationIds,
        CancellationToken cancellationToken = default)
    {
        var request = await repository.FindByIdAsync(context, id, cancellationToken);
        if (request is null || !request.IsActive)
        {
            throw new RecommendationException(404, "Recommendation request not found");
        }

        // NOTE the inconsistency, ported not corrected: every other ownership failure in this file is a 404 for
        // IDOR reasons; this one is a 403 that confirms the request exists. Legacy is the specification.
        if (request.StudentId != studentId)
        {
            throw new RecommendationException(403, "Only the student who created this request can link applications");
        }

        var apps = await repository.FindOwnedActiveApplicationsAsync(context, studentId, applicationIds, cancellationToken);
        if (apps.Count != applicationIds.Count)
        {
            throw new RecommendationException(400, "One or more applications not found or do not belong to you");
        }

        return await repository.UpsertApplicationLinksAsync(context, id, applicationIds, studentId, cancellationToken);
    }

    // =========================================================================================================

    private Task NotifyLetterSubmittedAsync(UserRef student, string? recommenderName, CancellationToken cancellationToken)
    {
        var message = emails.BuildSubmitted(student.Name, recommenderName, timeProvider.GetUtcNow().UtcDateTime);
        return emailSender.SendAsync(student.Email, message.Subject, message.Html, cancellationToken);
    }

    /// <summary>
    /// `dueDate ? new Date(dueDate) : null`, then `Number.isNaN(getTime()) ? null : it`. JS Date.parse accepts a
    /// wider grammar than .NET does; ISO-8601 (what the UI sends) round-trips identically, and a bare date is
    /// treated as UTC in both (AssumeUniversal here, the ISO date-only rule in JS).
    /// </summary>
    private static DateTime? ParseDueDate(string? raw)
    {
        if (string.IsNullOrEmpty(raw))
        {
            return null;
        }

        return DateTime.TryParse(
            raw, CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal,
            out var parsed)
            ? parsed
            : null;
    }
}
