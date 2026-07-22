using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.DataMappings;
using Npgsql;

namespace FormMaps.IntegrationTests.DataMappings;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC container tz) tests for <see cref="DataMappingsReader"/> (FM-DOTNET-056). Pins
/// listDataMappings: schoolId + isActive scope; optional status filter (valid enum) and the invalid-enum cast error
/// (→ 500 in the route); ORDER BY createdDate DESC with the id-ASC tie-break; the full-row camelCase passthrough incl.
/// confidence as a decimal.js STRING (trim_scale::text) or null; source/status as native-enum label strings; ISO-Z
/// timestamps incl. a null approvedAt; and totalPages.
/// </summary>
public sealed class DataMappingsReaderTests
    : IClassFixture<DataMappingsDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";

    private readonly DataMappingsDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public DataMappingsReaderTests(DataMappingsDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "data_mappings" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task List_scopes_to_school_and_active()
    {
        await InsertAsync("m1", School, "EXT1");
        await InsertAsync("m2", "other-school", "EXT2");       // different school — excluded
        await InsertAsync("m3", School, "EXT3", isActive: false); // inactive — excluded

        var page = await Reader().ListAsync(Ctx(), School, page: 1, limit: 20, skip: 0, status: null);

        Assert.Equal(1, page.Total);
        Assert.Equal("EXT1", Assert.Single(page.Data).ExternalCode);
    }

    [Fact]
    public async Task List_filters_by_valid_status_enum()
    {
        await InsertAsync("m1", School, "EXT1", status: "approved");
        await InsertAsync("m2", School, "EXT2", status: "pending");

        var page = await Reader().ListAsync(Ctx(), School, 1, 20, 0, status: "pending");

        Assert.Equal("EXT2", Assert.Single(page.Data).ExternalCode);
        Assert.Equal("pending", page.Data[0].Status);
    }

    [Fact]
    public async Task List_invalid_status_enum_throws_cast_error()
    {
        // Faithful to legacy passing a bad enum to Prisma: @status::"DataMappingStatus" cast fails → the route 500s.
        var ex = await Assert.ThrowsAsync<PostgresException>(() =>
            Reader().ListAsync(Ctx(), School, 1, 20, 0, status: "not-a-status"));
        Assert.Equal(PostgresErrorCodes.InvalidTextRepresentation, ex.SqlState);
    }

    [Fact]
    public async Task List_orders_by_createdDate_desc_then_id_asc()
    {
        var t1 = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
        var t2 = new DateTime(2024, 2, 2, 0, 0, 0, DateTimeKind.Unspecified);
        // Same createdDate for the tie-break pair; id ASC decides ("a" before "b").
        await InsertAsync("b-id", School, "OLD", createdDate: t1);
        await InsertAsync("a-id", School, "OLD2", createdDate: t1);
        await InsertAsync("z-id", School, "NEW", createdDate: t2);

        var page = await Reader().ListAsync(Ctx(), School, 1, 20, 0, null);

        // Newest first; then the tie broken by id ASC.
        Assert.Equal(["z-id", "a-id", "b-id"], page.Data.Select(m => m.Id).ToArray());
    }

    [Fact]
    public async Task List_emits_confidence_string_and_null()
    {
        await InsertAsync("m1", School, "EXT1", confidence: 0.85m);
        await InsertAsync("m2", School, "EXT2", confidence: null);

        var page = await Reader().ListAsync(Ctx(), School, 1, 20, 0, null);
        var m1 = page.Data.Single(m => m.Id == "m1");
        var m2 = page.Data.Single(m => m.Id == "m2");

        Assert.Equal("0.85", m1.Confidence); // raw Decimal → decimal.js STRING on the wire (NOT 0.850000…)
        Assert.Null(m2.Confidence);          // NULL → null
    }

    [Fact]
    public async Task List_emits_source_status_enum_strings_and_iso_z_timestamps()
    {
        var approvedAt = new DateTime(2024, 3, 4, 5, 6, 7, DateTimeKind.Unspecified);
        await InsertAsync("m1", School, "EXT1", status: "approved", source: "ai_suggested",
            approvedBy: "admin-9", approvedAt: approvedAt);

        var row = Assert.Single((await Reader().ListAsync(Ctx(), School, 1, 20, 0, null)).Data);

        Assert.Equal("ai_suggested", row.Source);   // native-enum label ::text
        Assert.Equal("approved", row.Status);
        Assert.Equal("admin-9", row.ApprovedBy);
        Assert.Equal("2024-03-04T05:06:07.000Z", row.ApprovedAt);
        Assert.Matches(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$", row.CreatedDate);
        Assert.Matches(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$", row.UpdatedAt);
    }

    [Fact]
    public async Task List_null_approvedAt_reports_null()
    {
        await InsertAsync("m1", School, "EXT1", status: "pending", approvedBy: null, approvedAt: null);

        var row = Assert.Single((await Reader().ListAsync(Ctx(), School, 1, 20, 0, null)).Data);

        Assert.Null(row.ApprovedAt);
        Assert.Null(row.ApprovedBy);
    }

    [Fact]
    public async Task List_computes_totalPages_and_pages()
    {
        for (var i = 0; i < 5; i++)
        {
            await InsertAsync($"m{i}", School, $"EXT{i:00}",
                createdDate: new DateTime(2024, 1, 1 + i, 0, 0, 0, DateTimeKind.Unspecified));
        }

        var page1 = await Reader().ListAsync(Ctx(), School, page: 1, limit: 2, skip: 0, status: null);

        Assert.Equal(5, page1.Total);
        Assert.Equal(3, page1.TotalPages); // ceil(5/2)
        Assert.Equal(2, page1.Data.Count);
        // createdDate DESC → newest (EXT04) first.
        Assert.Equal(["EXT04", "EXT03"], page1.Data.Select(m => m.ExternalCode).ToArray());

        var page3 = await Reader().ListAsync(Ctx(), School, page: 3, limit: 2, skip: 4, status: null);
        Assert.Equal(["EXT00"], page3.Data.Select(m => m.ExternalCode).ToArray());
    }

    // ---- helpers ----

    private DataMappingsReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school-admin", "a@e.st", "Admin"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private async Task InsertAsync(
        string id, string schoolId, string externalCode, string externalSource = "manual",
        string internalCourseId = "course-1", bool isActive = true, decimal? confidence = null,
        string source = "manual", string status = "approved", string? approvedBy = "admin-1",
        DateTime? approvedAt = null, DateTime? createdDate = null)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "data_mappings"
                ("id","schoolId","externalCode","externalName","externalSource","internalCourseId","confidence",
                 "source","status","approvedBy","approvedAt","isActive","createdDate","updatedAt")
            VALUES (@id,@sid,@code,@name,@src,@icid,@conf,@source::"DataMappingSource",@status::"DataMappingStatus",
                    @apprBy,@apprAt,@active,@created,now())
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("sid", schoolId);
        cmd.Parameters.AddWithValue("code", externalCode);
        cmd.Parameters.AddWithValue("name", DBNull.Value);
        cmd.Parameters.AddWithValue("src", externalSource);
        cmd.Parameters.AddWithValue("icid", internalCourseId);
        cmd.Parameters.AddWithValue("conf", (object?)confidence ?? DBNull.Value);
        cmd.Parameters.AddWithValue("source", source);
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("apprBy", (object?)approvedBy ?? DBNull.Value);
        cmd.Parameters.AddWithValue("apprAt", (object?)approvedAt ?? DBNull.Value);
        cmd.Parameters.AddWithValue("active", isActive);
        cmd.Parameters.AddWithValue("created", (object?)createdDate ?? new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }
}
