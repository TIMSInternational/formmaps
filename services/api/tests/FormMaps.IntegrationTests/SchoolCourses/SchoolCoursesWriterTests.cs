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

    // ---- helpers ----

    private SchoolCoursesWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static JsonElement Body(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private static RequestContext Ctx(string schoolId = School) =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school-admin", "a@e.st", "Admin"),
            schoolId: schoolId, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

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
