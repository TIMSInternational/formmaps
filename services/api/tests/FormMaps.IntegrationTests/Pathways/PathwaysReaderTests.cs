using FormMaps.Application.Auth;
using FormMaps.Application.Pathways;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Pathways;
using Npgsql;

namespace FormMaps.IntegrationTests.Pathways;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="PathwaysReader"/> (FM-DOTNET-058). Pins the DB-side contract the pure
/// <c>PathwaysComputer</c> depends on: only isActive=true AND status='active' rows in the caller's school feed the
/// derivation (inactive / draft / other-school rows are excluded), text[] prerequisites round-trip verbatim, an empty
/// catalog is { truncated:false, groups:[] }, and the end-to-end chain shape matches. The exhaustive graph-algorithm
/// parity lives in the pure PathwaysComputerTests; here we prove the wiring + filters.
/// </summary>
public sealed class PathwaysReaderTests : IClassFixture<PathwaysDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private readonly PathwaysDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public PathwaysReaderTests(PathwaysDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("TRUNCATE \"school_courses\"", conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Empty_catalog_is_no_truncation_no_groups()
    {
        var result = await Reader().ComputePathwaysAsync(Ctx(), School);
        Assert.False(result.Truncated);
        Assert.Empty(result.Groups);
    }

    [Fact]
    public async Task Derives_chain_end_to_end()
    {
        await InsertCourseAsync("id-alg1", "ALG1", department: "Mathematics");
        await InsertCourseAsync("id-alg2", "ALG2", department: "Mathematics", prerequisites: ["ALG1"]);

        var result = await Reader().ComputePathwaysAsync(Ctx(), School);

        var group = Assert.Single(result.Groups);
        Assert.Equal("Mathematics", group.Department);
        var chain = Assert.Single(group.Chains);
        Assert.Equal(["ALG1", "ALG2"], chain.Select(c => c.Code));
        Assert.Equal("id-alg1", chain[0].CourseId);
    }

    [Fact]
    public async Task Inactive_draft_and_foreign_rows_are_excluded()
    {
        // The dependent B is present but its would-be root A is excluded by each filter → A never becomes a node, so
        // B has no in-catalog prereq edge feeding a chain. Result: no chains at all.
        await InsertCourseAsync("id-b", "B", prerequisites: ["A"]);
        await InsertCourseAsync("id-a-inactive", "A", isActive: false);       // soft-deleted
        await InsertCourseAsync("id-a-draft", "A2", status: "draft");         // non-active status (distinct code)
        await InsertCourseAsync("id-a-foreign", "A", school: "other-school"); // other school

        var result = await Reader().ComputePathwaysAsync(Ctx(), School);

        Assert.Empty(result.Groups);
    }

    [Fact]
    public async Task Prerequisites_array_roundtrips_verbatim()
    {
        // Multi-element text[] prereqs survive the Npgsql string[] read: PRECALC ⇐ {ALG1, ALG2}, ALG2 ⇐ ALG1.
        await InsertCourseAsync("id-alg1", "ALG1");
        await InsertCourseAsync("id-alg2", "ALG2", prerequisites: ["ALG1"]);
        await InsertCourseAsync("id-precalc", "PRECALC", prerequisites: ["ALG1", "ALG2"]);

        var result = await Reader().ComputePathwaysAsync(Ctx(), School);

        var chain = Assert.Single(Assert.Single(result.Groups).Chains);
        Assert.Equal(["ALG1", "ALG2", "PRECALC"], chain.Select(c => c.Code)); // redundant ALG1→PRECALC edge pruned
    }

    // ---- helpers ----

    private PathwaysReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school-admin", "a@e.st", "Admin"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private async Task InsertCourseAsync(
        string id, string code, string? school = null, string department = "Dept", string[]? prerequisites = null,
        bool isHonors = false, bool isActive = true, string status = "active")
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "school_courses"
                ("id","schoolId","code","name","department","prerequisites","isHonors","isActive","status")
            VALUES (@id,@sid,@code,@code,@dept,@prereqs,@honors,@active,@status)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("sid", school ?? School);
        cmd.Parameters.AddWithValue("code", code);
        cmd.Parameters.AddWithValue("dept", department);
        cmd.Parameters.AddWithValue("prereqs", prerequisites ?? []);
        cmd.Parameters.AddWithValue("honors", isHonors);
        cmd.Parameters.AddWithValue("active", isActive);
        cmd.Parameters.AddWithValue("status", status);
        await cmd.ExecuteNonQueryAsync();
    }
}
