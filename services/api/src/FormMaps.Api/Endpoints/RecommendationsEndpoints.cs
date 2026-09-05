using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Recommendations;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Letters of recommendation (formmaps#59 — routes/recommendations.ts, mounted /api/v1/recommendations; the service
/// half is services/recommendationsService.ts). ONE dark flag <c>FORMMAPS_ROUTE_RECOMMENDATIONS_TO_DOTNET</c>
/// co-flips all ten routes (Next matches path-not-method). Default OFF.
///
/// <para>Guards, exactly as legacy declares them: <c>authenticate</c> at the router (→ RequireIdentity everywhere),
/// and <c>requirePermission("recommendations:respond")</c> on FOUR routes only — GET /received (:137),
/// PUT /:id/respond (:155), PUT /:id/status (:177), POST /:id/letter (:195). The other six carry no permission
/// gate; their scoping is per-row inside the service (own studentId, owning recommenderId, or canAccessUser).</para>
///
/// <para>Error mapping is legacy's <c>fail()</c> (:29): a <see cref="RecommendationException"/> surfaces its own
/// status + author-controlled message; anything else is a 500 with the fixed "Internal server error".</para>
/// </summary>
public static class RecommendationsEndpoints
{
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    /// <summary>multer letterUpload: limits.fileSize = 5 MB (recommendations.ts:16).</summary>
    private const long MaxLetterSize = 5 * 1024 * 1024;

    public static IEndpointRouteBuilder MapRecommendationsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/recommendations").WithTags("Recommendations").DisableAntiforgery();
        group.MapPost("/", CreateRequestAsync);
        group.MapGet("/", ListMineAsync);
        group.MapGet("/staff", SearchStaffAsync);
        group.MapGet("/dashboard", DashboardAsync);
        group.MapGet("/received", ListReceivedAsync);
        group.MapPut("/{id}/respond", RespondAsync);
        group.MapPut("/{id}/status", UpdateStatusAsync);
        group.MapPost("/{id}/letter", UploadLetterAsync);
        group.MapGet("/{id}/letter", DownloadLetterAsync);
        group.MapPost("/{id}/link-applications", LinkApplicationsAsync);
        return app;
    }

    // =============================================================================================================
    // POST /api/v1/recommendations — Student requests a letter (recommendations.ts:59)
    // =============================================================================================================

    private static async Task<IResult> CreateRequestAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        RecommendationsService service, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        var parsed = RecommendationValidation.ValidateCreate(body.Value);
        if (!parsed.Ok) return BadRequest(parsed.Message!);

        var b = parsed.Value!;
        try
        {
            var row = await service.CreateRequestAsync(
                context,
                new CreateRequestInput(
                    context.Actor!.UserId, context.Tenant?.SchoolId, b.RecommenderId,
                    b.Relationship, b.RequestMessage, b.DueDate),
                cancellationToken);
            return Results.Json(new { success = true, data = RequestJson(row) }, statusCode: StatusCodes.Status201Created);
        }
        catch (RecommendationException ex)
        {
            return Fail(ex);
        }
    }

    // =============================================================================================================
    // GET /api/v1/recommendations — Student's own requests + status (recommendations.ts:84)
    // =============================================================================================================

    private static async Task<IResult> ListMineAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        RecommendationsService service, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;

        var rows = await service.ListForStudentAsync(context, context.Actor!.UserId, cancellationToken);
        return Results.Ok(new { success = true, data = rows.Select(StudentRequestJson) });
    }

    // =============================================================================================================
    // GET /api/v1/recommendations/staff — Student searches eligible recommenders (recommendations.ts:97)
    // =============================================================================================================

    private static async Task<IResult> SearchStaffAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        RecommendationsService service, IRecommendationsRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;

        try
        {
            var search = Slice(Qs(http, "search"), 100);
            // Math.min(parseInt(qs(limit) || "10", 10) || 10, 20): unparseable OR zero → 10 (JS `|| 10` on NaN/0);
            // a negative value survives both and is honoured downstream as Prisma's signed take + slice.
            var limit = Math.Min(JsParseIntOr(Qs(http, "limit"), 10), 20);

            var schoolId = await ResolveSchoolIdAsync(context, repository, cancellationToken);
            var rows = await service.SearchEligibleRecommendersAsync(
                context, context.Actor!.UserId, schoolId, search, limit, cancellationToken);
            return Results.Ok(new { success = true, data = rows.Select(RecommenderJson) });
        }
        catch (RecommendationException ex)
        {
            return Fail(ex);
        }
    }

    // =============================================================================================================
    // GET /api/v1/recommendations/dashboard — Staff oversight (recommendations.ts:113)
    // =============================================================================================================

    private static async Task<IResult> DashboardAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        RecommendationsService service, IRecommendationsRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;

        // The RAW role string, compared exactly as legacy does (`req.userRole`, no normalization) — an alias like
        // "admin" is NOT collapsed into "Super Admin" here, so it is forbidden, same as in Node.
        var role = context.Actor!.Role;
        if (role is not (FormMapsRoles.Counselor or FormMapsRoles.SchoolAdmin or FormMapsRoles.Teacher or FormMapsRoles.SuperAdmin))
        {
            return Forbidden();
        }

        try
        {
            var schoolId = await ResolveSchoolIdAsync(context, repository, cancellationToken);

            // Teachers are scoped by recommenderId, so they don't need a school.
            if (string.IsNullOrEmpty(schoolId) && role != FormMapsRoles.Teacher)
            {
                return BadRequest("No school associated with this account");
            }

            var data = await service.GetDashboardAsync(
                context, role, context.Actor.UserId, schoolId ?? "", cancellationToken);
            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    total = data.Total,
                    countByStatus = data.CountByStatus,
                    requests = data.Requests.Select(DashboardRequestJson),
                },
            });
        }
        catch (RecommendationException ex)
        {
            return Fail(ex);
        }
    }

    // =============================================================================================================
    // GET /api/v1/recommendations/received — Requests assigned to me (recommendations.ts:137)
    // =============================================================================================================

    private static async Task<IResult> ListReceivedAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        RecommendationsService service, CancellationToken cancellationToken)
    {
        var (context, error) = RequireRespondPermission(accessor, guard);
        if (error is not null) return error;

        var rows = await service.ListReceivedAsync(context, context.Actor!.UserId, cancellationToken);
        return Results.Ok(new { success = true, data = rows.Select(ReceivedRequestJson) });
    }

    // =============================================================================================================
    // PUT /api/v1/recommendations/{id}/respond — Recommender accept/decline (recommendations.ts:155)
    // =============================================================================================================

    private static async Task<IResult> RespondAsync(
        string id, HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        RecommendationsService service, CancellationToken cancellationToken)
    {
        var (context, error) = RequireRespondPermission(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        var parsed = RecommendationValidation.ValidateRespond(body.Value);
        if (!parsed.Ok) return BadRequest(parsed.Message!);

        try
        {
            var row = await service.RespondAsync(
                context, id, context.Actor!.UserId, parsed.Value!.Action, parsed.Value.DeclineReason, cancellationToken);
            return Results.Ok(new { success = true, data = RequestJson(row) });
        }
        catch (RecommendationException ex)
        {
            return Fail(ex);
        }
    }

    // =============================================================================================================
    // PUT /api/v1/recommendations/{id}/status — Recommender → in_progress/submitted (recommendations.ts:177)
    // =============================================================================================================

    private static async Task<IResult> UpdateStatusAsync(
        string id, HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        RecommendationsService service, CancellationToken cancellationToken)
    {
        var (context, error) = RequireRespondPermission(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        var parsed = RecommendationValidation.ValidateStatus(body.Value);
        if (!parsed.Ok) return BadRequest(parsed.Message!);

        try
        {
            var row = await service.UpdateStatusAsync(context, id, context.Actor!.UserId, parsed.Value!, cancellationToken);
            return Results.Ok(new { success = true, data = RequestJson(row) });
        }
        catch (RecommendationException ex)
        {
            return Fail(ex);
        }
    }

    // =============================================================================================================
    // POST /api/v1/recommendations/{id}/letter — Recommender uploads the PDF (recommendations.ts:195)
    // =============================================================================================================

    /// <summary>
    /// The letter IS a file upload: legacy is <c>letterUpload.single("file")</c> with a dedicated multer instance —
    /// memory storage, 5 MB cap, and a fileFilter that accepts ONLY <c>application/pdf</c>. Reproduced here on the
    /// SAME S3 rail every other upload uses (<c>IObjectStorage</c>, FM-DOTNET-088), not a second storage path.
    ///
    /// <para>Two consequences of the filter being middleware rather than a handler check, both ported:
    /// a part whose declared mimetype is not application/pdf is DROPPED, so the handler sees no file and answers
    /// the file-required 400 — never "Only PDF letters are accepted"; and a part over 5 MB is a multer error before
    /// the handler, so it reaches the global 500 handler ("Internal server error"), not the route's own catch.
    /// The magic-byte check (a full <c>%PDF-&lt;digit&gt;</c> header) is the only thing that can produce the
    /// "Only PDF letters are accepted" 400.</para>
    /// </summary>
    private static async Task<IResult> UploadLetterAsync(
        string id, HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        RecommendationsService service, CancellationToken cancellationToken)
    {
        var (context, error) = RequireRespondPermission(accessor, guard);
        if (error is not null) return error;

        var read = await ReadLetterPartAsync(http, cancellationToken);
        if (read.TooLarge) return InternalError();
        if (read.File is null) return BadRequest("File required (field name: file)");

        try
        {
            var row = await service.UploadLetterAsync(context, id, context.Actor!.UserId, read.File, cancellationToken);
            return Results.Ok(new { success = true, data = RequestJson(row) });
        }
        catch (RecommendationException ex)
        {
            return Fail(ex);
        }
    }

    // =============================================================================================================
    // GET /api/v1/recommendations/{id}/letter — Download the letter (recommendations.ts:217)
    // =============================================================================================================

    /// <summary>
    /// ⚠️ INTENTIONALLY REACHABLE BY THE SUBJECT OF THE LETTER — INHERITED EXPOSURE, DECISION D9.
    ///
    /// <para>This is the ONE route in routes/recommendations.ts with no
    /// <c>requirePermission("recommendations:respond")</c> gate (recommendations.ts:217 — compare :137, :155, :177,
    /// :195, which all have one). Authorization is delegated to
    /// <c>getLetterDownloadUrl</c>, whose allow-list is: the owning recommender, OR anyone
    /// <c>canAccessUser(caller, request.studentId)</c> admits — and that includes the STUDENT THEMSELVES, because
    /// a caller is always allowed to access their own record. So a student can fetch a 5-minute presigned URL for
    /// the letter written about them. A letter of recommendation is normally confidential from its subject; here
    /// it is not.</para>
    ///
    /// <para>This port does NOT change that. Decision D9 is to port the surface unchanged and make the exposure
    /// VISIBLE rather than silent, so that closing it is a deliberate act by a later reader rather than an
    /// accident of a migration. Flipping <c>FORMMAPS_ROUTE_RECOMMENDATIONS_TO_DOTNET</c> must be
    /// behaviour-neutral; adding a guard here would make it not so.</para>
    ///
    /// <para><b>To close it</b>, three things have to change together:
    /// (1) <c>RecommendationsService.GetLetterDownloadUrlAsync</c> must stop treating self-access as sufficient —
    /// e.g. deny when <c>request.StudentId == context.Actor.UserId</c> and the caller is not also the recommender
    /// or a privileged reader, raising the same 404 as any other denial so the endpoint stays
    /// enumeration-resistant; (2) the pinning test
    /// <c>RecommendationLetterEndpointsTests.Letter_subject_can_download_their_own_letter__INHERITED_EXPOSURE_pinned_by_D9</c>
    /// must be consciously rewritten (it exists to make step 1 impossible to do by accident, and it is NOT an
    /// assertion that the exposure is correct); and (3) legacy Node must change in the same commit or the flag
    /// stops being behaviour-neutral and a rollback silently reopens the hole.</para>
    /// </summary>
    private static async Task<IResult> DownloadLetterAsync(
        string id, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        RecommendationsService service, CancellationToken cancellationToken)
    {
        // NOTE: RequireIdentity, NOT RequireRespondPermission. That asymmetry is the whole point of the comment
        // above; it is load-bearing, not an oversight.
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;

        try
        {
            var data = await service.GetLetterDownloadUrlAsync(context, id, cancellationToken);
            return Results.Ok(new { success = true, data = new { url = data.Url, filename = data.Filename } });
        }
        catch (RecommendationException ex)
        {
            return Fail(ex);
        }
    }

    // =============================================================================================================
    // POST /api/v1/recommendations/{id}/link-applications — Student links to apps (recommendations.ts:238)
    // =============================================================================================================

    private static async Task<IResult> LinkApplicationsAsync(
        string id, HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        RecommendationsService service, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        var parsed = RecommendationValidation.ValidateLinkApplications(body.Value);
        if (!parsed.Ok) return BadRequest(parsed.Message!);

        try
        {
            var links = await service.LinkApplicationsAsync(
                context, id, context.Actor!.UserId, parsed.Value!, cancellationToken);
            return Results.Json(
                new { success = true, data = links.Select(LinkJson) }, statusCode: StatusCodes.Status201Created);
        }
        catch (RecommendationException ex)
        {
            return Fail(ex);
        }
    }

    // =============================================================================================================
    // JSON shapes — Prisma key order (model scalars in schema order, then the included relations)
    // =============================================================================================================

    private static object RequestJson(RecommendationRequestRow r) => new
    {
        id = r.Id,
        studentId = r.StudentId,
        recommenderId = r.RecommenderId,
        status = r.Status,
        relationship = r.Relationship,
        requestMessage = r.RequestMessage,
        declineReason = r.DeclineReason,
        dueDate = r.DueDate,
        submittedAt = r.SubmittedAt,
        letterFileKey = r.LetterFileKey,
        letterFileName = r.LetterFileName,
        letterUploadedAt = r.LetterUploadedAt,
        isActive = r.IsActive,
        createdBy = r.CreatedBy,
        createdDate = r.CreatedDate,
        updatedBy = r.UpdatedBy,
        updatedAt = r.UpdatedAt,
    };

    private static object StudentRequestJson(StudentRequestRow r) => new
    {
        id = r.Request.Id,
        studentId = r.Request.StudentId,
        recommenderId = r.Request.RecommenderId,
        status = r.Request.Status,
        relationship = r.Request.Relationship,
        requestMessage = r.Request.RequestMessage,
        declineReason = r.Request.DeclineReason,
        dueDate = r.Request.DueDate,
        submittedAt = r.Request.SubmittedAt,
        letterFileKey = r.Request.LetterFileKey,
        letterFileName = r.Request.LetterFileName,
        letterUploadedAt = r.Request.LetterUploadedAt,
        isActive = r.Request.IsActive,
        createdBy = r.Request.CreatedBy,
        createdDate = r.Request.CreatedDate,
        updatedBy = r.Request.UpdatedBy,
        updatedAt = r.Request.UpdatedAt,
        recommender = new
        {
            id = r.Recommender.Id,
            name = r.Recommender.Name,
            email = r.Recommender.Email,
            roleName = r.Recommender.RoleName,
        },
        applicationLinks = r.ApplicationLinks.Select(LinkJson),
    };

    private static object ReceivedRequestJson(ReceivedRequestRow r) => new
    {
        id = r.Request.Id,
        studentId = r.Request.StudentId,
        recommenderId = r.Request.RecommenderId,
        status = r.Request.Status,
        relationship = r.Request.Relationship,
        requestMessage = r.Request.RequestMessage,
        declineReason = r.Request.DeclineReason,
        dueDate = r.Request.DueDate,
        submittedAt = r.Request.SubmittedAt,
        letterFileKey = r.Request.LetterFileKey,
        letterFileName = r.Request.LetterFileName,
        letterUploadedAt = r.Request.LetterUploadedAt,
        isActive = r.Request.IsActive,
        createdBy = r.Request.CreatedBy,
        createdDate = r.Request.CreatedDate,
        updatedBy = r.Request.UpdatedBy,
        updatedAt = r.Request.UpdatedAt,
        student = UserJson(r.Student),
        applicationLinks = r.ApplicationLinks.Select(LinkJson),
    };

    private static object DashboardRequestJson(DashboardRequestRow r) => new
    {
        id = r.Request.Id,
        studentId = r.Request.StudentId,
        recommenderId = r.Request.RecommenderId,
        status = r.Request.Status,
        relationship = r.Request.Relationship,
        requestMessage = r.Request.RequestMessage,
        declineReason = r.Request.DeclineReason,
        dueDate = r.Request.DueDate,
        submittedAt = r.Request.SubmittedAt,
        letterFileKey = r.Request.LetterFileKey,
        letterFileName = r.Request.LetterFileName,
        letterUploadedAt = r.Request.LetterUploadedAt,
        isActive = r.Request.IsActive,
        createdBy = r.Request.CreatedBy,
        createdDate = r.Request.CreatedDate,
        updatedBy = r.Request.UpdatedBy,
        updatedAt = r.Request.UpdatedAt,
        student = UserJson(r.Student),
        recommender = UserJson(r.Recommender),
        applicationLinks = r.ApplicationLinks.Select(LinkJson),
    };

    private static object UserJson(UserRef u) => new { id = u.Id, name = u.Name, email = u.Email };

    private static object RecommenderJson(EligibleRecommender u) =>
        new { id = u.Id, name = u.Name, email = u.Email, roleName = u.RoleName };

    private static object LinkJson(RecommendationApplicationLinkRow l) => new
    {
        id = l.Id,
        recommendationRequestId = l.RecommendationRequestId,
        studentApplicationId = l.StudentApplicationId,
        isSubmitted = l.IsSubmitted,
        submittedAt = l.SubmittedAt,
        isActive = l.IsActive,
        createdBy = l.CreatedBy,
        createdDate = l.CreatedDate,
        updatedBy = l.UpdatedBy,
        updatedAt = l.UpdatedAt,
    };

    // =============================================================================================================
    // Guards + helpers
    // =============================================================================================================

    private static (RequestContext Context, IResult? Error) RequireIdentity(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        return decision.Allowed
            ? (context, null)
            : (context, Results.Json(
                new { success = false, code = decision.Code, message = decision.Message },
                statusCode: decision.StatusCode));
    }

    /// <summary>authenticate → requirePermission("recommendations:respond"), in that order (:11 then the route).</summary>
    private static (RequestContext Context, IResult? Error) RequireRespondPermission(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null)
        {
            return (context, error);
        }

        return context.Permissions.Contains(FormMapsPermissions.RecommendationsRespond)
            ? (context, null)
            : (context, Results.Json(
                new { success = false, message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
    }

    /// <summary>resolveSchoolId (:37): the JWT claim when truthy, else a fresh read of the caller's own users row.</summary>
    private static async Task<string?> ResolveSchoolIdAsync(
        RequestContext context, IRecommendationsRepository repository, CancellationToken cancellationToken)
    {
        var claim = context.Tenant?.SchoolId;
        return !string.IsNullOrEmpty(claim) ? claim : await repository.GetCallerSchoolIdAsync(context, cancellationToken);
    }

    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        using var streamReader = new StreamReader(http.Request.Body);
        var raw = await streamReader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(raw)) return EmptyObject;

        try
        {
            using var document = JsonDocument.Parse(raw);
            return document.RootElement.ValueKind is JsonValueKind.Object or JsonValueKind.Array
                ? document.RootElement.Clone()
                : null; // a top-level primitive → express.json strict rejects → 500
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// The <c>letterUpload.single("file")</c> middleware: read the "file" part, drop it when the declared mimetype
    /// is not application/pdf (multer's fileFilter cb(null, false)), and report >5 MB separately so the caller can
    /// answer with the global-handler 500 rather than the route's 400.
    /// </summary>
    private static async Task<LetterPart> ReadLetterPartAsync(HttpContext http, CancellationToken cancellationToken)
    {
        if (!http.Request.HasFormContentType) return LetterPart.None;

        IFormFile? file;
        try
        {
            var form = await http.Request.ReadFormAsync(cancellationToken);
            file = form.Files["file"];
        }
        catch (Exception ex) when (ex is InvalidDataException or IOException)
        {
            // Same accepted divergence as UploadEndpoints: a pathological multipart body degrades to the
            // file-required 400 rather than Node's multer-error 500.
            return LetterPart.None;
        }

        if (file is null) return LetterPart.None;
        if (file.Length > MaxLetterSize) return LetterPart.Large;

        // busboy strips Content-Type parameters, so multer's file.mimetype is the bare type.
        var contentType = (file.ContentType ?? "").Split(';', 2)[0].Trim();
        if (contentType != "application/pdf")
        {
            // fileFilter rejected it → req.file stays undefined → the handler's file-required 400.
            return LetterPart.None;
        }

        using var stream = new MemoryStream();
        await file.CopyToAsync(stream, cancellationToken);
        return new LetterPart(new LetterUpload(file.FileName ?? "", contentType, stream.ToArray()), false);
    }

    /// <summary>qs(req.query.x): the first value of a repeated parameter, "" when absent.</summary>
    private static string Qs(HttpContext http, string name)
    {
        var values = http.Request.Query[name];
        return values.Count == 0 ? "" : values[0] ?? "";
    }

    private static string Slice(string value, int max) => value.Length <= max ? value : value[..max];

    /// <summary>`parseInt(raw || "10", 10) || fallback` — leading digits win, NaN and 0 both fall back.</summary>
    private static int JsParseIntOr(string raw, int fallback)
    {
        var s = (string.IsNullOrEmpty(raw) ? fallback.ToString() : raw).TrimStart();
        var i = 0;
        var sign = 1;
        if (i < s.Length && (s[i] == '+' || s[i] == '-'))
        {
            sign = s[i] == '-' ? -1 : 1;
            i++;
        }

        var start = i;
        while (i < s.Length && char.IsAsciiDigit(s[i]))
        {
            i++;
        }

        if (i == start) return fallback; // NaN → `|| fallback`
        return long.TryParse(s[start..i], out var digits) && digits != 0
            ? (int)Math.Clamp(sign * digits, int.MinValue, int.MaxValue)
            : fallback; // 0 is falsy in JS → `|| fallback`
    }

    private static IResult Fail(RecommendationException ex) =>
        Results.Json(new { success = false, message = ex.Message }, statusCode: ex.StatusCode);

    private static IResult BadRequest(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult Forbidden() =>
        Results.Json(new { success = false, message = "Forbidden" }, statusCode: StatusCodes.Status403Forbidden);

    private static IResult InternalError() =>
        Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);

    private sealed record LetterPart(LetterUpload? File, bool TooLarge)
    {
        public static readonly LetterPart None = new(null, false);
        public static readonly LetterPart Large = new(null, true);
    }
}
