namespace FormMaps.Infrastructure.Data;

public sealed class FormMapsDatabaseOptions
{
    public const string SectionName = "Database";

    public string? ConnectionString { get; set; }

    public int MaxPoolSize { get; set; } = 10;

    public int TimeoutSeconds { get; set; } = 20;
}
