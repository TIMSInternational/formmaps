using Amazon.SimpleEmailV2;
using Amazon.SimpleEmailV2.Model;
using FormMaps.Application.Email;
using Microsoft.Extensions.Logging;

namespace FormMaps.Infrastructure.Email;

/// <summary>
/// SES v2 implementation of <see cref="IEmailSender"/> — the FIRST outbound integration in the .NET service.
/// Faithful port of lib/email.ts <c>sendEmail</c>: SendEmail with Content.Simple, never throws (false + logged on
/// any exception, matching the TS try/catch→false so a mailer outage can't fail the calling write). Never logs PII.
/// ⚠️ Cutover prereq (Federico): the prod App Runner role needs ses:SendEmail + a verified SES sender identity —
/// ships DARK behind a flag, so this is a cutover dependency, not a build blocker.
/// </summary>
public sealed class SesEmailSender(
    IAmazonSimpleEmailServiceV2 client,
    EmailOptions options,
    ILogger<SesEmailSender> logger) : IEmailSender
{
    public async Task<bool> SendAsync(string to, string subject, string html, CancellationToken cancellationToken = default)
    {
        try
        {
            await client.SendEmailAsync(
                new SendEmailRequest
                {
                    FromEmailAddress = options.FromEmail,
                    Destination = new Destination { ToAddresses = [to] },
                    Content = new EmailContent
                    {
                        Simple = new Message
                        {
                            Subject = new Content { Data = subject },
                            Body = new Body { Html = new Content { Data = html } },
                        },
                    },
                },
                cancellationToken);
            return true;
        }
        catch (Exception ex)
        {
            // Match legacy: log + return false, never throw. No recipient/PII in the log.
            logger.LogError(ex, "audit.email.send_failed subject={Subject}", subject);
            return false;
        }
    }
}
