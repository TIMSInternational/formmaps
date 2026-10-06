using System.Text.Json;
using System.Text.Json.Nodes;
using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;
using Microsoft.Extensions.Options;
using HttpJsonOptions = Microsoft.AspNetCore.Http.Json.JsonOptions;

namespace FormMaps.Api.Auth;

/// <summary>What a <see cref="StudentPaywallFilter"/> does to an endpoint when the caller lacks paid results.</summary>
public enum StudentPaywallMode
{
    /// <summary>Full results / reports: 402 PAID_RESULTS_REQUIRED before the handler runs.</summary>
    RequirePaidResults,

    /// <summary>Completion endpoints whose body carries scores: the handler runs, a successful body is redacted.</summary>
    RedactCompletion,
}

/// <summary>
/// Port of legacy <c>api/src/middleware/studentPaywall.ts</c>'s RESULTS gate + completion redaction
/// (tafurfede/formmaps-platform#440, TIMSInternational/formmaps#240), behind INDEPENDENT_STUDENT_PAYWALL.
///
/// Flag OFF (the default): a complete no-op — <c>next</c> is invoked and nothing is read.
/// Flag ON, in legacy order:
///   - no / invalid identity  -> pass through (the endpoint's own RequireIdentity answers 401);
///   - token role not student -> pass through (legacy checks the JWT role first);
///   - caller's user row gone -> pass through (the endpoint answers);
///   - DB error               -> 503 { success:false, message:"Service temporarily unavailable" } (fail closed);
///   - otherwise              -> <see cref="IStudentAccessReader"/> decides, and without PaidResults a results
///                               endpoint answers 402 and a completion endpoint has its body redacted.
/// Runs BEFORE the handler's own subscription guard, like the legacy global middleware.
/// </summary>
public sealed class StudentPaywallFilter(StudentPaywallMode mode) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext invocationContext, EndpointFilterDelegate next)
    {
        var services = invocationContext.HttpContext.RequestServices;
        var configuration = services.GetRequiredService<IConfiguration>();
        if (!StudentAccessRules.IsPaywallEnabled(configuration[StudentAccessRules.FlagKey]))
        {
            return await next(invocationContext);
        }

        var context = services.GetRequiredService<IRequestContextAccessor>().Current;
        if (!context.IsAuthenticated ||
            context.Actor is null ||
            string.IsNullOrWhiteSpace(context.Tenant?.UserId) ||
            context.Actor.NormalizedRole != FormMapsRoles.Student)
        {
            return await next(invocationContext);
        }

        StudentAccess? access;
        try
        {
            access = await services.GetRequiredService<IStudentAccessReader>()
                .ReadAsync(context, invocationContext.HttpContext.RequestAborted);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            services.GetRequiredService<ILogger<StudentPaywallFilter>>().LogError(ex, "Student paywall check error");
            return Results.Json(
                new { success = false, message = "Service temporarily unavailable" },
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        if (access is null || access.PaidResults)
        {
            return await next(invocationContext);
        }

        if (mode == StudentPaywallMode.RequirePaidResults)
        {
            return Results.Json(
                new
                {
                    success = false,
                    message = StudentAccessRules.PaidResultsRequiredMessage,
                    code = StudentAccessRules.PaidResultsRequiredCode,
                },
                statusCode: StatusCodes.Status402PaymentRequired);
        }

        var result = await next(invocationContext);
        return Redact(result, services);
    }

    private static object? Redact(object? result, IServiceProvider services)
    {
        // Every completion handler answers Results.Ok(...) / Results.Json(...): an IResult carrying its value.
        if (result is not IValueHttpResult { Value: { } value })
        {
            return result;
        }

        var jsonOptions = services.GetRequiredService<IOptions<HttpJsonOptions>>().Value.SerializerOptions;
        var body = JsonSerializer.SerializeToNode(value, value.GetType(), jsonOptions);
        var redacted = StudentAccessRules.RedactCompletionBody(body);
        if (redacted is null)
        {
            return result;
        }

        var statusCode = (result as IStatusCodeHttpResult)?.StatusCode ?? StatusCodes.Status200OK;
        return Results.Json(redacted, jsonOptions, statusCode: statusCode);
    }
}

public static class StudentPaywallEndpointExtensions
{
    /// <summary>Full results / reports: 402 PAID_RESULTS_REQUIRED for a student without paid results (flag ON only).</summary>
    public static TBuilder RequirePaidResults<TBuilder>(this TBuilder builder)
        where TBuilder : IEndpointConventionBuilder =>
        builder.AddEndpointFilter(new StudentPaywallFilter(StudentPaywallMode.RequirePaidResults));

    /// <summary>Completion endpoints: strip a successful scored body to "completed" for a student without paid results (flag ON only).</summary>
    public static TBuilder RedactScoresWithoutPaidResults<TBuilder>(this TBuilder builder)
        where TBuilder : IEndpointConventionBuilder =>
        builder.AddEndpointFilter(new StudentPaywallFilter(StudentPaywallMode.RedactCompletion));
}
