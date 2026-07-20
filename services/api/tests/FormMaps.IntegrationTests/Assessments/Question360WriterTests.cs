using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Assessments;
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
        await using var cmd = new NpgsqlCommand("""TRUNCATE "questions_360" """, conn);
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

    // ---------------------------------------------------------------- helpers

    private Question360Writer Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), NullLogger<Question360Writer>.Instance);

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
