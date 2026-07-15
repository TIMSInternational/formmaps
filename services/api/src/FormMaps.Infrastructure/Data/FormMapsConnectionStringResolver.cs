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
        NpgsqlConnectionStringBuilder builder;
        try
        {
            builder = new NpgsqlConnectionStringBuilder(NormalizeConnectionString(connectionString));
        }
        catch (Exception exception) when (exception is ArgumentException or FormatException)
        {
            throw new InvalidOperationException("Invalid FormMaps database connection string.");
        }

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

    private static string NormalizeConnectionString(string connectionString)
    {
        var trimmed = connectionString.Trim();

        if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri) ||
            (uri.Scheme != "postgres" && uri.Scheme != "postgresql"))
        {
            return trimmed;
        }

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/'))
        };

        if (uri.Port > 0)
        {
            builder.Port = uri.Port;
        }

        var userInfoParts = uri.UserInfo.Split(':', 2);
        if (userInfoParts.Length > 0 && !string.IsNullOrWhiteSpace(userInfoParts[0]))
        {
            builder.Username = Uri.UnescapeDataString(userInfoParts[0]);
        }

        if (userInfoParts.Length > 1)
        {
            builder.Password = Uri.UnescapeDataString(userInfoParts[1]);
        }

        foreach (var (key, value) in ParseQuery(uri.Query))
        {
            switch (key.ToLowerInvariant())
            {
                case "schema" when !string.IsNullOrWhiteSpace(value):
                    builder.SearchPath = value;
                    break;
                case "sslmode" when !string.IsNullOrWhiteSpace(value):
                    builder.SslMode = Enum.Parse<SslMode>(value, ignoreCase: true);
                    break;
            }
        }

        return builder.ConnectionString;
    }

    private static IEnumerable<(string Key, string Value)> ParseQuery(string query)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            yield break;
        }

        foreach (var pair in query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = pair.Split('=', 2);
            var key = Uri.UnescapeDataString(parts[0]);
            var value = parts.Length > 1 ? Uri.UnescapeDataString(parts[1]) : string.Empty;

            yield return (key, value);
        }
    }
}
