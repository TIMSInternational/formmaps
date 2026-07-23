using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.DataMappings;
using Npgsql;

namespace FormMaps.IntegrationTests.DataMappings;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC container tz) tests for <see cref="DataMappingsWriter"/> (FM-DOTNET-056). Pins
/// createDataMapping: the full created row with source FORCED 'manual', status 'approved', approvedBy=caller,
/// approvedAt set, createdBy/updatedBy NULL, isActive true; externalSource default "manual"; confidence emitted as a
/// STRING for both a JSON number AND a numeric string, and null when absent; a duplicate
/// (schoolId, externalCode, externalSource) surfaces as an uncaught unique-violation (→ 500, NOT 409); a missing
/// externalCode surfaces as an uncaught NOT-NULL violation (→ 500). Pins bulkApproveMappings: a real id array flips
/// those rows to approved (school-scoped, bumping updatedAt); and the RATIFIED SAFE DIVERGENCE — an EMPTY id array
/// approves 0 and flips NOTHING (never the whole school).
/// </summary>
public sealed class DataMappingsWriterTests
    : IClassFixture<DataMappingsDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string Caller = "admin-1";

    private readonly DataMappingsDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public DataMappingsWriterTests(DataMappingsDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "data_mappings" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- createDataMapping ----

    [Fact]
    public async Task Create_forces_manual_approved_and_sets_approvedBy_now_and_null_audit()
    {
        var row = await Writer().CreateAsync(Ctx(), School,
            Json("""{"externalCode":"EXT1","internalCourseId":"course-1"}"""), Caller);

        Assert.Equal(School, row.SchoolId);
        Assert.Equal("EXT1", row.ExternalCode);
        Assert.Equal("course-1", row.InternalCourseId);
        Assert.Equal("manual", row.ExternalSource);  // || "manual" default
        Assert.Equal("manual", row.Source);          // FORCED
        Assert.Equal("approved", row.Status);        // FORCED
        Assert.Equal(Caller, row.ApprovedBy);
        Assert.NotNull(row.ApprovedAt);
        Assert.True(row.IsActive);
        Assert.Null(row.CreatedBy);
        Assert.Null(row.UpdatedBy);
        Assert.Null(row.ExternalName);
        Assert.Null(row.Confidence);                 // absent → NULL
    }

    [Fact]
    public async Task Create_honors_explicit_externalSource()
    {
        var row = await Writer().CreateAsync(Ctx(), School,
            Json("""{"externalCode":"EXT1","internalCourseId":"course-1","externalSource":"powerschool"}"""), Caller);

        Assert.Equal("powerschool", row.ExternalSource);
    }

    [Fact]
    public async Task Create_emits_confidence_string_for_number()
    {
        var row = await Writer().CreateAsync(Ctx(), School,
            Json("""{"externalCode":"EXT1","internalCourseId":"course-1","confidence":0.85}"""), Caller);

        Assert.Equal("0.85", row.Confidence); // raw Decimal → decimal.js STRING (NOT 0.850000…)
    }

    [Fact]
    public async Task Create_emits_confidence_string_for_numeric_string()
    {
        var row = await Writer().CreateAsync(Ctx(), School,
            Json("""{"externalCode":"EXT1","internalCourseId":"course-1","confidence":"0.85"}"""), Caller);

        Assert.Equal("0.85", row.Confidence); // numeric string coerced → decimal → STRING
    }

    // ---- confidence STRING-coercion parity (FM-056 fold: AllowLeadingSign|AllowDecimalPoint|AllowExponent) ----
    // These pin the exact decimal.js-parity boundary. RED if the mask regresses to NumberStyles.Number: "1e3" would
    // then throw (exponent lost), and "1,000"/" 0.85 " would silently PARSE (fail-OPEN — a row legacy 500s on).

    [Fact]
    public async Task Create_confidence_exponent_string_parses_like_decimaljs()
    {
        // decimal.js "1e3" → 1000; the AllowExponent mask matches. (Under NumberStyles.Number this would throw.)
        var row = await Writer().CreateAsync(Ctx(), School,
            Json("""{"externalCode":"EXT1","internalCourseId":"course-1","confidence":"1e3"}"""), Caller);

        Assert.Equal("1000", row.Confidence); // trim_scale(1000)::text
    }

    [Theory]
    [InlineData("1,000")]   // thousands separator: decimal.js THROWS → we must NOT fail-open (no AllowThousands)
    [InlineData(" 0.85 ")]  // surrounding whitespace: decimal.js THROWS → we must NOT fail-open (no AllowWhite)
    public async Task Create_confidence_string_rejected_like_decimaljs_no_fail_open(string confidence)
    {
        // Legacy decimal.js rejects these → route 500. Under NumberStyles.Number both would PARSE (fail-open),
        // writing a row legacy never would — the exact regression this test guards.
        var body = Json($$"""{"externalCode":"EXT1","internalCourseId":"course-1","confidence":{{JsonSerializer.Serialize(confidence)}}}""");
        await Assert.ThrowsAsync<FormatException>(() => Writer().CreateAsync(Ctx(), School, body, Caller));
        Assert.Equal(0, await RowCount()); // no phantom write
    }

    [Theory]
    [InlineData("0x10")]      // hex: decimal.js → 16
    [InlineData("Infinity")]  // decimal.js → Infinity
    [InlineData("NaN")]       // decimal.js → NaN
    [InlineData("1_000")]     // ES underscore: decimal.js → 1000
    public async Task Create_confidence_pathological_string_fails_closed_documented_divergence(string confidence)
    {
        // DOCUMENTED divergence (fail-CLOSED, intentional): decimal.js accepts these exotic forms; .NET rejects → 500.
        // We choose NOT to reproduce persisting NaN/Infinity/hex as a confidence. Divergence is one-directional (safe):
        // .NET only rejects where legacy would write a nonsense value; it never accepts where legacy rejects.
        var body = Json($$"""{"externalCode":"EXT1","internalCourseId":"course-1","confidence":{{JsonSerializer.Serialize(confidence)}}}""");
        await Assert.ThrowsAsync<FormatException>(() => Writer().CreateAsync(Ctx(), School, body, Caller));
        Assert.Equal(0, await RowCount());
    }

    [Fact]
    public async Task Create_duplicate_key_throws_unique_violation_not_409()
    {
        await Writer().CreateAsync(Ctx(), School,
            Json("""{"externalCode":"DUP","internalCourseId":"course-1"}"""), Caller);

        // Same (schoolId, externalCode, externalSource) → NO P2002 catch → uncaught unique violation → route 500.
        var ex = await Assert.ThrowsAsync<PostgresException>(() =>
            Writer().CreateAsync(Ctx(), School,
                Json("""{"externalCode":"DUP","internalCourseId":"course-2"}"""), Caller));
        Assert.Equal(PostgresErrorCodes.UniqueViolation, ex.SqlState);
    }

    [Fact]
    public async Task Create_missing_externalCode_throws_not_null_violation()
    {
        var ex = await Assert.ThrowsAsync<PostgresException>(() =>
            Writer().CreateAsync(Ctx(), School, Json("""{"internalCourseId":"course-1"}"""), Caller));
        Assert.Equal(PostgresErrorCodes.NotNullViolation, ex.SqlState);
    }

    // ---- bulkApproveMappings ----

    [Fact]
    public async Task BulkApprove_flips_ids_school_scoped_and_bumps_updatedAt()
    {
        var early = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
        await InsertPendingAsync("m1", School, "E1", updatedAt: early);
        await InsertPendingAsync("m2", School, "E2", updatedAt: early);
        await InsertPendingAsync("other", "school-2", "E3", updatedAt: early); // another school — must NOT flip

        var approved = await Writer().BulkApproveAsync(Ctx(), School, ["m1", "m2", "other"], Caller);

        Assert.Equal(2, approved); // "other" is school-scoped out
        Assert.Equal(("approved", Caller), await StatusOf("m1"));
        Assert.Equal(("approved", Caller), await StatusOf("m2"));
        Assert.Equal(("pending", (string?)null), await StatusOf("other"));
        Assert.True(await UpdatedAtOf("m1") > early); // @updatedAt bumped
    }

    [Fact]
    public async Task BulkApprove_empty_list_approves_zero_and_flips_nothing()
    {
        // THE RATIFIED SAFE DIVERGENCE: an empty id array (the endpoint's normalization of a missing/non-array
        // mappingIds) must approve NOTHING — never the whole school (legacy's dropped-filter footgun).
        await InsertPendingAsync("m1", School, "E1");
        await InsertPendingAsync("m2", School, "E2");

        var approved = await Writer().BulkApproveAsync(Ctx(), School, Array.Empty<string>(), Caller);

        Assert.Equal(0, approved);
        Assert.Equal(("pending", (string?)null), await StatusOf("m1"));
        Assert.Equal(("pending", (string?)null), await StatusOf("m2"));
    }

    // ---- updateDataMapping (FM-DOTNET-061 PUT /data-mappings/:id) ----

    [Fact]
    public async Task Update_always_sets_updatedBy_updatedAt_and_only_present_conditional_fields()
    {
        var old = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
        await InsertPendingAsync("m1", School, "E1", updatedAt: old, externalName: "OrigName");

        // externalCode present → changed; the other conditional keys absent → unchanged; updatedBy+updatedAt ALWAYS set.
        var id = await Writer().UpdateDataMappingAsync(Ctx(), School, "user-9", "m1", Json("""{"externalCode":"NEW"}"""));

        Assert.Equal("m1", id);
        var m = await ReadMappingAsync("m1");
        Assert.Equal("NEW", m.ExternalCode);        // present → changed
        Assert.Equal("OrigName", m.ExternalName);   // absent → unchanged
        Assert.Equal("manual", m.ExternalSource);   // absent → unchanged
        Assert.Equal("course-1", m.InternalCourseId); // absent → unchanged
        Assert.Equal("user-9", m.UpdatedBy);        // ALWAYS stamped
        Assert.True(m.UpdatedAt > old);             // @updatedAt bumped
    }

    [Fact]
    public async Task Update_present_null_on_nullable_externalName_writes_null()
    {
        await InsertPendingAsync("m1", School, "E1", externalName: "Was");

        await Writer().UpdateDataMappingAsync(Ctx(), School, "user-9", "m1", Json("""{"externalName":null}"""));

        Assert.Null((await ReadMappingAsync("m1")).ExternalName); // nullable column → NULL (house rule)
    }

    [Fact]
    public async Task Update_all_conditional_fields_persist()
    {
        await InsertPendingAsync("m1", School, "E1");

        var id = await Writer().UpdateDataMappingAsync(Ctx(), School, "user-9", "m1",
            Json("""{"externalCode":"C2","externalName":"N2","externalSource":"powerschool","internalCourseId":"course-2"}"""));

        Assert.Equal("m1", id);
        var m = await ReadMappingAsync("m1");
        Assert.Equal("C2", m.ExternalCode);
        Assert.Equal("N2", m.ExternalName);
        Assert.Equal("powerschool", m.ExternalSource); // raw copy — NO `|| "manual"` here
        Assert.Equal("course-2", m.InternalCourseId);
    }

    [Fact]
    public async Task Update_present_null_on_not_null_externalCode_throws()
    {
        await InsertPendingAsync("m1", School, "E1");

        // externalCode is NOT NULL → present null → DBNull → NOT-NULL violation → 500.
        await Assert.ThrowsAsync<PostgresException>(() =>
            Writer().UpdateDataMappingAsync(Ctx(), School, "user-9", "m1", Json("""{"externalCode":null}""")));
    }

    [Fact]
    public async Task Update_missing_mapping_returns_null()
    {
        Assert.Null(await Writer().UpdateDataMappingAsync(Ctx(), School, "user-9", "nope", Json("""{"externalCode":"X"}""")));
    }

    [Fact]
    public async Task Update_wrong_school_returns_null_and_does_not_write()
    {
        var old = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
        await InsertPendingAsync("m1", "school-2", "E1", updatedAt: old, externalName: "Other");

        var id = await Writer().UpdateDataMappingAsync(Ctx(), School, "user-9", "m1", Json("""{"externalName":"Hijack"}"""));

        Assert.Null(id);
        var m = await ReadMappingAsync("m1");
        Assert.Equal("Other", m.ExternalName); // unchanged
        Assert.Null(m.UpdatedBy);              // not stamped
        Assert.Equal(old, m.UpdatedAt);        // not bumped
    }

    // ---- deleteDataMapping (HARD delete) ----

    [Fact]
    public async Task Delete_hard_removes_row()
    {
        await InsertPendingAsync("m1", School, "E1");

        var ok = await Writer().DeleteDataMappingAsync(Ctx(), School, "m1");

        Assert.True(ok);
        Assert.Equal(0, await RowCount()); // HARD delete — the row is gone
    }

    [Fact]
    public async Task Delete_missing_mapping_returns_false()
    {
        Assert.False(await Writer().DeleteDataMappingAsync(Ctx(), School, "nope"));
    }

    [Fact]
    public async Task Delete_wrong_school_returns_false_and_row_still_present()
    {
        await InsertPendingAsync("m1", "school-2", "E1");

        var ok = await Writer().DeleteDataMappingAsync(Ctx(), School, "m1");

        Assert.False(ok);
        Assert.Equal(1, await RowCount()); // untouched
    }

    // ---- helpers ----

    private static JsonElement Json(string s) => JsonDocument.Parse(s).RootElement.Clone();

    private DataMappingsWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(Caller, "school-admin", "a@e.st", "Admin"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private async Task InsertPendingAsync(
        string id, string schoolId, string externalCode, DateTime? updatedAt = null, string? externalName = null)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "data_mappings"
                ("id","schoolId","externalCode","externalName","externalSource","internalCourseId","status","updatedAt")
            VALUES (@id,@sid,@code,@name,'manual',@icid,'pending'::"DataMappingStatus",@upd)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("sid", schoolId);
        cmd.Parameters.AddWithValue("code", externalCode);
        cmd.Parameters.AddWithValue("name", (object?)externalName ?? DBNull.Value);
        cmd.Parameters.AddWithValue("icid", "course-1");
        cmd.Parameters.AddWithValue("upd", (object?)updatedAt ?? new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task<(string ExternalCode, string? ExternalName, string ExternalSource, string InternalCourseId, string? UpdatedBy, DateTime UpdatedAt)> ReadMappingAsync(string id)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT "externalCode","externalName","externalSource","internalCourseId","updatedBy","updatedAt"
            FROM "data_mappings" WHERE "id"=@id
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (
            reader.GetString(0),
            reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3),
            reader.IsDBNull(4) ? null : reader.GetString(4),
            reader.GetDateTime(5));
    }

    private async Task<(string Status, string? ApprovedBy)> StatusOf(string id)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT "status"::text, "approvedBy" FROM "data_mappings" WHERE "id" = @id""", conn);
        cmd.Parameters.AddWithValue("id", id);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (reader.GetString(0), reader.IsDBNull(1) ? null : reader.GetString(1));
    }

    private async Task<int> RowCount()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""SELECT COUNT(*) FROM "data_mappings" """, conn);
        return (int)(long)(await cmd.ExecuteScalarAsync())!;
    }

    private async Task<DateTime> UpdatedAtOf(string id)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""SELECT "updatedAt" FROM "data_mappings" WHERE "id" = @id""", conn);
        cmd.Parameters.AddWithValue("id", id);
        return (DateTime)(await cmd.ExecuteScalarAsync())!;
    }
}
