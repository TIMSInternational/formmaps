using FormMaps.Application.Auth;
using FormMaps.Application.Email;
using FormMaps.Application.Reports;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// report.ts send-report-email (Phase F) — routes/report.ts:71. POST /api/v1/reports/send-report-email/:userId:
/// IUserAccessGuard cross-user check, fetch {id,email,name}, send the canned "report ready" email via the
/// existing IEmailSender/EmailTemplates rail. Dark behind FORMMAPS_ROUTE_SEND_REPORT_EMAIL_TO_DOTNET. No PDF, no
/// attachment — legacy never generates one for this route.
/// </summary>
public static class ReportEmailEndpoints
{
    public static IEndpointRouteBuilder MapReportEmailEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGroup("/api/v1/reports").WithTags("ReportEmail")
            .MapPost("/send-report-email/{userId}", SendReportEmailAsync);
        return app;
    }

    private static async Task<IResult> SendReportEmailAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IUserAccessGuard userAccessGuard,
        IReportEmailRecipientReader recipientReader, EmailTemplates templates, IEmailSender emailSender,
        string userId, CancellationToken ct)
    {
        var context = accessor.Current;
        var identity = guard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Results.Json(
                new { success = false, code = identity.Code, message = identity.Message },
                statusCode: identity.StatusCode);
        }

        if (!await userAccessGuard.CanAccessUserAsync(context, userId, ct))
        {
            return NotFound("Not found");
        }

        var recipient = await recipientReader.FindAsync(context, userId, ct);
        if (recipient is null)
        {
            return NotFound("User not found");
        }

        var message = templates.BuildReportEmail(recipient.Name);
        var emailSent = await emailSender.SendAsync(recipient.Email, message.Subject, message.Html, ct);

        return Results.Ok(new { success = true, data = new { emailSent, recipient = recipient.Email } });
    }

    private static IResult NotFound(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status404NotFound);
}
