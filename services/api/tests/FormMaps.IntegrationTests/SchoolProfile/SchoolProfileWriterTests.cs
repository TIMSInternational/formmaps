using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolProfile;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolProfile;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolProfile;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC container tz) tests for <see cref="SchoolProfileWriter"/> (FM-DOTNET-051).
/// Pins: profile UPDATE writes ONLY the allow-listed columns (mass-assignment guard end-to-end via the builder),
/// email ""→NULL clear / valid→set, address FULL jsonb replace (omitted fields cleared), the empty-patch NO-OP that
/// still returns the row AND bumps updatedAt, and updateSettings allow-list (notify booleans + truthy timezone,
/// RETURNING raw values) incl. its own empty-patch updatedAt bump.
/// </summary>
public sealed class SchoolProfileWriterTests : IClassFixture<SchoolProfileDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string Admin = "admin-1";
    private static readonly DateTime SeedUpdatedAt = new(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);

    private readonly SchoolProfileDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public SchoolProfileWriterTests(SchoolProfileDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "schools","users" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- updateSchoolProfile ----

    [Fact]
    public async Task Profile_writes_allowlisted_columns_and_ignores_unknown_keys()
    {
        await SeedSchoolAsync(contactEmail: "old@s.test", maxStudents: 111);

        var columns = Build("""
            {
              "name": "New Name",
              "timezone": "America/Chicago",
              "email": "new@s.test",
              "adminEmail": "attacker@evil.test",
              "maxStudents": 99999,
              "plan": "Enterprise"
            }
            """);
        var profile = await Writer().UpdateSchoolProfileAsync(Ctx(), School, columns);

        Assert.Equal("New Name", profile.Name);
        Assert.Equal("America/Chicago", profile.Timezone);
        Assert.Equal("new@s.test", profile.ContactEmail);
        Assert.Equal("new@s.test", profile.Email);
        // Mass-assignment guard: unlisted keys NEVER written.
        Assert.Equal("admin@school.test", profile.AdminEmail); // unchanged (adminEmail not editable)
        Assert.Equal(111, profile.MaxStudents);                // unchanged (maxStudents not editable)
    }

    [Fact]
    public async Task Profile_email_empty_clears_contactEmail_to_null()
    {
        await SeedSchoolAsync(contactEmail: "old@s.test");

        var profile = await Writer().UpdateSchoolProfileAsync(Ctx(), School, Build("""{"email":""}"""));

        Assert.Null(profile.ContactEmail);
        Assert.Equal("", profile.Email);
    }

    [Fact]
    public async Task Profile_invalid_email_is_not_written()
    {
        await SeedSchoolAsync(contactEmail: "old@s.test");

        var profile = await Writer().UpdateSchoolProfileAsync(Ctx(), School, Build("""{"email":"not-an-email"}"""));

        Assert.Equal("old@s.test", profile.ContactEmail); // preserved (invalid ignored)
    }

    [Fact]
    public async Task Profile_address_is_full_replace_clearing_omitted_fields()
    {
        await SeedSchoolAsync(address: """{"street":"OLD St","city":"OldCity","state":"OS","country":"OC","postalCode":"00000"}""");

        var profile = await Writer().UpdateSchoolProfileAsync(
            Ctx(), School, Build("""{"address":{"street":"NEW St","city":"NewCity"}}"""));

        Assert.Equal("NEW St", profile.Address.GetProperty("street").GetString());
        Assert.Equal("NewCity", profile.Address.GetProperty("city").GetString());
        // Omitted fields are GONE (full replace, not merge).
        Assert.False(profile.Address.TryGetProperty("state", out _));
        Assert.False(profile.Address.TryGetProperty("country", out _));
        Assert.False(profile.Address.TryGetProperty("postalCode", out _));
    }

    [Fact]
    public async Task Profile_empty_patch_is_noop_that_returns_row_and_bumps_updatedAt()
    {
        await SeedSchoolAsync(contactEmail: "keep@s.test", maxStudents: 321);

        var profile = await Writer().UpdateSchoolProfileAsync(Ctx(), School, []);

        // Row returned unchanged...
        Assert.Equal("keep@s.test", profile.ContactEmail);
        Assert.Equal(321, profile.MaxStudents);
        // ...but updatedAt bumped off the 2020 seed (Prisma @updatedAt fires on every update, incl. {}).
        var updatedAt = await ReadUpdatedAtAsync();
        Assert.True(updatedAt > SeedUpdatedAt, $"updatedAt {updatedAt:o} should be after seed {SeedUpdatedAt:o}");
    }

    // ---- updateSettings ----

    [Fact]
    public async Task Settings_writes_flags_and_timezone_returning_raw_values()
    {
        await SeedSchoolAsync(maxStudents: 250,
            notifyOnStudentSignup: null, notifyOnAssessmentComplete: null, allowStudentSelfRegistration: null,
            timezone: "America/New_York");

        var patch = new SchoolSettingsPatch(
            HasNotifyOnStudentSignup: true, NotifyOnStudentSignup: false,
            HasNotifyOnAssessmentComplete: true, NotifyOnAssessmentComplete: true,
            HasAllowStudentSelfRegistration: true, AllowStudentSelfRegistration: true,
            HasTimezone: true, Timezone: "Europe/London");

        var result = await Writer().UpdateSettingsAsync(Ctx(), School, patch);

        Assert.False(result.NotifyOnStudentSignup);   // raw stored false
        Assert.True(result.NotifyOnAssessmentComplete);
        Assert.True(result.AllowStudentSelfRegistration);
        Assert.Equal("Europe/London", result.Timezone);
        Assert.Equal(250, result.MaxStudents);        // raw column (not coalesced by the writer)
    }

    [Fact]
    public async Task Settings_null_flag_clears_column_to_null_and_returns_null()
    {
        // A previously-true flag is cleared by a present JSON null (legacy `data.x = null`); the RETURNING value and
        // the stored column are both NULL (NOT the getSettings ?? default — that coalescing is GET-only).
        await SeedSchoolAsync(maxStudents: 300,
            notifyOnStudentSignup: true, notifyOnAssessmentComplete: true, allowStudentSelfRegistration: true);

        var patch = new SchoolSettingsPatch(
            HasNotifyOnStudentSignup: true, NotifyOnStudentSignup: null,   // clear to NULL
            HasNotifyOnAssessmentComplete: false, NotifyOnAssessmentComplete: null,
            HasAllowStudentSelfRegistration: false, AllowStudentSelfRegistration: null,
            HasTimezone: false, Timezone: null);

        var result = await Writer().UpdateSettingsAsync(Ctx(), School, patch);

        Assert.Null(result.NotifyOnStudentSignup);          // RETURNING null (not ?? true)
        Assert.True(result.NotifyOnAssessmentComplete);     // untouched
        Assert.True(result.AllowStudentSelfRegistration);   // untouched

        // The stored column is really NULL.
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT "notifyOnStudentSignup" FROM "schools" WHERE "id"=@id""", conn);
        cmd.Parameters.AddWithValue("id", School);
        Assert.Equal(DBNull.Value, await cmd.ExecuteScalarAsync());
    }

    [Fact]
    public async Task Settings_empty_patch_returns_raw_row_and_bumps_updatedAt()
    {
        await SeedSchoolAsync(maxStudents: 250,
            notifyOnStudentSignup: null, allowStudentSelfRegistration: true, timezone: null);

        var result = await Writer().UpdateSettingsAsync(Ctx(), School, EmptyPatch());

        // RAW row (NO coalescing) — an unset nullable flag reads back null; timezone null.
        Assert.Null(result.NotifyOnStudentSignup);
        Assert.True(result.AllowStudentSelfRegistration);
        Assert.Null(result.Timezone);
        Assert.Equal(250, result.MaxStudents);

        var updatedAt = await ReadUpdatedAtAsync();
        Assert.True(updatedAt > SeedUpdatedAt, $"updatedAt {updatedAt:o} should be after seed {SeedUpdatedAt:o}");
    }

    // ---- helpers ----

    private SchoolProfileWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static IReadOnlyList<SchoolProfileColumn> Build(string json) =>
        SchoolProfileUpdateBuilder.Build(JsonDocument.Parse(json).RootElement);

    private static SchoolSettingsPatch EmptyPatch() =>
        new(false, false, false, false, false, false, false, null);

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(Admin, "school-admin", "a@e.st", "Admin"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private async Task<DateTime> ReadUpdatedAtAsync()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""SELECT "updatedAt" FROM "schools" WHERE "id"=@id""", conn);
        cmd.Parameters.AddWithValue("id", School);
        return (DateTime)(await cmd.ExecuteScalarAsync())!;
    }

    private async Task SeedSchoolAsync(
        string? contactEmail = "contact@school.test",
        int maxStudents = 300,
        string? address = null,
        string? timezone = "America/New_York",
        bool? notifyOnStudentSignup = null,
        bool? notifyOnAssessmentComplete = null,
        bool? allowStudentSelfRegistration = null)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "schools"
                ("id","name","adminEmail","contactEmail","maxStudents","address","timezone",
                 "notifyOnStudentSignup","notifyOnAssessmentComplete","allowStudentSelfRegistration","updatedAt")
            VALUES (@id,'Test School','admin@school.test',@ce,@ms,CAST(@addr AS jsonb),@tz,@nss,@nac,@asr,@ua)
            """, conn);
        cmd.Parameters.AddWithValue("id", School);
        cmd.Parameters.AddWithValue("ce", (object?)contactEmail ?? DBNull.Value);
        cmd.Parameters.AddWithValue("ms", maxStudents);
        cmd.Parameters.AddWithValue("addr", (object?)address ?? DBNull.Value);
        cmd.Parameters.AddWithValue("tz", (object?)timezone ?? DBNull.Value);
        cmd.Parameters.AddWithValue("nss", (object?)notifyOnStudentSignup ?? DBNull.Value);
        cmd.Parameters.AddWithValue("nac", (object?)notifyOnAssessmentComplete ?? DBNull.Value);
        cmd.Parameters.AddWithValue("asr", (object?)allowStudentSelfRegistration ?? DBNull.Value);
        cmd.Parameters.AddWithValue("ua", SeedUpdatedAt);
        await cmd.ExecuteNonQueryAsync();
    }
}
