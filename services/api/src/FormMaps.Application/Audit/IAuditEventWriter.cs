namespace FormMaps.Application.Audit;

/// <summary>
/// A single audit event to persist. IDs/enums/counts only -- see <see cref="AuditMetadataGuard" />.
/// EventType values should reuse the existing "audit.&lt;domain&gt;.&lt;action&gt;" strings already used
/// by LiaSessionWriter/PersonalitySessionWriter/TestScoreWriter/VocationalWriter/PcaExamWriter/
/// Question360Writer/EvaluationExternalService's log-only calls when retrofitting.
/// </summary>
/// <remarks>
/// There is deliberately no UpdatedAt/ModifiedBy: the audit_events table is immutable by construction
/// (REVOKE + ENABLE ALWAYS trigger, see infra/aws/sql/audit-events-schema.sql), so a "last modified"
/// concept would be a category error. <see cref="Outcome" /> is 'success' | 'failure' | 'denied'.
/// </remarks>
public sealed record AuditEvent(
    string EventType,
    string? ActorUserId,
    string? ActorRole,
    string? SchoolId,
    string SubjectType,
    string? SubjectId,
    string Outcome = "success",
    IReadOnlyDictionary<string, object?>? Metadata = null);

public interface IAuditEventWriter
{
    /// <summary>
    /// Persists an audit event. Write failures are logged at Error level (prefix
    /// "audit.write_failed") and swallowed: an audit outage must never fail a real user action
    /// (matches legacy's fail-soft semantics), but unlike legacy's plain logger.warn, this is
    /// distinguishable for future alerting. See the spec's "Failure semantics".
    /// </summary>
    /// <remarks>
    /// "Fail-soft" has exactly two documented exceptions, and they are named here rather than left
    /// for a caller to discover in production:
    /// <list type="bullet">
    /// <item><see cref="OperationCanceledException" /> propagates. Cancellation is not an audit
    /// failure -- the caller is already unwinding. Consequence for the retrofit call sites (plan
    /// Tasks 8-14), which fire AFTER their own commit: pass <see cref="CancellationToken.None" />,
    /// not the request token, or a client disconnecting in the gap between commit and audit write
    /// raises from an operation that already succeeded.</item>
    /// <item>A null <paramref name="auditEvent" /> throws <see cref="ArgumentNullException" />. That
    /// is a call-site programming error the nullable annotations already forbid, not a runtime
    /// condition to absorb.</item>
    /// </list>
    /// </remarks>
    Task WriteAsync(AuditEvent auditEvent, CancellationToken cancellationToken = default);
}

/// <summary>
/// Denylist guard for <see cref="AuditEvent.Metadata" /> keys -- defense-in-depth against accidentally
/// logging PII into an immutable, indefinitely-retained table.
/// </summary>
/// <remarks>
/// Deliberately NOT exhaustive, and it is worth being precise about what it does not do rather than
/// letting a future reader assume it is airtight:
/// <list type="bullet">
/// <item>It inspects keys only. PII smuggled into an allowed key's VALUE (<c>["note"] = "call bob at
/// bob@x.com"</c>) passes untouched.</item>
/// <item>It is substring-based, so it over-matches as readily as it under-matches
/// (<c>"nameSpace"</c> is rejected). That trade is intentional: a false positive is a build-time
/// annoyance, a false negative is permanent PII in an append-only table.</item>
/// </list>
/// The primary control is that every v1 call site only has IDs/enums/counts available to log in the
/// first place; this guard exists to fail loudly if that ever changes.
/// </remarks>
public static class AuditMetadataGuard
{
    /// <summary>
    /// Lowercase substrings; a key is rejected if it CONTAINS any of them. Kept non-redundant on
    /// purpose -- "address" already covers ipAddress/ip_address/homeAddress/emailAddress, so listing
    /// those separately would be dead entries that overstate the list's real coverage. If "address"
    /// is ever narrowed, the ip-address cases in AuditMetadataGuardTests go red.
    /// </summary>
    private static readonly string[] DisallowedKeyFragments =
        ["email", "name", "phone", "address", "ssn", "dob", "birthdate"];

    /// <summary>
    /// Throws <see cref="ArgumentException" /> if any key looks PII-shaped. Null/empty metadata is
    /// valid (most events carry none).
    /// </summary>
    public static void Validate(IReadOnlyDictionary<string, object?>? metadata)
    {
        if (metadata is null)
        {
            return;
        }

        foreach (var key in metadata.Keys)
        {
            var normalized = key.ToLowerInvariant();
            foreach (var fragment in DisallowedKeyFragments)
            {
                if (normalized.Contains(fragment, StringComparison.Ordinal))
                {
                    // The key is named so the failure is actionable; the VALUE never is, since that
                    // is the thing most likely to be the PII we are refusing to persist.
                    throw new ArgumentException(
                        $"AuditEvent.Metadata key '{key}' looks like it may contain PII (matched '{fragment}') -- audit_events is PII-free by design.",
                        nameof(metadata));
                }
            }
        }
    }
}
