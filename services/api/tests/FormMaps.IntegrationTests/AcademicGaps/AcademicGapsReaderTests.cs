using FormMaps.Application.Auth;
using FormMaps.Infrastructure.AcademicGaps;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.AcademicGaps;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="AcademicGapsReader"/> (FM-DOTNET-080 loads). Pins the SQL the pure
/// computer can't reach: scope resolution (own schoolId/roleName), the student school+role scoping and counselor
/// assignment scoping, the completed+active grade filter, credits ::double precision, the active category
/// requirements (sortOrder ASC), the HasRules early-outs (no current AY / no active rule set), the student-detail
/// 404 cases (missing / wrong school / counselor-unassigned), and the recommendations status='active' course filter.
/// </summary>
public sealed class AcademicGapsReaderTests
    : IClassFixture<AcademicGapsDatabaseFixture>, IAsyncLifetime
{
    private const string Admin = "admin-1";
    private const string Counselor = "counselor-1";
    private const string School = "school-1";
    private const string Other = "school-2";

    private readonly AcademicGapsDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public AcademicGapsReaderTests(AcademicGapsDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            TRUNCATE "users","counselor_student_assignments","student_grades","school_courses",
                     "academic_years","graduation_rule_sets","category_requirements"
            """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- scope ----

    [Fact]
    public async Task Scope_returns_school_and_role()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Admin, School, role: "school_admin");
        var scope = await Reader().ResolveScopeAsync(Ctx(Admin), Admin);
        Assert.Equal(School, scope.SchoolId);
        Assert.Equal("school_admin", scope.RoleName);
    }

    [Fact]
    public async Task Scope_missing_user_is_null_null()
    {
        var scope = await Reader().ResolveScopeAsync(Ctx("ghost"), "ghost");
        Assert.Null(scope.SchoolId);
        Assert.Null(scope.RoleName);
    }

    [Fact]
    public async Task Scope_null_school_returns_role_only()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Admin, schoolId: null, role: "school_admin");
        var scope = await Reader().ResolveScopeAsync(Ctx(Admin), Admin);
        Assert.Null(scope.SchoolId);
        Assert.Equal("school_admin", scope.RoleName);
    }

    // ---- summary loads ----

    [Fact]
    public async Task Summary_no_current_ay_has_no_rules()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, Admin, School, role: "school_admin");
        var load = await Reader().GetSummaryLoadAsync(Ctx(Admin), School, counselorScoped: false, Admin);
        Assert.False(load.HasRules);
    }

    [Fact]
    public async Task Summary_no_active_rule_set_has_no_rules()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedAcademicYear(conn, "ay1", School, isCurrent: true);
        await SeedRuleSet(conn, "r1", School, "ay1", 24, isActive: false); // inactive → not found
        var load = await Reader().GetSummaryLoadAsync(Ctx(Admin), School, counselorScoped: false, Admin);
        Assert.False(load.HasRules);
    }

    [Fact]
    public async Task Summary_scopes_students_by_school_and_role_and_loads_active_completed_grades()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedRules(conn);
        await SeedUser(conn, "s1", School, role: "Student", name: "Alice", gradeLevel: 11);
        await SeedUser(conn, "s2", School, role: "student", name: "Bob");
        await SeedUser(conn, "t1", School, role: "teacher", name: "Teacher");           // not a student → excluded
        await SeedUser(conn, "s3", Other, role: "student", name: "Other");              // other school → excluded
        await SeedGrade(conn, "g1", "s1", School, "c1", 3, status: "completed", isActive: true);
        await SeedGrade(conn, "g2", "s1", School, "c2", 0, status: "in_progress", isActive: true); // not completed
        await SeedGrade(conn, "g3", "s1", School, "c3", 0, status: "completed", isActive: false);  // inactive
        await SeedCourse(conn, "c1", School, "ENG-9", "English", 3);

        var load = await Reader().GetSummaryLoadAsync(Ctx(Admin), School, counselorScoped: false, Admin);

        Assert.True(load.HasRules);
        Assert.Equal(new[] { "s1", "s2" }, load.Students.Select(s => s.Id).OrderBy(x => x).ToArray());
        Assert.Single(load.Grades);                       // only the completed+active grade
        Assert.Equal(3, load.Grades[0].Credits);          // ::double precision
        Assert.True(load.Courses.ContainsKey("c1"));
        Assert.Equal(24, load.TotalRequired);
        Assert.Equal("Core", load.Categories[0].Category); // sortOrder ASC
    }

    [Fact]
    public async Task Summary_counselor_scoped_to_active_assignments()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedRules(conn);
        await SeedUser(conn, "s1", School, role: "student");
        await SeedUser(conn, "s2", School, role: "student");
        await SeedAssignment(conn, "a1", Counselor, "s1", isActive: true);
        await SeedAssignment(conn, "a2", Counselor, "s2", isActive: false); // inactive → excluded

        var load = await Reader().GetSummaryLoadAsync(Ctx(Counselor), School, counselorScoped: true, Counselor);
        Assert.Equal(new[] { "s1" }, load.Students.Select(s => s.Id).ToArray());
    }

    [Fact]
    public async Task Summary_no_students_keeps_has_rules_true()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedRules(conn);
        var load = await Reader().GetSummaryLoadAsync(Ctx(Admin), School, counselorScoped: false, Admin);
        Assert.True(load.HasRules);
        Assert.Empty(load.Students);
    }

    [Fact]
    public async Task Summary_loads_active_categories_sorted()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedAcademicYear(conn, "ay1", School, isCurrent: true);
        await SeedRuleSet(conn, "r1", School, "ay1", 24, isActive: true);
        await SeedCategory(conn, "cat2", "r1", "Science", 4, ["BIO"], electives: false, sortOrder: 2, isActive: true);
        await SeedCategory(conn, "cat1", "r1", "Core", 6, [], electives: true, sortOrder: 1, isActive: true);
        await SeedCategory(conn, "cat3", "r1", "Gone", 1, [], electives: true, sortOrder: 0, isActive: false); // inactive

        var load = await Reader().GetSummaryLoadAsync(Ctx(Admin), School, counselorScoped: false, Admin);
        Assert.Equal(new[] { "Core", "Science" }, load.Categories.Select(c => c.Category).ToArray());
        Assert.Equal(new[] { "BIO" }, load.Categories[1].RequiredCourses.ToArray());
        Assert.False(load.Categories[1].ElectivesAllowed);
    }

    // ---- student detail 404 cases ----

    [Fact]
    public async Task Detail_missing_student_is_null()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedRules(conn);
        Assert.Null(await Reader().GetStudentDetailLoadAsync(Ctx(Admin), School, false, Admin, "ghost"));
    }

    [Fact]
    public async Task Detail_wrong_school_is_null()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedRules(conn);
        await SeedUser(conn, "s1", Other, role: "student");
        Assert.Null(await Reader().GetStudentDetailLoadAsync(Ctx(Admin), School, false, Admin, "s1"));
    }

    [Fact]
    public async Task Detail_counselor_unassigned_is_null()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedRules(conn);
        await SeedUser(conn, "s1", School, role: "student");
        Assert.Null(await Reader().GetStudentDetailLoadAsync(Ctx(Counselor), School, true, Counselor, "s1"));
    }

    [Fact]
    public async Task Detail_happy_loads_student_and_grades()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedRules(conn);
        await SeedUser(conn, "s1", School, role: "student", name: "Alice", gradeLevel: 12);
        await SeedGrade(conn, "g1", "s1", School, "c1", 3.5m, status: "completed", isActive: true);

        var load = await Reader().GetStudentDetailLoadAsync(Ctx(Admin), School, false, Admin, "s1");
        Assert.NotNull(load);
        Assert.True(load!.HasRules);
        Assert.Equal("Alice", load.StudentName);
        Assert.Equal(12, load.GradeLevel);
        Assert.Equal(3.5, load.Grades[0].Credits);
    }

    [Fact]
    public async Task Detail_no_rules_returns_load_with_has_rules_false()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "student");
        var load = await Reader().GetStudentDetailLoadAsync(Ctx(Admin), School, false, Admin, "s1");
        Assert.NotNull(load);
        Assert.False(load!.HasRules);
    }

    // ---- recommendations ----

    [Fact]
    public async Task Recommendations_only_active_status_courses_ordered_by_code()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedRules(conn);
        await SeedUser(conn, "s1", School, role: "student");
        await SeedCourseFull(conn, "c2", School, "ENG-10", "English", 1, status: "active", isActive: true);
        await SeedCourseFull(conn, "c1", School, "ENG-9", "English", 1, status: "active", isActive: true);
        await SeedCourseFull(conn, "c3", School, "ENG-11", "English", 1, status: "inactive", isActive: true); // status filtered

        var load = await Reader().GetRecommendationsLoadAsync(Ctx(Admin), School, false, Admin, "s1");
        Assert.NotNull(load);
        Assert.Equal(new[] { "ENG-10", "ENG-9" }, load!.Courses.Select(c => c.Code).ToArray()); // code ASC; ENG-11 excluded
    }

    // ---- helpers ----

    private AcademicGapsReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx(string userId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "school_admin", "u@e.st", "User"),
            schoolId: School, permissions: new[] { "grades:read" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private async Task SeedRules(NpgsqlConnection conn)
    {
        await SeedAcademicYear(conn, "ay1", School, isCurrent: true);
        await SeedRuleSet(conn, "r1", School, "ay1", 24, isActive: true);
        await SeedCategory(conn, "cat1", "r1", "Core", 12, [], electives: true, sortOrder: 1, isActive: true);
    }

    private static async Task Exec(NpgsqlConnection conn, string sql, params (string, object?)[] ps)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        foreach (var (n, v) in ps)
        {
            cmd.Parameters.AddWithValue(n, v ?? DBNull.Value);
        }

        await cmd.ExecuteNonQueryAsync();
    }

    private static Task SeedUser(NpgsqlConnection conn, string id, string? schoolId, string? role = "student", string? name = "User", int? gradeLevel = null) =>
        Exec(conn, """INSERT INTO "users"("id","name","email","schoolId","roleName","gradeLevel") VALUES(@id,@n,@e,@s,@r,@g)""",
            ("id", id), ("n", name), ("e", id + "@e.st"), ("s", schoolId), ("r", role), ("g", gradeLevel));

    private static Task SeedAssignment(NpgsqlConnection conn, string id, string c, string s, bool isActive) =>
        Exec(conn, """INSERT INTO "counselor_student_assignments"("id","counselorId","studentId","isActive") VALUES(@id,@c,@s,@a)""",
            ("id", id), ("c", c), ("s", s), ("a", isActive));

    private static Task SeedGrade(NpgsqlConnection conn, string id, string s, string school, string course, decimal credits, string status, bool isActive) =>
        Exec(conn, """INSERT INTO "student_grades"("id","studentId","schoolId","courseId","credits","status","isActive") VALUES(@id,@s,@sc,@c,@cr,@st,@a)""",
            ("id", id), ("s", s), ("sc", school), ("c", course), ("cr", credits), ("st", status), ("a", isActive));

    private static Task SeedCourse(NpgsqlConnection conn, string id, string school, string code, string dept, decimal credits) =>
        SeedCourseFull(conn, id, school, code, dept, credits, status: "active", isActive: true);

    private static Task SeedCourseFull(NpgsqlConnection conn, string id, string school, string code, string dept, decimal credits, string status, bool isActive) =>
        Exec(conn, """INSERT INTO "school_courses"("id","schoolId","code","name","department","credits","status","isActive") VALUES(@id,@s,@c,@n,@d,@cr,@st,@a)""",
            ("id", id), ("s", school), ("c", code), ("n", code), ("d", dept), ("cr", credits), ("st", status), ("a", isActive));

    private static Task SeedAcademicYear(NpgsqlConnection conn, string id, string school, bool isCurrent) =>
        Exec(conn, """INSERT INTO "academic_years"("id","schoolId","isCurrent") VALUES(@id,@s,@c)""",
            ("id", id), ("s", school), ("c", isCurrent));

    private static Task SeedRuleSet(NpgsqlConnection conn, string id, string school, string ay, decimal total, bool isActive) =>
        Exec(conn, """INSERT INTO "graduation_rule_sets"("id","schoolId","academicYearId","totalCreditsRequired","isActive") VALUES(@id,@s,@ay,@t,@a)""",
            ("id", id), ("s", school), ("ay", ay), ("t", total), ("a", isActive));

    private static Task SeedCategory(NpgsqlConnection conn, string id, string ruleSetId, string category, decimal minCredits, string[] required, bool electives, int sortOrder, bool isActive) =>
        Exec(conn, """INSERT INTO "category_requirements"("id","ruleSetId","category","minCredits","requiredCourses","electivesAllowed","sortOrder","isActive") VALUES(@id,@rs,@c,@m,@rc,@e,@so,@a)""",
            ("id", id), ("rs", ruleSetId), ("c", category), ("m", minCredits), ("rc", required), ("e", electives), ("so", sortOrder), ("a", isActive));
}
