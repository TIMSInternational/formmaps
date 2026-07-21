using FormMaps.Application.Auth;
using FormMaps.Application.Calendar;
using FormMaps.Infrastructure.Calendar;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.Calendar;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="CalendarWriter"/> (FM-DOTNET-048). MUST-PINs: createdBy/
/// updatedBy stay NULL after create + update; terms sortOrder == array index; updateAcademicYear with terms
/// REPLACES; set-current ownership-before-clear (a foreign id must NOT clear the school's current flag);
/// deleteAcademicYear cascades terms + holidays; IDOR (cross-school) returns not-owned; createAssessmentPeriod
/// termId fallback (current-year first term) + no-term -> null; createHolidays AY fallback + no-AY -> null,
/// endDate-not-strictly-after -> null, batch >500 bounded, all-invalid -> count 0.
/// </summary>
public sealed class CalendarWriterTests : IClassFixture<CalendarWriteDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";

    private readonly CalendarWriteDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CalendarWriterTests(CalendarWriteDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        // Truncate children first (or CASCADE) so FK constraints don't block the reset.
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "holidays","academic_terms","assessment_periods","academic_years" CASCADE""", conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---------------------------------------------------------------- academic years

    [Fact]
    public async Task CreateAcademicYear_inserts_year_and_terms_with_sortOrder_index_and_null_actors()
    {
        var input = new CreateAcademicYearInput(
            "2025-2026", D("2025-08-01"), D("2026-06-15"),
            [new AcademicTermInput("Fall", D("2025-08-01"), D("2025-12-20")),
             new AcademicTermInput("Spring", D("2026-01-05"), D("2026-06-15"))]);

        var created = await Writer().CreateAcademicYearAsync(Ctx(), School, input);

        Assert.Equal("2025-2026", created.Name);
        Assert.False(string.IsNullOrEmpty(created.Id));

        // year: createdBy/updatedBy NULL, defaults isCurrent=false / isActive=true.
        await using var conn = await _dataSource.OpenConnectionAsync();
        var (createdBy, updatedBy) = await ActorsAsync(conn, "academic_years", created.Id);
        Assert.Null(createdBy);
        Assert.Null(updatedBy);
        Assert.False(await ScalarBoolAsync(conn, """SELECT "isCurrent" FROM "academic_years" WHERE "id"=@id""", created.Id));
        Assert.True(await ScalarBoolAsync(conn, """SELECT "isActive" FROM "academic_years" WHERE "id"=@id""", created.Id));

        // terms: sortOrder == index, createdBy NULL.
        await using var cmd = new NpgsqlCommand(
            """SELECT "name","sortOrder","createdBy","updatedBy" FROM "academic_terms" WHERE "academicYearId"=@id ORDER BY "sortOrder" """, conn);
        cmd.Parameters.AddWithValue("id", created.Id);
        var terms = new List<(string Name, int Sort, bool CbNull, bool UbNull)>();
        await using (var r = await cmd.ExecuteReaderAsync())
        {
            while (await r.ReadAsync())
            {
                terms.Add((r.GetString(0), r.GetInt32(1), r.IsDBNull(2), r.IsDBNull(3)));
            }
        }

        Assert.Equal(2, terms.Count);
        Assert.Equal(("Fall", 0, true, true), terms[0]);
        Assert.Equal(("Spring", 1, true, true), terms[1]);
    }

    [Fact]
    public async Task SetCurrent_foreign_id_returns_false_and_does_not_clear_existing_current()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedYear(conn, "y-mine", School, "2025-2026", "2025-08-01", isCurrent: true);
        await SeedYear(conn, "y-other", OtherSchool, "2025-2026", "2025-08-01", isCurrent: true);

        // A cross-school (foreign) id: not owned -> false, and the school's current flag stays put.
        var ok = await Writer().SetCurrentAcademicYearAsync(Ctx(), School, "y-other");
        Assert.False(ok);
        Assert.True(await ScalarBoolAsync(conn, """SELECT "isCurrent" FROM "academic_years" WHERE "id"=@id""", "y-mine"));

        // A nonexistent id: same — no destructive partial state.
        var ok2 = await Writer().SetCurrentAcademicYearAsync(Ctx(), School, "does-not-exist");
        Assert.False(ok2);
        Assert.True(await ScalarBoolAsync(conn, """SELECT "isCurrent" FROM "academic_years" WHERE "id"=@id""", "y-mine"));
    }

    [Fact]
    public async Task SetCurrent_owned_id_clears_others_and_sets_target()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedYear(conn, "y-old", School, "2024-2025", "2024-08-01", isCurrent: true);
        await SeedYear(conn, "y-new", School, "2025-2026", "2025-08-01", isCurrent: false);

        var ok = await Writer().SetCurrentAcademicYearAsync(Ctx(), School, "y-new");

        Assert.True(ok);
        Assert.False(await ScalarBoolAsync(conn, """SELECT "isCurrent" FROM "academic_years" WHERE "id"=@id""", "y-old"));
        Assert.True(await ScalarBoolAsync(conn, """SELECT "isCurrent" FROM "academic_years" WHERE "id"=@id""", "y-new"));
    }

    [Fact]
    public async Task DeleteAcademicYear_cascades_terms_and_holidays()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedYear(conn, "y-1", School, "2025-2026", "2025-08-01");
        await SeedTerm(conn, "t-1", "y-1", "Fall", 0);
        await SeedHoliday(conn, "h-1", School, "y-1", "2025-12-25");

        var deleted = await Writer().DeleteAcademicYearAsync(Ctx(), School, "y-1");

        Assert.True(deleted);
        Assert.Equal(0L, await CountAsync(conn, "academic_years"));
        Assert.Equal(0L, await CountAsync(conn, "academic_terms"));
        Assert.Equal(0L, await CountAsync(conn, "holidays")); // cascaded via FK ON DELETE CASCADE
    }

    [Fact]
    public async Task DeleteAcademicYear_cross_school_returns_false_and_keeps_row()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedYear(conn, "y-other", OtherSchool, "2025-2026", "2025-08-01");

        var deleted = await Writer().DeleteAcademicYearAsync(Ctx(), School, "y-other"); // IDOR

        Assert.False(deleted);
        Assert.Equal(1L, await CountAsync(conn, "academic_years"));
    }

    [Fact]
    public async Task UpdateAcademicYear_patches_name_only_and_keeps_null_actors()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedYear(conn, "y-1", School, "Old Name", "2025-08-01");

        var input = new UpdateAcademicYearInput("New Name", false, default, false, default, false, []);
        var ok = await Writer().UpdateAcademicYearAsync(Ctx(), School, "y-1", input);

        Assert.True(ok);
        Assert.Equal("New Name", await ScalarStringAsync(conn, """SELECT "name" FROM "academic_years" WHERE "id"=@id""", "y-1"));
        var (createdBy, updatedBy) = await ActorsAsync(conn, "academic_years", "y-1");
        Assert.Null(createdBy);
        Assert.Null(updatedBy); // update does NOT populate updatedBy (parity)
    }

    [Fact]
    public async Task UpdateAcademicYear_with_terms_replaces_all()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedYear(conn, "y-1", School, "2025-2026", "2025-08-01");
        await SeedTerm(conn, "t-old", "y-1", "Old", 0);

        var input = new UpdateAcademicYearInput(
            null, false, default, false, default,
            HasTerms: true,
            Terms: [new AcademicTermInput("Q1", D("2025-08-01"), D("2025-10-01")),
                    new AcademicTermInput("Q2", D("2025-10-02"), D("2025-12-01"))]);

        var ok = await Writer().UpdateAcademicYearAsync(Ctx(), School, "y-1", input);

        Assert.True(ok);
        await using var cmd = new NpgsqlCommand(
            """SELECT "name","sortOrder" FROM "academic_terms" WHERE "academicYearId"=@id ORDER BY "sortOrder" """, conn);
        cmd.Parameters.AddWithValue("id", "y-1");
        var names = new List<string>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            names.Add($"{r.GetString(0)}:{r.GetInt32(1)}");
        }

        Assert.Equal(new[] { "Q1:0", "Q2:1" }, names.ToArray()); // old gone, new present, index sortOrder
    }

    [Fact]
    public async Task UpdateAcademicYear_cross_school_returns_false()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedYear(conn, "y-other", OtherSchool, "2025-2026", "2025-08-01");

        var ok = await Writer().UpdateAcademicYearAsync(
            Ctx(), School, "y-other", new UpdateAcademicYearInput("x", false, default, false, default, false, []));

        Assert.False(ok);
        Assert.Equal("2025-2026", await ScalarStringAsync(conn, """SELECT "name" FROM "academic_years" WHERE "id"=@id""", "y-other"));
    }

    // ---------------------------------------------------------------- assessment periods

    [Fact]
    public async Task CreateAssessmentPeriod_uses_explicit_termId_and_null_actors()
    {
        var input = new CreateAssessmentPeriodInput("term-explicit", "Window", D("2025-01-01"), D("2025-02-01"), ["PCA", "MIL"]);

        var created = await Writer().CreateAssessmentPeriodAsync(Ctx(), School, input);

        Assert.NotNull(created);
        await using var conn = await _dataSource.OpenConnectionAsync();
        Assert.Equal("term-explicit", await ScalarStringAsync(conn, """SELECT "termId" FROM "assessment_periods" WHERE "id"=@id""", created!.Id));
        var (createdBy, updatedBy) = await ActorsAsync(conn, "assessment_periods", created.Id);
        Assert.Null(createdBy);
        Assert.Null(updatedBy);
    }

    [Fact]
    public async Task CreateAssessmentPeriod_falls_back_to_current_year_first_term()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedYear(conn, "y-cur", School, "2025-2026", "2025-08-01", isCurrent: true);
        // Deterministic first term by (createdDate, id): "t-first" created earlier.
        await SeedTerm(conn, "t-first", "y-cur", "Fall", 0, createdDate: "2025-01-01T00:00:00");
        await SeedTerm(conn, "t-second", "y-cur", "Spring", 1, createdDate: "2025-01-02T00:00:00");

        var created = await Writer().CreateAssessmentPeriodAsync(
            Ctx(), School, new CreateAssessmentPeriodInput(null, "Window", D("2025-01-01"), D("2025-02-01"), []));

        Assert.NotNull(created);
        Assert.Equal("t-first", await ScalarStringAsync(conn, """SELECT "termId" FROM "assessment_periods" WHERE "id"=@id""", created!.Id));
    }

    [Fact]
    public async Task CreateAssessmentPeriod_no_term_returns_null()
    {
        // No current year / no terms -> no fallback termId -> null (endpoint 400s).
        var created = await Writer().CreateAssessmentPeriodAsync(
            Ctx(), School, new CreateAssessmentPeriodInput(null, "Window", D("2025-01-01"), D("2025-02-01"), []));

        Assert.Null(created);
    }

    [Fact]
    public async Task DeleteAssessmentPeriod_cross_school_returns_false()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedPeriod(conn, "p-other", OtherSchool, "2025-01-01");

        var deleted = await Writer().DeleteAssessmentPeriodAsync(Ctx(), School, "p-other");

        Assert.False(deleted);
        Assert.Equal(1L, await CountAsync(conn, "assessment_periods"));
    }

    [Fact]
    public async Task UpdateAssessmentPeriod_patches_and_keeps_untouched_fields()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedPeriod(conn, "p-1", School, "2025-01-01", termId: "term-orig", name: "Orig");

        // Only name provided -> termId preserved (nullish keep), name updated.
        var input = new UpdateAssessmentPeriodInput(false, null, "Renamed", false, default, false, default, false, []);
        var ok = await Writer().UpdateAssessmentPeriodAsync(Ctx(), School, "p-1", input);

        Assert.True(ok);
        Assert.Equal("Renamed", await ScalarStringAsync(conn, """SELECT "name" FROM "assessment_periods" WHERE "id"=@id""", "p-1"));
        Assert.Equal("term-orig", await ScalarStringAsync(conn, """SELECT "termId" FROM "assessment_periods" WHERE "id"=@id""", "p-1"));
    }

    [Fact]
    public async Task UpdateAssessmentPeriod_cross_school_returns_false()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedPeriod(conn, "p-other", OtherSchool, "2025-01-01");

        var ok = await Writer().UpdateAssessmentPeriodAsync(
            Ctx(), School, "p-other", new UpdateAssessmentPeriodInput(false, null, "x", false, default, false, default, false, []));

        Assert.False(ok);
    }

    // ---------------------------------------------------------------- holidays

    [Fact]
    public async Task CreateHolidays_no_academic_year_returns_null()
    {
        var count = await Writer().CreateHolidaysAsync(
            Ctx(), School, [new HolidayInputDto("Xmas", "2025-12-25", null, "holiday")]);

        Assert.Null(count); // endpoint 400s
    }

    [Fact]
    public async Task CreateHolidays_uses_current_year_and_inserts_valid_only()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedYear(conn, "y-cur", School, "2025-2026", "2025-08-01", isCurrent: true);

        var count = await Writer().CreateHolidaysAsync(Ctx(), School,
        [
            new HolidayInputDto("Xmas", "2025-12-25", "2025-12-26", "holiday"),  // valid, multi-day
            new HolidayInputDto("  ", "2025-11-01", null, null),                 // whitespace name -> dropped
            new HolidayInputDto("Bad date", "not-a-date", null, null),           // invalid date -> dropped
        ]);

        Assert.Equal(1, count); // only the one valid holiday survives normalization
        Assert.Equal(1L, await CountAsync(conn, "holidays"));
    }

    [Fact]
    public async Task CreateHolidays_falls_back_to_latest_year_when_no_current()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedYear(conn, "y-old", School, "2023", "2023-08-01", isCurrent: false);
        await SeedYear(conn, "y-newest", School, "2025", "2025-08-01", isCurrent: false);

        var count = await Writer().CreateHolidaysAsync(
            Ctx(), School, [new HolidayInputDto("Xmas", "2025-12-25", null, "holiday")]);

        Assert.Equal(1, count);
        var ayId = await ScalarStringAsync(conn, """SELECT "academicYearId" FROM "holidays" LIMIT 1""");
        Assert.Equal("y-newest", ayId); // latest by startDate DESC
    }

    [Fact]
    public async Task CreateHolidays_endDate_not_strictly_after_collapses_to_null()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedYear(conn, "y-cur", School, "2025-2026", "2025-08-01", isCurrent: true);

        var count = await Writer().CreateHolidaysAsync(Ctx(), School,
        [
            new HolidayInputDto("Same day", "2025-12-25", "2025-12-25", null), // endDate == date -> null
            new HolidayInputDto("Before", "2025-12-25", "2025-12-20", null),   // endDate < date -> null
        ]);

        Assert.Equal(2, count);
        await using var cmd = new NpgsqlCommand("""SELECT COUNT(*) FROM "holidays" WHERE "endDate" IS NULL""", conn);
        Assert.Equal(2L, (long)(await cmd.ExecuteScalarAsync())!);
    }

    [Fact]
    public async Task CreateHolidays_all_invalid_returns_zero_and_inserts_nothing()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedYear(conn, "y-cur", School, "2025-2026", "2025-08-01", isCurrent: true);

        var count = await Writer().CreateHolidaysAsync(Ctx(), School,
        [
            new HolidayInputDto("", "2025-12-25", null, null),        // empty name
            new HolidayInputDto("X", "bad", null, null),             // bad date
            new HolidayInputDto(null, null, null, null),             // nothing
        ]);

        Assert.Equal(0, count); // still success, no rows
        Assert.Equal(0L, await CountAsync(conn, "holidays"));
    }

    [Fact]
    public async Task CreateHolidays_batch_bounded_to_500()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedYear(conn, "y-cur", School, "2025-2026", "2025-08-01", isCurrent: true);

        var many = new List<HolidayInputDto>();
        for (var i = 0; i < 600; i++)
        {
            many.Add(new HolidayInputDto($"H{i}", "2025-12-25", null, "holiday"));
        }

        var count = await Writer().CreateHolidaysAsync(Ctx(), School, many);

        Assert.Equal(500, count); // first 500 only
        Assert.Equal(500L, await CountAsync(conn, "holidays"));
    }

    [Fact]
    public async Task DeleteHoliday_cross_school_returns_false()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedYear(conn, "y-1", OtherSchool, "2025-2026", "2025-08-01");
        await SeedHoliday(conn, "h-other", OtherSchool, "y-1", "2025-12-25");

        var deleted = await Writer().DeleteHolidayAsync(Ctx(), School, "h-other"); // IDOR

        Assert.False(deleted);
        Assert.Equal(1L, await CountAsync(conn, "holidays"));
    }

    [Fact]
    public async Task DeleteHoliday_owned_hard_deletes()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedYear(conn, "y-1", School, "2025-2026", "2025-08-01");
        await SeedHoliday(conn, "h-1", School, "y-1", "2025-12-25");

        var deleted = await Writer().DeleteHolidayAsync(Ctx(), School, "h-1");

        Assert.True(deleted);
        Assert.Equal(0L, await CountAsync(conn, "holidays"));
    }

    // ---------------------------------------------------------------- helpers

    private CalendarWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school-admin", "a@e.st", "Admin"),
            schoolId: School, permissions: new[] { "calendar:manage" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static DateTime D(string date) => DateTime.SpecifyKind(DateTime.Parse(date), DateTimeKind.Unspecified);

    private static async Task<long> CountAsync(NpgsqlConnection conn, string table)
    {
        await using var cmd = new NpgsqlCommand($"""SELECT COUNT(*) FROM "{table}" """, conn);
        return (long)(await cmd.ExecuteScalarAsync())!;
    }

    private static async Task<bool> ScalarBoolAsync(NpgsqlConnection conn, string sql, string id)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", id);
        return (bool)(await cmd.ExecuteScalarAsync())!;
    }

    private static async Task<string?> ScalarStringAsync(NpgsqlConnection conn, string sql, string? id = null)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        if (id is not null)
        {
            cmd.Parameters.AddWithValue("id", id);
        }

        var value = await cmd.ExecuteScalarAsync();
        return value as string;
    }

    private static async Task<(string? CreatedBy, string? UpdatedBy)> ActorsAsync(NpgsqlConnection conn, string table, string id)
    {
        await using var cmd = new NpgsqlCommand($"""SELECT "createdBy","updatedBy" FROM "{table}" WHERE "id"=@id""", conn);
        cmd.Parameters.AddWithValue("id", id);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (reader.IsDBNull(0) ? null : reader.GetString(0), reader.IsDBNull(1) ? null : reader.GetString(1));
    }

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
        NpgsqlConnection conn, string id, string academicYearId, string name, int sortOrder,
        bool isActive = true, string? createdDate = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "academic_terms" ("id","academicYearId","name","startDate","endDate","sortOrder","isActive","createdDate")
            VALUES (@id,@y,@n,@sd,@ed,@so,@a,@cd)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("y", academicYearId);
        cmd.Parameters.AddWithValue("n", name);
        cmd.Parameters.AddWithValue("sd", DateTime.Parse("2025-08-01"));
        cmd.Parameters.AddWithValue("ed", DateTime.Parse("2025-12-01"));
        cmd.Parameters.AddWithValue("so", sortOrder);
        cmd.Parameters.AddWithValue("a", isActive);
        cmd.Parameters.AddWithValue("cd", DateTime.Parse(createdDate ?? "2025-01-01T00:00:00"));
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedPeriod(
        NpgsqlConnection conn, string id, string schoolId, string startDate, string termId = "term-1", string name = "Period")
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "assessment_periods" ("id","schoolId","termId","name","startDate","endDate","assessmentTypes")
            VALUES (@id,@s,@t,@n,@sd,@ed,@at)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("t", termId);
        cmd.Parameters.AddWithValue("n", name);
        cmd.Parameters.AddWithValue("sd", DateTime.Parse(startDate));
        cmd.Parameters.AddWithValue("ed", DateTime.Parse(startDate).AddMonths(1));
        cmd.Parameters.AddWithValue("at", Array.Empty<string>());
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedHoliday(
        NpgsqlConnection conn, string id, string schoolId, string academicYearId, string date)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "holidays" ("id","schoolId","academicYearId","name","date")
            VALUES (@id,@s,@y,@n,@d)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("y", academicYearId);
        cmd.Parameters.AddWithValue("n", "Holiday");
        cmd.Parameters.AddWithValue("d", DateTime.Parse(date));
        await cmd.ExecuteNonQueryAsync();
    }
}
