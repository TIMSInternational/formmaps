namespace FormMaps.Application.IsamsReads;

/// <summary>
/// getIsamsStatus result (schoolService.ts:391 — <c>prisma.isamsConfig.findUnique({ where:{ schoolId } })</c>).
/// Present ONLY when a config row exists (the reader returns <c>null</c> otherwise). Carries the raw scalar
/// columns the endpoint needs to derive the status envelope — the endpoint owns the JS-truthy derivations
/// (<c>enabled</c> = <c>!!config.endpoint</c>; <c>connected</c> = <c>!!(config.isActive &amp;&amp;
/// config.endpoint &amp;&amp; config.credentialsEncrypted)</c>, formmaps#145 — the field the UI gates on) and
/// always emits the lastSyncAt key.
/// </summary>
/// <param name="Endpoint">The endpoint column (nullable). JS <c>!!config.endpoint</c> ⇒ enabled = non-empty string.</param>
/// <param name="LastSyncAt">The lastSyncAt column as ISO-Z, or <c>null</c> when the column is NULL.</param>
/// <param name="IsActive">The isActive column (NOT NULL, default true). First conjunct of <c>connected</c>.</param>
/// <param name="CredentialsEncrypted">The credentialsEncrypted column (nullable), raw — "" and NULL are distinct
/// (both JS-falsy). Feeds ONLY the <c>connected</c> truthiness; the endpoint never serializes the value.</param>
public sealed record IsamsConfigStatus(string? Endpoint, string? LastSyncAt, bool IsActive, string? CredentialsEncrypted);

/// <summary>
/// One getIsamsSyncJobs row (schoolService.ts:475 — <c>prisma.isamsSyncJob.findMany</c>). A verbatim passthrough
/// of every IsamsSyncJob scalar column in the legacy JSON field order (camelCase). <see cref="Status"/> is the
/// native <c>SyncJobStatus</c> enum value as its string label ("pending"/"running"/"completed"/"failed"/
/// "cancelled"). <see cref="StartedAt"/>/<see cref="FinishedAt"/> are nullable ISO-Z; <see cref="CreatedDate"/>/
/// <see cref="UpdatedAt"/> are non-null ISO-Z. <see cref="Details"/> is string | null.
/// </summary>
public sealed record IsamsSyncJobRow(
    string Id,
    string SchoolId,
    string InitiatedBy,
    string Status,
    string? Details,
    string? StartedAt,
    string? FinishedAt,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);
