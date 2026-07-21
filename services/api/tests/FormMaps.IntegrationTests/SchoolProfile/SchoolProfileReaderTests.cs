using FormMaps.Application.Auth;
using FormMaps.Application.SchoolProfile;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolProfile;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolProfile;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC container tz) tests for <see cref="SchoolProfileReader"/> (FM-DOTNET-051).
/// Pins: getSchoolProfile full-row passthrough + the email alias (contactEmail set / null→""); missing row→null;
/// getSettings composed object with the JS-exact coalescing — maxStudents 0→300 (||), timezone ""→default (||),
/// notify false STAYS false + null→default (??) — plan hardcoded "Standard", studentCount both-case + active-only,
/// admin identity, and school-missing→null.
/// </summary>
public sealed class SchoolProfileReaderTests : IClassFixture<SchoolProfileDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";
    private const string Admin = "admin-1";

    private readonly SchoolProfileDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public SchoolProfileReaderTests(SchoolProfileDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "schools","users" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- getSchoolProfile ----

    [Fact]
    public async Task Profile_full_passthrough_with_email_alias()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedSchoolAsync(conn, contactEmail: "contact@school.test", maxStudents: 500,
            details: "About us", phone: "555", website: "https://s.test", timezone: "America/Chicago",
            address: """{"street":"1 A St","city":"Townsville"}""");

        var profile = await Reader().GetSchoolProfileAsync(Ctx(), School);

        Assert.NotNull(profile);
        Assert.Equal(School, profile!.Id);
        Assert.Equal("Test School", profile.Name);
        Assert.Equal("admin@school.test", profile.AdminEmail);
        Assert.Equal("contact@school.test", profile.ContactEmail);
        Assert.Equal("contact@school.test", profile.Email);          // email alias = contactEmail
        Assert.Equal(500, profile.MaxStudents);
        Assert.Equal("About us", profile.Details);
        Assert.Equal("America/Chicago", profile.Timezone);
        Assert.Equal("1 A St", profile.Address.GetProperty("street").GetString()); // jsonb passthrough
    }

    [Fact]
    public async Task Profile_null_contactEmail_yields_empty_email_alias()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedSchoolAsync(conn, contactEmail: null);

        var profile = await Reader().GetSchoolProfileAsync(Ctx(), School);

        Assert.NotNull(profile);
        Assert.Null(profile!.ContactEmail);
        Assert.Equal("", profile.Email); // contactEmail ?? ""
    }

    [Fact]
    public async Task Profile_null_address_yields_json_null()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedSchoolAsync(conn, address: null);

        var profile = await Reader().GetSchoolProfileAsync(Ctx(), School);

        Assert.NotNull(profile);
        Assert.Equal(System.Text.Json.JsonValueKind.Null, profile!.Address.ValueKind);
    }

    [Fact]
    public async Task Profile_missing_row_returns_null()
    {
        Assert.Null(await Reader().GetSchoolProfileAsync(Ctx(), "nope"));
    }

    // ---- getSettings ----

    [Fact]
    public async Task Settings_composes_with_defaults_and_student_count()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        // maxStudents 0 → 300 (||); timezone "" → default (||); notify flags NULL → ?? defaults.
        await SeedSchoolAsync(conn, maxStudents: 0, timezone: "",
            notifyOnStudentSignup: null, notifyOnAssessmentComplete: null, allowStudentSelfRegistration: null);
        await SeedUserAsync(conn, Admin, School, "Admin User", "admin@school.test", "SchoolAdmin");
        // students both-case + active; inactive + other-school excluded.
        await SeedUserAsync(conn, "s1", School, "S1", "s1@x.test", "Student");
        await SeedUserAsync(conn, "s2", School, "S2", "s2@x.test", "student");
        await SeedUserAsync(conn, "s3", School, "S3", "s3@x.test", "Student", isActive: false);
        await SeedUserAsync(conn, "sx", OtherSchool, "SX", "sx@x.test", "Student");

        var settings = await Reader().GetSettingsAsync(Ctx(), Admin, School);

        Assert.NotNull(settings);
        Assert.Equal("Test School", settings!.Name);
        Assert.Equal(2, settings.CurrentStudents);       // both-case active only
        Assert.Equal(300, settings.MaxStudents);         // 0 || 300
        Assert.Equal("Standard", settings.Plan);         // no plan column
        Assert.Equal("America/New_York", settings.Timezone); // "" || default
        Assert.True(settings.NotifyOnStudentSignup);     // null ?? true
        Assert.True(settings.NotifyOnAssessmentComplete);// null ?? true
        Assert.False(settings.AllowStudentSelfRegistration); // null ?? false
        Assert.Equal(Admin, settings.AdminId);
        Assert.Equal("Admin User", settings.AdminName);
        Assert.Equal("admin@school.test", settings.AdminEmail);
    }

    [Fact]
    public async Task Settings_notify_false_stays_false()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedSchoolAsync(conn, maxStudents: 250, timezone: "Europe/London",
            notifyOnStudentSignup: false, notifyOnAssessmentComplete: false, allowStudentSelfRegistration: true);
        await SeedUserAsync(conn, Admin, School, "Admin", "admin@school.test", "SchoolAdmin");

        var settings = await Reader().GetSettingsAsync(Ctx(), Admin, School);

        Assert.NotNull(settings);
        Assert.False(settings!.NotifyOnStudentSignup);       // false stays false (?? only coalesces null)
        Assert.False(settings.NotifyOnAssessmentComplete);
        Assert.True(settings.AllowStudentSelfRegistration);
        Assert.Equal(250, settings.MaxStudents);              // non-zero preserved
        Assert.Equal("Europe/London", settings.Timezone);    // non-empty preserved
    }

    [Fact]
    public async Task Settings_missing_school_returns_null()
    {
        Assert.Null(await Reader().GetSettingsAsync(Ctx(), Admin, "nope"));
    }

    // ---- helpers ----

    private SchoolProfileReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(Admin, "school-admin", "a@e.st", "Admin"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task SeedSchoolAsync(
        NpgsqlConnection conn,
        string? contactEmail = "contact@school.test",
        int maxStudents = 300,
        string? details = null,
        string? phone = null,
        string? website = null,
        string? timezone = "America/New_York",
        string? address = null,
        bool? notifyOnStudentSignup = null,
        bool? notifyOnAssessmentComplete = null,
        bool? allowStudentSelfRegistration = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "schools"
                ("id","name","adminEmail","contactEmail","maxStudents","details","phone","website","timezone",
                 "address","notifyOnStudentSignup","notifyOnAssessmentComplete","allowStudentSelfRegistration")
            VALUES (@id,'Test School','admin@school.test',@ce,@ms,@d,@p,@w,@tz,
                    CAST(@addr AS jsonb),@nss,@nac,@asr)
            """, conn);
        cmd.Parameters.AddWithValue("id", School);
        cmd.Parameters.AddWithValue("ce", (object?)contactEmail ?? DBNull.Value);
        cmd.Parameters.AddWithValue("ms", maxStudents);
        cmd.Parameters.AddWithValue("d", (object?)details ?? DBNull.Value);
        cmd.Parameters.AddWithValue("p", (object?)phone ?? DBNull.Value);
        cmd.Parameters.AddWithValue("w", (object?)website ?? DBNull.Value);
        cmd.Parameters.AddWithValue("tz", (object?)timezone ?? DBNull.Value);
        cmd.Parameters.AddWithValue("addr", (object?)address ?? DBNull.Value);
        cmd.Parameters.AddWithValue("nss", (object?)notifyOnStudentSignup ?? DBNull.Value);
        cmd.Parameters.AddWithValue("nac", (object?)notifyOnAssessmentComplete ?? DBNull.Value);
        cmd.Parameters.AddWithValue("asr", (object?)allowStudentSelfRegistration ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedUserAsync(
        NpgsqlConnection conn, string id, string schoolId, string name, string email, string role, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "users" ("id","name","email","roleName","schoolId","isActive")
            VALUES (@id,@name,@email,@role,@sid,@active)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.AddWithValue("email", email);
        cmd.Parameters.AddWithValue("role", role);
        cmd.Parameters.AddWithValue("sid", schoolId);
        cmd.Parameters.AddWithValue("active", isActive);
        await cmd.ExecuteNonQueryAsync();
    }
}
