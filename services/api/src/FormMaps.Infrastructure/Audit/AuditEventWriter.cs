using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Audit;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using Microsoft.Extensions.Logging;

namespace FormMaps.Infrastructure.Audit;

/// <summary>
/// Writes <c>audit_events</c>. Always opens under <see cref="RequestContext.System()" />: the table's
/// RLS policy admits bypass-mode sessions ONLY (see <c>infra/aws/sql/audit-events-schema.sql</c>), so
/// an Identity-mode session cannot read or write here at all — proven, not assumed, by
/// <c>AuditEventWriterTests.IdentitySession_CannotWriteOrReadAuditEvents</c> running on a
/// NOSUPERUSER NOBYPASSRLS login.
/// </summary>
/// <remarks>
/// <para>
/// FAIL-SOFT-BUT-ALERT. Every failure — the PII guard rejecting metadata, the database being
/// unreachable, a constraint violation — is logged at Error with the <c>audit.write_failed</c> prefix
/// and swallowed. An audit outage must never fail the real user action that triggered it. The Error
/// level and stable prefix are what make this distinguishable for alerting, unlike legacy's plain
/// <c>logger.warn</c>.
/// </para>
/// <para>
/// ONE DELIBERATE EXCEPTION TO "never throws": <see cref="OperationCanceledException" /> is re-thrown.
/// Cancellation is not an audit failure — it means the caller is already unwinding — and swallowing it
/// would convert a cancelled request into a silent, permanently-missing audit row. Call sites that
/// invoke <c>WriteAsync</c> AFTER their own commit should therefore pass
/// <see cref="CancellationToken.None" />, not the request token: a client that disconnects between the
/// commit and the audit write would otherwise surface an <c>OperationCanceledException</c> from an
/// operation that had already succeeded.
/// </para>
/// <para>
/// The log line carries eventType/subjectType/subjectId and nothing else. Metadata is deliberately
/// NOT logged on failure: the most likely reason a write failed at all is that the metadata was
/// PII-shaped, and logging it there would defeat the guard it just tripped.
/// </para>
/// </remarks>
public sealed class AuditEventWriter(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    ILogger<AuditEventWriter> logger) : IAuditEventWriter
{
    public async Task WriteAsync(AuditEvent auditEvent, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(auditEvent);

        try
        {
            // Before the connection is even opened: a rejected event should cost nothing and must
            // never reach a transaction that could partially apply.
            AuditMetadataGuard.Validate(auditEvent.Metadata);

            await using var session = await databaseSessionFactory.OpenWritableAsync(
                RequestContext.System(), cancellationToken);

            await using var command = Command(session, """
                INSERT INTO "audit_events"
                    ("id", "eventType", "actorUserId", "actorRole", "schoolId", "subjectType", "subjectId", "outcome", "metadata")
                VALUES (@id, @eventType, @actorUserId, @actorRole, @schoolId, @subjectType, @subjectId, @outcome, @metadata::jsonb)
                """);
            AddParameter(command, "id", Guid.NewGuid().ToString());
            AddParameter(command, "eventType", auditEvent.EventType);
            AddParameter(command, "actorUserId", (object?)auditEvent.ActorUserId ?? DBNull.Value);
            AddParameter(command, "actorRole", (object?)auditEvent.ActorRole ?? DBNull.Value);
            AddParameter(command, "schoolId", (object?)auditEvent.SchoolId ?? DBNull.Value);
            AddParameter(command, "subjectType", auditEvent.SubjectType);
            AddParameter(command, "subjectId", (object?)auditEvent.SubjectId ?? DBNull.Value);
            AddParameter(command, "outcome", auditEvent.Outcome);
            // DBNull, not JsonSerializer.Serialize(null): the latter produces the four characters
            // "null", which ::jsonb accepts as the JSON null LITERAL. That is a non-NULL column value,
            // and it would make "metadata IS NULL" false for every metadata-less event.
            AddParameter(command, "metadata",
                auditEvent.Metadata is null ? DBNull.Value : JsonSerializer.Serialize(auditEvent.Metadata));
            await command.ExecuteNonQueryAsync(cancellationToken);

            await session.CommitAsync(cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex,
                "audit.write_failed eventType={EventType} subjectType={SubjectType} subjectId={SubjectId}",
                auditEvent.EventType, auditEvent.SubjectType, auditEvent.SubjectId);
        }
    }

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
