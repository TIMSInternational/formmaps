using FormMaps.Application.Auth;
using FormMaps.Application.SchoolCourses;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolCourses;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolCourses;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC container tz) tests for <see cref="SchoolCoursesReader"/> (FM-DOTNET-054). Pins
/// listCourses: school+isActive scope; search (name OR code ILIKE); department ILIKE; gradeLevel `has` (and the
/// gradeLevel=0 skip is at the endpoint); code-ASC + id-ASC tie-break; enrollmentCount (enrolled+planned only,
/// default 0, ONE groupBy); credits Decimal→number; gradeLevels/prerequisites/corequisites arrays; ISO-Z timestamps;
/// and the framework merge (enabled frameworks only; framework rows appended un-paginated to EVERY page;
/// total = schoolCourseCount + frameworkCount; framework prerequisites/department; includeFramework=false disables).
/// </summary>
public sealed class SchoolCoursesReaderTests : IClassFixture<SchoolCoursesDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";

    private readonly SchoolCoursesDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public SchoolCoursesReaderTests(SchoolCoursesDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "school_courses","student_course_plans","curriculum_frameworks","framework_courses" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- scope + basic list ----

    [Fact]
    public async Task List_scopes_to_school_and_active_only()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedCourse(conn, "c1", School, "MATH101", "Algebra");
        await SeedCourse(conn, "c2", School, "MATH102", "Geometry");
        await SeedCourse(conn, "c3", School, "MATH103", "Calc", isActive: false); // inactive excluded
        await SeedCourse(conn, "cx", OtherSchool, "MATH104", "Other");            // other school excluded

        var result = await Reader().ListCoursesAsync(Ctx(), School, Query());

        Assert.Equal(2, result.Total); // no frameworks enabled
        Assert.Equal(new[] { "MATH101", "MATH102" }, result.SchoolCourses.Select(c => c.Code));
        Assert.Empty(result.FrameworkCourses);
        Assert.Equal(1, result.TotalPages);
    }

    [Fact]
    public async Task List_orders_by_code_asc()
    {
        // Within one school (schoolId, code) is UNIQUE, so code-ASC is already deterministic; the appended
        // ", id ASC" tie-break is a harmless defensive superset that can never actually trigger here (it does matter
        // for framework_courses, which can share a code across frameworkTypes). Seeded out of order → returned sorted.
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedCourse(conn, "id-b", School, "MATH200", "B");
        await SeedCourse(conn, "id-a", School, "MATH100", "A");
        await SeedCourse(conn, "id-c", School, "MATH300", "C");

        var result = await Reader().ListCoursesAsync(Ctx(), School, Query());

        Assert.Equal(new[] { "MATH100", "MATH200", "MATH300" }, result.SchoolCourses.Select(c => c.Code));
    }

    // ---- filters ----

    [Fact]
    public async Task List_search_matches_name_or_code_ilike()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedCourse(conn, "c1", School, "BIO101", "Biology");
        await SeedCourse(conn, "c2", School, "CHEM101", "Chemistry");
        await SeedCourse(conn, "c3", School, "PHYS-BIO", "Physics"); // matches by code substring

        var result = await Reader().ListCoursesAsync(Ctx(), School, Query(search: "bio"));

        Assert.Equal(new[] { "BIO101", "PHYS-BIO" }, result.SchoolCourses.Select(c => c.Code).OrderBy(x => x));
        Assert.Equal(2, result.Total);
    }

    [Fact]
    public async Task List_department_filter_is_ilike_substring()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedCourse(conn, "c1", School, "M1", "Algebra", department: "Mathematics");
        await SeedCourse(conn, "c2", School, "S1", "Biology", department: "Science");

        var result = await Reader().ListCoursesAsync(Ctx(), School, Query(department: "math"));

        Assert.Single(result.SchoolCourses);
        Assert.Equal("M1", result.SchoolCourses[0].Code);
    }

    [Fact]
    public async Task List_gradeLevel_uses_has_membership()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedCourse(conn, "c1", School, "G9", "Nine", gradeLevels: new[] { 9, 10 });
        await SeedCourse(conn, "c2", School, "G11", "Eleven", gradeLevels: new[] { 11, 12 });

        var result = await Reader().ListCoursesAsync(Ctx(), School, Query(gradeLevel: 11));

        Assert.Single(result.SchoolCourses);
        Assert.Equal("G11", result.SchoolCourses[0].Code);
    }

    // ---- enrollmentCount ----

    [Fact]
    public async Task List_enrollmentCount_counts_enrolled_and_planned_only_default_zero()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedCourse(conn, "c1", School, "C1", "One");
        await SeedCourse(conn, "c2", School, "C2", "Two"); // no plans → 0
        await SeedPlan(conn, "p1", "c1", "enrolled");
        await SeedPlan(conn, "p2", "c1", "planned");
        await SeedPlan(conn, "p3", "c1", "dropped");   // excluded
        await SeedPlan(conn, "p4", "c1", "completed"); // excluded

        var result = await Reader().ListCoursesAsync(Ctx(), School, Query());

        var c1 = result.SchoolCourses.Single(c => c.Code == "C1");
        var c2 = result.SchoolCourses.Single(c => c.Code == "C2");
        Assert.Equal(2, c1.EnrollmentCount);
        Assert.Equal(0, c2.EnrollmentCount);
    }

    // ---- type fidelity ----

    [Fact]
    public async Task List_maps_credits_arrays_and_isoZ_timestamps()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedCourse(conn, "c1", School, "C1", "One",
            credits: 3.5m, gradeLevels: new[] { 9, 10 },
            prerequisites: new[] { "PRE1", "PRE2" }, corequisites: new[] { "CO1" },
            frameworkType: "AP", frameworkCourseId: "fw-1", description: "desc",
            maxEnrollment: 30, isHonors: true, createdBy: "u-c", updatedBy: "u-u",
            createdDate: new DateTime(2026, 1, 2, 3, 4, 5, 6, DateTimeKind.Unspecified),
            updatedAt: new DateTime(2026, 2, 3, 4, 5, 6, 7, DateTimeKind.Unspecified));

        var row = (await Reader().ListCoursesAsync(Ctx(), School, Query())).SchoolCourses.Single();

        Assert.Equal("3.5", row.Credits);   // raw Prisma Decimal → decimal.js string on the wire (trim_scale::text)
        Assert.Equal(new[] { 9, 10 }, row.GradeLevels);
        Assert.Equal(new[] { "PRE1", "PRE2" }, row.Prerequisites);
        Assert.Equal(new[] { "CO1" }, row.Corequisites);
        Assert.Equal("AP", row.FrameworkType);
        Assert.Equal("fw-1", row.FrameworkCourseId);
        Assert.Equal("desc", row.Description);
        Assert.Equal(30, row.MaxEnrollment);
        Assert.True(row.IsHonors);
        Assert.Equal("u-c", row.CreatedBy);
        Assert.Equal("u-u", row.UpdatedBy);
        Assert.Equal("2026-01-02T03:04:05.006Z", row.CreatedDate);
        Assert.Equal("2026-02-03T04:05:06.007Z", row.UpdatedAt);
    }

    [Fact]
    public async Task List_nullable_columns_come_back_null()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedCourse(conn, "c1", School, "C1", "One"); // frameworkType/description/maxEnrollment default NULL

        var row = (await Reader().ListCoursesAsync(Ctx(), School, Query())).SchoolCourses.Single();

        Assert.Null(row.FrameworkType);
        Assert.Null(row.FrameworkCourseId);
        Assert.Null(row.Description);
        Assert.Null(row.MaxEnrollment);
        Assert.Null(row.CreatedBy);
        Assert.Null(row.UpdatedBy);
        Assert.Empty(row.GradeLevels);
        Assert.Empty(row.Prerequisites);
        Assert.Empty(row.Corequisites);
    }

    // ---- framework merge + quirk ----

    [Fact]
    public async Task List_merges_only_enabled_active_frameworks()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedCourse(conn, "c1", School, "SCH1", "School course");
        await SeedFramework(conn, "f-ap", School, "AP", enabled: true);
        await SeedFramework(conn, "f-ib", School, "IB", enabled: false);       // disabled → excluded
        await SeedFramework(conn, "f-nat", OtherSchool, "NATIONAL", enabled: true); // other school → excluded
        await SeedFrameworkCourse(conn, "fc1", "AP", "AP-CALC", "AP Calculus", department: "Math", credits: 1m, gradeLevels: new[] { 11, 12 });
        await SeedFrameworkCourse(conn, "fc2", "IB", "IB-MATH", "IB Math");     // framework disabled → excluded
        await SeedFrameworkCourse(conn, "fc3", "AP", "AP-BIO", "AP Biology", isActive: false); // inactive → excluded

        var result = await Reader().ListCoursesAsync(Ctx(), School, Query());

        Assert.Single(result.FrameworkCourses);
        var fw = result.FrameworkCourses[0];
        Assert.Equal("AP-CALC", fw.Code);
        Assert.Equal("Math", fw.Department);
        Assert.Equal("1", fw.Credits);      // trim_scale(1.000…)::text → "1" (decimal.js toString parity)
        Assert.Equal(new[] { 11, 12 }, fw.GradeLevels);
        Assert.Equal("AP", fw.FrameworkType);
        // total = 1 school course + 1 framework course.
        Assert.Equal(2, result.Total);
    }

    [Fact]
    public async Task List_framework_courses_are_appended_unpaginated_to_every_page()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        // 3 school courses, page size 2 → page 2 has ONE school course, but the framework set is appended in FULL.
        await SeedCourse(conn, "c1", School, "S1", "One");
        await SeedCourse(conn, "c2", School, "S2", "Two");
        await SeedCourse(conn, "c3", School, "S3", "Three");
        await SeedFramework(conn, "f-ap", School, "AP", enabled: true);
        await SeedFrameworkCourse(conn, "fc1", "AP", "AP1", "AP One");
        await SeedFrameworkCourse(conn, "fc2", "AP", "AP2", "AP Two");

        var page2 = await Reader().ListCoursesAsync(Ctx(), School, Query(page: 2, limit: 2));

        Assert.Single(page2.SchoolCourses);              // only S3 on page 2
        Assert.Equal(2, page2.FrameworkCourses.Count);   // FULL framework set appended again
        // total = 3 school courses + 2 framework, totalPages = ceil(5/2) = 3.
        Assert.Equal(5, page2.Total);
        Assert.Equal(3, page2.TotalPages);
    }

    [Fact]
    public async Task List_framework_search_filters_framework_courses_too()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedFramework(conn, "f-ap", School, "AP", enabled: true);
        await SeedFrameworkCourse(conn, "fc1", "AP", "AP-CALC", "AP Calculus");
        await SeedFrameworkCourse(conn, "fc2", "AP", "AP-BIO", "AP Biology");

        var result = await Reader().ListCoursesAsync(Ctx(), School, Query(search: "calc"));

        Assert.Single(result.FrameworkCourses);
        Assert.Equal("AP-CALC", result.FrameworkCourses[0].Code);
    }

    [Fact]
    public async Task List_includeFramework_false_disables_the_merge()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedCourse(conn, "c1", School, "S1", "One");
        await SeedFramework(conn, "f-ap", School, "AP", enabled: true);
        await SeedFrameworkCourse(conn, "fc1", "AP", "AP1", "AP One");

        var result = await Reader().ListCoursesAsync(Ctx(), School, Query(includeFramework: false));

        Assert.Empty(result.FrameworkCourses);
        Assert.Equal(1, result.Total); // school course only
    }

    // ---- helpers ----

    private SchoolCoursesReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school-admin", "a@e.st", "Admin"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static SchoolCoursesQuery Query(
        int page = 1, int limit = 20, string? search = null, string? department = null, int? gradeLevel = null,
        bool includeFramework = true) =>
        new(page, limit, (long)(page - 1) * limit, search, department, gradeLevel, includeFramework);

    private static async Task SeedCourse(
        NpgsqlConnection conn, string id, string schoolId, string code, string name, string department = "General",
        decimal credits = 0m, int[]? gradeLevels = null, string[]? prerequisites = null, string[]? corequisites = null,
        string? frameworkType = null, string? frameworkCourseId = null, string? description = null,
        int? maxEnrollment = null, bool isHonors = false, bool isActive = true, string? createdBy = null,
        string? updatedBy = null, DateTime? createdDate = null, DateTime? updatedAt = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "school_courses"
                ("id","schoolId","code","name","department","credits","gradeLevels","prerequisites","corequisites",
                 "frameworkType","frameworkCourseId","description","maxEnrollment","isHonors","isActive","createdBy",
                 "updatedBy","createdDate","updatedAt")
            VALUES (@id,@sid,@code,@name,@dept,@credits,@grades,@pre,@co,@ft,@fcid,@desc,@max,@honors,@active,@cby,
                    @uby,@cdate,@udate)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("sid", schoolId);
        cmd.Parameters.AddWithValue("code", code);
        cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.AddWithValue("dept", department);
        cmd.Parameters.AddWithValue("credits", credits);
        cmd.Parameters.AddWithValue("grades", gradeLevels ?? []);
        cmd.Parameters.AddWithValue("pre", prerequisites ?? []);
        cmd.Parameters.AddWithValue("co", corequisites ?? []);
        cmd.Parameters.AddWithValue("ft", (object?)frameworkType ?? DBNull.Value);
        cmd.Parameters.AddWithValue("fcid", (object?)frameworkCourseId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("desc", (object?)description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("max", (object?)maxEnrollment ?? DBNull.Value);
        cmd.Parameters.AddWithValue("honors", isHonors);
        cmd.Parameters.AddWithValue("active", isActive);
        cmd.Parameters.AddWithValue("cby", (object?)createdBy ?? DBNull.Value);
        cmd.Parameters.AddWithValue("uby", (object?)updatedBy ?? DBNull.Value);
        cmd.Parameters.AddWithValue("cdate", (object?)createdDate ?? new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Unspecified));
        cmd.Parameters.AddWithValue("udate", (object?)updatedAt ?? new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedPlan(NpgsqlConnection conn, string id, string courseId, string status)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "student_course_plans" ("id","courseId","status") VALUES (@id,@cid,@status)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("cid", courseId);
        cmd.Parameters.AddWithValue("status", status);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedFramework(NpgsqlConnection conn, string id, string schoolId, string type, bool enabled, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "curriculum_frameworks" ("id","schoolId","type","enabled","isActive") VALUES (@id,@sid,@type,@en,@active)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("sid", schoolId);
        cmd.Parameters.AddWithValue("type", type);
        cmd.Parameters.AddWithValue("en", enabled);
        cmd.Parameters.AddWithValue("active", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedFrameworkCourse(
        NpgsqlConnection conn, string id, string frameworkType, string code, string name, string? department = null,
        decimal credits = 0m, int[]? gradeLevels = null, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "framework_courses" ("id","frameworkType","code","name","department","credits","gradeLevels","isActive")
            VALUES (@id,@ft,@code,@name,@dept,@credits,@grades,@active)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("ft", frameworkType);
        cmd.Parameters.AddWithValue("code", code);
        cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.AddWithValue("dept", (object?)department ?? DBNull.Value);
        cmd.Parameters.AddWithValue("credits", credits);
        cmd.Parameters.AddWithValue("grades", gradeLevels ?? []);
        cmd.Parameters.AddWithValue("active", isActive);
        await cmd.ExecuteNonQueryAsync();
    }
}
