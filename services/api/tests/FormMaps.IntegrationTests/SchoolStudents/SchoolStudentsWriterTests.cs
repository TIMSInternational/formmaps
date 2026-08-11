using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolStudents;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolStudents;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="SchoolStudentsWriter"/>. Pins: deleteStudent (ownership → false +
/// NO write for missing/cross-school; soft delete isActive=false + updatedAt bump for own student) and
/// updateCourseRequestDeadline (insert-then-update upsert on the unique schoolId; null clears; ISO-Z return).
/// </summary>
public sealed class SchoolStudentsWriterTests : IClassFixture<SchoolStudentsDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";

    private readonly SchoolStudentsDatabaseFixture _fixture;

    /// <summary>Restricted login (NOSUPERUSER NOBYPASSRLS) — the code under test runs on this.</summary>
    private NpgsqlDataSource _dataSource = null!;

    /// <summary>Container superuser — seeding and assertions ONLY.</summary>
    private NpgsqlDataSource _adminDataSource = null!;

    public SchoolStudentsWriterTests(SchoolStudentsDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        await _fixture.TruncateAsync("users", "school_assessment_settings");
    }

    public async Task DisposeAsync()
    {
        await _dataSource.DisposeAsync();
        await _adminDataSource.DisposeAsync();
    }

    [Fact]
    public async Task DeleteStudent_soft_deletes_own_student()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School);

        Assert.True(await Writer().DeleteStudentAsync(Ctx(), School, "s1"));
        Assert.False(await IsActive(conn, "s1")); // isActive flipped
    }

    [Fact]
    public async Task DeleteStudent_false_and_no_write_for_missing_or_cross_school()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "sx", OtherSchool);

        Assert.False(await Writer().DeleteStudentAsync(Ctx(), School, "nope")); // missing
        Assert.False(await Writer().DeleteStudentAsync(Ctx(), School, "sx"));   // other school
        Assert.True(await IsActive(conn, "sx"));                                 // untouched
    }

    [Fact]
    public async Task UpdateDeadline_inserts_then_updates_on_conflict()
    {
        var d1 = new DateTime(2026, 5, 1, 0, 0, 0, DateTimeKind.Utc);
        var d2 = new DateTime(2026, 6, 15, 12, 30, 0, DateTimeKind.Utc);

        var first = await Writer().UpdateCourseRequestDeadlineAsync(Ctx(), School, d1);
        Assert.Equal("2026-05-01T00:00:00.000Z", first);

        var second = await Writer().UpdateCourseRequestDeadlineAsync(Ctx(), School, d2);
        Assert.Equal("2026-06-15T12:30:00.000Z", second); // updated, same row

        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""SELECT COUNT(*)::int FROM "school_assessment_settings" WHERE "schoolId"=@s""", conn);
        cmd.Parameters.AddWithValue("s", School);
        Assert.Equal(1, (int)(await cmd.ExecuteScalarAsync())!); // exactly one row (upsert, not duplicate)
    }

    [Fact]
    public async Task UpdateDeadline_null_clears()
    {
        await Writer().UpdateCourseRequestDeadlineAsync(Ctx(), School, new DateTime(2026, 5, 1, 0, 0, 0, DateTimeKind.Utc));
        var cleared = await Writer().UpdateCourseRequestDeadlineAsync(Ctx(), School, null);
        Assert.Null(cleared);
    }

    // ---- helpers ----

    private SchoolStudentsWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school_admin", "admin@e.st", "Admin"),
            schoolId: School, permissions: new[] { "school:manage" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task<bool> IsActive(NpgsqlConnection conn, string id)
    {
        await using var cmd = new NpgsqlCommand("""SELECT "isActive" FROM "users" WHERE "id"=@id""", conn);
        cmd.Parameters.AddWithValue("id", id);
        return (bool)(await cmd.ExecuteScalarAsync())!;
    }

    private static async Task SeedUser(NpgsqlConnection conn, string id, string schoolId)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users" ("id","name","email","roleName","schoolId","isActive") VALUES (@id,@id,@id,'Student',@s,true)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        await cmd.ExecuteNonQueryAsync();
    }
}
