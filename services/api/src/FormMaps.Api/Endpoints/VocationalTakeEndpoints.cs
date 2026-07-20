using System.Text.Json;
using FormMaps.Api.Security;
using FormMaps.Application.Assessments;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// External vocational take endpoints (legacy routes/vocationalTake.ts), mounted at <c>/evaluation/vocational</c>
/// — NO authenticate; the token is the credential. GET form / POST submit / POST violations. Dark behind
/// FORMMAPS_ROUTE_VOCATIONAL_TAKE_TO_DOTNET (web rewrite). The literal <c>/submit</c> ranks above <c>/{token}</c>.
/// </summary>
public static class VocationalTakeEndpoints
{
    // zod bounds (submitSchema).
    private static readonly HashSet<string> AnswerTypes = new(StringComparer.Ordinal)
    {
        "likert", "ranking", "multi_select", "single_select", "open",
    };

    public static IEndpointRouteBuilder MapVocationalTakeEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/evaluation/vocational").WithTags("VocationalTake");

        // Legacy applies sensitiveLimiter (10/hour) to /submit ONLY (vocationalTake.ts:62); GET form + violations
        // are unthrottled beyond the global limiter.
        group.MapPost("/submit", SubmitAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Sensitive);
        group.MapPost("/{token}/violations", ViolationsAsync);
        group.MapGet("/{token}", GetFormAsync);

        return app;
    }

    // GET /evaluation/vocational/{token}
    private static async Task<IResult> GetFormAsync(
        string token, IVocationalTakeService service, CancellationToken cancellationToken)
    {
        var result = await service.GetFormAsync(token, cancellationToken);
        return result.Status switch
        {
            VocationalFormStatus.Ok => Results.Ok(new
            {
                success = true,
                data = new
                {
                    group = result.Group,
                    instrumentVersion = result.InstrumentVersion,
                    evaluatorName = result.EvaluatorName,
                    studentName = result.StudentName,
                    isEvaluationCompleted = false,
                    questions = result.Questions,
                },
            }),
            VocationalFormStatus.Completed => Results.Ok(new
            {
                success = true,
                data = new { completed = true, evaluatorName = result.EvaluatorName },
            }),
            VocationalFormStatus.InvalidGroup => Results.Json(
                new { success = false, message = "No questionnaire for this group", reason = "invalid-group" },
                statusCode: StatusCodes.Status400BadRequest),
            VocationalFormStatus.Expired => Results.Json(
                new { success = false, message = "This evaluation link has expired.", reason = "expired" },
                statusCode: StatusCodes.Status410Gone),
            _ => Results.Json(
                new { success = false, message = "This evaluation link is no longer valid.", reason = "not-found" },
                statusCode: StatusCodes.Status404NotFound),
        };
    }

    // POST /evaluation/vocational/{token}/violations
    private static async Task<IResult> ViolationsAsync(
        string token, HttpContext http, IVocationalTakeService service, CancellationToken cancellationToken)
    {
        var body = await ReadBodyAsync(http, cancellationToken);
        var violations = body.ValueKind == JsonValueKind.Object && body.TryGetProperty("violations", out var v)
            ? v
            : default;

        var result = await service.SaveViolationsAsync(token, violations, cancellationToken);
        if (!result.Found)
        {
            return Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);
        }

        return Results.Ok(new { success = true, data = new { saved = result.Saved, violation_count = result.ViolationCount } });
    }

    // POST /evaluation/vocational/submit (sensitiveLimiter in Node; systemContext)
    private static async Task<IResult> SubmitAsync(
        HttpContext http, IVocationalTakeService service, CancellationToken cancellationToken)
    {
        var body = await ReadBodyAsync(http, cancellationToken);
        if (!TryParseSubmit(body, out var token, out var answers))
        {
            return Results.Json(new { success = false, message = "Invalid submission" }, statusCode: StatusCodes.Status400BadRequest);
        }

        var result = await service.SubmitAsync(token, answers, cancellationToken);
        return result.Status switch
        {
            VocationalSubmitStatus.Ok => Results.Ok(new { success = true, data = new { ok = true, count = result.Count } }),
            VocationalSubmitStatus.AlreadyCompleted => Results.Json(
                new { success = false, message = "Already completed" }, statusCode: StatusCodes.Status409Conflict),
            VocationalSubmitStatus.InvalidGroup or VocationalSubmitStatus.BadAnswer or VocationalSubmitStatus.Incomplete =>
                Results.Json(new { success = false, message = "Invalid submission" }, statusCode: StatusCodes.Status400BadRequest),
            _ => Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound),
        };
    }

    // ---- submitSchema (zod) parity: token 1..200, answers 1..80 discriminatedUnion(type). Any failure → false. ----

    private static bool TryParseSubmit(JsonElement body, out string token, out IReadOnlyList<VocationalAnswerInput> answers)
    {
        token = string.Empty;
        answers = Array.Empty<VocationalAnswerInput>();
        if (body.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        if (!body.TryGetProperty("token", out var tokenElement) || tokenElement.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        token = tokenElement.GetString() ?? string.Empty;
        if (token.Length < 1 || token.Length > 200)
        {
            return false;
        }

        if (!body.TryGetProperty("answers", out var answersElement) || answersElement.ValueKind != JsonValueKind.Array)
        {
            return false;
        }

        var length = answersElement.GetArrayLength();
        if (length is < 1 or > 80)
        {
            return false;
        }

        var parsed = new List<VocationalAnswerInput>(length);
        foreach (var a in answersElement.EnumerateArray())
        {
            if (!TryParseAnswer(a, out var answer))
            {
                return false;
            }

            parsed.Add(answer);
        }

        answers = parsed;
        return true;
    }

    private static bool TryParseAnswer(JsonElement a, out VocationalAnswerInput answer)
    {
        answer = null!;
        if (a.ValueKind != JsonValueKind.Object
            || !Int(a, "questionNumber", out var questionNumber)
            || !Str(a, "type", out var type)
            || !AnswerTypes.Contains(type))
        {
            return false;
        }

        switch (type)
        {
            case "likert":
                if (!Int(a, "ratingValue", out var rating) || rating < 1 || rating > 5)
                {
                    return false;
                }

                answer = new VocationalAnswerInput(questionNumber, type, rating, null, null, null);
                return true;

            case "ranking":
                if (!a.TryGetProperty("rankingOrder", out var order) || order.ValueKind != JsonValueKind.Array)
                {
                    return false;
                }

                var count = order.GetArrayLength();
                if (count is < 1 or > 30)
                {
                    return false;
                }

                var entries = new List<VocationalRankingEntry>(count);
                foreach (var e in order.EnumerateArray())
                {
                    if (e.ValueKind != JsonValueKind.Object
                        || !Str(e, "value", out var value) || value.Length is < 1 or > 80
                        || !Int(e, "rank", out var rank) || rank < 1)
                    {
                        return false;
                    }

                    entries.Add(new VocationalRankingEntry(value, rank));
                }

                answer = new VocationalAnswerInput(questionNumber, type, null, entries, null, null);
                return true;

            case "multi_select":
                if (!a.TryGetProperty("selectedValues", out var selected) || selected.ValueKind != JsonValueKind.Array)
                {
                    return false;
                }

                var selectedCount = selected.GetArrayLength();
                if (selectedCount is < 1 or > 20)
                {
                    return false;
                }

                var values = new List<string>(selectedCount);
                foreach (var e in selected.EnumerateArray())
                {
                    if (e.ValueKind != JsonValueKind.String)
                    {
                        return false;
                    }

                    var value = e.GetString() ?? string.Empty;
                    if (value.Length is < 1 or > 80)
                    {
                        return false;
                    }

                    values.Add(value);
                }

                answer = new VocationalAnswerInput(questionNumber, type, null, null, values, null);
                return true;

            case "single_select":
                if (!Str(a, "textValue", out var single) || single.Length is < 1 or > 120)
                {
                    return false;
                }

                answer = new VocationalAnswerInput(questionNumber, type, null, null, null, single);
                return true;

            case "open":
                if (!Str(a, "textValue", out var open) || open.Length is < 1 or > 4000)
                {
                    return false;
                }

                answer = new VocationalAnswerInput(questionNumber, type, null, null, null, open);
                return true;

            default:
                return false;
        }
    }

    private static bool Int(JsonElement obj, string name, out int value)
    {
        value = 0;
        return obj.TryGetProperty(name, out var element)
            && element.ValueKind == JsonValueKind.Number
            && element.TryGetInt32(out value);
    }

    private static bool Str(JsonElement obj, string name, out string value)
    {
        value = string.Empty;
        if (obj.TryGetProperty(name, out var element) && element.ValueKind == JsonValueKind.String)
        {
            value = element.GetString() ?? string.Empty;
            return true;
        }

        return false;
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
