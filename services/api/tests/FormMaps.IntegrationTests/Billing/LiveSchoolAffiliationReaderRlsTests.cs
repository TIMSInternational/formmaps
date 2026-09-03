using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;
using FormMaps.Infrastructure.Billing;
using FormMaps.Infrastructure.Data;
using FormMaps.IntegrationTests.SchoolUsers;
using Npgsql;

namespace FormMaps.IntegrationTests.Billing;

/// <summary>
/// Wave 3 billing-subscription-parity review (security/nit). <see cref="LiveSchoolAffiliationReader" /> is
/// documented as reading users."schoolId" under the caller's OWN tenant-scoped RLS session, but every
/// billing fixture runs as the Testcontainers superuser with no policies -- so a reader that had quietly
/// switched to RequestContext.System() would pass all of BillingEndpointsTests identically. This class
/// runs the reader on <see cref="SchoolUserRoleRlsHarness" />, which carries the production users policy
/// (self OR same-school, prisma/rls/005-sensitive.sql) and a NOSUPERUSER NOBYPASSRLS login, the way
/// TestSupport/Rls/CONVERTING-A-FIXTURE.md prescribes. Seeding and assertions stay on the admin
/// connection; only the reader runs as the app login.
///
/// <para>The endpoint only ever asks this reader about the CALLER's own id, so the self case is the one
/// production exercises; the cross-school case is the negative control that proves the policy is live
/// for this reader's session (and that it is an Identity session -- a System/bypass session would return
/// the other school's id). The same-school case documents what RLS admits on its own, so nobody later
/// reads "returns null" here as an ownership check the reader performs itself: it does not, legacy
/// user.ts:304 does not either, and the endpoint never passes a foreign id.</para>
/// </summary>
public sealed class LiveSchoolAffiliationReaderRlsTests : IClassFixture<SchoolUserRoleRlsHarness>, IAsyncLifetime
{
    private const string SchoolA = "school-a";
    private const string SchoolB = "school-b";
    private const string Self = "student-a1";
    private const string Classmate = "student-a2";
    private const string Stranger = "student-b1";

    private readonly SchoolUserRoleRlsHarness _harness;
    private NpgsqlDataSource _appDataSource = null!;

    public LiveSchoolAffiliationReaderRlsTests(SchoolUserRoleRlsHarness harness) => _harness = harness;

    public async Task InitializeAsync()
    {
        await _harness.ResetAsync();
        _appDataSource = NpgsqlDataSource.Create(_harness.AppConnectionString);
        await SeedUserAsync(Self, SchoolA);
        await SeedUserAsync(Classmate, SchoolA);
        await SeedUserAsync(Stranger, SchoolB);
    }

    public async Task DisposeAsync() => await _appDataSource.DisposeAsync();

    [Fact]
    public async Task The_reader_runs_as_a_login_that_cannot_bypass_rls()
    {
        // Same tripwire as SchoolUsersRoleWriterTests: if this goes false every assertion below is vacuous.
        await using var connection = await _appDataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand(
            "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user", connection);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.False(reader.GetBoolean(0));
        Assert.False(reader.GetBoolean(1));
    }

    [Fact]
    public async Task GetSchoolId_ForTheCallersOwnRow_ReturnsTheSchoolId()
    {
        var schoolId = await Reader().GetSchoolIdAsync(ContextFor(Self, SchoolA), Self, CancellationToken.None);

        Assert.Equal(SchoolA, schoolId);
    }

    [Fact]
    public async Task GetSchoolId_ForAUserInAnotherSchool_IsHiddenByRls_ReturnsNull()
    {
        // The row exists (asserted on the admin side, so "null" below cannot mean "not seeded").
        Assert.Equal(SchoolB, await ReadSchoolIdAsAdminAsync(Stranger));

        var schoolId = await Reader().GetSchoolIdAsync(ContextFor(Self, SchoolA), Stranger, CancellationToken.None);

        Assert.Null(schoolId);
    }

    [Fact]
    public async Task GetSchoolId_ForASameSchoolUser_IsAdmittedByRls_NotByTheReader()
    {
        // Documents the policy's school branch: the reader carries no ownership WHERE of its own, and the
        // endpoint never passes anything but the caller's id -- see the class summary.
        var schoolId = await Reader().GetSchoolIdAsync(ContextFor(Self, SchoolA), Classmate, CancellationToken.None);

        Assert.Equal(SchoolA, schoolId);
    }

    [Fact]
    public async Task GetSchoolId_SchoolLessCaller_StillSeesItsOwnRow_ThroughTheSelfBranch()
    {
        // A user with NO schoolId (the individual-subscription population this endpoint mostly serves)
        // sets app.current_school_id = '' and is admitted only by the policy's self branch; the reader
        // must still resolve its own row (to a null schoolId) rather than be locked out of it.
        await SeedUserAsync("individual-1", schoolId: null);

        var schoolId = await Reader().GetSchoolIdAsync(ContextFor("individual-1", schoolId: null), "individual-1", CancellationToken.None);

        Assert.Null(schoolId);
        // ...and the other users' rows are all hidden from it.
        Assert.Null(await Reader().GetSchoolIdAsync(ContextFor("individual-1", schoolId: null), Self, CancellationToken.None));
    }

    // ---------------------------------------------------------------- wiring

    private LiveSchoolAffiliationReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_appDataSource, new RlsSessionContextApplier()));

    private static RequestContext ContextFor(string userId, string? schoolId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, FormMapsRoles.Student, $"{userId}@example.test", userId),
            schoolId,
            permissions: Array.Empty<string>(),
            tokenSource: TokenSource.AuthorizationBearer,
            isDevelopmentOverride: false);

    // ---- seeding + assertions as the SUPERUSER so RLS never hides state from the test itself ----

    private async Task SeedUserAsync(string id, string? schoolId)
    {
        await using var connection = new NpgsqlConnection(_harness.AdminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            """
            INSERT INTO "users" ("id","name","email","roleId","roleName","schoolId")
            VALUES (@id, @id, @id || '@example.test', 'seed-role-id', 'student', @schoolId)
            """, connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("schoolId", (object?)schoolId ?? DBNull.Value);
        await command.ExecuteNonQueryAsync();
    }

    private async Task<string?> ReadSchoolIdAsAdminAsync(string id)
    {
        await using var connection = new NpgsqlConnection(_harness.AdminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand("""SELECT "schoolId" FROM "users" WHERE "id" = @id""", connection);
        command.Parameters.AddWithValue("id", id);
        var value = await command.ExecuteScalarAsync();
        Assert.NotNull(value);
        return value is DBNull ? null : (string)value!;
    }
}
