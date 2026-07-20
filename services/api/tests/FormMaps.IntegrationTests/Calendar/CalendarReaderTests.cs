using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Calendar;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.Calendar;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="CalendarReader"/>: academic-years (startDate DESC + nested
/// isActive terms sortOrder ASC), the assessment-periods GATE quirk (param / current-year / neither -> []),
/// text[] assessmentTypes, holidays (date ASC + nullable endDate), isActive filtering, school-scoping.
/// </summary>
public sealed class CalendarReaderTests : IClassFixture<CalendarDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";

    private readonly CalendarDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CalendarReaderTests(CalendarDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "academic_years","academic_terms","assessment_periods","holidays" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- academic-years ----

    [Fact]
    public async Task AcademicYears_ordered_startDate_desc_with_nested_active_terms_sortOrder_asc()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedYear(conn, "y-2024", School, "2024-2025", "2024-08-01", isCurrent: false);
        await SeedYear(conn, "y-2025", School, "2025-2026", "2025-08-01", isCurrent: true);
        await SeedYear(conn, "y-other", OtherSchool, "2025-2026", "2025-08-01"); // other school — excluded
        await SeedYear(conn, "y-inactive", School, "old", "2020-08-01", isActive: false); // inactive — excluded
        await SeedTerm(conn, "t-2", "y-2025", "Spring", sortOrder: 2);
        await SeedTerm(conn, "t-1", "y-2025", "Fall", sortOrder: 1);
        await SeedTerm(conn, "t-x", "y-2025", "Dropped", sortOrder: 3, isActive: false); // inactive term — excluded

        var years = await Reader().GetAcademicYearsAsync(Ctx(), School);

        Assert.Equal(2, years.Count);
        Assert.Equal("y-2025", years[0].Id); // startDate DESC
        Assert.Equal("y-2024", years[1].Id);
        Assert.True(years[0].IsCurrent);
        // nested terms: only active, sortOrder ASC
        Assert.Equal(new[] { "t-1", "t-2" }, years[0].Terms.Select(t => t.Id).ToArray());
        Assert.Empty(years[1].Terms);
        // ISO-Z timestamps
        Assert.EndsWith("Z", years[0].StartDate);
        Assert.EndsWith("Z", years[0].Terms[0].CreatedDate);
    }

    [Fact]
    public async Task AcademicYears_empty_when_none()
    {
        Assert.Empty(await Reader().GetAcademicYearsAsync(Ctx(), School));
    }

    // ---- assessment-periods (the GATE quirk) ----

    [Fact]
    public async Task AssessmentPeriods_with_explicit_year_param_returns_all_active_periods()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        // No current year exists — but an explicit param bypasses the current-year lookup.
        await SeedPeriod(conn, "p-2", School, "2025-02-01", new[] { "PCA" });
        await SeedPeriod(conn, "p-1", School, "2025-01-01", new[] { "MIL", "360" });
        await SeedPeriod(conn, "p-x", School, "2025-03-01", new[] { "PCA" }, isActive: false); // excluded

        var periods = await Reader().GetAssessmentPeriodsAsync(Ctx(), School, "any-year-id");

        Assert.Equal(new[] { "p-1", "p-2" }, periods.Select(p => p.Id).ToArray()); // startDate ASC
        Assert.Equal(new[] { "MIL", "360" }, periods[0].AssessmentTypes.ToArray()); // text[] passthrough
    }

    [Fact]
    public async Task AssessmentPeriods_no_param_uses_current_year_gate_and_returns_all()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedYear(conn, "y-cur", School, "2025-2026", "2025-08-01", isCurrent: true);
        await SeedPeriod(conn, "p-1", School, "2025-01-01", new[] { "PCA" });

        var periods = await Reader().GetAssessmentPeriodsAsync(Ctx(), School, null);

        Assert.Single(periods);
        Assert.Equal("p-1", periods[0].Id);
    }

    [Fact]
    public async Task AssessmentPeriods_no_param_no_current_year_returns_empty()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        // A NON-current year exists + a period exists, but with no param AND no current year the gate short-circuits to [].
        await SeedYear(conn, "y-old", School, "2024-2025", "2024-08-01", isCurrent: false);
        await SeedPeriod(conn, "p-1", School, "2025-01-01", new[] { "PCA" });

        var periods = await Reader().GetAssessmentPeriodsAsync(Ctx(), School, null);

        Assert.Empty(periods);
    }

    [Fact]
    public async Task AssessmentPeriods_empty_array_types_default()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedPeriod(conn, "p-1", School, "2025-01-01", Array.Empty<string>());

        var periods = await Reader().GetAssessmentPeriodsAsync(Ctx(), School, "y");

        Assert.Single(periods);
        Assert.Empty(periods[0].AssessmentTypes);
    }

    // ---- holidays ----

    [Fact]
    public async Task Holidays_ordered_date_asc_with_nullable_endDate()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedHoliday(conn, "h-2", School, "2025-12-25", endDate: null);
        await SeedHoliday(conn, "h-1", School, "2025-11-27", endDate: "2025-11-28");
        await SeedHoliday(conn, "h-other", OtherSchool, "2025-01-01", endDate: null); // excluded
        await SeedHoliday(conn, "h-x", School, "2025-01-01", endDate: null, isActive: false); // excluded

        var holidays = await Reader().GetHolidaysAsync(Ctx(), School);

        Assert.Equal(new[] { "h-1", "h-2" }, holidays.Select(h => h.Id).ToArray()); // date ASC
        Assert.NotNull(holidays[0].EndDate);
        Assert.Null(holidays[1].EndDate); // nullable endDate -> null, not ""
    }

    // ---- helpers ----

    private CalendarReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school-admin", "admin@e.st", "Admin"),
            schoolId: School, permissions: new[] { "calendar:manage" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task SeedYear(
        NpgsqlConnection conn, string id, string schoolId, string name, string startDate,
        bool isCurrent = false, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "academic_years" ("id","schoolId","name","startDate","endDate","isCurrent","isActive")
            VALUES (@id,@s,@n,@sd,@ed,@c,@a)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("n", name);
        cmd.Parameters.AddWithValue("sd", DateTime.Parse(startDate));
        cmd.Parameters.AddWithValue("ed", DateTime.Parse(startDate).AddMonths(10));
        cmd.Parameters.AddWithValue("c", isCurrent);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedTerm(
        NpgsqlConnection conn, string id, string academicYearId, string name, int sortOrder, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "academic_terms" ("id","academicYearId","name","startDate","endDate","sortOrder","isActive")
            VALUES (@id,@y,@n,@sd,@ed,@so,@a)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("y", academicYearId);
        cmd.Parameters.AddWithValue("n", name);
        cmd.Parameters.AddWithValue("sd", DateTime.Parse("2025-08-01"));
        cmd.Parameters.AddWithValue("ed", DateTime.Parse("2025-12-01"));
        cmd.Parameters.AddWithValue("so", sortOrder);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedPeriod(
        NpgsqlConnection conn, string id, string schoolId, string startDate, string[] assessmentTypes, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "assessment_periods" ("id","schoolId","termId","name","startDate","endDate","assessmentTypes","isActive")
            VALUES (@id,@s,@t,@n,@sd,@ed,@at,@a)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("t", "term-1");
        cmd.Parameters.AddWithValue("n", "Period");
        cmd.Parameters.AddWithValue("sd", DateTime.Parse(startDate));
        cmd.Parameters.AddWithValue("ed", DateTime.Parse(startDate).AddMonths(1));
        cmd.Parameters.AddWithValue("at", assessmentTypes);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedHoliday(
        NpgsqlConnection conn, string id, string schoolId, string date, string? endDate, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "holidays" ("id","schoolId","academicYearId","name","date","endDate","isActive")
            VALUES (@id,@s,@y,@n,@d,@ed,@a)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("y", "y-1");
        cmd.Parameters.AddWithValue("n", "Holiday");
        cmd.Parameters.AddWithValue("d", DateTime.Parse(date));
        cmd.Parameters.AddWithValue("ed", (object?)(endDate is null ? null : DateTime.Parse(endDate)) ?? DBNull.Value);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }
}
