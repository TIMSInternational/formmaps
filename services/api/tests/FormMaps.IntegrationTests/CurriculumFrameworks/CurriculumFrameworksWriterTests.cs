using FormMaps.Application.Auth;
using FormMaps.Application.CurriculumFrameworks;
using FormMaps.Infrastructure.CurriculumFrameworks;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.CurriculumFrameworks;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC container tz) tests for <see cref="CurriculumFrameworksWriter"/> (FM-DOTNET-055).
/// Pins updateFrameworks: UPSERT enable (create) + disable (update) with configuredAt set on both branches, and an
/// EMPTY list writes NOTHING. Pins customizeFrameworkCourse: 404 when the course id is missing; 400 when the course's
/// frameworkType != :type.ToUpperCase() (incl. the lower-case :type still matching via uppercasing); the CREATE branch
/// sets credits/localName/createdBy; and — THE KEY TRAP — the UPDATE branch's create-vs-update undefined asymmetry:
/// a body WITHOUT credits KEEPS the existing credits (NOT nulled), a body WITHOUT localName keeps the existing
/// localName, gradeLevels is ALWAYS replaced, and updatedBy is always set. Plus the merged response shape.
/// </summary>
public sealed class CurriculumFrameworksWriterTests
    : IClassFixture<CurriculumFrameworksDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string User = "user-1";

    private readonly CurriculumFrameworksDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CurriculumFrameworksWriterTests(CurriculumFrameworksDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "curriculum_frameworks","framework_courses","school_framework_course_overrides" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- updateFrameworks ----

    [Fact]
    public async Task UpdateFrameworks_creates_then_updates_row_with_configuredAt()
    {
        await Writer().UpdateFrameworksAsync(Ctx(), School, [("AP", true, true)]);

        var (enabled1, configuredAt1) = await ReadFrameworkAsync("AP");
        Assert.True(enabled1);
        Assert.NotNull(configuredAt1); // configuredAt set on create

        await Writer().UpdateFrameworksAsync(Ctx(), School, [("AP", false, true)]);

        var (enabled2, configuredAt2) = await ReadFrameworkAsync("AP");
        Assert.False(enabled2);        // updated in place (single row via ON CONFLICT)
        Assert.NotNull(configuredAt2); // configuredAt bumped on update too

        Assert.Equal(1, await CountFrameworksAsync()); // upsert, not duplicate insert
    }

    [Fact]
    public async Task UpdateFrameworks_absent_enabled_keeps_existing_on_update()
    {
        // Create AP enabled=true, then an element that OMITS enabled (HasEnabled=false) → UPDATE must SKIP the
        // enabled column (legacy `update:{enabled:undefined}`), preserving true. Only configuredAt is bumped.
        await Writer().UpdateFrameworksAsync(Ctx(), School, [("AP", true, true)]);
        await Writer().UpdateFrameworksAsync(Ctx(), School, [("AP", false, false)]); // enabled absent → skip

        Assert.True((await ReadFrameworkAsync("AP")).Enabled);   // PRESERVED — the undefined-skip trap
        Assert.Equal(1, await CountFrameworksAsync());
    }

    [Fact]
    public async Task UpdateFrameworks_absent_enabled_defaults_false_on_create()
    {
        // No existing row + element omits enabled (HasEnabled=false) → CREATE writes the column default (false).
        await Writer().UpdateFrameworksAsync(Ctx(), School, [("IB", false, false)]);

        Assert.False((await ReadFrameworkAsync("IB")).Enabled);
    }

    [Fact]
    public async Task UpdateFrameworks_empty_list_writes_nothing()
    {
        await Writer().UpdateFrameworksAsync(Ctx(), School, []);

        Assert.Equal(0, await CountFrameworksAsync());
    }

    [Fact]
    public async Task UpdateFrameworks_upserts_multiple_types_in_one_call()
    {
        await Writer().UpdateFrameworksAsync(Ctx(), School, [("AP", true, true), ("IB", false, true), ("CUSTOM", true, true)]);

        Assert.Equal(3, await CountFrameworksAsync());
        Assert.True((await ReadFrameworkAsync("AP")).Enabled);
        Assert.False((await ReadFrameworkAsync("IB")).Enabled);
    }

    // ---- customizeFrameworkCourse: guards ----

    [Fact]
    public async Task Customize_missing_course_is_404()
    {
        var result = await Writer().CustomizeFrameworkCourseAsync(
            Ctx(), School, User, "AP", "does-not-exist", Input());

        Assert.Equal(404, result.Status);
        Assert.Equal("Course not found", result.Error);
    }

    [Fact]
    public async Task Customize_wrong_framework_type_is_400()
    {
        await InsertCourseAsync("c1", "IB", "IB101"); // course is IB

        var result = await Writer().CustomizeFrameworkCourseAsync(Ctx(), School, User, "AP", "c1", Input());

        Assert.Equal(400, result.Status);
        Assert.Equal("Course does not belong to this framework type", result.Error);
    }

    [Fact]
    public async Task Customize_lowercase_type_still_matches_via_uppercase()
    {
        await InsertCourseAsync("c1", "AP", "AP101"); // course stored uppercase AP

        // :type = "ap" (lowercase) → uppercased to "AP" → matches → success (NOT a 400).
        var result = await Writer().CustomizeFrameworkCourseAsync(Ctx(), School, User, "ap", "c1", Input());

        Assert.Equal(200, result.Status);
        Assert.Null(result.Error);
    }

    // ---- customizeFrameworkCourse: create branch ----

    [Fact]
    public async Task Customize_create_sets_credits_localName_gradeLevels_and_createdBy()
    {
        await InsertCourseAsync("c1", "AP", "AP101", name: "Base Name", credits: 1m, gradeLevels: [9]);

        var result = await Writer().CustomizeFrameworkCourseAsync(
            Ctx(), School, User, "AP", "c1",
            new FrameworkOverrideInput(HasCredits: true, Credits: 5m, GradeLevels: [11, 12], HasLocalName: true, LocalName: "Local Name"));

        Assert.Equal(200, result.Status);
        var stored = await ReadOverrideAsync("c1");
        Assert.Equal(5.0, stored.Credits);
        Assert.Equal([11, 12], stored.GradeLevels);
        Assert.Equal("Local Name", stored.LocalName);
        Assert.Equal(User, stored.CreatedBy);
        Assert.Null(stored.UpdatedBy); // create does NOT set updatedBy
    }

    [Fact]
    public async Task Customize_create_absent_credits_and_localName_are_null()
    {
        await InsertCourseAsync("c1", "AP", "AP101");

        // Absent credits + localName on CREATE → NULL (create-branch behavior).
        await Writer().CustomizeFrameworkCourseAsync(
            Ctx(), School, User, "AP", "c1",
            new FrameworkOverrideInput(HasCredits: false, Credits: null, GradeLevels: [9], HasLocalName: false, LocalName: null));

        var stored = await ReadOverrideAsync("c1");
        Assert.Null(stored.Credits);
        Assert.Null(stored.LocalName);
        Assert.Equal([9], stored.GradeLevels);
    }

    // ---- THE KEY TRAP: update-branch create-vs-update undefined asymmetry ----

    [Fact]
    public async Task Customize_update_without_credits_keeps_existing_credits()
    {
        await InsertCourseAsync("c1", "AP", "AP101");
        await SeedOverrideAsync("c1", credits: 7m, gradeLevels: [9], localName: "Existing");

        // Body WITHOUT credits (HasCredits=false) → credits must NOT be written → keeps 7 (NOT nulled).
        await Writer().CustomizeFrameworkCourseAsync(
            Ctx(), School, User, "AP", "c1",
            new FrameworkOverrideInput(HasCredits: false, Credits: null, GradeLevels: [10], HasLocalName: false, LocalName: null));

        var stored = await ReadOverrideAsync("c1");
        Assert.Equal(7.0, stored.Credits);          // PRESERVED — the trap
        Assert.Equal("Existing", stored.LocalName); // PRESERVED — the trap
        Assert.Equal([10], stored.GradeLevels);     // ALWAYS replaced
        Assert.Equal(User, stored.UpdatedBy);       // ALWAYS set on update
    }

    [Fact]
    public async Task Customize_update_present_null_credits_clears_to_null()
    {
        await InsertCourseAsync("c1", "AP", "AP101");
        await SeedOverrideAsync("c1", credits: 7m, gradeLevels: [9], localName: "Existing");

        // Body WITH credits:null (HasCredits=true, value null) → SET NULL (present-with-null writes).
        await Writer().CustomizeFrameworkCourseAsync(
            Ctx(), School, User, "AP", "c1",
            new FrameworkOverrideInput(HasCredits: true, Credits: null, GradeLevels: [9], HasLocalName: false, LocalName: null));

        var stored = await ReadOverrideAsync("c1");
        Assert.Null(stored.Credits);                // cleared (present-with-null)
        Assert.Equal("Existing", stored.LocalName); // localName absent → preserved
    }

    [Fact]
    public async Task Customize_update_gradeLevels_always_replaced_even_when_empty()
    {
        await InsertCourseAsync("c1", "AP", "AP101");
        await SeedOverrideAsync("c1", credits: 7m, gradeLevels: [9, 10, 11], localName: "Existing");

        await Writer().CustomizeFrameworkCourseAsync(
            Ctx(), School, User, "AP", "c1",
            new FrameworkOverrideInput(HasCredits: false, Credits: null, GradeLevels: [], HasLocalName: false, LocalName: null));

        var stored = await ReadOverrideAsync("c1");
        Assert.Empty(stored.GradeLevels); // replaced with [] (always written)
    }

    // ---- merged response ----

    [Fact]
    public async Task Customize_merged_response_shape()
    {
        await InsertCourseAsync("c1", "AP", "AP101", name: "Base Name", department: "Math", credits: 3m,
            gradeLevels: [9, 10], description: "Desc");

        // localName override wins for name; credits override wins; gradeLevel (singular) = override (non-empty).
        var withOverride = await Writer().CustomizeFrameworkCourseAsync(
            Ctx(), School, User, "AP", "c1",
            new FrameworkOverrideInput(true, 8m, [12], true, "Custom Name"));

        var data = withOverride.Data!;
        Assert.Equal("c1", data.Id);
        Assert.Equal("AP101", data.Code);
        Assert.Equal("Custom Name", data.Name);       // localName || course.name
        Assert.Equal("AP", data.FrameworkType);
        Assert.Equal("Math", data.Department);
        Assert.Equal("8", data.Credits);              // override.credits ?? course.credits, decimal.js string
        Assert.Equal([12], data.GradeLevel);          // singular key, override wins (non-empty)
        Assert.Equal("Desc", data.Description);
        Assert.True(data.IsCustomized);
    }

    [Fact]
    public async Task Customize_merged_response_falls_back_to_course_values()
    {
        await InsertCourseAsync("c1", "AP", "AP101", name: "Base Name", credits: 3m, gradeLevels: [9, 10]);

        // Override with no credits and empty gradeLevels + empty localName → response falls back to course values.
        var result = await Writer().CustomizeFrameworkCourseAsync(
            Ctx(), School, User, "AP", "c1",
            new FrameworkOverrideInput(HasCredits: false, Credits: null, GradeLevels: [], HasLocalName: true, LocalName: ""));

        var data = result.Data!;
        Assert.Equal("Base Name", data.Name);   // localName "" falsy → course.name
        Assert.Equal("3", data.Credits);         // no override credits → course.credits (decimal.js string)
        Assert.Equal([9, 10], data.GradeLevel);  // override empty → course.gradeLevels
    }

    // ---- helpers ----

    private CurriculumFrameworksWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static FrameworkOverrideInput Input() =>
        new(HasCredits: false, Credits: null, GradeLevels: [], HasLocalName: false, LocalName: null);

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(User, "school-admin", "a@e.st", "Admin"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private async Task<(bool Enabled, DateTime? ConfiguredAt)> ReadFrameworkAsync(string type)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT "enabled","configuredAt" FROM "curriculum_frameworks" WHERE "schoolId"=@sid AND "type"=@type""", conn);
        cmd.Parameters.AddWithValue("sid", School);
        cmd.Parameters.AddWithValue("type", type);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (reader.GetBoolean(0), reader.IsDBNull(1) ? null : reader.GetDateTime(1));
    }

    private async Task<int> CountFrameworksAsync()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""SELECT COUNT(*)::int FROM "curriculum_frameworks" """, conn);
        return (int)(await cmd.ExecuteScalarAsync())!;
    }

    private async Task<(double? Credits, int[] GradeLevels, string? LocalName, string? CreatedBy, string? UpdatedBy)> ReadOverrideAsync(string courseId)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT "credits"::double precision,"gradeLevels","localName","createdBy","updatedBy" FROM "school_framework_course_overrides" WHERE "schoolId"=@sid AND "frameworkCourseId"=@cid""", conn);
        cmd.Parameters.AddWithValue("sid", School);
        cmd.Parameters.AddWithValue("cid", courseId);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (
            reader.IsDBNull(0) ? null : reader.GetDouble(0),
            reader.IsDBNull(1) ? [] : reader.GetFieldValue<int[]>(1),
            reader.IsDBNull(2) ? null : reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            reader.IsDBNull(4) ? null : reader.GetString(4));
    }

    private async Task SeedOverrideAsync(string courseId, decimal? credits, int[] gradeLevels, string? localName)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "school_framework_course_overrides"
                ("id","schoolId","frameworkCourseId","credits","gradeLevels","localName","createdBy","updatedAt")
            VALUES (@id,@sid,@cid,@credits,@grades,@ln,'seed-creator',now())
            """, conn);
        cmd.Parameters.AddWithValue("id", $"ov-{courseId}");
        cmd.Parameters.AddWithValue("sid", School);
        cmd.Parameters.AddWithValue("cid", courseId);
        cmd.Parameters.AddWithValue("credits", (object?)credits ?? DBNull.Value);
        cmd.Parameters.AddWithValue("grades", gradeLevels);
        cmd.Parameters.AddWithValue("ln", (object?)localName ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task InsertCourseAsync(
        string id, string frameworkType, string code, string name = "Course", string? department = null,
        decimal credits = 0m, int[]? gradeLevels = null, string? description = null)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "framework_courses"
                ("id","frameworkType","code","name","department","credits","gradeLevels","description","updatedAt")
            VALUES (@id,@ft,@code,@name,@dept,@credits,@grades,@desc,now())
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("ft", frameworkType);
        cmd.Parameters.AddWithValue("code", code);
        cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.AddWithValue("dept", (object?)department ?? DBNull.Value);
        cmd.Parameters.AddWithValue("credits", credits);
        cmd.Parameters.AddWithValue("grades", gradeLevels ?? []);
        cmd.Parameters.AddWithValue("desc", (object?)description ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }
}
