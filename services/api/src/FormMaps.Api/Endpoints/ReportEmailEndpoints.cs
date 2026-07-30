using FormMaps.Application.Auth;
using FormMaps.Application.Email;
using FormMaps.Application.Reports;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// report.ts send-report-email (Phase F) — routes/report.ts:71. POST /api/v1/reports/send-report-email/:userId:
/// IUserAccessGuard cross-user check, fetch {id,email,name}, send the canned "report ready" email via the
/// existing IEmailSender/EmailTemplates rail. Dark behind FORMMAPS_ROUTE_SEND_REPORT_EMAIL_TO_DOTNET. No PDF, no
/// attachment — legacy never generates one for this route.
/// Byte-for-byte port EXCEPT the 404 message: both the access-denied and missing-recipient branches
/// return the identical "Not found" body here (see <see cref="NotFound"/>), a deliberate deviation from
/// whatever distinct per-branch text legacy may emit — collapsing to one message closes an IDOR-style
/// existence oracle, matching ReportEndpoints.cs's established uniform-404 convention (commit 075505f).
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
            return NotFound();
        }

        var recipient = await recipientReader.FindAsync(context, userId, ct);
        if (recipient is null)
        {
            return NotFound();
        }

        var message = templates.BuildReportEmail(recipient.Name);
        var emailSent = await emailSender.SendAsync(recipient.Email, message.Subject, message.Html, ct);

        return Results.Ok(new { success = true, data = new { emailSent, recipient = recipient.Email } });
    }

    // IDOR defense: denial reveals nothing about existence — always 404 "Not found", never a
    // distinct message per branch (matches ReportEndpoints.cs's uniform-404 convention).
    private static IResult NotFound() =>
        Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);
}
