namespace FormMaps.Api.Auth;

public sealed class LegacyJwtOptions
{
    public const string SectionName = "LegacyJwt";

    public string Issuer { get; set; } = "formmaps-api";

    public string Audience { get; set; } = "formmaps-frontend";

    public string? SecretOverride { get; set; }

    public TimeSpan ClockSkew { get; set; } = TimeSpan.FromSeconds(30);
}
