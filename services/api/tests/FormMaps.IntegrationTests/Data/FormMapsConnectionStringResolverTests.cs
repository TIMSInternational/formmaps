using FormMaps.Infrastructure.Data;
using Microsoft.Extensions.Configuration;
using Npgsql;

namespace FormMaps.IntegrationTests.Data;

public class FormMapsConnectionStringResolverTests
{
    [Fact]
    public void Resolve_prefers_database_options_connection_string()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:FormMaps"] = "Host=localhost;Database=from-config;Username=user;Password=pass",
                ["DATABASE_URL"] = "Host=localhost;Database=from-env;Username=user;Password=pass"
            })
            .Build();

        var resolved = FormMapsConnectionStringResolver.Resolve(
            configuration,
            new FormMapsDatabaseOptions
            {
                ConnectionString = "Host=localhost;Database=from-options;Username=user;Password=pass"
            });

        var builder = new NpgsqlConnectionStringBuilder(resolved);
        Assert.Equal("from-options", builder.Database);
    }

    [Fact]
    public void Resolve_uses_database_url_when_named_connection_strings_are_missing()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["DATABASE_URL"] = "Host=localhost;Database=from-env;Username=user;Password=pass"
            })
            .Build();

        var resolved = FormMapsConnectionStringResolver.Resolve(
            configuration,
            new FormMapsDatabaseOptions());

        var builder = new NpgsqlConnectionStringBuilder(resolved);
        Assert.Equal("from-env", builder.Database);
    }

    [Fact]
    public void Resolve_applies_pooling_defaults_for_npgsql()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["DATABASE_URL"] = "Host=localhost;Database=formmaps;Username=user;Password=pass"
            })
            .Build();

        var resolved = FormMapsConnectionStringResolver.Resolve(
            configuration,
            new FormMapsDatabaseOptions
            {
                MaxPoolSize = 17,
                TimeoutSeconds = 9
            });

        var builder = new NpgsqlConnectionStringBuilder(resolved);
        Assert.Equal(17, builder.MaxPoolSize);
        Assert.Equal(9, builder.Timeout);
    }

    [Fact]
    public void Resolve_normalizes_postgres_url_database_urls()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["DATABASE_URL"] = "postgresql://formmaps_app:p%40ssw%3Ard@db.example.test:5432/nexa?schema=school_data&connection_limit=1"
            })
            .Build();

        var resolved = FormMapsConnectionStringResolver.Resolve(
            configuration,
            new FormMapsDatabaseOptions
            {
                MaxPoolSize = 17,
                TimeoutSeconds = 9
            });

        var builder = new NpgsqlConnectionStringBuilder(resolved);
        Assert.Equal("db.example.test", builder.Host);
        Assert.Equal(5432, builder.Port);
        Assert.Equal("nexa", builder.Database);
        Assert.Equal("formmaps_app", builder.Username);
        Assert.Equal("p@ssw:rd", builder.Password);
        Assert.Equal("school_data", builder.SearchPath);
        Assert.Equal(17, builder.MaxPoolSize);
        Assert.Equal(9, builder.Timeout);
    }

    [Fact]
    public void Resolve_does_not_echo_invalid_connection_string_values()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["DATABASE_URL"] = "Host=localhost;Database=formmaps;Username=user;Password=super-secret;UnknownKey=value"
            })
            .Build();

        var exception = Assert.Throws<InvalidOperationException>(() =>
            FormMapsConnectionStringResolver.Resolve(configuration, new FormMapsDatabaseOptions()));

        Assert.Equal("Invalid FormMaps database connection string.", exception.Message);
        Assert.DoesNotContain("super-secret", exception.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public void Resolve_fails_fast_when_no_connection_string_exists()
    {
        var configuration = new ConfigurationBuilder().Build();

        var exception = Assert.Throws<InvalidOperationException>(() =>
            FormMapsConnectionStringResolver.Resolve(configuration, new FormMapsDatabaseOptions()));

        Assert.Contains("connection string is required", exception.Message, StringComparison.OrdinalIgnoreCase);
    }
}
