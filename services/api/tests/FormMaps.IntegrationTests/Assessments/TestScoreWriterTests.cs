using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Data;
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
    private NpgsqlDataSource _dataSource = null!;

    public TestScoreWriterTests(TestScoreDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "student_test_scores" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

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

    // ---------------------------------------------------------------- helpers

    private TestScoreWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), NullLogger<TestScoreWriter>.Instance);

    private TestScoreReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static JsonElement Body(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private static string NewUser() => "u-" + Guid.NewGuid().ToString("N");

    private static RequestContext Ctx(string userId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "student", $"{userId}@e.st", "Test User"),
            schoolId: null, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private async Task<bool> IsActiveAsync(string id)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""SELECT "isActive" FROM "student_test_scores" WHERE "id" = @id""", conn);
        cmd.Parameters.AddWithValue("id", id);
        return (bool)(await cmd.ExecuteScalarAsync())!;
    }
}
