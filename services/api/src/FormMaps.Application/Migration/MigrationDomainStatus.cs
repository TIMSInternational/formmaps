namespace FormMaps.Application.Migration;

public sealed record MigrationDomainStatus(
    string Domain,
    string CurrentOwner,
    string TargetOwner,
    string FirstMove,
    string Risk,
    string Status);
