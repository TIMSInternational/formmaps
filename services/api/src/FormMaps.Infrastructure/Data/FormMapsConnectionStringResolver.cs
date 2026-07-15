using Microsoft.Extensions.Configuration;
using Npgsql;

namespace FormMaps.Infrastructure.Data;

public static class FormMapsConnectionStringResolver
{
    public static string Resolve(IConfiguration configuration, FormMapsDatabaseOptions options)
    {
        var rawConnectionString =
            options.ConnectionString ??
            configuration.GetConnectionString("FormMaps") ??
            configuration["DATABASE_URL"];

        if (string.IsNullOrWhiteSpace(rawConnectionString))
        {
            throw new InvalidOperationException(
                "FormMaps database connection string is required. Set ConnectionStrings:FormMaps, Database:ConnectionString, or DATABASE_URL.");
        }

        return ApplyPoolingDefaults(rawConnectionString, options);
    }

    private static string ApplyPoolingDefaults(string connectionString, FormMapsDatabaseOptions options)
    {
        var builder = new NpgsqlConnectionStringBuilder(connectionString);

        if (builder.MaxPoolSize == 100)
        {
            builder.MaxPoolSize = Math.Max(1, options.MaxPoolSize);
        }

        if (builder.Timeout == 15)
        {
            builder.Timeout = Math.Max(1, options.TimeoutSeconds);
        }

        return builder.ConnectionString;
    }
}
