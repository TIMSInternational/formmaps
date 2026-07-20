using System.Text.Json;
using FormMaps.Api.Security;
using FormMaps.Application.Assessments;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// External 360 evaluation endpoints (legacy routes/evaluation.ts systemContext routes), mounted at
/// <c>/evaluation</c> — NO authenticate; the invitation token is the credential. validate-token (read),
/// submit-feedback (write), 360evolutor (read). Dark behind FORMMAPS_ROUTE_EVAL_EXTERNAL_TO_DOTNET (web
/// rewrite). The authed CRUD on /evaluation stays in Node (out of scope).
/// </summary>
public static class EvaluationExternalEndpoints
{
    public static IEndpointRouteBuilder MapEvaluationExternalEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/evaluation").WithTags("EvaluationExternal");

        group.MapGet("/validate-token", ValidateTokenAsync);
        // Legacy applies sensitiveLimiter (10/hour) to submit-feedback ONLY (evaluation.ts:143); the other two
        // external routes are unthrottled beyond the global limiter.
        group.MapPost("/submit-feedback", SubmitFeedbackAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Sensitive);
        group.MapGet("/360evolutor/{token}", Get360EvaluatorFormAsync);

        return app;
    }

    // GET /evaluation/validate-token?token=
    private static async Task<IResult> ValidateTokenAsync(
        HttpContext http, IEvaluationExternalService service, CancellationToken cancellationToken)
    {
        var token = http.Request.Query["token"].Count > 0 ? http.Request.Query["token"][0] ?? string.Empty : string.Empty;
        if (string.IsNullOrEmpty(token))
        {
            return Results.Json(new { success = false, message = "Token required" }, statusCode: StatusCodes.Status400BadRequest);
        }

        var result = await service.ValidateTokenAsync(token, cancellationToken);
        object data = result.Valid
            ? new
            {
                valid = true,
                evaluatorName = result.EvaluatorName,
                evaluatorEmail = result.EvaluatorEmail,
                relation = result.Relation,
                groupType = result.GroupType,
                instrument = result.Instrument,
            }
            : new { valid = false, reason = result.Reason };

        return Results.Ok(new { success = true, data });
    }

    // POST /evaluation/submit-feedback (sensitiveLimiter in Node; systemContext)
    private static async Task<IResult> SubmitFeedbackAsync(
        HttpContext http, IEvaluationExternalService service, CancellationToken cancellationToken)
    {
        var body = await ReadBodyAsync(http, cancellationToken);
        if (!TryParseFeedback(body, out var input, out var validationMessage))
        {
            return Results.Json(new { success = false, message = validationMessage }, statusCode: StatusCodes.Status400BadRequest);
        }

        var result = await service.SubmitFeedbackAsync(input, cancellationToken);
        return result.Status switch
        {
            FeedbackSubmitStatus.Ok => Results.Ok(new { success = true, message = "Feedback submitted", data = result.Feedback }),
            FeedbackSubmitStatus.AlreadySubmitted => Results.Json(
                new { success = false, message = "This evaluation has already been submitted" },
                statusCode: StatusCodes.Status409Conflict),
            // Every other service error → 400 with the raw legacy message (client-facing).
            _ => Results.Json(new { success = false, message = FeedbackErrorMessage(result.Status) }, statusCode: StatusCodes.Status400BadRequest),
        };
    }

    // GET /evaluation/360evolutor/{token}
    private static async Task<IResult> Get360EvaluatorFormAsync(
        string token, IEvaluationExternalService service, CancellationToken cancellationToken)
    {
        var form = await service.Get360EvaluatorFormAsync(token, cancellationToken);
        if (form is null)
        {
            return Results.Json(new { success = false, message = "Group not found" }, statusCode: StatusCodes.Status404NotFound);
        }

        object data = form.Completed
            ? new
            {
                evolutorGroupId = form.EvolutorGroupId,
                invitationToken = form.InvitationToken,
                evaluatorName = form.EvaluatorName,
                isEvaluationCompleted = true,
                completed = true,
                questions = Array.Empty<object>(),
            }
            : new
            {
                evolutorGroupId = form.EvolutorGroupId,
                evaluatedUserEmail = form.EvaluatedUserEmail,
                evaluatedUserName = form.EvaluatedUserName,
                evaluatorName = form.EvaluatorName,
                evaluatorEmail = form.EvaluatorEmail,
                relation = form.Relation,
                invitationToken = form.InvitationToken,
                isEvaluationCompleted = false,
                questions = (form.Questions ?? Array.Empty<Evaluator360Question>()).Select(q => new
                {
                    id = q.Id,
                    questionNumber = q.QuestionNumber,
                    questionText = q.QuestionText,
                    questionTextEs = q.QuestionTextEs,
                    category = q.Category,
                }),
            };

        return Results.Ok(new { success = true, data });
    }

    private static string FeedbackErrorMessage(FeedbackSubmitStatus status) => status switch
    {
        FeedbackSubmitStatus.InvalidTokenOrGroup => "Invalid token or group",
        FeedbackSubmitStatus.VocationalInstrument => "This evaluation uses the vocational instrument",
        FeedbackSubmitStatus.EmailMismatch => "Email mismatch",
        FeedbackSubmitStatus.TokenExpiredOrUsed => "Token expired or already used",
        _ => "Invalid request",
    };

    // ---- feedbackSchema (zod) parity: evaluationGroupId/token non-empty strings, valid email, answers[≥1] ----

    private static bool TryParseFeedback(JsonElement body, out FeedbackSubmitInput input, out string error)
    {
        input = null!;
        error = string.Empty;
        if (body.ValueKind != JsonValueKind.Object)
        {
            error = "Invalid request body";
            return false;
        }

        if (!NonEmptyString(body, "evaluationGroupId", out var groupId))
        {
            error = "evaluationGroupId is required";
            return false;
        }

        if (!NonEmptyString(body, "token", out var token))
        {
            error = "token is required";
            return false;
        }

        // zod z.string().email() on the RAW email (pre-normalization). A "mailto:<X>" value must 400 here, not
        // slip through to normalizeEmail and match the stored address.
        if (!NonEmptyString(body, "evaluatorEmail", out var email) || !ExternalEmailNormalization.IsValidZodEmail(email))
        {
            error = "Invalid email";
            return false;
        }

        if (!body.TryGetProperty("answers", out var answersElement)
            || answersElement.ValueKind != JsonValueKind.Array
            || answersElement.GetArrayLength() < 1)
        {
            error = "answers must contain at least 1 entry";
            return false;
        }

        var answers = new List<FeedbackAnswer>();
        foreach (var a in answersElement.EnumerateArray())
        {
            if (a.ValueKind != JsonValueKind.Object
                || !TryGetInt(a, "questionNumber", out var questionNumber)
                || !TryGetString(a, "questionText", out var questionText)
                || !TryGetInt(a, "rating", out var rating) || rating < 1 || rating > 5)
            {
                error = "Invalid answer";
                return false;
            }

            var questionId = OptionalBoundedString(a, "questionId", 100, out var qidOk);
            var category = OptionalBoundedString(a, "category", 100, out var catOk);
            // comment is z.string().optional() — absent is fine, but a PRESENT non-string (number/null/bool) is a
            // zod error → 400 (matches feedbackSchema).
            var comment = OptionalBoundedString(a, "comment", int.MaxValue, out var commentOk);
            if (!qidOk || !catOk || !commentOk)
            {
                error = "Invalid answer";
                return false;
            }

            answers.Add(new FeedbackAnswer(questionNumber, questionText, rating, comment, questionId, category));
        }

        input = new FeedbackSubmitInput(groupId, token, email, answers);
        return true;
    }

    private static bool NonEmptyString(JsonElement obj, string name, out string value)
    {
        value = string.Empty;
        if (obj.TryGetProperty(name, out var element) && element.ValueKind == JsonValueKind.String)
        {
            value = element.GetString() ?? string.Empty;
            return value.Length >= 1;
        }

        return false;
    }

    private static bool TryGetString(JsonElement obj, string name, out string value)
    {
        value = string.Empty;
        if (obj.TryGetProperty(name, out var element) && element.ValueKind == JsonValueKind.String)
        {
            value = element.GetString() ?? string.Empty;
            return true;
        }

        return false;
    }

    private static bool TryGetInt(JsonElement obj, string name, out int value)
    {
        value = 0;
        return obj.TryGetProperty(name, out var element)
            && element.ValueKind == JsonValueKind.Number
            && element.TryGetInt32(out value);
    }

    // Optional string: absent → (null, ok). Present-and-string within bound → (value, ok). Present-wrong → (null, !ok).
    private static string? OptionalBoundedString(JsonElement obj, string name, int max, out bool ok)
    {
        ok = true;
        if (!obj.TryGetProperty(name, out var element))
        {
            return null;
        }

        if (element.ValueKind != JsonValueKind.String)
        {
            ok = false;
            return null;
        }

        var value = element.GetString() ?? string.Empty;
        if (value.Length > max)
        {
            ok = false;
            return null;
        }

        return value;
    }

    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    private static async Task<JsonElement> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        try
        {
            var element = await http.Request.ReadFromJsonAsync<JsonElement>(cancellationToken);
            return element.ValueKind == JsonValueKind.Undefined ? EmptyObject : element;
        }
        catch (JsonException)
        {
            return EmptyObject;
        }
        catch (BadHttpRequestException)
        {
            return EmptyObject;
        }
        catch (InvalidOperationException)
        {
            return EmptyObject;
        }
    }
}
