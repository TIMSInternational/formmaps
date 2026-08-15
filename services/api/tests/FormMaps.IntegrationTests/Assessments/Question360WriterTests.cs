using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Audit;
using FormMaps.Infrastructure.Data;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="Question360Writer"/> — the question360 catalog writes
/// (POST / PUT /:id / activate / deactivate / DELETE /:id / bulk-create). Pins: create defaults + createdBy/
/// updatedBy NULL (never populated), partial-update + isActive-exclusion, activate/deactivate, the DELETE child-
/// guard + soft-delete + missing→Missing (legacy P2025→500), and bulk-create's independent-insert partial-failure
/// report incl. duplicate-without-unique → both created, 23505 → "Duplicate question", other error → "Failed to
/// create question". Reuses the FM-038 read harness (questions_360 under a NON-UTC server).
/// </summary>
public sealed class Question360WriterTests : IClassFixture<Question360DatabaseFixture>, IAsyncLifetime
{
    private readonly Question360DatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public Question360WriterTests(Question360DatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        // audit_events is truncated alongside questions_360 — the one retrofit fixture in this plan that
        // needs to be. Sibling retrofits narrow every audit assertion by a freshly-generated per-test id, but
        // audit.question360.bulk_created deliberately has NO subject (a batch has no single one), so several
        // tests here would otherwise be counting each other's bulk rows. This is test isolation only; the
        // table's real append-only/immutability guarantees are proven against the production DDL in
        // FormMaps.IntegrationTests/Audit (plan Tasks 1/4), not weakened by a TRUNCATE in this fixture.
        await using var cmd = new NpgsqlCommand("""TRUNCATE "questions_360", "audit_events" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Create_writes_full_row_with_defaults_and_null_audit_columns()
    {
        var outcome = await Writer().CreateAsync(Ctx(), Body(
            """{"questionEnglishText":"How?","questionSpanishText":"¿Cómo?","category":"collab","relationType":"peer","questionNumber":3}"""));

        Assert.Equal(Question360WriteStatus.Created, outcome.Status);
        var row = outcome.Row!;
        Assert.False(string.IsNullOrWhiteSpace(row.Id));
        Assert.Equal("How?", row.QuestionEnglishText);
        Assert.Equal("¿Cómo?", row.QuestionSpanishText);
        Assert.Equal(3, row.QuestionNumber);
        Assert.False(row.IsSubQuestion);          // default
        Assert.Null(row.ParentQuestionId);         // default null
        Assert.True(row.IsActive);                 // DB default
        Assert.Null(row.CreatedBy);                // never populated
        Assert.Null(row.UpdatedBy);
        Assert.Equal(row.CreatedDate, row.UpdatedAt); // created == updated on insert
        Assert.EndsWith("Z", row.CreatedDate);

        var listed = await Reader().ListAsync(Ctx(), relationType: null);
        Assert.Single(listed);
        Assert.Equal(row.Id, listed[0].Id);
    }

    [Fact]
    public async Task Update_writes_only_present_fields_and_ignores_isActive()
    {
        var created = (await Writer().CreateAsync(Ctx(), Body(Valid(number: 1, category: "old")))).Row!;

        // isActive is silently dropped by the update schema (mass-assignment guard) — only category changes.
        var outcome = await Writer().UpdateAsync(Ctx(), created.Id, Body("""{"category":"new","isActive":false}"""));

        Assert.Equal(Question360WriteStatus.Ok, outcome.Status);
        Assert.Equal("new", outcome.Row!.Category);
        Assert.Equal("How?", outcome.Row.QuestionEnglishText); // untouched
        Assert.True(outcome.Row.IsActive);                     // isActive NOT flipped by PUT
        Assert.NotEqual(created.UpdatedAt, outcome.Row.UpdatedAt); // @updatedAt bumped
    }

    [Fact]
    public async Task Update_missing_id_is_Missing()
    {
        var outcome = await Writer().UpdateAsync(Ctx(), "nope", Body("""{"category":"x"}"""));
        Assert.Equal(Question360WriteStatus.Missing, outcome.Status);
    }

    [Fact]
    public async Task Activate_and_deactivate_flip_isActive()
    {
        var created = (await Writer().CreateAsync(Ctx(), Body(Valid(1)))).Row!;

        var deactivated = await Writer().SetActiveAsync(Ctx(), created.Id, isActive: false);
        Assert.Equal(Question360WriteStatus.Ok, deactivated.Status);
        Assert.False(deactivated.Row!.IsActive);

        var activated = await Writer().SetActiveAsync(Ctx(), created.Id, isActive: true);
        Assert.True(activated.Row!.IsActive);
    }

    [Fact]
    public async Task SetActive_missing_id_is_Missing()
    {
        var outcome = await Writer().SetActiveAsync(Ctx(), "nope", isActive: true);
        Assert.Equal(Question360WriteStatus.Missing, outcome.Status);
    }

    [Fact]
    public async Task Delete_soft_deletes_and_is_idempotent_success()
    {
        var created = (await Writer().CreateAsync(Ctx(), Body(Valid(1)))).Row!;

        Assert.Equal(Question360DeleteStatus.Deleted, await Writer().DeleteAsync(Ctx(), created.Id));
        Assert.False(await IsActiveAsync(created.Id)); // soft-deleted, row retained

        // No isActive precheck on delete → a 2nd delete still finds the row and succeeds (legacy parity).
        Assert.Equal(Question360DeleteStatus.Deleted, await Writer().DeleteAsync(Ctx(), created.Id));
    }

    [Fact]
    public async Task Delete_missing_id_is_Missing()
    {
        Assert.Equal(Question360DeleteStatus.Missing, await Writer().DeleteAsync(Ctx(), "nope"));
    }

    [Fact]
    public async Task Delete_is_blocked_by_an_active_sub_question_only()
    {
        var parent = (await Writer().CreateAsync(Ctx(), Body(Valid(1)))).Row!;
        var child = (await Writer().CreateAsync(Ctx(), Body(
            $$"""{"questionEnglishText":"e","questionSpanishText":"s","category":"c","relationType":"r","questionNumber":2,"isSubQuestion":true,"parentQuestionId":"{{parent.Id}}"}"""))).Row!;

        Assert.Equal(Question360DeleteStatus.ChildGuard, await Writer().DeleteAsync(Ctx(), parent.Id));

        // Deactivate the child → the guard (isActive sub-questions only) no longer trips.
        await Writer().SetActiveAsync(Ctx(), child.Id, isActive: false);
        Assert.Equal(Question360DeleteStatus.Deleted, await Writer().DeleteAsync(Ctx(), parent.Id));
    }

    [Fact]
    public async Task BulkCreate_reports_created_and_per_item_errors()
    {
        var result = await Writer().BulkCreateAsync(Ctx(), Body($$"""
            [
              {{Valid(1)}},
              {"questionEnglishText":"e","questionSpanishText":"s","category":"c","relationType":"r","questionNumber":-2},
              "not-an-object"
            ]
            """));

        Assert.Equal(3, result.TotalRequested);
        Assert.Equal(1, result.CreatedCount);
        Assert.Equal(2, result.Errors.Count);
        // The invalid-object item echoes its raw questionNumber; the non-object item omits the key (JS undefined).
        Assert.Equal(-2, result.Errors[0]["questionNumber"]!.GetValue<int>());
        Assert.Equal("Number must be greater than 0", result.Errors[0]["error"]!.GetValue<string>());
        Assert.False(result.Errors[1].ContainsKey("questionNumber"));
        Assert.Equal("Expected object, received string", result.Errors[1]["error"]!.GetValue<string>());
    }

    [Fact]
    public async Task BulkCreate_allows_duplicates_when_no_unique_constraint()
    {
        var result = await Writer().BulkCreateAsync(Ctx(), Body($"[{Valid(5)},{Valid(5)}]"));
        Assert.Equal(2, result.CreatedCount); // no @@unique in the schema → both persist
        Assert.Empty(result.Errors);
    }

    [Fact]
    public async Task BulkCreate_maps_23505_to_duplicate_question()
    {
        await Exec("""CREATE UNIQUE INDEX q360_qn_uq ON "questions_360"("questionNumber")""");
        try
        {
            var result = await Writer().BulkCreateAsync(Ctx(), Body($"[{Valid(7)},{Valid(7)}]"));
            Assert.Equal(1, result.CreatedCount);
            Assert.Single(result.Errors);
            Assert.Equal("Duplicate question", result.Errors[0]["error"]!.GetValue<string>());
        }
        finally
        {
            await Exec("""DROP INDEX q360_qn_uq""");
        }
    }

    [Fact]
    public async Task BulkCreate_maps_other_db_errors_to_failed_to_create()
    {
        await Exec("""ALTER TABLE "questions_360" ADD CONSTRAINT q360_ck CHECK ("questionNumber" <> 999)""");
        try
        {
            var result = await Writer().BulkCreateAsync(Ctx(), Body($"[{Valid(999)}]")); // passes zod, fails the CHECK (23514)
            Assert.Equal(0, result.CreatedCount);
            Assert.Single(result.Errors);
            Assert.Equal("Failed to create question", result.Errors[0]["error"]!.GetValue<string>());
        }
        finally
        {
            await Exec("""ALTER TABLE "questions_360" DROP CONSTRAINT q360_ck""");
        }
    }

    [Fact]
    public async Task Create_questionNumber_beyond_int32_hits_the_db_error_path()
    {
        // Passes zod (positive int, no upper bound) but the int4 column rejects it (22003) — legacy single → 500.
        await Assert.ThrowsAsync<PostgresException>(() =>
            Writer().CreateAsync(Ctx(), Body(
                """{"questionEnglishText":"e","questionSpanishText":"s","category":"c","relationType":"r","questionNumber":9999999999}""")));
    }

    [Fact]
    public async Task BulkCreate_int32_overflow_maps_to_failed_to_create()
    {
        var result = await Writer().BulkCreateAsync(Ctx(), Body(
            """[{"questionEnglishText":"e","questionSpanishText":"s","category":"c","relationType":"r","questionNumber":9999999999}]"""));
        Assert.Equal(0, result.CreatedCount);
        Assert.Single(result.Errors);
        Assert.Equal("Failed to create question", result.Errors[0]["error"]!.GetValue<string>());
    }

    [Fact]
    public async Task BulkCreate_null_element_is_reported_gracefully_not_crashed()
    {
        // Deliberate divergence from legacy (which throws → 500 on a null element): the null item is reported and
        // the request still returns a 200-shaped result with the valid items created.
        var result = await Writer().BulkCreateAsync(Ctx(), Body($"[{Valid(1)},null,{Valid(2)}]"));

        Assert.Equal(3, result.TotalRequested);
        Assert.Equal(2, result.CreatedCount);
        Assert.Single(result.Errors);
        Assert.False(result.Errors[0].ContainsKey("questionNumber")); // null element → key omitted
        Assert.Equal("Expected object, received null", result.Errors[0]["error"]!.GetValue<string>());
    }

    // ================================================== audit-events retrofit (formmaps#52 Task 13)

    /// <summary>
    /// Until now "audit" here meant one structured log line carrying a question id and nothing else — no actor,
    /// not queryable, and eventually deleted by a log-retention window. It matters more for this writer than
    /// for any sibling: <c>questions_360</c> has <c>createdBy</c>/<c>updatedBy</c> columns that this writer
    /// NEVER populates (legacy parity, pinned by the create test above), so after this retrofit
    /// <c>audit_events</c> is the ONLY record anywhere of who changed the global question bank.
    /// The WHOLE row is asserted rather than a count, because eight of the nine written columns are TEXT and
    /// six are nullable — a count stays green for a writer that swapped actorUserId with subjectId.
    /// </summary>
    [Fact]
    public async Task Create_persists_a_pii_free_audit_event_naming_the_actor()
    {
        var outcome = await Writer().CreateAsync(AuditCtx(), Body(Valid(1)));
        var questionId = outcome.Row!.Id;

        var row = await _fixture.QuerySingleAuditEventAsync("audit.question360.created", questionId);
        Assert.Equal("audit.question360.created", row.EventType);
        Assert.Equal("admin-audit-1", row.ActorUserId);   // the catalog row itself records no one — see above
        Assert.Equal("school_admin", row.ActorRole);
        Assert.Null(row.SchoolId);                        // a GLOBAL catalog row belongs to no school
        Assert.Equal("question_360", row.SubjectType);
        Assert.Equal(questionId, row.SubjectId);
        Assert.Equal("success", row.Outcome);
        Assert.False(string.IsNullOrWhiteSpace(row.Id));

        // No metadata: the log line carries only the question id, and there is nothing else at this call site
        // worth persisting into an append-only, indefinitely-retained table. Asserted as SQL NULL rather than
        // merely "not the question text" — the JSON null literal is a non-NULL column value and would make
        // "metadata IS NULL" false for every metadata-less event.
        Assert.Null(row.MetadataJson);

        AssertPiiFree(row);
    }

    /// <summary>Update audits the same subject under a distinct event type.</summary>
    [Fact]
    public async Task Update_persists_an_audit_event()
    {
        var created = (await Writer().CreateAsync(AuditCtx(), Body(Valid(1)))).Row!;

        await Writer().UpdateAsync(AuditCtx(), created.Id, Body("""{"category":"new"}"""));

        var row = await _fixture.QuerySingleAuditEventAsync("audit.question360.updated", created.Id);
        Assert.Equal("question_360", row.SubjectType);
        Assert.Equal(created.Id, row.SubjectId);
        Assert.Equal("admin-audit-1", row.ActorUserId);
        Assert.Null(row.MetadataJson);
    }

    /// <summary>
    /// The activate/deactivate call site is ONE log line whose action is a runtime placeholder
    /// (<c>audit.question360.{Action}</c>), so a retrofit that hardcoded either string would still look wired.
    /// Both branches are therefore asserted for the event they DO write and for the one they must not.
    /// </summary>
    [Fact]
    public async Task Deactivate_persists_a_deactivated_event_and_not_an_activated_one()
    {
        var created = (await Writer().CreateAsync(AuditCtx(), Body(Valid(1)))).Row!;

        await Writer().SetActiveAsync(AuditCtx(), created.Id, isActive: false);

        var row = await _fixture.QuerySingleAuditEventAsync("audit.question360.deactivated", created.Id);
        Assert.Equal(created.Id, row.SubjectId);
        Assert.Equal("question_360", row.SubjectType);
        Assert.Equal(0, await _fixture.CountAuditEventsAsync("audit.question360.activated", created.Id));
    }

    /// <inheritdoc cref="Deactivate_persists_a_deactivated_event_and_not_an_activated_one"/>
    [Fact]
    public async Task Activate_persists_an_activated_event_and_not_a_deactivated_one()
    {
        var created = (await Writer().CreateAsync(AuditCtx(), Body(Valid(1)))).Row!;

        await Writer().SetActiveAsync(AuditCtx(), created.Id, isActive: true);

        var row = await _fixture.QuerySingleAuditEventAsync("audit.question360.activated", created.Id);
        Assert.Equal(created.Id, row.SubjectId);
        Assert.Equal(0, await _fixture.CountAuditEventsAsync("audit.question360.deactivated", created.Id));
    }

    /// <summary>
    /// Delete is a SOFT delete, so the catalog row survives and the audit event is the only durable marker of
    /// the intent. The delete is also idempotent (no isActive precheck — pinned above), and each successful
    /// call is a separate act by a separate possible actor, so the second one audits too.
    /// </summary>
    [Fact]
    public async Task Delete_persists_a_deleted_event_on_every_successful_call()
    {
        var created = (await Writer().CreateAsync(AuditCtx(), Body(Valid(1)))).Row!;

        Assert.Equal(Question360DeleteStatus.Deleted, await Writer().DeleteAsync(AuditCtx(), created.Id));
        var row = await _fixture.QuerySingleAuditEventAsync("audit.question360.deleted", created.Id);
        Assert.Equal(created.Id, row.SubjectId);
        Assert.Equal("question_360", row.SubjectType);

        Assert.Equal(Question360DeleteStatus.Deleted, await Writer().DeleteAsync(AuditCtx(), created.Id));
        Assert.Equal(2, await _fixture.CountAuditEventsAsync("audit.question360.deleted", created.Id));
    }

    /// <summary>
    /// bulk-create is the one site with NO subject: the batch is the act, and its items each already got their
    /// own row id that nothing else references. One summary event per request — not one per item, which is what
    /// the count assertion pins — carrying the same two counts the log line does. <c>subjectId</c> NULL is the
    /// production column's documented shape ("nullable: bulk operations may have no single subject"), not a
    /// local shortcut.
    /// </summary>
    [Fact]
    public async Task BulkCreate_persists_one_subjectless_event_carrying_the_counts()
    {
        var result = await Writer().BulkCreateAsync(AuditCtx(), Body($$"""
            [
              {{Valid(1)}},
              {{Valid(2)}},
              {"questionEnglishText":"e","questionSpanishText":"s","category":"c","relationType":"r","questionNumber":-2}
            ]
            """));

        Assert.Equal(2, result.CreatedCount);
        Assert.Equal(3, result.TotalRequested);

        var row = await _fixture.QuerySingleAuditEventAsync("audit.question360.bulk_created", subjectId: null);
        Assert.Equal("audit.question360.bulk_created", row.EventType);
        Assert.Null(row.SubjectId);
        Assert.Equal("question_360", row.SubjectType);
        Assert.Equal("admin-audit-1", row.ActorUserId);

        Assert.NotNull(row.MetadataJson);
        using var metadata = JsonDocument.Parse(row.MetadataJson!);
        Assert.Equal(2, metadata.RootElement.GetProperty("createdCount").GetInt32());
        Assert.Equal(3, metadata.RootElement.GetProperty("totalRequested").GetInt32());
    }

    /// <summary>
    /// A batch where NOTHING was created still audits, deliberately — unlike every other site here, where the
    /// event means "a row changed". The two counts are in the metadata, so a <c>createdCount: 0</c> event
    /// claims nothing was written; and an admin attempting a bulk mutation of the global bank that wholly
    /// failed is exactly the thing an auditor asks about. This mirrors the existing log line, which is also
    /// unconditional.
    /// </summary>
    [Fact]
    public async Task BulkCreate_that_created_nothing_still_records_the_attempt()
    {
        var result = await Writer().BulkCreateAsync(AuditCtx(), Body("""["not-an-object"]"""));

        Assert.Equal(0, result.CreatedCount);
        var row = await _fixture.QuerySingleAuditEventAsync("audit.question360.bulk_created", subjectId: null);
        using var metadata = JsonDocument.Parse(row.MetadataJson!);
        Assert.Equal(0, metadata.RootElement.GetProperty("createdCount").GetInt32());
        Assert.Equal(1, metadata.RootElement.GetProperty("totalRequested").GetInt32());
    }

    /// <summary>
    /// Negative control: a missing id short-circuits to Missing BEFORE the commit, so nothing changed and
    /// nothing may be audited. An event emitted alongside the attempt would let any caller manufacture a
    /// tamper-proof record of edits to questions that do not exist.
    /// </summary>
    [Fact]
    public async Task Update_missing_id_writes_no_audit_event()
    {
        Assert.Equal(Question360WriteStatus.Missing,
            (await Writer().UpdateAsync(AuditCtx(), "nope", Body("""{"category":"x"}"""))).Status);
        Assert.Equal(0, await _fixture.CountAuditEventsAsync("audit.question360.updated", "nope"));
    }

    /// <inheritdoc cref="Update_missing_id_writes_no_audit_event"/>
    [Fact]
    public async Task SetActive_missing_id_writes_no_audit_event()
    {
        Assert.Equal(Question360WriteStatus.Missing, (await Writer().SetActiveAsync(AuditCtx(), "nope", isActive: true)).Status);
        Assert.Equal(0, await _fixture.CountAuditEventsAsync("audit.question360.activated", "nope"));
        Assert.Equal(0, await _fixture.CountAuditEventsAsync("audit.question360.deactivated", "nope"));
    }

    /// <inheritdoc cref="Update_missing_id_writes_no_audit_event"/>
    [Fact]
    public async Task Delete_missing_id_writes_no_audit_event()
    {
        Assert.Equal(Question360DeleteStatus.Missing, await Writer().DeleteAsync(AuditCtx(), "nope"));
        Assert.Equal(0, await _fixture.CountAuditEventsAsync("audit.question360.deleted", "nope"));
    }

    /// <summary>
    /// Negative control on the OTHER early return out of DeleteAsync: an active sub-question blocks the
    /// delete before the UPDATE runs at all. The parent is still active afterwards, so a "deleted" event here
    /// would be a durable, immutable claim that contradicts the catalog.
    /// </summary>
    [Fact]
    public async Task Delete_blocked_by_the_child_guard_writes_no_audit_event()
    {
        var parent = (await Writer().CreateAsync(AuditCtx(), Body(Valid(1)))).Row!;
        await Writer().CreateAsync(AuditCtx(), Body(
            $$"""{"questionEnglishText":"e","questionSpanishText":"s","category":"c","relationType":"r","questionNumber":2,"isSubQuestion":true,"parentQuestionId":"{{parent.Id}}"}"""));

        Assert.Equal(Question360DeleteStatus.ChildGuard, await Writer().DeleteAsync(AuditCtx(), parent.Id));

        Assert.True(await IsActiveAsync(parent.Id));
        Assert.Equal(0, await _fixture.CountAuditEventsAsync("audit.question360.deleted", parent.Id));
    }

    /// <summary>
    /// Negative control on the throwing path: an int4 overflow escapes CreateAsync as a PostgresException
    /// (legacy → 500) and never reaches the commit, so there is no created event. The audit write sits below
    /// the commit rather than in a finally, and this is what proves it.
    /// </summary>
    [Fact]
    public async Task Create_that_throws_writes_no_audit_event()
    {
        await Assert.ThrowsAsync<PostgresException>(() =>
            Writer().CreateAsync(AuditCtx(), Body(
                """{"questionEnglishText":"e","questionSpanishText":"s","category":"c","relationType":"r","questionNumber":9999999999}""")));

        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT count(*)::int FROM "audit_events" WHERE "eventType" = 'audit.question360.created'""", conn);
        Assert.Equal(0, (int)(await cmd.ExecuteScalarAsync())!);
    }

    // ---------------------------------------------------------------- helpers

    private Question360Writer Writer()
    {
        var factory = new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());
        // The audit writer is the REAL one, never a fake: the retrofit's claim is that a row lands in
        // audit_events, and a substitute cannot prove that.
        return new Question360Writer(factory, new AuditEventWriter(factory, NullLogger<AuditEventWriter>.Instance),
            NullLogger<Question360Writer>.Instance);
    }

    private Question360Reader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static JsonElement Body(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private static string Valid(int number, string category = "collab") =>
        $$"""{"questionEnglishText":"How?","questionSpanishText":"¿Cómo?","category":"{{category}}","relationType":"peer","questionNumber":{{number}}}""";

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school_admin", "a@e.st", "Admin"),
            schoolId: null, permissions: ["evaluations:manage"],
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    /// <summary>
    /// The context the audit-retrofit tests act under. It differs from <see cref="Ctx"/> in three ways that
    /// each carry an assertion: a real-looking name and email so the PII check has something to catch; a
    /// <c>schoolId</c> so "SchoolId stays null" is a proven decision rather than an artifact of there being
    /// nothing to copy; and a role given in mixed case so the persisted <c>actorRole</c> is shown to be the
    /// NORMALIZED role, not whatever casing the token happened to carry.
    /// </summary>
    private static RequestContext AuditCtx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-audit-1", "School_Admin", "grace.hopper@formmaps.test", "Grace Hopper"),
            schoolId: "school-audit-1", permissions: ["evaluations:manage"],
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static void AssertPiiFree(Question360DatabaseFixture.AuditEventRow row)
    {
        var serialized = string.Join("|", row.Id, row.EventType, row.ActorUserId, row.ActorRole,
            row.SchoolId, row.SubjectType, row.SubjectId, row.Outcome, row.MetadataJson);
        Assert.DoesNotContain("Grace Hopper", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("grace.hopper@formmaps.test", serialized, StringComparison.Ordinal);
    }

    private async Task<bool> IsActiveAsync(string id)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""SELECT "isActive" FROM "questions_360" WHERE "id" = @id""", conn);
        cmd.Parameters.AddWithValue("id", id);
        return (bool)(await cmd.ExecuteScalarAsync())!;
    }

    private async Task Exec(string sql)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(sql, conn);
        await cmd.ExecuteNonQueryAsync();
    }
}
