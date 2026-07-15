namespace FormMaps.Infrastructure.Data;

public sealed record RlsSessionStatement(
    string CommandText,
    IReadOnlyDictionary<string, object?> Parameters);
