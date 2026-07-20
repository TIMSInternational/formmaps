namespace FormMaps.Application.Email;

/// <summary>
/// Resolved email branding/config, mirroring the live TS lib/email.ts module constants. Bound once from
/// environment/IConfiguration in DI so the pure <see cref="EmailTemplates"/> stay deterministic + testable.
/// </summary>
public sealed record EmailOptions(
    string FromEmail,      // SES_FROM_EMAIL || "noreply@formmaps.com"
    string FrontendUrl,    // frontendBaseUrl(): FRONTEND_BASE_URL || "https://app.formmaps.com" (prod fallback) — reminder button
    string InviteBaseUrl,  // setup360's own base: FRONTEND_BASE_URL || "https://app.formmaps.ai" (⚠️ .ai, NOT .com; raw, no trailing-slash strip)
    string LogoUrl,        // EMAIL_LOGO_URL || the landing white wordmark
    string PostalAddress,  // COMPANY_POSTAL_ADDRESS || "FormMaps — postal address not configured"
    string AwsRegion)      // AWS_REGION || "us-east-1"
{
    public const string DefaultFromEmail = "noreply@formmaps.com";
    public const string DefaultFrontendUrl = "https://app.formmaps.com";
    public const string DefaultInviteBaseUrl = "https://app.formmaps.ai";
    public const string DefaultLogoUrl = "https://formmaps-landing.vercel.app/fm-full-white.png";
    public const string DefaultPostalAddress = "FormMaps — postal address not configured";
    public const string DefaultAwsRegion = "us-east-1";
}

/// <summary>A rendered email ready to hand to <see cref="IEmailSender"/>.</summary>
public sealed record EmailMessage(string Subject, string Html);
