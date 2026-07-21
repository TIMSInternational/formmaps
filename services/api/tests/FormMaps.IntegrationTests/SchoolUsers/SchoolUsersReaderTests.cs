using FormMaps.Application.Auth;
using FormMaps.Application.SchoolUsers;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolUsers;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolUsers;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC container tz) tests for <see cref="SchoolUsersReader"/> (FM-DOTNET-052). Pins
/// listSchoolUsers (school+isActive scope, role ILIKE, search over name OR email, pagination, createdDate ISO-Z,
/// status/joinedAt derivations, totalPages, and the createdDate-tie → id-ASC deterministic-superset order) and
/// getCounselorStudents (counselor-not-in-school → error, student shape, pagination, id-ASC order).
/// </summary>
public sealed class SchoolUsersReaderTests : IClassFixture<SchoolUsersDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";

    private readonly SchoolUsersDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public SchoolUsersReaderTests(SchoolUsersDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "counselor_student_assignments","users" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- listSchoolUsers ----

    [Fact]
    public async Task List_scopes_to_school_and_active_only()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "u1", School, role: "student");
        await SeedUser(conn, "u2", School, role: "counselor");
        await SeedUser(conn, "u3", School, role: "student", isActive: false); // inactive excluded
        await SeedUser(conn, "ux", OtherSchool, role: "student");             // other school excluded

        var page = await Reader().ListSchoolUsersAsync(Ctx(), School, Query());

        Assert.Equal(2, page.Total);
        Assert.Equal(new[] { "u1", "u2" }.OrderBy(x => x), page.Data.Select(r => r.Id).OrderBy(x => x));
        Assert.All(page.Data, r => Assert.True(r.IsActive)); // status/joinedAt are derived at the endpoint
    }

    [Fact]
    public async Task List_role_filter_is_case_insensitive_ilike_substring()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "u1", School, role: "student");
        await SeedUser(conn, "u2", School, role: "counselor");
        await SeedUser(conn, "u3", School, role: "Student");

        // "STUD" ILIKE '%STUD%' matches both "student" and "Student", not "counselor".
        var page = await Reader().ListSchoolUsersAsync(Ctx(), School, Query(role: "STUD"));

        Assert.Equal(2, page.Total);
        Assert.All(page.Data, r => Assert.Contains("tudent", r.RoleName));
    }

    [Fact]
    public async Task List_search_matches_name_or_email()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "u1", School, role: "student", name: "Ada Lovelace", email: "ada@e.st");
        await SeedUser(conn, "u2", School, role: "student", name: "Grace Hopper", email: "grace@e.st");
        await SeedUser(conn, "u3", School, role: "student", name: "Someone", email: "ADA-alt@e.st");

        // "ada" ILIKE hits u1 by name AND u3 by email (case-insensitive), not u2.
        var page = await Reader().ListSchoolUsersAsync(Ctx(), School, Query(search: "ada"));

        Assert.Equal(2, page.Total);
        Assert.Equal(new[] { "u1", "u3" }.OrderBy(x => x), page.Data.Select(r => r.Id).OrderBy(x => x));
    }

    [Fact]
    public async Task List_paginates_and_computes_totalPages()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        for (var i = 0; i < 5; i++)
        {
            await SeedUser(conn, $"u{i}", School, role: "student", createdDate: new DateTime(2026, 1, 1 + i, 0, 0, 0, DateTimeKind.Unspecified));
        }

        var page = await Reader().ListSchoolUsersAsync(Ctx(), School, Query(page: 2, limit: 2, skip: 2));

        Assert.Equal(5, page.Total);
        Assert.Equal(2, page.Page);
        Assert.Equal(2, page.Limit);
        Assert.Equal(3, page.TotalPages);   // ceil(5/2)
        Assert.Equal(2, page.Data.Count);
    }

    [Fact]
    public async Task List_orders_createdDate_desc_then_id_asc_on_ties()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        var tie = new DateTime(2026, 5, 1, 0, 0, 0, DateTimeKind.Unspecified);
        var newer = new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Unspecified);
        await SeedUser(conn, "b-tie", School, role: "student", createdDate: tie);
        await SeedUser(conn, "a-tie", School, role: "student", createdDate: tie);
        await SeedUser(conn, "z-newer", School, role: "student", createdDate: newer);

        var page = await Reader().ListSchoolUsersAsync(Ctx(), School, Query());

        // newer first (DESC on createdDate); then the tie group ordered by id ASC (a-tie before b-tie).
        Assert.Equal(new[] { "z-newer", "a-tie", "b-tie" }, page.Data.Select(r => r.Id).ToArray());
    }

    [Fact]
    public async Task List_maps_row_fields_gradeLevel_status_joinedAt_and_isoZ_createdDate()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        var created = new DateTime(2026, 3, 4, 5, 6, 7, 123, DateTimeKind.Unspecified);
        await SeedUser(conn, "u1", School, role: "student", name: "Ada", email: "ada@e.st", gradeLevel: 11, createdDate: created);
        await SeedUser(conn, "u2", School, role: "student", gradeLevel: null, createdDate: created);

        var page = await Reader().ListSchoolUsersAsync(Ctx(), School, Query());
        var u1 = page.Data.Single(r => r.Id == "u1");
        var u2 = page.Data.Single(r => r.Id == "u2");

        Assert.Equal(11, u1.GradeLevel);
        Assert.Null(u2.GradeLevel);
        Assert.True(u1.IsActive); // status "active" / joinedAt are derived at the endpoint (UserJson)
        Assert.Equal("2026-03-04T05:06:07.123Z", u1.CreatedDate);
    }

    // ---- getCounselorStudents ----

    [Fact]
    public async Task CounselorStudents_errors_when_counselor_not_in_school()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "c-other", OtherSchool, role: "counselor");

        var result = await Reader().GetCounselorStudentsAsync(Ctx(), School, "c-other", 1, 20, 0);

        Assert.Equal("Counselor not in your school", result.Error);
        Assert.Empty(result.Data);
    }

    [Fact]
    public async Task CounselorStudents_errors_when_counselor_missing()
    {
        var result = await Reader().GetCounselorStudentsAsync(Ctx(), School, "ghost", 1, 20, 0);
        Assert.Equal("Counselor not in your school", result.Error);
    }

    [Fact]
    public async Task CounselorStudents_returns_active_assignment_students_with_shape_and_id_asc_order()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "c1", School, role: "counselor");
        var created = new DateTime(2026, 2, 2, 3, 4, 5, 6, DateTimeKind.Unspecified);
        await SeedUser(conn, "s1", School, role: "student", name: "Ada", email: "ada@e.st", gradeLevel: 9, createdDate: created);
        await SeedUser(conn, "s2", School, role: "student", name: "Grace", email: "grace@e.st", gradeLevel: null, createdDate: created);
        await SeedUser(conn, "s3", School, role: "student");
        await SeedAssignment(conn, "a-2", "c1", "s2", isActive: true);
        await SeedAssignment(conn, "a-1", "c1", "s1", isActive: true);
        await SeedAssignment(conn, "a-3", "c1", "s3", isActive: false); // inactive excluded

        var result = await Reader().GetCounselorStudentsAsync(Ctx(), School, "c1", 1, 20, 0);

        Assert.Null(result.Error);
        Assert.Equal(2, result.Total);
        Assert.Equal(1, result.TotalPages);
        // ORDER BY assignment.id ASC → a-1 (s1) before a-2 (s2).
        Assert.Equal(new[] { "s1", "s2" }, result.Data.Select(s => s.Id).ToArray());
        var s1 = result.Data[0];
        Assert.Equal("Ada", s1.Name);
        Assert.Equal("ada@e.st", s1.Email);
        Assert.Equal(9, s1.GradeLevel);
        Assert.Equal("2026-02-02T03:04:05.006Z", s1.CreatedDate);
        Assert.Null(result.Data[1].GradeLevel);
    }

    [Fact]
    public async Task CounselorStudents_paginates()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "c1", School, role: "counselor");
        for (var i = 0; i < 3; i++)
        {
            await SeedUser(conn, $"s{i}", School, role: "student");
            await SeedAssignment(conn, $"a{i}", "c1", $"s{i}", isActive: true);
        }

        var result = await Reader().GetCounselorStudentsAsync(Ctx(), School, "c1", 2, 2, 2);

        Assert.Equal(3, result.Total);
        Assert.Equal(2, result.TotalPages);
        Assert.Single(result.Data);
    }

    // ---- helpers ----

    private SchoolUsersReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static SchoolUsersQuery Query(int page = 1, int limit = 20, long skip = 0, string? role = null, string? search = null) =>
        new(page, limit, skip, role, search);

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school-admin", "a@e.st", "Admin"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task SeedUser(
        NpgsqlConnection conn, string id, string? schoolId, string role,
        string name = "User", string email = "u@e.st", int? gradeLevel = null, bool isActive = true, DateTime? createdDate = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "users" ("id","name","email","roleName","schoolId","gradeLevel","isActive","createdDate")
            VALUES (@id,@name,@email,@role,@sid,@grade,@active,@created)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.AddWithValue("email", email == "u@e.st" ? $"{id}@e.st" : email);
        cmd.Parameters.AddWithValue("role", role);
        cmd.Parameters.AddWithValue("sid", (object?)schoolId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("grade", (object?)gradeLevel ?? DBNull.Value);
        cmd.Parameters.AddWithValue("active", isActive);
        cmd.Parameters.AddWithValue("created", (object?)createdDate ?? new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedAssignment(NpgsqlConnection conn, string id, string counselorId, string studentId, bool isActive)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "counselor_student_assignments" ("id","counselorId","studentId","isActive")
            VALUES (@id,@c,@s,@active)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("c", counselorId);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("active", isActive);
        await cmd.ExecuteNonQueryAsync();
    }
}
