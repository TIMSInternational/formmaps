using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolCourses;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolCourses;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC container tz) tests for <see cref="SchoolCoursesWriter"/> (FM-DOTNET-054). Pins
/// createCourse: returns { id, code } + persists; the legacy `||` defaults (department ""/credits 0/arrays []/
/// maxEnrollment null/isHonors false; frameworkType/description nullable passthrough); DB defaults (status 'active',
/// isActive true) and createdBy/updatedBy NULL; the (schoolId, code) unique violation → Duplicate; and the missing/
/// non-string code NOT-NULL path (throws — the route maps it to 500).
/// </summary>
public sealed class SchoolCoursesWriterTests : IClassFixture<SchoolCoursesDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";

    private readonly SchoolCoursesDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public SchoolCoursesWriterTests(SchoolCoursesDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "school_courses" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Create_returns_id_and_code_and_persists_full_body()
    {
        var body = Body("""
            {"code":"MATH301","name":"Calculus","department":"Mathematics","credits":3.5,
             "gradeLevels":[11,12],"prerequisites":["MATH201"],"corequisites":["PHYS201"],
             "frameworkType":"AP","description":"AP Calc","maxEnrollment":30,"isHonors":true}
            """);

        var result = await Writer().CreateCourseAsync(Ctx(), School, body);

        Assert.False(result.Duplicate);
        Assert.NotNull(result.Id);
        Assert.Equal("MATH301", result.Code);

        var row = await ReadCourse(result.Id!);
        Assert.Equal(School, row.SchoolId);
        Assert.Equal("Mathematics", row.Department);
        Assert.Equal(3.5m, row.Credits);
        Assert.Equal(new[] { 11, 12 }, row.GradeLevels);
        Assert.Equal(new[] { "MATH201" }, row.Prerequisites);
        Assert.Equal(new[] { "PHYS201" }, row.Corequisites);
        Assert.Equal("AP", row.FrameworkType);
        Assert.Equal("AP Calc", row.Description);
        Assert.Equal(30, row.MaxEnrollment);
        Assert.True(row.IsHonors);
        // DB defaults + NULL audit columns.
        Assert.Equal("active", row.Status);
        Assert.True(row.IsActive);
        Assert.Null(row.CreatedBy);
        Assert.Null(row.UpdatedBy);
    }

    [Fact]
    public async Task Create_applies_or_defaults_on_minimal_body()
    {
        var result = await Writer().CreateCourseAsync(Ctx(), School, Body("""{"code":"C1","name":"One"}"""));

        Assert.False(result.Duplicate);
        var row = await ReadCourse(result.Id!);
        Assert.Equal("", row.Department);              // || ''
        Assert.Equal(0m, row.Credits);                 // || 0
        Assert.Empty(row.GradeLevels);                 // || []
        Assert.Empty(row.Prerequisites);               // || []
        Assert.Empty(row.Corequisites);                // || []
        Assert.Null(row.FrameworkType);                // nullable, no default
        Assert.Null(row.Description);                  // nullable, no default
        Assert.Null(row.MaxEnrollment);                // || null
        Assert.False(row.IsHonors);                    // || false
    }

    [Fact]
    public async Task Create_credits_zero_and_maxEnrollment_zero_fall_to_defaults()
    {
        var result = await Writer().CreateCourseAsync(Ctx(), School, Body("""{"code":"C1","name":"One","credits":0,"maxEnrollment":0}"""));

        var row = await ReadCourse(result.Id!);
        Assert.Equal(0m, row.Credits);        // 0 || 0 → 0
        Assert.Null(row.MaxEnrollment);       // 0 || null → null (0 is falsy)
    }

    [Fact]
    public async Task Create_duplicate_schoolId_code_returns_duplicate()
    {
        await Writer().CreateCourseAsync(Ctx(), School, Body("""{"code":"DUP","name":"First"}"""));

        var result = await Writer().CreateCourseAsync(Ctx(), School, Body("""{"code":"DUP","name":"Second"}"""));

        Assert.True(result.Duplicate);
        Assert.Null(result.Id);
        Assert.Null(result.Code);
        // The first row is still the only one.
        Assert.Equal(1, await CountCourses());
    }

    [Fact]
    public async Task Create_same_code_different_school_is_allowed()
    {
        await Writer().CreateCourseAsync(Ctx(), School, Body("""{"code":"SHARED","name":"A"}"""));

        var result = await Writer().CreateCourseAsync(Ctx("school-2"), "school-2", Body("""{"code":"SHARED","name":"B"}"""));

        Assert.False(result.Duplicate);
        Assert.Equal(2, await CountCourses());
    }

    [Fact]
    public async Task Create_missing_code_hits_not_null_path_and_throws()
    {
        // code is String NOT NULL, no app validation → DBNull binding → NOT-NULL violation (the route maps → 500).
        await Assert.ThrowsAsync<PostgresException>(() =>
            Writer().CreateCourseAsync(Ctx(), School, Body("""{"name":"NoCode"}""")));
    }

    [Fact]
    public async Task Create_non_string_name_hits_not_null_path_and_throws()
    {
        await Assert.ThrowsAsync<PostgresException>(() =>
            Writer().CreateCourseAsync(Ctx(), School, Body("""{"code":"C1","name":123}""")));
    }

    [Fact]
    public async Task Create_truthy_non_string_department_fails_closed()
    {
        // Legacy `department: body.department || ''` lets a truthy non-string (123) flow to Prisma's text column →
        // type rejection → 500. We fail closed (throw → 500) rather than silently coerce to "" (FM-054 gate fold).
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Writer().CreateCourseAsync(Ctx(), School, Body("""{"code":"C1","name":"One","department":123}""")));
    }

    [Fact]
    public async Task Create_falsy_department_values_become_empty_string()
    {
        // JS `|| ''`: 0 and false are falsy → "" (NOT a 500 — only TRUTHY non-strings reject).
        var zero = await Writer().CreateCourseAsync(Ctx(), School, Body("""{"code":"Z","name":"Z","department":0}"""));
        Assert.Equal("", (await ReadCourse(zero.Id!)).Department);
        var no = await Writer().CreateCourseAsync(Ctx(), School, Body("""{"code":"F","name":"F","department":false}"""));
        Assert.Equal("", (await ReadCourse(no.Id!)).Department);
    }

    [Fact]
    public async Task Create_non_string_frameworkType_fails_closed()
    {
        // Nullable text column: a present non-string, non-null value (123) → Prisma String? type rejection → 500
        // (throw), NOT silently stored as NULL (FM-054 gate fold).
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Writer().CreateCourseAsync(Ctx(), School, Body("""{"code":"C1","name":"One","frameworkType":123}""")));
    }

    // ---- updateCourse (FM-DOTNET-061 PUT /courses/:courseId) ----

    [Fact]
    public async Task Update_only_present_fields_change_and_bumps_updatedAt()
    {
        var old = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
        await SeedCourseAsync("cx", School, old, name: "Orig", department: "OrigDept", credits: 1m,
            maxEnrollment: 10, isHonors: false, status: "active");

        // Only name + credits present → the rest keeps its existing value (undefined-omit).
        var id = await Writer().UpdateCourseAsync(Ctx(), School, "cx", Body("""{"name":"Changed","credits":4.5}"""));

        Assert.Equal("cx", id);
        var row = await ReadCourse("cx");
        Assert.Equal("Changed", await NameOf("cx"));  // present → changed
        Assert.Equal(4.5m, row.Credits);              // present → changed
        Assert.Equal("OrigDept", row.Department);     // absent → unchanged
        Assert.Equal(10, row.MaxEnrollment);          // absent → unchanged
        Assert.False(row.IsHonors);                   // absent → unchanged
        Assert.Equal("active", row.Status);           // absent → unchanged
        Assert.True(await UpdatedAtOf("cx") > old);   // @updatedAt bumped
    }

    [Fact]
    public async Task Update_empty_body_still_bumps_updatedAt_and_touches_nothing_else()
    {
        // Legacy prisma.update({data:{}}) still bumps @updatedAt (parity: SET always includes updatedAt).
        var old = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
        await SeedCourseAsync("cx", School, old, name: "Keep", department: "KeepDept");

        var id = await Writer().UpdateCourseAsync(Ctx(), School, "cx", Body("{}"));

        Assert.Equal("cx", id);
        Assert.Equal("Keep", await NameOf("cx"));
        Assert.Equal("KeepDept", (await ReadCourse("cx")).Department);
        Assert.True(await UpdatedAtOf("cx") > old);
    }

    [Fact]
    public async Task Update_all_field_types_persist()
    {
        await SeedCourseAsync("cx", School, new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified));

        var id = await Writer().UpdateCourseAsync(Ctx(), School, "cx", Body("""
            {"code":"NEW","name":"New Name","department":"Sci","credits":"3.25","gradeLevels":[9,10],
             "prerequisites":["P1"],"corequisites":["C1"],"frameworkType":"AP","description":"d",
             "maxEnrollment":25,"isHonors":true,"status":"archived"}
            """));

        Assert.Equal("cx", id);
        var row = await ReadCourse("cx");
        Assert.Equal("Sci", row.Department);
        Assert.Equal(3.25m, row.Credits);              // numeric STRING coerced → decimal (Prisma Decimal)
        Assert.Equal(new[] { 9, 10 }, row.GradeLevels);
        Assert.Equal(new[] { "P1" }, row.Prerequisites);
        Assert.Equal(new[] { "C1" }, row.Corequisites);
        Assert.Equal("AP", row.FrameworkType);
        Assert.Equal("d", row.Description);
        Assert.Equal(25, row.MaxEnrollment);
        Assert.True(row.IsHonors);
        Assert.Equal("archived", row.Status);
    }

    [Fact]
    public async Task Update_credits_exponent_string_parses_like_decimaljs()
    {
        // FM-061 gate fold (mirrors the FM-056 confidence mask): the credits string coercion ALLOWS exponent, matching
        // legacy Prisma's decimal.js ("1e3" → 1000).
        await SeedCourseAsync("cx", School, new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified));
        await Writer().UpdateCourseAsync(Ctx(), School, "cx", Body("""{"credits":"1e3"}"""));
        Assert.Equal(1000m, (await ReadCourse("cx")).Credits);
    }

    [Theory]
    [InlineData("1,000")]  // thousands separator
    [InlineData(" 0.85 ")] // surrounding whitespace
    [InlineData("5-")]     // trailing sign
    public async Task Update_credits_thousands_or_whitespace_string_fails_closed(string credits)
    {
        // RED if the mask regresses to NumberStyles.Number: these would silently PARSE (fail-OPEN — writing a row that
        // legacy's decimal.js 500s on). The restricted mask throws → 500, no write.
        await SeedCourseAsync("cx", School, new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified), credits: 1m);
        await Assert.ThrowsAnyAsync<Exception>(() =>
            Writer().UpdateCourseAsync(Ctx(), School, "cx", Body($$"""{"credits":"{{credits}}"}""")));
        Assert.Equal(1m, (await ReadCourse("cx")).Credits); // unchanged
    }

    [Fact]
    public async Task Update_present_null_on_nullable_column_writes_null()
    {
        await SeedCourseAsync("cx", School, new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified),
            frameworkType: "AP", description: "orig", maxEnrollment: 10);

        // frameworkType/description (nullable) + maxEnrollment (nullable Int) present-null → NULL (house rule).
        await Writer().UpdateCourseAsync(Ctx(), School, "cx",
            Body("""{"frameworkType":null,"description":null,"maxEnrollment":null}"""));

        var row = await ReadCourse("cx");
        Assert.Null(row.FrameworkType);
        Assert.Null(row.Description);
        Assert.Null(row.MaxEnrollment);
    }

    [Fact]
    public async Task Update_wrong_typed_present_field_fails_closed()
    {
        await SeedCourseAsync("cx", School, new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified));

        // A number for a text column → Prisma type rejection → 500 (fail-closed throw). No write.
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Writer().UpdateCourseAsync(Ctx(), School, "cx", Body("""{"name":123}""")));
        Assert.Equal("Orig", await NameOf("cx")); // unchanged
    }

    [Fact]
    public async Task Update_missing_course_returns_null()
    {
        var id = await Writer().UpdateCourseAsync(Ctx(), School, "does-not-exist", Body("""{"name":"X"}"""));
        Assert.Null(id);
    }

    [Fact]
    public async Task Update_wrong_school_returns_null_and_does_not_write()
    {
        var old = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
        await SeedCourseAsync("cx", "school-2", old, name: "Other");

        // Caller is school-1; the course belongs to school-2 → ownership gate → null, no write.
        var id = await Writer().UpdateCourseAsync(Ctx(), School, "cx", Body("""{"name":"Hijack"}"""));

        Assert.Null(id);
        Assert.Equal("Other", await NameOf("cx"));         // unchanged
        Assert.Equal(old, await UpdatedAtOf("cx"));        // not even updatedAt bumped
    }

    // ---- deleteCourse (soft delete) ----

    [Fact]
    public async Task Delete_soft_archives_row_and_bumps_updatedAt_row_still_present()
    {
        var old = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
        await SeedCourseAsync("cx", School, old, status: "active", isActive: true);

        var ok = await Writer().DeleteCourseAsync(Ctx(), School, "cx");

        Assert.True(ok);
        var row = await ReadCourse("cx");     // row still readable → NOT hard-deleted
        Assert.False(row.IsActive);           // SOFT delete
        Assert.Equal("archived", row.Status);
        Assert.True(await UpdatedAtOf("cx") > old);
        Assert.Equal(1, await CountCourses());
    }

    [Fact]
    public async Task Delete_missing_course_returns_false()
    {
        Assert.False(await Writer().DeleteCourseAsync(Ctx(), School, "nope"));
    }

    [Fact]
    public async Task Delete_wrong_school_returns_false_and_does_not_archive()
    {
        await SeedCourseAsync("cx", "school-2", new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified),
            status: "active", isActive: true);

        var ok = await Writer().DeleteCourseAsync(Ctx(), School, "cx");

        Assert.False(ok);
        var row = await ReadCourse("cx");
        Assert.True(row.IsActive);            // untouched
        Assert.Equal("active", row.Status);
    }

    // ---- helpers ----

    private SchoolCoursesWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static JsonElement Body(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private static RequestContext Ctx(string schoolId = School) =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school-admin", "a@e.st", "Admin"),
            schoolId: schoolId, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    // Direct-SQL seed with a controllable updatedAt (so the @updatedAt-bump assertions are deterministic).
    private async Task SeedCourseAsync(
        string id, string schoolId, DateTime updatedAt, string name = "Orig", string department = "OrigDept",
        decimal credits = 1m, int? maxEnrollment = 10, bool isHonors = false, string status = "active",
        bool isActive = true, string? frameworkType = null, string? description = null)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "school_courses"
                ("id","schoolId","code","name","department","credits","gradeLevels","prerequisites","corequisites",
                 "frameworkType","description","maxEnrollment","isHonors","status","isActive","createdDate","updatedAt")
            VALUES (@id,@sid,@code,@name,@dept,@credits,ARRAY[]::integer[],ARRAY[]::text[],ARRAY[]::text[],
                    @fw,@desc,@max,@honors,@status,@active,@upd,@upd)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("sid", schoolId);
        cmd.Parameters.AddWithValue("code", "C-" + id);
        cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.AddWithValue("dept", department);
        cmd.Parameters.AddWithValue("credits", credits);
        cmd.Parameters.AddWithValue("fw", (object?)frameworkType ?? DBNull.Value);
        cmd.Parameters.AddWithValue("desc", (object?)description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("max", (object?)maxEnrollment ?? DBNull.Value);
        cmd.Parameters.AddWithValue("honors", isHonors);
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("active", isActive);
        cmd.Parameters.AddWithValue("upd", updatedAt);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task<string> NameOf(string id)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""SELECT "name" FROM "school_courses" WHERE "id"=@id""", conn);
        cmd.Parameters.AddWithValue("id", id);
        return (string)(await cmd.ExecuteScalarAsync())!;
    }

    private async Task<DateTime> UpdatedAtOf(string id)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""SELECT "updatedAt" FROM "school_courses" WHERE "id"=@id""", conn);
        cmd.Parameters.AddWithValue("id", id);
        return (DateTime)(await cmd.ExecuteScalarAsync())!;
    }

    private async Task<int> CountCourses()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""SELECT COUNT(*)::int FROM "school_courses" """, conn);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync());
    }

    private async Task<CourseRow> ReadCourse(string id)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT "schoolId","department","credits"::double precision,"gradeLevels","prerequisites","corequisites",
                   "frameworkType","description","maxEnrollment","isHonors","status","isActive","createdBy","updatedBy"
            FROM "school_courses" WHERE "id"=@id
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return new CourseRow(
            SchoolId: reader.GetString(0),
            Department: reader.GetString(1),
            Credits: (decimal)reader.GetDouble(2),
            GradeLevels: reader.GetFieldValue<int[]>(3),
            Prerequisites: reader.GetFieldValue<string[]>(4),
            Corequisites: reader.GetFieldValue<string[]>(5),
            FrameworkType: reader.IsDBNull(6) ? null : reader.GetString(6),
            Description: reader.IsDBNull(7) ? null : reader.GetString(7),
            MaxEnrollment: reader.IsDBNull(8) ? null : reader.GetInt32(8),
            IsHonors: reader.GetBoolean(9),
            Status: reader.GetString(10),
            IsActive: reader.GetBoolean(11),
            CreatedBy: reader.IsDBNull(12) ? null : reader.GetString(12),
            UpdatedBy: reader.IsDBNull(13) ? null : reader.GetString(13));
    }

    private sealed record CourseRow(
        string SchoolId, string Department, decimal Credits, int[] GradeLevels, string[] Prerequisites,
        string[] Corequisites, string? FrameworkType, string? Description, int? MaxEnrollment, bool IsHonors,
        string Status, bool IsActive, string? CreatedBy, string? UpdatedBy);
}
