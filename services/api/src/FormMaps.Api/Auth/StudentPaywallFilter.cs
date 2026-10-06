using System.Text.Json;
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

/// <summary>Endpoint metadata marking a results endpoint, so <see cref="StudentPaywallMiddleware"/> classifies it as Results.</summary>
public sealed class StudentPaywallResultsMetadata
{
    public static readonly StudentPaywallResultsMetadata Instance = new();

    private StudentPaywallResultsMetadata()
    {
    }
}

/// <summary>
/// The flag + identity + DB read shared by <see cref="StudentPaywallMiddleware"/> and <see cref="StudentPaywallFilter"/>.
/// The caller's access is read at most ONCE per request and cached in <see cref="HttpContext.Items"/>.
/// </summary>
internal static class StudentPaywallAccess
{
    private const string ItemsKey = "FormMaps.StudentPaywall.Access";

    public static bool IsEnabled(HttpContext httpContext) =>
        StudentAccessRules.IsPaywallEnabled(
            httpContext.RequestServices.GetRequiredService<IConfiguration>()[StudentAccessRules.FlagKey]);

    /// <summary>
    /// Legacy order: no / invalid identity -> null (the endpoint's own guard answers); a token role that is
    /// not student -> null (untouched); otherwise the DB-read access (null when the user row is gone).
    /// DB errors propagate — callers fail closed with 503.
    /// </summary>
    public static async Task<StudentAccess?> ReadForStudentAsync(HttpContext httpContext)
    {
        if (httpContext.Items.TryGetValue(ItemsKey, out var cached))
        {
            return cached as StudentAccess;
        }

        var services = httpContext.RequestServices;
        var context = services.GetRequiredService<IRequestContextAccessor>().Current;
        StudentAccess? access = null;
        if (context.IsAuthenticated &&
            context.Actor is not null &&
            !string.IsNullOrWhiteSpace(context.Tenant?.UserId) &&
            context.Actor.NormalizedRole == FormMapsRoles.Student)
        {
            access = await services.GetRequiredService<IStudentAccessReader>()
                .ReadAsync(context, httpContext.RequestAborted);
        }

        httpContext.Items[ItemsKey] = access;
        return access;
    }

    public static IResult ServiceUnavailable() =>
        Results.Json(
            new { success = false, message = "Service temporarily unavailable" },
            statusCode: StatusCodes.Status503ServiceUnavailable);

    public static IResult PaymentRequired(PaywallDenial denial) =>
        Results.Json(
            new { success = false, message = denial.Message, code = denial.Code },
            statusCode: StatusCodes.Status402PaymentRequired);
}

/// <summary>
/// The global student paywall for .NET-served routes — port of legacy <c>studentPaywall</c> (mounted once,
/// before every router, deny-by-default), behind INDEPENDENT_STUDENT_PAYWALL. Flag OFF: a complete no-op.
///
/// WHY ONE MIDDLEWARE AND NOT PER-GROUP FILTERS: the legacy gate is deny-by-default — a route added later
/// needs the FULL platform entitlement unless it is explicitly listed. Per-group filters are opt-in, so a new
/// group that forgets the filter would silently be free; one middleware after
/// <see cref="RequestContextMiddleware"/> keeps the same fail-safe shape and lets the path tables in
/// <see cref="StudentPaywallPolicy"/> mirror the Node ones line for line. Routing has already run
/// (WebApplication adds UseRouting at the start of the pipeline), so endpoints carrying
/// <see cref="StudentPaywallResultsMetadata"/> are classified Results even when no path pattern lists them.
/// Completion redaction stays an endpoint filter: it needs the handler's typed result.
/// </summary>
public sealed class StudentPaywallMiddleware(RequestDelegate next, ILogger<StudentPaywallMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext httpContext)
    {
        if (!StudentPaywallAccess.IsEnabled(httpContext))
        {
            await next(httpContext);
            return;
        }

        var endpointIsResults = httpContext.GetEndpoint()?.Metadata.GetMetadata<StudentPaywallResultsMetadata>() is not null;
        var cls = StudentPaywallPolicy.Classify(httpContext.Request.Path.Value, endpointIsResults);
        if (cls == PaywallClass.Open)
        {
            await next(httpContext);
            return;
        }

        StudentAccess? access;
        try
        {
            access = await StudentPaywallAccess.ReadForStudentAsync(httpContext);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Student paywall check error");
            await StudentPaywallAccess.ServiceUnavailable().ExecuteAsync(httpContext);
            return;
        }

        if (access is not null && StudentPaywallPolicy.Decide(cls, access) is { } denial)
        {
            await StudentPaywallAccess.PaymentRequired(denial).ExecuteAsync(httpContext);
            return;
        }

        await next(httpContext);
    }
}

/// <summary>
/// Per-endpoint half of the paywall (TIMSInternational/formmaps#240), behind INDEPENDENT_STUDENT_PAYWALL.
/// <see cref="StudentPaywallMode.RequirePaidResults"/> re-asserts the results gate at the endpoint (defence in
/// depth: the middleware already answered 402; the access read is cached so this costs no second query).
/// <see cref="StudentPaywallMode.RedactCompletion"/> replaces a successful scored body with
/// <c>{ success: true, data: { sessionId, completed: true, resultsLocked: true } }</c> for a student without paid
/// results. Flag OFF: a complete no-op.
/// </summary>
public sealed class StudentPaywallFilter(StudentPaywallMode mode) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext invocationContext, EndpointFilterDelegate next)
    {
        var httpContext = invocationContext.HttpContext;
        if (!StudentPaywallAccess.IsEnabled(httpContext))
        {
            return await next(invocationContext);
        }

        StudentAccess? access;
        try
        {
            access = await StudentPaywallAccess.ReadForStudentAsync(httpContext);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            httpContext.RequestServices.GetRequiredService<ILogger<StudentPaywallFilter>>()
                .LogError(ex, "Student paywall check error");
            return StudentPaywallAccess.ServiceUnavailable();
        }

        if (access is null || access.PaidResults)
        {
            return await next(invocationContext);
        }

        if (mode == StudentPaywallMode.RequirePaidResults)
        {
            return StudentPaywallAccess.PaymentRequired(new PaywallDenial(
                StudentAccessRules.PaidResultsRequiredCode, StudentAccessRules.PaidResultsRequiredMessage));
        }

        var result = await next(invocationContext);
        return Redact(result, httpContext.RequestServices);
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
        where TBuilder : IEndpointConventionBuilder
    {
        builder.WithMetadata(StudentPaywallResultsMetadata.Instance);
        return builder.AddEndpointFilter(new StudentPaywallFilter(StudentPaywallMode.RequirePaidResults));
    }

    /// <summary>Completion endpoints: strip a successful scored body to "completed" for a student without paid results (flag ON only).</summary>
    public static TBuilder RedactScoresWithoutPaidResults<TBuilder>(this TBuilder builder)
        where TBuilder : IEndpointConventionBuilder =>
        builder.AddEndpointFilter(new StudentPaywallFilter(StudentPaywallMode.RedactCompletion));

    /// <summary>The global student paywall; must run AFTER <see cref="RequestContextMiddleware"/>.</summary>
    public static IApplicationBuilder UseStudentPaywall(this IApplicationBuilder app) =>
        app.UseMiddleware<StudentPaywallMiddleware>();
}
