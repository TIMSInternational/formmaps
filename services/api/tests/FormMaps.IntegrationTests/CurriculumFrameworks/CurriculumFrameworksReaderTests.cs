using FormMaps.Application.Auth;
using FormMaps.Infrastructure.CurriculumFrameworks;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.CurriculumFrameworks;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC container tz) tests for <see cref="CurriculumFrameworksReader"/> (FM-DOTNET-055).
/// Pins listFrameworks: the four FIXED types always present in order; a type with NO row reports HasRow=false (the
/// endpoint then omits id+configuredAt) with enabled=false; a type with a row reports id/configuredAt/enabled; the
/// courseCount comes from a GLOBAL framework_courses count (grouped by frameworkType, isActive). Pins
/// listFrameworkCourses: GLOBAL (no school), raw case-sensitive frameworkType, name|code search, code-ASC + id
/// tie-break, credits as a decimal.js STRING (trim_scale::text), gradeLevels int[], and totalPages.
/// </summary>
public sealed class CurriculumFrameworksReaderTests
    : IClassFixture<CurriculumFrameworksDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";

    private readonly CurriculumFrameworksDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CurriculumFrameworksReaderTests(CurriculumFrameworksDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "curriculum_frameworks","framework_courses","school_framework_course_overrides" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- listFrameworks ----

    [Fact]
    public async Task ListFrameworks_returns_four_fixed_types_in_order()
    {
        var result = await Reader().ListFrameworksAsync(Ctx(), School);

        Assert.Equal(["AP", "IB", "NATIONAL", "CUSTOM"], result.Select(f => f.Type).ToArray());
    }

    [Fact]
    public async Task ListFrameworks_missing_type_has_no_row_and_disabled()
    {
        // No curriculum_frameworks rows at all → every type HasRow=false, enabled=false.
        var result = await Reader().ListFrameworksAsync(Ctx(), School);

        Assert.All(result, f =>
        {
            Assert.False(f.HasRow);
            Assert.Null(f.Id);
            Assert.Null(f.ConfiguredAt);
            Assert.False(f.Enabled);
        });
    }

    [Fact]
    public async Task ListFrameworks_existing_row_has_id_configuredAt_enabled()
    {
        await InsertFrameworkAsync("fw-ap", School, "AP", enabled: true, configuredAt: new DateTime(2024, 3, 4, 5, 6, 7, DateTimeKind.Unspecified));

        var result = await Reader().ListFrameworksAsync(Ctx(), School);
        var ap = result.Single(f => f.Type == "AP");

        Assert.True(ap.HasRow);
        Assert.Equal("fw-ap", ap.Id);
        Assert.True(ap.Enabled);
        Assert.Equal("2024-03-04T05:06:07.000Z", ap.ConfiguredAt);
    }

    [Fact]
    public async Task ListFrameworks_row_with_null_configuredAt_reports_null()
    {
        await InsertFrameworkAsync("fw-ib", School, "IB", enabled: false, configuredAt: null);

        var result = await Reader().ListFrameworksAsync(Ctx(), School);
        var ib = result.Single(f => f.Type == "IB");

        Assert.True(ib.HasRow);
        Assert.Null(ib.ConfiguredAt); // present-with-null (row exists) — endpoint emits configuredAt: null
        Assert.False(ib.Enabled);
    }

    [Fact]
    public async Task ListFrameworks_courseCount_is_global_and_ignores_inactive()
    {
        // Global count grouped by frameworkType (isActive). NOT school-scoped: a course with a DIFFERENT school still counts.
        await InsertCourseAsync("c1", "AP", "AP101", schoolId: "other-school");
        await InsertCourseAsync("c2", "AP", "AP102", schoolId: null);
        await InsertCourseAsync("c3", "AP", "AP103", isActive: false); // excluded
        await InsertCourseAsync("c4", "IB", "IB101");

        var result = await Reader().ListFrameworksAsync(Ctx(), School);

        Assert.Equal(2, result.Single(f => f.Type == "AP").CourseCount);
        Assert.Equal(1, result.Single(f => f.Type == "IB").CourseCount);
        Assert.Equal(0, result.Single(f => f.Type == "NATIONAL").CourseCount);
    }

    // ---- listFrameworkCourses ----

    [Fact]
    public async Task ListFrameworkCourses_is_global_and_case_sensitive_on_type()
    {
        await InsertCourseAsync("c1", "AP", "AP101");
        await InsertCourseAsync("c2", "ap", "AP102"); // lowercase type — must NOT match "AP"

        var page = await Reader().ListFrameworkCoursesAsync(Ctx(), "AP", page: 1, limit: 50, skip: 0, search: null);

        Assert.Equal(1, page.Total);
        Assert.Equal("AP101", page.Data.Single().Code);
    }

    [Fact]
    public async Task ListFrameworkCourses_orders_by_code_ascending()
    {
        // (frameworkType, code) is UNIQUE, so code ASC fully determines order (the id-ASC tie-break in the reader is
        // a faithful no-op belt-and-braces — a duplicate code cannot exist). Insert out of order to prove sorting.
        await InsertCourseAsync("c-b", "AP", "CCC", name: "Gamma");
        await InsertCourseAsync("c-a", "AP", "AAA", name: "Alpha");
        await InsertCourseAsync("c-c", "AP", "BBB", name: "Beta");

        var page = await Reader().ListFrameworkCoursesAsync(Ctx(), "AP", page: 1, limit: 50, skip: 0, search: null);

        Assert.Equal(["AAA", "BBB", "CCC"], page.Data.Select(r => r.Code).ToArray());
    }

    [Fact]
    public async Task ListFrameworkCourses_search_matches_name_or_code_case_insensitive()
    {
        await InsertCourseAsync("c1", "AP", "CALC101", name: "Calculus");
        await InsertCourseAsync("c2", "AP", "BIO101", name: "Biology");

        var byName = await Reader().ListFrameworkCoursesAsync(Ctx(), "AP", 1, 50, 0, "calc");
        var byCode = await Reader().ListFrameworkCoursesAsync(Ctx(), "AP", 1, 50, 0, "bio101");

        Assert.Equal("CALC101", Assert.Single(byName.Data).Code);
        Assert.Equal("BIO101", Assert.Single(byCode.Data).Code);
    }

    [Fact]
    public async Task ListFrameworkCourses_emits_credits_as_number_and_gradeLevels_array()
    {
        await InsertCourseAsync("c1", "AP", "AP101", credits: 4.5m, gradeLevels: [11, 12]);

        var row = Assert.Single((await Reader().ListFrameworkCoursesAsync(Ctx(), "AP", 1, 50, 0, null)).Data);

        Assert.Equal("4.5", row.Credits);   // raw Decimal → decimal.js string on the wire
        Assert.Equal([11, 12], row.GradeLevels);
    }

    [Fact]
    public async Task ListFrameworkCourses_computes_totalPages_and_pages()
    {
        for (var i = 0; i < 5; i++)
        {
            await InsertCourseAsync($"c{i}", "AP", $"AP{i:00}");
        }

        var page1 = await Reader().ListFrameworkCoursesAsync(Ctx(), "AP", page: 1, limit: 2, skip: 0, search: null);

        Assert.Equal(5, page1.Total);
        Assert.Equal(3, page1.TotalPages); // ceil(5/2)
        Assert.Equal(2, page1.Data.Count);
        Assert.Equal(["AP00", "AP01"], page1.Data.Select(r => r.Code).ToArray());

        var page3 = await Reader().ListFrameworkCoursesAsync(Ctx(), "AP", page: 3, limit: 2, skip: 4, search: null);
        Assert.Equal(["AP04"], page3.Data.Select(r => r.Code).ToArray());
    }

    // ---- helpers ----

    private CurriculumFrameworksReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school-admin", "a@e.st", "Admin"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private async Task InsertFrameworkAsync(string id, string schoolId, string type, bool enabled, DateTime? configuredAt)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "curriculum_frameworks" ("id","schoolId","type","enabled","configuredAt","updatedAt")
            VALUES (@id,@sid,@type,@enabled,@ca,now())
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("sid", schoolId);
        cmd.Parameters.AddWithValue("type", type);
        cmd.Parameters.AddWithValue("enabled", enabled);
        cmd.Parameters.AddWithValue("ca", (object?)configuredAt ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task InsertCourseAsync(
        string id, string frameworkType, string code, string name = "Course", string? schoolId = null,
        bool isActive = true, decimal credits = 0m, int[]? gradeLevels = null)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "framework_courses"
                ("id","frameworkType","code","name","credits","gradeLevels","schoolId","isActive","updatedAt")
            VALUES (@id,@ft,@code,@name,@credits,@grades,@sid,@active,now())
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("ft", frameworkType);
        cmd.Parameters.AddWithValue("code", code);
        cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.AddWithValue("credits", credits);
        cmd.Parameters.AddWithValue("grades", (object?)(gradeLevels ?? []) ?? DBNull.Value);
        cmd.Parameters.AddWithValue("sid", (object?)schoolId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("active", isActive);
        await cmd.ExecuteNonQueryAsync();
    }
}
