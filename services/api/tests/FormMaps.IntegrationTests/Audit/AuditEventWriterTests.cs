using FormMaps.Application.Audit;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Infrastructure.Audit;
using FormMaps.Infrastructure.Data;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace FormMaps.IntegrationTests.Audit;

/// <summary>
/// Task 3 of formmaps#52. Exercises <see cref="AuditEventWriter" /> on a NOSUPERUSER NOBYPASSRLS login
/// (see <see cref="AuditDatabaseFixture" />), so "persists a row" is a statement about the production
/// grant + RLS shape and not about superuser privilege.
/// </summary>
[Collection(nameof(AuditDatabaseCollection))]
public class AuditEventWriterTests(AuditDatabaseFixture fixture)
{
    /// <summary>
    /// Harness proof, and it runs first for a reason: every other assertion in this file about the
    /// bypass being load-bearing is vacuous if the login under test bypasses RLS anyway.
    /// </summary>
    [Fact]
    public async Task Harness_AppLogin_DoesNotBypassRls()
    {
        Assert.False(await fixture.AppLoginBypassesRlsAsync());
    }

    [Fact]
    public async Task WriteAsync_ValidEvent_PersistsRow()
    {
        await fixture.ResetAsync();
        var (writer, _) = MakeWriter();

        await writer.WriteAsync(new AuditEvent(
            EventType: "audit.test.written",
            ActorUserId: "user_1",
            ActorRole: "student",
            SchoolId: "school_1",
            SubjectType: "test_score",
            SubjectId: "score_1",
            Metadata: new Dictionary<string, object?> { ["score"] = 87 }));

        Assert.Equal(1, await fixture.CountRowsAsync("audit.test.written"));

        // Read every column back, not just the count. Eight of the nine bound parameters are TEXT and
        // six of them are nullable, so a count-only assertion is green for a writer that swapped
        // actorRole with schoolId, or dropped subjectId entirely.
        var row = await fixture.QuerySingleAsync("audit.test.written");
        Assert.NotNull(row);
        Assert.Equal("audit.test.written", row.EventType);
        Assert.Equal("user_1", row.ActorUserId);
        Assert.Equal("student", row.ActorRole);
        Assert.Equal("school_1", row.SchoolId);
        Assert.Equal("test_score", row.SubjectType);
        Assert.Equal("score_1", row.SubjectId);
        Assert.Equal("success", row.Outcome);
        Assert.False(string.IsNullOrWhiteSpace(row.Id));
        Assert.Contains("\"score\": 87", row.MetadataJson);
        Assert.InRange(row.OccurredAt, DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddMinutes(5));
    }

    [Fact]
    public async Task WriteAsync_DisallowedMetadataKey_DoesNotThrow_AndDoesNotPersist()
    {
        await fixture.ResetAsync();
        var (writer, logger) = MakeWriter();

        // Fail-soft: a caller that accidentally passes PII-shaped metadata must never see an
        // exception (that would make an audit-logging mistake fail a real user request) -- but
        // the row must not be written either.
        await writer.WriteAsync(new AuditEvent(
            EventType: "audit.test.pii_attempt",
            ActorUserId: "user_1", ActorRole: null, SchoolId: null,
            SubjectType: "test_score", SubjectId: "score_1",
            Metadata: new Dictionary<string, object?> { ["email"] = "leak@example.test" }));

        Assert.Equal(0, await fixture.CountRowsAsync("audit.test.pii_attempt"));

        // "Fail-soft" without "but alert" is just a silent drop. Swallowing the guard's rejection with
        // no Error-level trace would mean a call site could leak PII-shaped metadata for months and
        // the only symptom would be audit rows that quietly never appeared.
        var error = Assert.Single(logger.Entries, e => e.Level == LogLevel.Error);
        Assert.Contains("audit.write_failed", error.Message, StringComparison.Ordinal);
        Assert.Contains("audit.test.pii_attempt", error.Message, StringComparison.Ordinal);

        // ...and the alert must not itself become the leak. The offending VALUE never belongs in a log.
        Assert.DoesNotContain("leak@example.test", error.Message, StringComparison.Ordinal);
        Assert.DoesNotContain("leak@example.test", error.Exception?.ToString() ?? string.Empty, StringComparison.Ordinal);
    }

    [Fact]
    public async Task WriteAsync_NullActorUserId_PersistsRow_SystemInitiatedEvent()
    {
        await fixture.ResetAsync();
        var (writer, _) = MakeWriter();

        await writer.WriteAsync(new AuditEvent(
            EventType: "audit.test.system_initiated",
            ActorUserId: null, ActorRole: null, SchoolId: null,
            SubjectType: "vocational_result", SubjectId: "result_1"));

        Assert.Equal(1, await fixture.CountRowsAsync("audit.test.system_initiated"));

        var row = await fixture.QuerySingleAsync("audit.test.system_initiated");
        Assert.NotNull(row);

        // SQL NULL, not the strings "null"/"" -- a writer that binds a null through
        // Convert.ToString or a "" fallback still writes a row and still passes a count assertion,
        // but every "actor unknown" query downstream then silently misses these events.
        Assert.Null(row.ActorUserId);
        Assert.Null(row.ActorRole);
        Assert.Null(row.SchoolId);
        Assert.Equal("vocational_result", row.SubjectType);

        // Outcome is NOT NULL in the DDL and defaulted in the record; both halves have to line up or
        // every v1 call site (which constructs AuditEvent positionally and omits it) throws at runtime.
        Assert.Equal("success", row.Outcome);
    }

    [Fact]
    public async Task WriteAsync_NullMetadata_PersistsSqlNull_NotJsonbNull()
    {
        await fixture.ResetAsync();
        var (writer, _) = MakeWriter();

        await writer.WriteAsync(new AuditEvent(
            EventType: "audit.test.no_metadata",
            ActorUserId: "user_1", ActorRole: "student", SchoolId: "school_1",
            SubjectType: "lia_session", SubjectId: "session_1"));

        var row = await fixture.QuerySingleAsync("audit.test.no_metadata");
        Assert.NotNull(row);

        // Most events carry no metadata. Serializing null yields the four characters "null", which
        // ::jsonb happily accepts as the JSON null LITERAL -- a non-NULL column value that makes
        // "metadata IS NULL" false and "metadata IS NOT NULL" true for every metadata-less event.
        Assert.Null(row.MetadataJson);
    }

    [Fact]
    public async Task WriteAsync_NonSuccessOutcome_PersistsThatOutcome()
    {
        await fixture.ResetAsync();
        var (writer, _) = MakeWriter();

        await writer.WriteAsync(new AuditEvent(
            EventType: "audit.test.denied",
            ActorUserId: "user_1", ActorRole: "parent", SchoolId: "school_1",
            SubjectType: "student_profile", SubjectId: "student_1",
            Outcome: "denied"));

        var row = await fixture.QuerySingleAsync("audit.test.denied");
        Assert.NotNull(row);

        // Negative control on the column default: a writer that never bound "outcome" at all would
        // still produce 'success' here and pass every other test in this file.
        Assert.Equal("denied", row.Outcome);
    }

    [Fact]
    public async Task WriteAsync_TwoEvents_PersistWithDistinctIds()
    {
        await fixture.ResetAsync();
        var (writer, logger) = MakeWriter();
        var auditEvent = new AuditEvent(
            EventType: "audit.test.repeat",
            ActorUserId: "user_1", ActorRole: "student", SchoolId: "school_1",
            SubjectType: "test_score", SubjectId: "score_1");

        await writer.WriteAsync(auditEvent);
        await writer.WriteAsync(auditEvent);

        // "id" is the PRIMARY KEY and is minted by the writer, not the database. A constant or
        // event-derived id would collide on the second write -- and because the writer is fail-soft,
        // that collision would be SWALLOWED and every single-write test above would still be green.
        var ids = await fixture.QueryIdsAsync("audit.test.repeat");
        Assert.Equal(2, ids.Count);
        Assert.Equal(2, ids.Distinct(StringComparer.Ordinal).Count());
        Assert.DoesNotContain(logger.Entries, e => e.Level == LogLevel.Error);
    }

    [Fact]
    public async Task WriteAsync_DatabaseUnreachable_DoesNotThrow_AndLogsError()
    {
        // The failure the interface's "an audit outage must never fail a real user action" promise is
        // actually about. The PII test above only proves the pre-flight guard's ArgumentException is
        // caught -- a writer whose catch was `catch (ArgumentException)` would pass it and would still
        // take down a real user request the first time Aurora hiccuped.
        await using var deadDataSource = NpgsqlDataSource.Create(
            "Host=127.0.0.1;Port=1;Username=nobody;Password=nobody;Database=nowhere;Timeout=2");
        var logger = new CapturingLogger();
        var writer = new AuditEventWriter(
            new NpgsqlFormMapsDatabaseSessionFactory(deadDataSource, new RlsSessionContextApplier()),
            logger);

        await writer.WriteAsync(new AuditEvent(
            EventType: "audit.test.db_down",
            ActorUserId: "user_1", ActorRole: "student", SchoolId: "school_1",
            SubjectType: "test_score", SubjectId: "score_1"));

        var error = Assert.Single(logger.Entries, e => e.Level == LogLevel.Error);
        Assert.Contains("audit.write_failed", error.Message, StringComparison.Ordinal);
        Assert.Contains("audit.test.db_down", error.Message, StringComparison.Ordinal);
        Assert.NotNull(error.Exception);
    }

    [Fact]
    public async Task IdentitySession_CannotWriteOrReadAuditEvents()
    {
        // The negative control for AuditEventWriter's central claim ("always opens under
        // RequestContext.System(), because the policy only admits bypass-mode sessions"). Without
        // this, every green test above is equally consistent with the RLS policy doing nothing at
        // all -- which is exactly how this repo has shipped controls that could not fail.
        await fixture.ResetAsync();
        var (writer, _) = MakeWriter();
        await writer.WriteAsync(new AuditEvent(
            EventType: "audit.test.identity_probe",
            ActorUserId: "user_1", ActorRole: "student", SchoolId: "school_1",
            SubjectType: "test_score", SubjectId: "score_1"));
        Assert.Equal(1, await fixture.CountRowsAsync("audit.test.identity_probe"));

        var identity = RequestContext.Authenticated(
            new RequestActor("user_1", "student", Email: null, Name: null),
            schoolId: "school_1",
            permissions: [],
            tokenSource: TokenSource.None,
            isDevelopmentOverride: false);

        await using var session = await fixture.SessionFactory.OpenWritableAsync(identity);

        // The row the System() write just made is invisible: USING (bypass = 'on') is false here.
        await using (var select = session.Connection.CreateCommand())
        {
            select.Transaction = session.Transaction;
            select.CommandText = """SELECT count(*)::int FROM "audit_events" """;
            Assert.Equal(0, (int)(await select.ExecuteScalarAsync())!);
        }

        // ...and it cannot forge one either: WITH CHECK rejects the INSERT outright.
        await using var insert = session.Connection.CreateCommand();
        insert.Transaction = session.Transaction;
        insert.CommandText = """
            INSERT INTO "audit_events" ("id", "eventType", "subjectType")
            VALUES ('forged_1', 'audit.test.identity_forged', 'test_score')
            """;
        var ex = await Assert.ThrowsAsync<PostgresException>(() => insert.ExecuteNonQueryAsync());
        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, ex.SqlState);

        // Admin-side confirmation: nothing was written. Asserting through the identity session could
        // not distinguish "insert rejected" from "insert succeeded but is invisible to me".
        Assert.Equal(0, await fixture.CountRowsAsync("audit.test.identity_forged"));
    }

    private (AuditEventWriter Writer, CapturingLogger Logger) MakeWriter()
    {
        var logger = new CapturingLogger();
        return (new AuditEventWriter(fixture.SessionFactory, logger), logger);
    }

    /// <summary>Captures log entries (shared pattern with PcaExamWriterTests' CapturingLogger).</summary>
    private sealed class CapturingLogger : ILogger<AuditEventWriter>
    {
        public List<(LogLevel Level, string Message, Exception? Exception)> Entries { get; } = new();

        IDisposable? ILogger.BeginScope<TState>(TState state) => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Add((logLevel, formatter(state, exception), exception));
    }
}
