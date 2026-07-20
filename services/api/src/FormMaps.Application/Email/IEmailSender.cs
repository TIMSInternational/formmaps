namespace FormMaps.Application.Email;

/// <summary>
/// Outbound transactional email. Port of the live TS <c>sendEmail(to, subject, html)</c> (lib/email.ts):
/// returns <c>true</c> on delivery, <c>false</c> on any failure — NEVER throws (matches the TS try/catch→false),
/// so a mailer outage can't fail the calling write. The first outbound integration in the .NET service.
/// </summary>
public interface IEmailSender
{
    Task<bool> SendAsync(string to, string subject, string html, CancellationToken cancellationToken = default);
}
