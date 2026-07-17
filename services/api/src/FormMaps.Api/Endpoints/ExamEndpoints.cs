using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// PCA exam-engine read endpoints (legacy examRouter, mounted /api/pcaexam). Guard order mirrors
/// the legacy middleware chain: authenticate (RequireIdentity) -> requireSubscription -> handler
/// (canAccessUser ownership). Denials are the uniform IDOR-safe 404.
/// </summary>
public static class ExamEndpoints
{
    public static IEndpointRouteBuilder MapExamEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/pcaexam")
            .WithTags("PcaExam");

        group.MapGet("/session/{sessionId}", GetSessionAsync);
        group.MapGet("/completed-exams/{userId}", GetCompletedExamsAsync);
        group.MapGet("/exams", GetExamsAsync);
        group.MapGet("/exams/{examId}", GetExamWithQuestionsAsync);
        group.MapGet("/exams/{examId}/instructions", GetInstructionsAsync);
        group.MapGet("/exam-config/{examId}", GetExamConfigAsync);
        group.MapGet("/statistics/{examId}", GetStatisticsAsync);
        group.MapGet("/history/{userId}", GetHistoryAsync);
        group.MapGet("/all-results", GetAllResultsAsync);
        group.MapPost("/exams/{examId}/start", StartExamAsync);
        group.MapPost("/submit", SubmitExamAsync);

        return app;
    }

    // POST /api/pcaexam/exams/{examId}/start (legacy startExamSession) — self-scoped create.
    private static async Task<IResult> StartExamAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IPcaExamWriter writer,
        string examId,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;

        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var subscription = await subscriptionGuard.RequireSubscriptionAsync(context, cancellationToken);
        if (!subscription.Allowed)
        {
            return Deny(subscription);
        }

        var outcome = await writer.StartExamAsync(context, examId, context.Tenant!.UserId, cancellationToken);
        return outcome.Status switch
        {
            PcaExamWriteStatus.Ok => Results.Ok(new { success = true, data = outcome.Payload }),
            PcaExamWriteStatus.AlreadyCompleted => Error(StatusCodes.Status409Conflict, "Exam already completed"),
            _ => ExamNotFound(),
        };
    }

    // POST /api/pcaexam/submit (legacy submitExam) — ownership is at the route via canAccessUser (a
    // privileged role CAN submit a scoped session), unlike the self-scoped LIA/personality writes.
    private static async Task<IResult> SubmitExamAsync(
        HttpContext http,
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IUserAccessGuard userAccessGuard,
        IExamSessionReader sessionReader,
        IPcaExamWriter writer,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;

        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var subscription = await subscriptionGuard.RequireSubscriptionAsync(context, cancellationToken);
        if (!subscription.Allowed)
        {
            return Deny(subscription);
        }

        var body = await ReadJsonObjectAsync(http, cancellationToken);
        var sessionId = ReadString(body, "sessionId") ?? string.Empty;
        var timeTaken = ReadTimeTaken(body);
        var answers = ReadAnswers(body);

        // Ownership (legacy examRouter): getSession -> 404 "Session not found"; canAccessUser -> 404 "Not found".
        var session = await sessionReader.GetSessionAsync(context, sessionId, cancellationToken);
        if (session is null)
        {
            return Error(StatusCodes.Status404NotFound, "Session not found");
        }

        if (!await userAccessGuard.CanAccessUserAsync(context, session.UserId, cancellationToken))
        {
            return NotFound();
        }

        // NOTE: legacy fires checkAssessmentCompletion -> generateInsightsBackground (Bedrock) after
        // responding; that fire-and-forget insight trigger stays polyglot / out of the .NET write path.
        var outcome = await writer.SubmitExamAsync(context, sessionId, answers, timeTaken, cancellationToken);
        return outcome.Status switch
        {
            PcaExamWriteStatus.Ok => Results.Ok(new { success = true, data = outcome.Result }),
            PcaExamWriteStatus.AlreadyCompleted => Error(StatusCodes.Status409Conflict, "Exam already completed"),
            PcaExamWriteStatus.ExamNotFound => Error(StatusCodes.Status404NotFound, "Exam not found"),
            _ => Error(StatusCodes.Status404NotFound, "Session not found"),
        };
    }

    private static IResult Error(int statusCode, string message) =>
        Results.Json(new { success = false, message }, statusCode: statusCode);

    // Lenient JSON body read — matches legacy `req.body?.x` optional-chaining (absent/invalid -> empty).
    private static async Task<JsonElement> ReadJsonObjectAsync(HttpContext http, CancellationToken cancellationToken)
    {
        try
        {
            var element = await http.Request.ReadFromJsonAsync<JsonElement>(cancellationToken);
            return element.ValueKind == JsonValueKind.Object ? element : default;
        }
        catch (JsonException)
        {
            return default;
        }
        catch (BadHttpRequestException)
        {
            return default;
        }
    }

    private static string? ReadString(JsonElement body, string name) =>
        body.ValueKind == JsonValueKind.Object
        && body.TryGetProperty(name, out var value)
        && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    // Legacy `timeTaken || 0`: a JSON number is truncated to Int; anything else (absent, string, null) -> 0.
    private static int ReadTimeTaken(JsonElement body)
    {
        if (body.ValueKind == JsonValueKind.Object
            && body.TryGetProperty("timeTaken", out var value)
            && value.ValueKind == JsonValueKind.Number)
        {
            return value.TryGetInt32(out var n) ? n : (int)value.GetDouble();
        }

        return 0;
    }

    // Parse the `answers` array (legacy submitExam iterates `answers || []`): each element coalesces to
    // { questionNumber, userAnswer = String(answer ?? selectedAnswer ?? ""), timeSpent }.
    private static IReadOnlyList<SubmitAnswer> ReadAnswers(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object
            || !body.TryGetProperty("answers", out var arr)
            || arr.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var result = new List<SubmitAnswer>();
        foreach (var element in arr.EnumerateArray())
        {
            if (element.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var questionNumber = ReadQuestionNumber(element);
            var userAnswer = ExamScoring.CoalesceUserAnswer(ReadAnswerValue(element, "answer"), ReadAnswerValue(element, "selectedAnswer"));
            var timeSpent = element.TryGetProperty("timeSpent", out var ts) ? ExamScoring.ParseTimeSpent(ts) : 0;
            result.Add(new SubmitAnswer(questionNumber, userAnswer, timeSpent));
        }

        return result;
    }

    // questionNumber is a strict `===` match against the Int question set — a JSON number is used; a
    // non-number never matches a question (isCorrect=false), matching legacy strict equality.
    private static int ReadQuestionNumber(JsonElement element) =>
        element.TryGetProperty("questionNumber", out var value)
        && value.ValueKind == JsonValueKind.Number
        && value.TryGetInt32(out var n)
            ? n
            : 0;

    // String(x): a JSON string passes through; a JSON number stringifies by VALUE (not raw token) so
    // String(3.0) === "3" matches an Int answer key of 3; other kinds -> null so the `??` chain continues.
    private static string? ReadAnswerValue(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Number => JsNumberToString(value),
            _ => null,
        };
    }

    // Legacy String(number): stringifies the numeric VALUE, not the raw token — String(3.0) === "3",
    // String(1e2) === "100". Emit the integer form when integral, else the shortest round-trip double.
    private static string JsNumberToString(JsonElement value) =>
        value.TryGetInt64(out var l)
            ? l.ToString(CultureInfo.InvariantCulture)
            : value.GetDouble().ToString(CultureInfo.InvariantCulture);

    private static async Task<IResult> GetHistoryAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IUserAccessGuard userAccessGuard,
        IExamHistoryReader reader,
        string userId,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;

        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var subscription = await subscriptionGuard.RequireSubscriptionAsync(context, cancellationToken);
        if (!subscription.Allowed)
        {
            return Deny(subscription);
        }

        if (!await userAccessGuard.CanAccessUserAsync(context, userId, cancellationToken))
        {
            return NotFound();
        }

        var data = await reader.ReadAsync(context, userId, cancellationToken);
        return Results.Ok(new { success = true, data });
    }

    private static async Task<IResult> GetAllResultsAsync(
        HttpContext http,
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IAllResultsReader reader,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;

        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var subscription = await subscriptionGuard.RequireSubscriptionAsync(context, cancellationToken);
        if (!subscription.Allowed)
        {
            return Deny(subscription);
        }

        // ADMIN_ROLES gate (Super Admin / school_admin, raw exact match) BEFORE any DB lookup.
        if (!PcaAdminGate.IsAdmin(context))
        {
            return Results.Json(
                new { success = false, message = "Admin access required" },
                statusCode: StatusCodes.Status403Forbidden);
        }

        var pageQuery = http.Request.Query["page"];
        var limitQuery = http.Request.Query["limit"];
        var pagination = PcaExamPagination.Resolve(
            pageQuery.Count > 0 ? pageQuery[0] : null,
            limitQuery.Count > 0 ? limitQuery[0] : null);

        var page = await reader.ReadAsync(context, pagination.Skip, pagination.Limit, cancellationToken);
        var totalPages = (int)Math.Ceiling((double)page.Total / pagination.Limit);

        return Results.Ok(new
        {
            success = true,
            data = new AllResults(page.Rows, page.Total, pagination.Page, pagination.Limit, totalPages),
        });
    }

    private static async Task<IResult> GetStatisticsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IExamStatisticsReader reader,
        string examId,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;

        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var subscription = await subscriptionGuard.RequireSubscriptionAsync(context, cancellationToken);
        if (!subscription.Allowed)
        {
            return Deny(subscription);
        }

        // ADMIN_ROLES gate (Super Admin / school_admin, raw exact match) BEFORE any DB lookup.
        if (!PcaAdminGate.IsAdmin(context))
        {
            return Results.Json(
                new { success = false, message = "Admin access required" },
                statusCode: StatusCodes.Status403Forbidden);
        }

        var rows = await reader.ReadScoresAsync(context, examId, cancellationToken);
        return Results.Ok(new { success = true, data = ExamStatistics.Compute(examId, rows) });
    }

    private static async Task<IResult> GetInstructionsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IExamConfigReader reader,
        string examId,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;

        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var subscription = await subscriptionGuard.RequireSubscriptionAsync(context, cancellationToken);
        if (!subscription.Allowed)
        {
            return Deny(subscription);
        }

        var instructions = await reader.GetInstructionsAsync(context, examId, cancellationToken);
        if (instructions is null)
        {
            return ExamNotFound();
        }

        return Results.Ok(new { success = true, data = instructions });
    }

    private static async Task<IResult> GetExamConfigAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IExamConfigReader reader,
        string examId,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;

        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var subscription = await subscriptionGuard.RequireSubscriptionAsync(context, cancellationToken);
        if (!subscription.Allowed)
        {
            return Deny(subscription);
        }

        var config = await reader.GetConfigAsync(context, examId, cancellationToken);
        if (config is null)
        {
            return ExamNotFound();
        }

        return Results.Ok(new { success = true, data = config });
    }

    // Global catalog: exam existence is not sensitive (listable via /exams), so match the legacy
    // message rather than the ownership-uniform 404.
    private static IResult ExamNotFound()
    {
        return Results.Json(
            new { success = false, message = "Exam not found" },
            statusCode: StatusCodes.Status404NotFound);
    }

    private static async Task<IResult> GetExamsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IExamCatalogReader reader,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;

        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var subscription = await subscriptionGuard.RequireSubscriptionAsync(context, cancellationToken);
        if (!subscription.Allowed)
        {
            return Deny(subscription);
        }

        var exams = await reader.ListExamsAsync(context, cancellationToken);
        return Results.Ok(new { success = true, data = exams });
    }

    private static async Task<IResult> GetExamWithQuestionsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IExamCatalogReader reader,
        string examId,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;

        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var subscription = await subscriptionGuard.RequireSubscriptionAsync(context, cancellationToken);
        if (!subscription.Allowed)
        {
            return Deny(subscription);
        }

        var exam = await reader.GetExamWithQuestionsAsync(context, examId, cancellationToken);
        if (exam is null)
        {
            // Global catalog: exam existence is not sensitive (listable via /exams), so match the
            // legacy message rather than the ownership-uniform 404.
            return Results.Json(
                new { success = false, message = "Exam not found" },
                statusCode: StatusCodes.Status404NotFound);
        }

        return Results.Ok(new { success = true, data = exam });
    }

    private static async Task<IResult> GetSessionAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IUserAccessGuard userAccessGuard,
        IExamSessionReader reader,
        string sessionId,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;

        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var subscription = await subscriptionGuard.RequireSubscriptionAsync(context, cancellationToken);
        if (!subscription.Allowed)
        {
            return Deny(subscription);
        }

        var session = await reader.GetSessionAsync(context, sessionId, cancellationToken);
        if (session is null)
        {
            return NotFound();
        }

        if (!await userAccessGuard.CanAccessUserAsync(context, session.UserId, cancellationToken))
        {
            return NotFound();
        }

        return Results.Ok(new { success = true, data = session });
    }

    private static async Task<IResult> GetCompletedExamsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IUserAccessGuard userAccessGuard,
        IExamSessionReader reader,
        string userId,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;

        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var subscription = await subscriptionGuard.RequireSubscriptionAsync(context, cancellationToken);
        if (!subscription.Allowed)
        {
            return Deny(subscription);
        }

        if (!await userAccessGuard.CanAccessUserAsync(context, userId, cancellationToken))
        {
            return NotFound();
        }

        var data = await reader.GetCompletedExamsAsync(context, userId, cancellationToken);

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                sessions = data.Sessions,
                uniqueCompleted = data.UniqueCompleted,
                count = data.Count
            }
        });
    }

    private static IResult Deny(GuardDecision decision)
    {
        return Results.Json(
            new
            {
                success = false,
                code = decision.Code,
                message = decision.Message
            },
            statusCode: decision.StatusCode);
    }

    // IDOR defense: denial reveals nothing about existence — always 404 "Not found", never 403.
    private static IResult NotFound()
    {
        return Results.Json(
            new
            {
                success = false,
                message = "Not found"
            },
            statusCode: StatusCodes.Status404NotFound);
    }
}
