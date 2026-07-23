using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Prerequisites;
using Npgsql;

namespace FormMaps.IntegrationTests.Prerequisites;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC tz) tests for <see cref="PrerequisitesWriter"/> (FM-DOTNET-057 —
/// updatePrerequisites). Pins: foreign/missing course → false (no write); prerequisiteRules[].courseIds resolved to
/// school-scoped CODES (another school's ids excluded); corequisites array stored, falsy → [], non-array-truthy /
/// non-string element → throw (Prisma String[] type rejection → 500); updatedBy set; "updatedAt" bumped (@updatedAt).
/// </summary>
public sealed class PrerequisitesWriterTests : IClassFixture<PrerequisitesDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string Caller = "admin-1";
    private readonly PrerequisitesDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public PrerequisitesWriterTests(PrerequisitesDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "school_courses" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Update_foreign_or_missing_course_returns_false()
    {
        await InsertCourseAsync("c1", "MATH1", school: "other-school");
        Assert.False(await Writer().UpdatePrerequisitesAsync(Ctx(), School, "c1", Caller, Json("{}")));
        Assert.False(await Writer().UpdatePrerequisitesAsync(Ctx(), School, "missing", Caller, Json("{}")));
    }

    [Fact]
    public async Task Update_missing_or_foreign_course_with_bad_corequisites_is_404_not_500()
    {
        // Ordering parity (fresh-review Finding 1): the course lookup 404 must PRE-EMPT the corequisites type
        // rejection. Legacy short-circuits on the missing/foreign course (findUnique) before Prisma ever validates
        // corequisites at the update. So a truthy-non-array corequisites on a missing/foreign course → false (404),
        // NOT a throw (500). RED if ParseCorequisites moves back before the lookup.
        await InsertCourseAsync("foreign", "FOR", school: "other-school");
        var badBody = Json("""{"corequisites":"NOT-AN-ARRAY"}""");

        Assert.False(await Writer().UpdatePrerequisitesAsync(Ctx(), School, "missing", Caller, badBody));
        Assert.False(await Writer().UpdatePrerequisitesAsync(Ctx(), School, "foreign", Caller, badBody));
    }

    [Fact]
    public async Task Update_resolves_courseIds_to_codes_school_scoped_and_bumps_updatedAt()
    {
        var early = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
        await InsertCourseAsync("target", "TARGET", updatedAt: early);
        await InsertCourseAsync("pre-a", "AAA");
        await InsertCourseAsync("pre-b", "BBB");
        await InsertCourseAsync("foreign", "FOR", school: "other-school"); // another school — must NOT resolve

        var body = Json("""{"prerequisiteRules":[{"courseIds":["pre-b","pre-a","foreign"]}],"corequisites":["COREQ1"]}""");
        Assert.True(await Writer().UpdatePrerequisitesAsync(Ctx(), School, "target", Caller, body));

        var (prereqs, coreqs, updatedBy, updatedAt) = await ReadWriteStateAsync("target");
        Assert.Equal(["AAA", "BBB"], prereqs);       // resolved codes, ORDER BY id ASC (pre-a, pre-b) — foreign excluded
        Assert.Equal(["COREQ1"], coreqs);
        Assert.Equal(Caller, updatedBy);
        Assert.True(updatedAt > early);              // @updatedAt bumped
    }

    [Fact]
    public async Task Update_empty_body_clears_prereqs_and_coreqs()
    {
        await InsertCourseAsync("target", "TARGET", prerequisites: ["OLD"]);
        Assert.True(await Writer().UpdatePrerequisitesAsync(Ctx(), School, "target", Caller, Json("{}")));

        var (prereqs, coreqs, _, _) = await ReadWriteStateAsync("target");
        Assert.Empty(prereqs); // prerequisiteRules absent → []
        Assert.Empty(coreqs);  // corequisites absent (falsy) → []
    }

    [Theory]
    [InlineData("null")]   // falsy → []
    [InlineData("false")]  // falsy → []
    [InlineData("\"\"")]   // empty string falsy → []
    [InlineData("0")]      // zero falsy → []
    public async Task Update_corequisites_falsy_becomes_empty(string coreqJson)
    {
        await InsertCourseAsync("target", "TARGET", prerequisites: ["OLD"]);
        Assert.True(await Writer().UpdatePrerequisitesAsync(Ctx(), School, "target", Caller,
            Json($$"""{"corequisites":{{coreqJson}}}""")));

        var (_, coreqs, _, _) = await ReadWriteStateAsync("target");
        Assert.Empty(coreqs);
    }

    [Theory]
    [InlineData("\"REQ\"")]       // non-empty string (truthy non-array) → 500
    [InlineData("42")]            // non-zero number → 500
    [InlineData("true")]          // true → 500
    [InlineData("{\"a\":1}")]     // object → 500
    [InlineData("[\"ok\",5]")]    // array with a non-string element → 500
    public async Task Update_corequisites_type_reject_throws(string coreqJson)
    {
        await InsertCourseAsync("target", "TARGET");
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Writer().UpdatePrerequisitesAsync(Ctx(), School, "target", Caller,
                Json($$"""{"corequisites":{{coreqJson}}}""")));
    }

    // ---- prerequisiteRules flatMap parity (Codex Findings 3 + 4) ----

    [Fact]
    public async Task Update_null_rule_element_throws_on_existing_course_but_404s_on_missing()
    {
        // JS `prerequisiteRules.flatMap(r => r.courseIds)` throws on a null rule (null.courseIds TypeError → 500) —
        // but ONLY after the course lookup, so a missing/foreign course still 404s (returns false).
        await InsertCourseAsync("target", "TARGET");
        var nullRuleBody = Json("""{"prerequisiteRules":[null]}""");

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Writer().UpdatePrerequisitesAsync(Ctx(), School, "target", Caller, nullRuleBody));

        Assert.False(await Writer().UpdatePrerequisitesAsync(Ctx(), School, "missing", Caller, nullRuleBody));
    }

    [Fact]
    public async Task Update_string_courseIds_is_treated_as_a_single_id()
    {
        // JS flatMap does NOT flatten a string → a bare-string courseIds is ONE id element → resolves that course.
        await InsertCourseAsync("target", "TARGET");
        await InsertCourseAsync("pre-a", "AAA");

        Assert.True(await Writer().UpdatePrerequisitesAsync(Ctx(), School, "target", Caller,
            Json("""{"prerequisiteRules":[{"courseIds":"pre-a"}]}""")));

        var (prereqs, _, _, _) = await ReadWriteStateAsync("target");
        Assert.Equal(["AAA"], prereqs);
    }

    [Theory]
    [InlineData("""{"prerequisiteRules":[{"courseIds":["ok",5]}]}""")] // non-string element in the array
    [InlineData("""{"prerequisiteRules":[{"courseIds":42}]}""")]        // truthy number courseIds
    [InlineData("""{"prerequisiteRules":[{"courseIds":true}]}""")]      // true courseIds
    public async Task Update_non_string_courseId_throws(string body)
    {
        await InsertCourseAsync("target", "TARGET");
        await InsertCourseAsync("ok", "OK");
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Writer().UpdatePrerequisitesAsync(Ctx(), School, "target", Caller, Json(body)));
    }

    // ---- helpers ----

    private static JsonElement Json(string s) => JsonDocument.Parse(s).RootElement.Clone();

    private PrerequisitesWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(Caller, "school-admin", "a@e.st", "Admin"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private async Task InsertCourseAsync(
        string id, string code, string? school = null, string[]? prerequisites = null, DateTime? updatedAt = null)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "school_courses" ("id","schoolId","code","name","prerequisites","updatedAt")
            VALUES (@id,@sid,@code,@code,@prereqs,@upd)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("sid", school ?? School);
        cmd.Parameters.AddWithValue("code", code);
        cmd.Parameters.AddWithValue("prereqs", prerequisites ?? []);
        cmd.Parameters.AddWithValue("upd", (object?)updatedAt ?? new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task<(string[] Prereqs, string[] Coreqs, string? UpdatedBy, DateTime UpdatedAt)> ReadWriteStateAsync(string id)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT "prerequisites", "corequisites", "updatedBy", "updatedAt" FROM "school_courses" WHERE "id" = @id""", conn);
        cmd.Parameters.AddWithValue("id", id);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (
            reader.GetFieldValue<string[]>(0),
            reader.GetFieldValue<string[]>(1),
            reader.IsDBNull(2) ? null : reader.GetString(2),
            reader.GetDateTime(3));
    }
}
