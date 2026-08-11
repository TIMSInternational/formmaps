using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Audit;
using FormMaps.Infrastructure.Data;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="TestScoreWriter"/> — the test-scores POST/PUT/DELETE writes.
/// Pins: create defaults (isOfficial true / isSuperScore false, generated id, subScores jsonb, testDate as an
/// instant), the ownership-404 collapse on update/delete (corpus #8 IDOR — non-owner/missing/inactive all 404),
/// soft-delete idempotency (corpus #25 — 2nd delete 404, row drops from the list), PUT ownership-before-
/// validation ordering, and the no-unique-constraint duplicate allowance. Reuses the FM-037 read harness
/// (student_test_scores under a NON-UTC server), so the ISO-Z / tz-independent timestamp binding is pinned.
/// </summary>
public sealed class TestScoreWriterTests : IClassFixture<TestScoreDatabaseFixture>, IAsyncLifetime
{
    private readonly TestScoreDatabaseFixture _fixture;

    /// <summary>Restricted login (NOSUPERUSER NOBYPASSRLS) — the writer and reader under test.</summary>
    private NpgsqlDataSource _dataSource = null!;

    /// <summary>Container superuser — row-state assertions only.</summary>
    private NpgsqlDataSource _adminDataSource = null!;

    public TestScoreWriterTests(TestScoreDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        // formmaps#125: the restricted (NOSUPERUSER NOBYPASSRLS) login, so these writes run through the real
        // production policies. Every case here is self-scoped — the caller writes their own scores — which is
        // precisely what student_test_scores' policy admits, so its WITH CHECK is now under test too: a writer
        // that bound someone else's userId would be rejected by the database and not only by the assertion.
        // TRUNCATE goes through the fixture (superuser): issued on this login it would be scoped by the very
        // policies under test and would silently leave rows behind for the next test.
        _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        // audit_events is truncated alongside the scores (formmaps#52 Task 10) so the retrofit's negative
        // controls can assert on an UNFILTERED count: a create rejected by validation produces no id to
        // filter by, and "no created event anywhere" is the only form that claim can take. xUnit runs the
        // tests within a class sequentially, so a table-wide reset here is safe.
        await _fixture.TruncateAsync("student_test_scores", "audit_events");
    }

    public async Task DisposeAsync()
    {
        await _dataSource.DisposeAsync();
        await _adminDataSource.DisposeAsync();
    }

    [Fact]
    public async Task Harness_runs_as_a_restricted_login_with_the_production_policies_live()
    {
        // formmaps#125 tripwire. Without it, "the writes go through the real policies" is a claim in a comment.
        await using var conn = await _dataSource.OpenConnectionAsync();
        Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(conn), "the app login must not bypass RLS");
        Assert.Contains("student_test_scores", _fixture.AppliedPolicyTables);
    }

    [Fact]
    public async Task Create_writes_full_row_with_defaults()
    {
        var user = NewUser();
        var outcome = await Writer().CreateAsync(Ctx(user), user, Body("""{"testType":"SAT","satMath":700}"""));

        Assert.Equal(TestScoreWriteStatus.Created, outcome.Status);
        var row = outcome.Row!;
        Assert.False(string.IsNullOrWhiteSpace(row.Id));
        Assert.Equal(user, row.UserId);
        Assert.Equal("SAT", row.TestType);
        Assert.Equal(700, row.SatMath);
        Assert.True(row.IsOfficial);       // default true
        Assert.False(row.IsSuperScore);    // default false
        Assert.True(row.IsActive);
        Assert.Null(row.CreatedBy);
        Assert.Null(row.UpdatedBy);
        Assert.Null(row.TestDate);
        Assert.Equal(JsonValueKind.Null, row.SubScores.ValueKind);
        Assert.Equal(row.CreatedDate, row.UpdatedAt); // created == updated on insert
        Assert.EndsWith("Z", row.CreatedDate);        // ISO-Z

        // Persisted and readable back through the list reader.
        var listed = await Reader().ListActiveScoresAsync(Ctx(user), user, testType: null);
        Assert.Single(listed);
        Assert.Equal(row.Id, listed[0].Id);
    }

    [Fact]
    public async Task Create_persists_provided_fields_subScores_jsonb_and_testDate_instant()
    {
        var user = NewUser();
        var outcome = await Writer().CreateAsync(
            Ctx(user), user,
            Body("""{"testType":"SAT","testDate":"2025-03-01","satTotal":1400,"subScores":{"essay":7},"isSuperScore":true,"isOfficial":false}"""));

        var row = outcome.Row!;
        Assert.Equal(1400, row.SatTotal);
        Assert.True(row.IsSuperScore);
        Assert.False(row.IsOfficial);
        Assert.Equal("2025-03-01T00:00:00.000Z", row.TestDate); // parsed as a UTC instant, ISO-Z
        Assert.Equal(7, row.SubScores.GetProperty("essay").GetInt32()); // jsonb passthrough
    }

    [Fact]
    public async Task Create_allows_duplicate_rows_no_unique_constraint()
    {
        var user = NewUser();
        var a = await Writer().CreateAsync(Ctx(user), user, Body("""{"testType":"SAT","satTotal":1400}"""));
        var b = await Writer().CreateAsync(Ctx(user), user, Body("""{"testType":"SAT","satTotal":1400}"""));

        Assert.NotEqual(a.Row!.Id, b.Row!.Id);
        var listed = await Reader().ListActiveScoresAsync(Ctx(user), user, testType: null);
        Assert.Equal(2, listed.Count);
    }

    [Fact]
    public async Task Update_touches_only_present_fields_and_bumps_updatedAt()
    {
        var user = NewUser();
        var created = (await Writer().CreateAsync(Ctx(user), user, Body("""{"testType":"SAT","satMath":700,"satReading":600}"""))).Row!;

        var outcome = await Writer().UpdateAsync(Ctx(user), user, created.Id, Body("""{"satMath":800}"""));

        Assert.Equal(TestScoreWriteStatus.Ok, outcome.Status);
        var row = outcome.Row!;
        Assert.Equal(800, row.SatMath);           // updated
        Assert.Equal(600, row.SatReading);        // untouched
        Assert.Equal(created.CreatedDate, row.CreatedDate); // createdDate frozen
        // @updatedAt bumped to >= the create time (ISO-Z strings order chronologically; non-flaky within a ms).
        Assert.True(string.CompareOrdinal(row.UpdatedAt, created.UpdatedAt) >= 0);
    }

    [Fact]
    public async Task Update_of_missing_foreign_or_inactive_row_is_NotFound()
    {
        var owner = NewUser();
        var other = NewUser();
        var created = (await Writer().CreateAsync(Ctx(owner), owner, Body("""{"testType":"SAT"}"""))).Row!;

        Assert.Equal(TestScoreWriteStatus.NotFound,
            (await Writer().UpdateAsync(Ctx(owner), owner, "does-not-exist", Body("""{"satMath":700}"""))).Status);
        Assert.Equal(TestScoreWriteStatus.NotFound,
            (await Writer().UpdateAsync(Ctx(other), other, created.Id, Body("""{"satMath":700}"""))).Status);

        await Writer().DeleteAsync(Ctx(owner), owner, created.Id);
        Assert.Equal(TestScoreWriteStatus.NotFound,
            (await Writer().UpdateAsync(Ctx(owner), owner, created.Id, Body("""{"satMath":700}"""))).Status);
    }

    [Fact]
    public async Task Update_ownership_404_precedes_validation_400()
    {
        var owner = NewUser();
        var other = NewUser();
        var created = (await Writer().CreateAsync(Ctx(owner), owner, Body("""{"testType":"SAT"}"""))).Row!;

        // A foreign row with an INVALID body -> ownership wins (404), not validation (400).
        var foreign = await Writer().UpdateAsync(Ctx(other), other, created.Id, Body("""{"satMath":1}"""));
        Assert.Equal(TestScoreWriteStatus.NotFound, foreign.Status);

        // Own row with an invalid body -> validation 400, and the stored row is unchanged.
        var invalid = await Writer().UpdateAsync(Ctx(owner), owner, created.Id, Body("""{"satMath":1}"""));
        Assert.Equal(TestScoreWriteStatus.ValidationError, invalid.Status);
        var stored = await Reader().ListActiveScoresAsync(Ctx(owner), owner, testType: null);
        Assert.Null(stored[0].SatMath); // no partial write
    }

    [Fact]
    public async Task Delete_soft_deletes_is_idempotent_404_and_drops_from_list()
    {
        var user = NewUser();
        var keep = (await Writer().CreateAsync(Ctx(user), user, Body("""{"testType":"ACT"}"""))).Row!;
        var drop = (await Writer().CreateAsync(Ctx(user), user, Body("""{"testType":"SAT"}"""))).Row!;

        Assert.True(await Writer().DeleteAsync(Ctx(user), user, drop.Id));   // soft delete
        Assert.False(await Writer().DeleteAsync(Ctx(user), user, drop.Id));  // 2nd delete -> 404
        Assert.False(await Writer().DeleteAsync(Ctx(user), NewUser(), keep.Id)); // foreign -> 404

        var listed = await Reader().ListActiveScoresAsync(Ctx(user), user, testType: null);
        Assert.Single(listed);
        Assert.Equal(keep.Id, listed[0].Id); // deleted row removed from the active list

        // The row still exists, just inactive.
        Assert.False(await IsActiveAsync(drop.Id));
    }

    [Fact]
    public async Task Create_empty_testDate_stores_null_not_500()
    {
        var user = NewUser();
        var outcome = await Writer().CreateAsync(Ctx(user), user, Body("""{"testType":"SAT","testDate":""}"""));

        Assert.Equal(TestScoreWriteStatus.Created, outcome.Status);
        Assert.Null(outcome.Row!.TestDate); // empty string -> null (legacy falsy), not a 500
    }

    [Fact]
    public async Task Whitespace_only_testDate_throws_matching_legacy_truthiness()
    {
        // Legacy: `"   "` is TRUTHY in JS -> new Date("   ") -> Invalid Date -> write error (500). Only the
        // empty string "" is falsy -> null. Faithful to `d.testDate ? new Date(d.testDate) : null`.
        var user = NewUser();
        await Assert.ThrowsAsync<FormatException>(() =>
            Writer().CreateAsync(Ctx(user), user, Body("""{"testType":"SAT","testDate":"   "}""")));
    }

    [Fact]
    public async Task Update_empty_testDate_clears_a_prior_date_to_null()
    {
        var user = NewUser();
        var created = (await Writer().CreateAsync(
            Ctx(user), user, Body("""{"testType":"SAT","testDate":"2025-03-01"}"""))).Row!;
        Assert.Equal("2025-03-01T00:00:00.000Z", created.TestDate);

        var outcome = await Writer().UpdateAsync(Ctx(user), user, created.Id, Body("""{"testDate":""}"""));

        Assert.Equal(TestScoreWriteStatus.Ok, outcome.Status);
        Assert.Null(outcome.Row!.TestDate); // present empty string clears the column to null
    }

    [Fact]
    public async Task Non_object_body_is_a_validation_error_on_create()
    {
        var user = NewUser();
        var outcome = await Writer().CreateAsync(Ctx(user), user, Body("[]"));

        Assert.Equal(TestScoreWriteStatus.ValidationError, outcome.Status);
        Assert.Equal("Expected object, received array", outcome.Message);
    }

    [Fact]
    public async Task Non_object_body_on_update_is_400_after_ownership_and_writes_nothing()
    {
        var user = NewUser();
        var created = (await Writer().CreateAsync(Ctx(user), user, Body("""{"testType":"SAT"}"""))).Row!;

        var outcome = await Writer().UpdateAsync(Ctx(user), user, created.Id, Body("[]"));

        Assert.Equal(TestScoreWriteStatus.ValidationError, outcome.Status);
        Assert.Equal("Expected object, received array", outcome.Message);

        // No write happened: updatedAt is byte-unchanged from the create.
        var stored = await Reader().ListActiveScoresAsync(Ctx(user), user, testType: null);
        Assert.Equal(created.UpdatedAt, stored[0].UpdatedAt);
    }

    [Fact]
    public async Task Non_object_body_on_a_foreign_row_is_404_not_400()
    {
        // Ownership precedes the body-shape 400, same as field validation.
        var owner = NewUser();
        var other = NewUser();
        var created = (await Writer().CreateAsync(Ctx(owner), owner, Body("""{"testType":"SAT"}"""))).Row!;

        var outcome = await Writer().UpdateAsync(Ctx(other), other, created.Id, Body("[]"));

        Assert.Equal(TestScoreWriteStatus.NotFound, outcome.Status);
    }

    // ------------------------------------------------------- audit-events retrofit (formmaps#52 Task 10)

    /// <summary>
    /// Until now "audit event" here meant one structured log line, which no compliance surface can query
    /// and which a log-retention window eventually deletes. A create must ALSO persist a row in
    /// <c>audit_events</c> — and this asserts the whole row, not a count, because eight of the nine
    /// written columns are TEXT and six are nullable, so a count stays green for a writer that swapped
    /// actorUserId with subjectId.
    /// </summary>
    [Fact]
    public async Task Create_persists_a_pii_free_row_to_audit_events()
    {
        var user = NewUser();
        var created = (await Writer().CreateAsync(Ctx(user), user, Body("""{"testType":"SAT","satMath":700}"""))).Row!;

        var row = await _fixture.QuerySingleAuditEventAsync("audit.assessment.testscore.created", created.Id);
        Assert.Equal("audit.assessment.testscore.created", row.EventType);
        Assert.Equal(user, row.ActorUserId);
        Assert.Equal("test_score", row.SubjectType);
        Assert.Equal(created.Id, row.SubjectId); // the GENERATED row id, not anything the caller supplied
        Assert.Equal("success", row.Outcome);
        Assert.False(string.IsNullOrWhiteSpace(row.Id));

        // Metadata is SQL NULL, not the JSON null literal: nothing beyond the two ids is logged at this
        // site today, and the writer binds DBNull rather than the four characters "null" precisely so
        // that `metadata IS NULL` stays true for a metadata-less event.
        Assert.Null(row.MetadataJson);

        AssertPiiFree(row, user);
    }

    /// <summary>
    /// The update half. Same argument as <see cref="Create_persists_a_pii_free_row_to_audit_events" />:
    /// the whole row is asserted, and the subject is the score's own id.
    /// </summary>
    [Fact]
    public async Task Update_persists_a_pii_free_row_to_audit_events()
    {
        var user = NewUser();
        var created = (await Writer().CreateAsync(Ctx(user), user, Body("""{"testType":"SAT","satMath":700}"""))).Row!;

        Assert.Equal(TestScoreWriteStatus.Ok,
            (await Writer().UpdateAsync(Ctx(user), user, created.Id, Body("""{"satMath":800}"""))).Status);

        var row = await _fixture.QuerySingleAuditEventAsync("audit.assessment.testscore.updated", created.Id);
        Assert.Equal("audit.assessment.testscore.updated", row.EventType);
        Assert.Equal(user, row.ActorUserId);
        Assert.Equal("test_score", row.SubjectType);
        Assert.Equal(created.Id, row.SubjectId);
        Assert.Equal("success", row.Outcome);
        Assert.Null(row.MetadataJson);
        AssertPiiFree(row, user);
    }

    /// <summary>
    /// The delete half. The score is only SOFT-deleted, so the audit row and its subject coexist — but
    /// the event type must still be <c>.deleted</c>, since that is what the user performed and what the
    /// existing log line already claims.
    /// </summary>
    [Fact]
    public async Task Delete_persists_a_pii_free_row_to_audit_events()
    {
        var user = NewUser();
        var created = (await Writer().CreateAsync(Ctx(user), user, Body("""{"testType":"SAT"}"""))).Row!;

        Assert.True(await Writer().DeleteAsync(Ctx(user), user, created.Id));

        var row = await _fixture.QuerySingleAuditEventAsync("audit.assessment.testscore.deleted", created.Id);
        Assert.Equal("audit.assessment.testscore.deleted", row.EventType);
        Assert.Equal(user, row.ActorUserId);
        Assert.Equal("test_score", row.SubjectType);
        Assert.Equal(created.Id, row.SubjectId);
        Assert.Equal("success", row.Outcome);
        Assert.Null(row.MetadataJson);
        AssertPiiFree(row, user);
    }

    /// <summary>
    /// Negative control: a body rejected by validation never reaches the INSERT, so it must persist no
    /// audit row. The count is unfiltered on purpose — a rejected create has no id to filter by, and
    /// "no created event anywhere" is the actual claim. Without this, a writer that audited before the
    /// validation gate would still satisfy the happy path above while reporting writes that never
    /// happened.
    /// </summary>
    [Fact]
    public async Task Create_rejected_by_validation_persists_no_audit_event()
    {
        var user = NewUser();
        var outcome = await Writer().CreateAsync(Ctx(user), user, Body("[]"));

        Assert.Equal(TestScoreWriteStatus.ValidationError, outcome.Status);
        Assert.Equal(0, await _fixture.CountAuditEventsAsync("audit.assessment.testscore.created"));
    }

    /// <summary>
    /// Negative control for the ownership-404 collapse (corpus #8 IDOR). A foreign update/delete changes
    /// nothing, and an invalid body on one's OWN row changes nothing either — so neither may leave an
    /// audit row. This one is load-bearing beyond bookkeeping: an event written before the ownership
    /// gate would record a stranger as having modified a score they cannot even see, and would make the
    /// audit table itself an existence oracle for rows the 404 exists to hide.
    /// </summary>
    [Fact]
    public async Task Update_and_delete_that_are_rejected_persist_no_audit_event()
    {
        var owner = NewUser();
        var other = NewUser();
        var created = (await Writer().CreateAsync(Ctx(owner), owner, Body("""{"testType":"SAT"}"""))).Row!;

        Assert.Equal(TestScoreWriteStatus.NotFound,
            (await Writer().UpdateAsync(Ctx(other), other, created.Id, Body("""{"satMath":700}"""))).Status);
        Assert.False(await Writer().DeleteAsync(Ctx(other), other, created.Id));

        // Own row, invalid body -> 400 after the ownership gate, still no write and still no event.
        Assert.Equal(TestScoreWriteStatus.ValidationError,
            (await Writer().UpdateAsync(Ctx(owner), owner, created.Id, Body("""{"satMath":1}"""))).Status);

        Assert.Equal(0, await _fixture.CountAuditEventsAsync("audit.assessment.testscore.updated"));
        Assert.Equal(0, await _fixture.CountAuditEventsAsync("audit.assessment.testscore.deleted"));
    }

    /// <summary>
    /// Idempotency, at the audit layer: the second delete is a 404 that touches nothing, so it must not
    /// append a second row. A double row here would misreport one deletion as two to every compliance
    /// surface reading this table.
    /// </summary>
    [Fact]
    public async Task Delete_twice_persists_exactly_one_audit_event()
    {
        var user = NewUser();
        var created = (await Writer().CreateAsync(Ctx(user), user, Body("""{"testType":"SAT"}"""))).Row!;

        Assert.True(await Writer().DeleteAsync(Ctx(user), user, created.Id));
        Assert.False(await Writer().DeleteAsync(Ctx(user), user, created.Id));

        Assert.Equal(1, await _fixture.CountAuditEventsAsync("audit.assessment.testscore.deleted", created.Id));
    }

    // ---------------------------------------------------------------- helpers

    private TestScoreWriter Writer()
    {
        var factory = new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());
        // The REAL AuditEventWriter (formmaps#52 Task 10), never a fake: the thing under test is that a
        // create/update/delete lands a row in audit_events, and a substituted writer would make that
        // assertion about the substitute. It shares the restricted app login, so the retrofit is proven
        // to work under the same NOSUPERUSER NOBYPASSRLS role production's .NET service runs as.
        return new TestScoreWriter(
            factory,
            new AuditEventWriter(factory, NullLogger<AuditEventWriter>.Instance),
            NullLogger<TestScoreWriter>.Instance);
    }

    private TestScoreReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    /// <summary>
    /// The whole point of the PII-free claim: <see cref="Ctx" /> puts a display name and an email on
    /// every actor these writes run under, so if the writer ever reached for the RequestContext's actor
    /// instead of the bare user id, the persisted row would carry it. Every written column is checked,
    /// not just metadata — the leak would be just as permanent in actorRole or schoolId.
    /// </summary>
    private static void AssertPiiFree(TestScoreDatabaseFixture.AuditEventRow row, string userId)
    {
        var persisted = string.Join(
            '|',
            row.Id, row.EventType, row.ActorUserId, row.ActorRole, row.SchoolId,
            row.SubjectType, row.SubjectId, row.Outcome, row.MetadataJson);

        Assert.DoesNotContain($"{userId}@e.st", persisted);
        Assert.DoesNotContain("Test User", persisted);
    }

    private static JsonElement Body(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private static string NewUser() => "u-" + Guid.NewGuid().ToString("N");

    private static RequestContext Ctx(string userId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "student", $"{userId}@e.st", "Test User"),
            schoolId: null, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    /// <summary>
    /// Reads the TRUE row state as the superuser. It cannot go through the app login: that connection carries no
    /// GUCs outside a session the factory opened, so student_test_scores' policy hides every row and this would
    /// return null — an assertion that cannot see a row it is asserting about proves nothing about the write.
    /// </summary>
    private async Task<bool> IsActiveAsync(string id)
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""SELECT "isActive" FROM "student_test_scores" WHERE "id" = @id""", conn);
        cmd.Parameters.AddWithValue("id", id);
        return (bool)(await cmd.ExecuteScalarAsync())!;
    }
}
