namespace FormMaps.Api.Security;

public static class StartupEnvironmentValidator
{
    private const int MinimumJwtSecretLength = 32;

    public static void Validate(IConfiguration configuration, IHostEnvironment environment)
    {
        if (!environment.IsProduction())
        {
            return;
        }

        var errors = new List<string>();
        var jwtSecret = configuration["JWT_SECRET"] ?? Environment.GetEnvironmentVariable("JWT_SECRET");

        if (string.IsNullOrWhiteSpace(jwtSecret))
        {
            errors.Add("JWT_SECRET is required in Production.");
        }
        else if (jwtSecret.Length < MinimumJwtSecretLength)
        {
            errors.Add($"JWT_SECRET must be at least {MinimumJwtSecretLength} characters in Production.");
        }

        var databaseUrl =
            configuration.GetConnectionString("FormMaps") ??
            configuration["Database:ConnectionString"] ??
            configuration["DATABASE_URL"];

        if (string.IsNullOrWhiteSpace(databaseUrl))
        {
            errors.Add("ConnectionStrings:FormMaps, Database:ConnectionString, or DATABASE_URL is required in Production.");
        }

        var stripeSecretKey = configuration["STRIPE_SECRET_KEY"] ?? Environment.GetEnvironmentVariable("STRIPE_SECRET_KEY");

        if (string.IsNullOrWhiteSpace(stripeSecretKey))
        {
            errors.Add("STRIPE_SECRET_KEY is required in Production.");
        }

        var stripeWebhookSecret = configuration["STRIPE_WEBHOOK_SECRET"] ?? Environment.GetEnvironmentVariable("STRIPE_WEBHOOK_SECRET");

        if (string.IsNullOrWhiteSpace(stripeWebhookSecret))
        {
            errors.Add("STRIPE_WEBHOOK_SECRET is required in Production.");
        }

        if (errors.Count > 0)
        {
            throw new InvalidOperationException(
                "Invalid FormMaps API production configuration: " + string.Join(" ", errors));
        }
    }
}
