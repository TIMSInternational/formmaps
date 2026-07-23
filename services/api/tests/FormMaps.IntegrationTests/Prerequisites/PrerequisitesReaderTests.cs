using FormMaps.Application.Auth;
using FormMaps.Application.Prerequisites;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Prerequisites;
using Npgsql;

namespace FormMaps.IntegrationTests.Prerequisites;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC tz) tests for <see cref="PrerequisitesReader"/> (FM-DOTNET-057). Pins the chain
/// BFS (depth-DESC STABLE order, cycle-safety, heterogeneous credits: catalog=STRING vs non-catalog=NUMBER 0), the
/// eligibility engine (grade gate incl. falsy-0, "Not in catalog" vs incomplete, completed → eligible), resolveCourse
/// (id-in-school then EXACT case-sensitive code), the student cross-school 404, and computeEligibilityMap's two-set
/// design (resolution = full catalog incl inactive; enumeration = active+status='active' only).
/// </summary>
public sealed class PrerequisitesReaderTests : IClassFixture<PrerequisitesDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string Student = "student-1";
    private readonly PrerequisitesDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public PrerequisitesReaderTests(PrerequisitesDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        foreach (var t in new[] { "school_courses", "student_grades", "users" })
        {
            await using var cmd = new NpgsqlCommand($"TRUNCATE \"{t}\"", conn);
            await cmd.ExecuteNonQueryAsync();
        }
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- getPrerequisiteChain ----

    [Fact]
    public async Task Chain_foreign_or_missing_course_is_null()
    {
        await InsertCourseAsync("c1", "MATH1", school: "other-school");
        Assert.Null(await Reader().GetPrerequisiteChainAsync(Ctx(), School, "c1"));
        Assert.Null(await Reader().GetPrerequisiteChainAsync(Ctx(), School, "does-not-exist"));
    }

    [Fact]
    public async Task Chain_walks_depth_and_sorts_desc_with_totaldepth()
    {
        // A -> [B]; B -> [C]. chain built B@1, C@2; sorted DESC → C@2 then B@1. totalDepth = 2.
        await InsertCourseAsync("A", "A", prerequisites: ["B"]);
        await InsertCourseAsync("B", "B", prerequisites: ["C"]);
        await InsertCourseAsync("C", "C");

        var result = await Reader().GetPrerequisiteChainAsync(Ctx(), School, "A");

        Assert.NotNull(result);
        Assert.Equal("A", result!.CourseCode);
        Assert.Equal(["C", "B"], result.Chain.Select(c => c.Code));
        Assert.Equal([2, 1], result.Chain.Select(c => c.Depth));
        Assert.Equal(2, result.TotalDepth);
    }

    [Fact]
    public async Task Chain_credits_are_heterogeneous_catalog_string_vs_noncatalog_number()
    {
        // A -> [B (in catalog), GHOST (not in catalog)]. Both depth 1 → stable order preserves BFS [B, GHOST].
        await InsertCourseAsync("A", "A", prerequisites: ["B", "GHOST"]);
        await InsertCourseAsync("B", "B", credits: 0.5m);

        var result = await Reader().GetPrerequisiteChainAsync(Ctx(), School, "A");

        Assert.NotNull(result);
        Assert.Equal(["B", "GHOST"], result!.Chain.Select(c => c.Code)); // stable BFS order at equal depth

        var catalog = result.Chain.Single(c => c.Code == "B");
        Assert.IsType<string>(catalog.Credits);            // catalog → decimal.js STRING (trim_scale)
        Assert.Equal("0.5", catalog.Credits);

        var ghost = result.Chain.Single(c => c.Code == "GHOST");
        Assert.IsType<int>(ghost.Credits);                 // non-catalog → NUMBER 0
        Assert.Equal(0, ghost.Credits);
        Assert.Equal("GHOST", ghost.Name);                 // name = code
        Assert.Equal("", ghost.Department);
    }

    [Fact]
    public async Task Chain_is_cycle_safe()
    {
        await InsertCourseAsync("A", "A", prerequisites: ["B"]);
        await InsertCourseAsync("B", "B", prerequisites: ["A"]); // A<->B cycle

        var result = await Reader().GetPrerequisiteChainAsync(Ctx(), School, "A");

        Assert.NotNull(result);
        Assert.Equal(2, result!.Chain.Count); // visited stops the loop (B@1, A@2)
    }

    // ---- checkEligibility ----

    [Fact]
    public async Task Check_student_missing_or_cross_school_is_student_not_found()
    {
        await InsertCourseAsync("c1", "MATH1");
        Assert.Equal(PrerequisiteLookupOutcome.StudentNotFound,
            (await Reader().CheckEligibilityAsync(Ctx(), School, "nobody", "c1")).Outcome);

        await InsertStudentAsync("s-other", school: "other-school", gradeLevel: 9);
        Assert.Equal(PrerequisiteLookupOutcome.StudentNotFound,
            (await Reader().CheckEligibilityAsync(Ctx(), School, "s-other", "c1")).Outcome);
    }

    [Fact]
    public async Task Check_course_missing_is_course_not_found()
    {
        await InsertStudentAsync(Student, School, gradeLevel: 9);
        Assert.Equal(PrerequisiteLookupOutcome.CourseNotFound,
            (await Reader().CheckEligibilityAsync(Ctx(), School, Student, "nope")).Outcome);
    }

    [Fact]
    public async Task Check_resolves_by_id_then_exact_code()
    {
        await InsertStudentAsync(Student, School, gradeLevel: 9);
        await InsertCourseAsync("cid", "BIO", gradeLevels: [9]);

        var byId = await Reader().CheckEligibilityAsync(Ctx(), School, Student, "cid");
        Assert.Equal("cid", byId.CourseId);

        var byCode = await Reader().CheckEligibilityAsync(Ctx(), School, Student, "BIO");
        Assert.Equal("cid", byCode.CourseId);

        // exact case-sensitive: "bio" is neither an id nor the exact code → not found.
        Assert.Equal(PrerequisiteLookupOutcome.CourseNotFound,
            (await Reader().CheckEligibilityAsync(Ctx(), School, Student, "bio")).Outcome);
    }

    [Fact]
    public async Task Check_grade_gate_errors_and_zero_is_falsy()
    {
        await InsertCourseAsync("c1", "MATH1", gradeLevels: [10, 11]);

        await InsertStudentAsync(Student, School, gradeLevel: 9);
        var g9 = await Reader().CheckEligibilityAsync(Ctx(), School, Student, "c1");
        Assert.False(g9.Eligible);
        Assert.Contains("Not available for grade 9", g9.Errors);

        // gradeLevel 0 is JS-falsy → grade gate skipped → eligible (no prereqs).
        await SetGradeLevelAsync(Student, 0);
        var g0 = await Reader().CheckEligibilityAsync(Ctx(), School, Student, "c1");
        Assert.True(g0.Eligible);
        Assert.Empty(g0.Errors);
    }

    [Fact]
    public async Task Check_prereq_not_in_catalog_vs_incomplete_vs_complete()
    {
        await InsertStudentAsync(Student, School, gradeLevel: 9);
        await InsertCourseAsync("target", "TARGET", prerequisites: ["PRE", "GHOST"]);
        await InsertCourseAsync("pre", "PRE", name: "Prereq One");

        // Nothing completed → PRE missing (by name) + GHOST "Not in catalog".
        var before = await Reader().CheckEligibilityAsync(Ctx(), School, Student, "target");
        Assert.False(before.Eligible);
        Assert.Contains(before.Missing, m => m.Code == "PRE" && m.Name == "Prereq One");
        Assert.Contains(before.Missing, m => m.Code == "GHOST" && m.Name == "Not in catalog");
        Assert.Contains("Missing: Prereq One", before.Errors);
        Assert.Contains("Missing: GHOST", before.Errors);

        // Complete PRE → PRE resolves out; GHOST still "Not in catalog".
        await InsertGradeAsync(Student, "pre");
        var after = await Reader().CheckEligibilityAsync(Ctx(), School, Student, "target");
        Assert.DoesNotContain(after.Missing, m => m.Code == "PRE");
        Assert.Contains(after.Missing, m => m.Code == "GHOST");
    }

    // ---- computeEligibilityMap (two-set) ----

    [Fact]
    public async Task Eligible_two_set_resolution_includes_inactive_enumeration_active_only()
    {
        await InsertStudentAsync(Student, School, gradeLevel: 9);
        // X (active) requires OLD; OLD is INACTIVE/draft; student completed OLD.
        await InsertCourseAsync("x", "X", prerequisites: ["OLD"]);
        await InsertCourseAsync("old", "OLD", isActive: false, status: "draft");
        await InsertGradeAsync(Student, "old");

        var result = await Reader().ComputeEligibleAsync(Ctx(), School, Student);

        Assert.Equal(PrerequisiteLookupOutcome.Ok, result.Outcome);
        // Enumeration: OLD (inactive) is NOT a candidate; X is.
        Assert.DoesNotContain(result.Candidates, c => c.CourseCode == "OLD");
        var x = result.Candidates.Single(c => c.CourseCode == "X");
        // Resolution saw the inactive OLD + the completed grade → X is eligible.
        Assert.True(x.Eligible);
    }

    [Fact]
    public async Task Eligible_student_missing_is_student_not_found()
    {
        Assert.Equal(PrerequisiteLookupOutcome.StudentNotFound,
            (await Reader().ComputeEligibleAsync(Ctx(), School, "nobody")).Outcome);
    }

    // ---- helpers ----

    private PrerequisitesReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school-admin", "a@e.st", "Admin"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private async Task InsertCourseAsync(
        string id, string code, string? school = null, string? name = null, decimal credits = 0m,
        int[]? gradeLevels = null, string[]? prerequisites = null, bool isActive = true, string status = "active")
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "school_courses"
                ("id","schoolId","code","name","department","credits","gradeLevels","prerequisites","isActive","status","updatedAt")
            VALUES (@id,@sid,@code,@name,'Dept',@credits,@grades,@prereqs,@active,@status, now())
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("sid", school ?? School);
        cmd.Parameters.AddWithValue("code", code);
        cmd.Parameters.AddWithValue("name", name ?? code);
        cmd.Parameters.AddWithValue("credits", credits);
        cmd.Parameters.AddWithValue("grades", gradeLevels ?? []);
        cmd.Parameters.AddWithValue("prereqs", prerequisites ?? []);
        cmd.Parameters.AddWithValue("active", isActive);
        cmd.Parameters.AddWithValue("status", status);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task InsertStudentAsync(string id, string school, int? gradeLevel)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users" ("id","schoolId","gradeLevel") VALUES (@id,@sid,@g)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("sid", school);
        cmd.Parameters.AddWithValue("g", (object?)gradeLevel ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task SetGradeLevelAsync(string id, int gradeLevel)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""UPDATE "users" SET "gradeLevel" = @g WHERE "id" = @id""", conn);
        cmd.Parameters.AddWithValue("g", gradeLevel);
        cmd.Parameters.AddWithValue("id", id);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task InsertGradeAsync(string studentId, string courseId, string status = "completed", bool isActive = true)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_grades" ("id","schoolId","studentId","courseId","status","isActive")
            VALUES (@id,@sid,@student,@course,@status,@active)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("sid", School);
        cmd.Parameters.AddWithValue("student", studentId);
        cmd.Parameters.AddWithValue("course", courseId);
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("active", isActive);
        await cmd.ExecuteNonQueryAsync();
    }
}
