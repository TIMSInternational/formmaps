using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace FormMaps.Api.Security;

public static class ApiSecurityExtensions
{
    public const string CorsPolicyName = "FormMapsCors";

    private static readonly string[] BuiltInProductionOrigins =
    [
        "https://app.formmaps.ai",
        "https://formmaps.ai",
        "https://app.formmaps.com",
        "https://formmaps.com",
        "https://www.formmaps.com"
    ];

    public static WebApplicationBuilder AddFormMapsApiSecurity(this WebApplicationBuilder builder)
    {
        StartupEnvironmentValidator.Validate(builder.Configuration, builder.Environment);

        var apiSecurityOptions = LoadOptions(builder.Configuration);

        builder.Services.Configure<ApiSecurityOptions>(
            builder.Configuration.GetSection(ApiSecurityOptions.SectionName));

        builder.WebHost.ConfigureKestrel(options =>
        {
            options.Limits.MaxRequestBodySize = apiSecurityOptions.JsonBodyLimitBytes;
        });

        builder.Services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.ForwardLimit = 1;
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
        });

        builder.Services.AddCors();
        builder.Services.AddOptions<CorsOptions>()
            .Configure<IOptions<ApiSecurityOptions>, IConfiguration, IHostEnvironment>(
                (options, configuredSecurityOptions, configuration, environment) =>
                {
                    var allowedOrigins = ResolveAllowedOrigins(
                        configuration,
                        environment,
                        configuredSecurityOptions.Value);

                    options.AddPolicy(CorsPolicyName, policy =>
                    {
                        policy
                            .WithOrigins(allowedOrigins)
                            .AllowAnyHeader()
                            .AllowAnyMethod()
                            .AllowCredentials()
                            .SetPreflightMaxAge(TimeSpan.FromDays(1));
                    });
                });

        builder.Services.AddRateLimiter();
        builder.Services.AddOptions<RateLimiterOptions>()
            .Configure<IOptions<ApiSecurityOptions>>((options, configuredSecurityOptions) =>
                ConfigureRateLimiter(options, configuredSecurityOptions.Value));

        return builder;
    }

    public static WebApplication UseFormMapsApiSecurity(this WebApplication app)
    {
        app.UseForwardedHeaders();

        if (!app.Environment.IsDevelopment())
        {
            app.UseExceptionHandler(errorApp =>
            {
                errorApp.Run(async context =>
                {
                    context.Response.StatusCode = StatusCodes.Status500InternalServerError;
                    await context.Response.WriteAsJsonAsync(new
                    {
                        success = false,
                        message = "Internal server error"
                    });
                });
            });
        }

        app.UseMiddleware<SecurityHeadersMiddleware>();
        app.UseCors(CorsPolicyName);
        app.UseMiddleware<RedactedRequestLoggingMiddleware>();
        app.UseMiddleware<MutationContentTypeMiddleware>();
        app.UseMiddleware<RequestBodySizeLimitMiddleware>();
        app.UseRateLimiter();
        app.UseMiddleware<RequestTimeoutMiddleware>();
        app.UseMiddleware<JsonBodySanitizationMiddleware>();

        return app;
    }

    private static ApiSecurityOptions LoadOptions(IConfiguration configuration)
    {
        return configuration.GetSection(ApiSecurityOptions.SectionName).Get<ApiSecurityOptions>() ?? new ApiSecurityOptions();
    }

    private static string[] ResolveAllowedOrigins(
        IConfiguration configuration,
        IHostEnvironment environment,
        ApiSecurityOptions options)
    {
        var origins = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var origin in BuiltInProductionOrigins)
        {
            origins.Add(origin);
        }

        foreach (var origin in options.AllowedOrigins)
        {
            AddOrigin(origins, origin);
        }

        foreach (var origin in ReadCommaSeparated(configuration["CORS_ORIGINS"]))
        {
            AddOrigin(origins, origin);
        }

        foreach (var origin in ReadCommaSeparated(configuration["CORS_ALLOWED_ORIGINS"]))
        {
            AddOrigin(origins, origin);
        }

        if (environment.IsDevelopment())
        {
            origins.Add("http://localhost:3000");
        }

        return origins.Order(StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private static IEnumerable<string> ReadCommaSeparated(string? value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? []
            : value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    private static void AddOrigin(HashSet<string> origins, string? origin)
    {
        if (!string.IsNullOrWhiteSpace(origin))
        {
            origins.Add(origin.Trim().TrimEnd('/'));
        }
    }

    private static void ConfigureRateLimiter(
        RateLimiterOptions options,
        ApiSecurityOptions apiSecurityOptions)
    {
        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
        options.OnRejected = async (context, cancellationToken) =>
        {
            context.HttpContext.Response.ContentType = "application/json";
            await context.HttpContext.Response.WriteAsJsonAsync(
                new { success = false, message = RejectionMessageFor(context.HttpContext) },
                cancellationToken);
        };

        options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(
            httpContext => BuildFixedWindowPartition(
                BuildRequestLimitKey(httpContext),
                apiSecurityOptions.RateLimits.General));

        options.AddPolicy(FormMapsRateLimitPolicies.Auth, httpContext =>
            BuildFixedWindowPartition(BuildIpLimitKey(httpContext), apiSecurityOptions.RateLimits.Auth));

        options.AddPolicy(FormMapsRateLimitPolicies.Sensitive, httpContext =>
            BuildFixedWindowPartition(BuildRequestLimitKey(httpContext), apiSecurityOptions.RateLimits.Sensitive));

        options.AddPolicy(FormMapsRateLimitPolicies.Ai, httpContext =>
            BuildFixedWindowPartition(BuildRequestLimitKey(httpContext), apiSecurityOptions.RateLimits.Ai));

        // formmaps#63. Same per-caller partition as Sensitive (legacy keys moderationLimiter on
        // `req.userId || req.ip`, which BuildRequestLimitKey already mirrors) but legacy's own 30/hour.
        options.AddPolicy(FormMapsRateLimitPolicies.Moderation, httpContext =>
            BuildFixedWindowPartition(BuildRequestLimitKey(httpContext), apiSecurityOptions.RateLimits.Moderation));
    }

    /// <summary>
    /// The 429 body. One global <c>OnRejected</c> serves every policy here, so the per-policy message legacy
    /// sends has to be selected from the endpoint's own metadata rather than from a policy-level handler:
    /// ASP.NET invokes a policy's <c>OnRejected</c> IN ADDITION to the global one, which would append a
    /// second JSON document to the response body.
    ///
    /// <para>Only moderation is special-cased, and only because formmaps#63 is a port whose brief is to
    /// reproduce the limiter's response. The other three policies keep the message they already send — they
    /// are NOT re-derived here; changing them would be a behaviour change in lanes this one does not own,
    /// which is the divergence this port is deliberately not making.</para>
    ///
    /// <para>KNOWN EDGE: if the GLOBAL limiter (3000 per 15 min) is what rejected a moderation request, this
    /// still returns moderation's message. Distinguishing them is not exposed by the middleware, and a
    /// caller who trips 3000/15min has long since tripped 30/hour on these three routes.</para>
    /// </summary>
    private static string RejectionMessageFor(HttpContext httpContext)
    {
        var policyName = httpContext.GetEndpoint()?.Metadata
            .GetMetadata<Microsoft.AspNetCore.RateLimiting.EnableRateLimitingAttribute>()?.PolicyName;

        // rateLimiter.ts:31 — `message: { success: false, message: "Too many attempts. Try again later." }`.
        return policyName == FormMapsRateLimitPolicies.Moderation
            ? "Too many attempts. Try again later."
            : "Too many requests, please try again later";
    }

    private static RateLimitPartition<string> BuildFixedWindowPartition(
        string partitionKey,
        FixedWindowRateLimitOptions options)
    {
        return RateLimitPartition.GetFixedWindowLimiter(partitionKey, _ => new FixedWindowRateLimiterOptions
        {
            AutoReplenishment = true,
            PermitLimit = Math.Max(1, options.PermitLimit),
            QueueLimit = 0,
            Window = TimeSpan.FromSeconds(Math.Max(1, options.WindowSeconds))
        });
    }

    private static string BuildRequestLimitKey(HttpContext httpContext)
    {
        var token = ExtractAccessToken(httpContext.Request);
        if (!string.IsNullOrWhiteSpace(token))
        {
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)))
                .ToLowerInvariant();
            return $"auth:{hash[..32]}";
        }

        return BuildIpLimitKey(httpContext);
    }

    private static string BuildIpLimitKey(HttpContext httpContext)
    {
        var remoteIp = httpContext.Connection.RemoteIpAddress ?? IPAddress.None;
        return $"ip:{remoteIp}";
    }

    private static string? ExtractAccessToken(HttpRequest request)
    {
        if (request.Cookies.TryGetValue("access_token", out var cookieToken) &&
            !string.IsNullOrWhiteSpace(cookieToken))
        {
            return cookieToken;
        }

        var authorization = request.Headers.Authorization.ToString();
        if (authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return authorization["Bearer ".Length..].Trim();
        }

        return null;
    }
}
