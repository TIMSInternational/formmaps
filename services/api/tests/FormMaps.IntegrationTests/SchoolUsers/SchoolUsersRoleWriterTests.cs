using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolUsers;
using FormMaps.Domain.Auth;
using FormMaps.Infrastructure.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolUsers;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolUsers;

/// <summary>
/// Real-DB, RLS-ON, non-superuser tests for <see cref="SchoolUsersWriter.UpdateUserRoleAsync"/> — formmaps#114
/// (the .NET twin of PUT /api/v1/school-admin/users/:userId/role, which did not exist) and #120 (that twin writing
/// neither an audit record nor revoking the target's refresh tokens).
///
/// <para>Every success assertion checks BOTH halves: that the role actually changed AND that the target's tokens
/// are actually revoked in the database. "It did not throw" is worth nothing here — the bug this slice exists to
/// prevent is a revocation that affects ZERO rows and returns quietly
/// (<see cref="Revoking_under_the_callers_identity_silently_affects_zero_rows"/> reproduces exactly that against
/// this harness, and is the negative control proving these assertions can fail).</para>
/// </summary>
public sealed class SchoolUsersRoleWriterTests : IClassFixture<SchoolUserRoleRlsHarness>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";
    private const string Admin = "admin-1";
    private const string Target = "target-1";
    private const string Bystander = "bystander-1";
    private const string Ip = "203.0.113.7";

    private readonly SchoolUserRoleRlsHarness _harness;
    private NpgsqlDataSource _appDataSource = null!;

    public SchoolUsersRoleWriterTests(SchoolUserRoleRlsHarness harness) => _harness = harness;

    public async Task InitializeAsync()
    {
        await _harness.ResetAsync();
        _appDataSource = NpgsqlDataSource.Create(_harness.AppConnectionString);
        await SeedRolesAsync();
    }

    public async Task DisposeAsync() => await _appDataSource.DisposeAsync();

    // =====================================================================================================
    // The harness itself: prove RLS is live and prove the #117 failure shape reproduces here.
    // =====================================================================================================

    [Fact]
    public async Task The_app_login_is_not_a_superuser_and_does_not_bypass_rls()
    {
        // formmaps#119: verifying RLS through a role in rds_superuser shows every policy "failing open" — or, in a
        // harness like this, every policy silently passing. If this assertion ever goes false, every other test in
        // this file becomes vacuous, so it is checked rather than assumed.
        await using var connection = await _appDataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand(
            "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user", connection);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.False(reader.GetBoolean(0));
        Assert.False(reader.GetBoolean(1));
    }

    [Fact]
    public async Task Revoking_under_the_callers_identity_silently_affects_zero_rows()
    {
        // THE BUG, reproduced. This is what legacy did before formmaps#117: run the revocation on the request's own
        // session, whose GUCs are the CALLER's, against the TARGET's rows in an owner-only-policied table. Postgres
        // matches nothing, the UPDATE affects zero rows, and NOTHING THROWS. Everything downstream reads as success.
        //
        // It is also the negative control for this whole file: it proves the refresh_tokens policy is genuinely
        // active in this harness, so an assertion that tokens ARE revoked is a claim that can fail.
        await SeedUserAsync(Admin, School, FormMapsRoles.SchoolAdmin);
        await SeedUserAsync(Target, School, "teacher");
        await SeedTokenAsync(Target, "tok-1");

        var factory = SessionFactory();
        await using var session = await factory.OpenWritableAsync(AdminContext());
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = """
            UPDATE "refresh_tokens" SET "isRevoked" = true, "revokedAt" = now(), "revokedByIp" = 'x', "updatedAt" = now()
            WHERE "userId" = @userId AND "isRevoked" = false
            """;
        var parameter = command.CreateParameter();
        parameter.ParameterName = "userId";
        parameter.Value = Target;
        command.Parameters.Add(parameter);

        var affected = await command.ExecuteNonQueryAsync();
        await session.CommitAsync();

        Assert.Equal(0, affected);                                  // silently matched nothing …
        Assert.False(await IsRevokedAsync("tok-1"));                // … and the session is still live.
    }

    // =====================================================================================================
    // Happy path — BOTH halves.
    // =====================================================================================================

    [Fact]
    public async Task Role_change_writes_the_role_and_actually_revokes_the_targets_tokens()
    {
        await SeedUserAsync(Admin, School, FormMapsRoles.SchoolAdmin);
        await SeedUserAsync(Target, School, "teacher");
        await SeedUserAsync(Bystander, School, "teacher");
        await SeedTokenAsync(Target, "target-live-1");
        await SeedTokenAsync(Target, "target-live-2");
        await SeedTokenAsync(Target, "target-already-revoked", isRevoked: true);
        await SeedTokenAsync(Bystander, "bystander-live");

        var result = await Writer().UpdateUserRoleAsync(
            AdminContext(), Admin, "admin@example.test", Target, "counselor", Ip);

        Assert.Equal(RoleUpdateStatus.Updated, result.Status);
        Assert.Equal("counselor", result.RoleName);
        Assert.Equal("teacher", result.PreviousRoleName);

        // Half 1 — the role write. BOTH columns; roleName is the "roles" row's stored name.
        var (roleId, roleName) = await ReadUserRoleAsync(Target);
        Assert.Equal("role-counselor", roleId);
        Assert.Equal("counselor", roleName);

        // Half 2 — the revocation ACTUALLY happened. A no-op revocation (the #117 shape) fails right here.
        Assert.True(await IsRevokedAsync("target-live-1"));
        Assert.True(await IsRevokedAsync("target-live-2"));
        Assert.Equal(Ip, await ReadRevokedByIpAsync("target-live-1"));
        Assert.NotNull(await ReadRevokedAtAsync("target-live-1"));

        // …and only the target's. Scoping is asserted, not assumed: a bypass session can reach everyone's rows.
        Assert.False(await IsRevokedAsync("bystander-live"));
    }

    [Fact]
    public async Task Role_change_writes_the_audit_row()
    {
        await SeedUserAsync(Admin, School, FormMapsRoles.SchoolAdmin);
        await SeedUserAsync(Target, School, "teacher");

        await Writer().UpdateUserRoleAsync(AdminContext(), Admin, "admin@example.test", Target, "coach", Ip);

        var rows = await ReadAuditRowsAsync();
        var row = Assert.Single(rows);
        Assert.Equal("USER_ROLE_CHANGE", row.Action);
        Assert.Equal("User", row.ResourceType);
        // The trap lib/audit.ts exists to prevent: a resourceId sitting in the resourceType column.
        Assert.Equal(Target, row.ResourceId);
        Assert.Equal(Admin, row.ActorId);
        Assert.Equal("admin@example.test", row.ActorEmail);
        Assert.Equal(Ip, row.IpAddress);

        using var details = JsonDocument.Parse(row.Details!);
        Assert.Equal("teacher", details.RootElement.GetProperty("from").GetString());
        Assert.Equal("coach", details.RootElement.GetProperty("to").GetString());
    }

    [Fact]
    public async Task Role_change_bumps_updatedAt()
    {
        await SeedUserAsync(Admin, School, FormMapsRoles.SchoolAdmin);
        await SeedUserAsync(Target, School, "teacher");
        await SetUserUpdatedAtAsync(Target, new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified));

        await Writer().UpdateUserRoleAsync(AdminContext(), Admin, "admin@example.test", Target, "counselor", Ip);

        Assert.True(await ReadUserUpdatedAtAsync(Target) > new DateTime(2021, 1, 1));
    }

    [Fact]
    public async Task Stored_role_name_casing_wins_over_the_request_token()
    {
        // Legacy resolves the Role row case-insensitively and then writes role.name AS STORED. Seed a
        // capitalised catalogue row and confirm the users row gets "Coach", not the lowercased request token.
        await ExecuteAdminAsync("""UPDATE "roles" SET "name" = 'Coach' WHERE "id" = 'role-coach'""");
        await SeedUserAsync(Admin, School, FormMapsRoles.SchoolAdmin);
        await SeedUserAsync(Target, School, "teacher");

        var result = await Writer().UpdateUserRoleAsync(AdminContext(), Admin, "a@e.st", Target, "coach", Ip);

        Assert.Equal(RoleUpdateStatus.Updated, result.Status);
        Assert.Equal("Coach", result.RoleName);
        Assert.Equal("Coach", (await ReadUserRoleAsync(Target)).RoleName);
    }

    // =====================================================================================================
    // Guards. Each one must leave NO role change, NO audit row and NO revocation.
    // =====================================================================================================

    [Fact]
    public async Task Self_role_change_is_refused_before_any_write()
    {
        await SeedUserAsync(Admin, School, "teacher");
        await SeedTokenAsync(Admin, "own-token");

        var result = await Writer().UpdateUserRoleAsync(AdminContext(), Admin, "a@e.st", Admin, "counselor", Ip);

        Assert.Equal(RoleUpdateStatus.SelfRoleChange, result.Status);
        Assert.Equal("teacher", (await ReadUserRoleAsync(Admin)).RoleName);
        Assert.Empty(await ReadAuditRowsAsync());
        // Even self-revocation would succeed under the caller's own GUCs (owner branch) — so this asserts the
        // guard stopped BEFORE the write, not that RLS happened to block it.
        Assert.False(await IsRevokedAsync("own-token"));
    }

    [Fact]
    public async Task Cross_school_target_is_refused_even_when_rls_cannot_hide_it()
    {
        // The authorization gate, exercised where RLS cannot do its job for it. A Super Admin context resolves to
        // TenantGucPlanMode.Bypass, so the users policy is OFF and the cross-school row IS visible and IS writable
        // by the database. G3 must still refuse it: schoolService.updateUserRole has NO Super Admin exemption,
        // deliberately (a Super Admin has PUT /authapi/change-role for cross-school work). If someone "improves"
        // G3 by leaning on RLS, this goes red and the ordinary school-admin path below stays green.
        await SeedUserAsync(Admin, School, FormMapsRoles.SuperAdmin);
        await SeedUserAsync(Target, OtherSchool, "teacher");
        await SeedTokenAsync(Target, "tok");

        var result = await Writer().UpdateUserRoleAsync(SuperAdminContext(), Admin, "a@e.st", Target, "counselor", Ip);

        Assert.Equal(RoleUpdateStatus.CrossSchool, result.Status);
        Assert.Equal("teacher", (await ReadUserRoleAsync(Target)).RoleName);
        Assert.Empty(await ReadAuditRowsAsync());
        Assert.False(await IsRevokedAsync("tok"));
    }

    [Fact]
    public async Task Cross_school_target_is_invisible_to_an_ordinary_school_admin()
    {
        // Defence in depth: for a school_admin the users policy hides the other school's row entirely, so the read
        // comes back empty and the branch is TargetNotFound (404 "User not found") rather than CrossSchool (403).
        // Legacy behaves identically under the same policy — prisma.user.findUnique returns null — and the
        // collapsed 404 is the better answer anyway: a 403-vs-404 split would be a cross-tenant existence oracle.
        await SeedUserAsync(Admin, School, FormMapsRoles.SchoolAdmin);
        await SeedUserAsync(Target, OtherSchool, "teacher");

        var result = await Writer().UpdateUserRoleAsync(AdminContext(), Admin, "a@e.st", Target, "counselor", Ip);

        Assert.Equal(RoleUpdateStatus.TargetNotFound, result.Status);
        Assert.Equal("teacher", (await ReadUserRoleAsync(Target)).RoleName);
        Assert.Empty(await ReadAuditRowsAsync());
    }

    [Fact]
    public async Task Unknown_target_is_not_found()
    {
        await SeedUserAsync(Admin, School, FormMapsRoles.SchoolAdmin);

        var result = await Writer().UpdateUserRoleAsync(AdminContext(), Admin, "a@e.st", "ghost", "counselor", Ip);

        Assert.Equal(RoleUpdateStatus.TargetNotFound, result.Status);
        Assert.Empty(await ReadAuditRowsAsync());
    }

    [Theory]
    [InlineData(FormMapsRoles.SchoolAdmin, RoleUpdateStatus.SourceIsAdministrator)]
    [InlineData("Super Admin", RoleUpdateStatus.SourceIsAdministrator)]
    [InlineData("student", RoleUpdateStatus.SourceIsNotChangeable)]
    [InlineData("parent", RoleUpdateStatus.SourceIsNotChangeable)]
    public async Task Source_role_outside_the_allowlist_is_refused(string sourceRole, RoleUpdateStatus expected)
    {
        // G5 — the guard G4 does not give you. G4 says what you may SET; without G5 a school admin can demote a
        // peer school_admin (or convert a student, orphaning gradeLevel / assignments / assessment data).
        await SeedUserAsync(Admin, School, FormMapsRoles.SchoolAdmin);
        await SeedUserAsync(Target, School, sourceRole);
        await SeedTokenAsync(Target, "tok");

        var result = await Writer().UpdateUserRoleAsync(AdminContext(), Admin, "a@e.st", Target, "counselor", Ip);

        Assert.Equal(expected, result.Status);
        Assert.Equal(sourceRole, (await ReadUserRoleAsync(Target)).RoleName);
        Assert.Empty(await ReadAuditRowsAsync());
        Assert.False(await IsRevokedAsync("tok"));
    }

    [Fact]
    public async Task Staff_is_an_allowed_source_role_even_though_normalizeRole_maps_it_to_parent()
    {
        // The precise reason G5 tests membership against the literal allowlist and uses normalizeRole only to pick
        // the refusal MESSAGE: normalizeRole("staff") is Parent, so a membership test through it would refuse a
        // role change that legacy permits. "parent" (refused above) and "staff" (allowed here) are the pair.
        await SeedUserAsync(Admin, School, FormMapsRoles.SchoolAdmin);
        await SeedUserAsync(Target, School, "staff");

        var result = await Writer().UpdateUserRoleAsync(AdminContext(), Admin, "a@e.st", Target, "counselor", Ip);

        Assert.Equal(RoleUpdateStatus.Updated, result.Status);
    }

    [Theory]
    [InlineData("school_admin")]
    [InlineData("student")]
    [InlineData("")]
    public async Task Destination_role_outside_the_allowlist_is_refused_by_the_writer_too(string destination)
    {
        // G4 duplicated in the service, exactly as legacy duplicates it: the route's zod enum is the first line of
        // defence, but the writer is callable from anywhere. Note this refuses BEFORE any DB read — an unseeded
        // caller still gets InvalidRole rather than a missing-row branch.
        var result = await Writer().UpdateUserRoleAsync(AdminContext(), Admin, "a@e.st", Target, destination, Ip);

        Assert.Equal(RoleUpdateStatus.InvalidRole, result.Status);
        Assert.Empty(await ReadAuditRowsAsync());
    }

    [Fact]
    public async Task Missing_catalogue_role_is_role_not_found_not_an_auto_create()
    {
        // Auto-creating a Role row from a user-supplied name would be a write into the permission model itself.
        // With G4 in front, a missing row is a seed defect → 400, and the "roles" table must be untouched.
        await ExecuteAdminAsync("""DELETE FROM "roles" WHERE "id" = 'role-coach'""");
        await SeedUserAsync(Admin, School, FormMapsRoles.SchoolAdmin);
        await SeedUserAsync(Target, School, "teacher");

        var result = await Writer().UpdateUserRoleAsync(AdminContext(), Admin, "a@e.st", Target, "coach", Ip);

        Assert.Equal(RoleUpdateStatus.RoleNotFound, result.Status);
        Assert.Equal(0, await ScalarAdminAsync("""SELECT COUNT(*)::int FROM "roles" WHERE "name" = 'coach'"""));
        Assert.Equal("teacher", (await ReadUserRoleAsync(Target)).RoleName);
        Assert.Empty(await ReadAuditRowsAsync());
    }

    [Fact]
    public async Task Inactive_catalogue_role_is_role_not_found()
    {
        await ExecuteAdminAsync("""UPDATE "roles" SET "isActive" = false WHERE "id" = 'role-coach'""");
        await SeedUserAsync(Admin, School, FormMapsRoles.SchoolAdmin);
        await SeedUserAsync(Target, School, "teacher");

        var result = await Writer().UpdateUserRoleAsync(AdminContext(), Admin, "a@e.st", Target, "coach", Ip);

        Assert.Equal(RoleUpdateStatus.RoleNotFound, result.Status);
    }

    [Fact]
    public async Task Same_role_is_no_change_and_does_not_revoke_anything()
    {
        // Idempotence is a 400 ("User already has this role"), matching authService.changeRole. It must NOT log the
        // user out: a no-op request that silently kills the target's sessions would be a denial-of-service handle.
        await SeedUserAsync(Admin, School, FormMapsRoles.SchoolAdmin);
        await SeedUserAsync(Target, School, "teacher");
        await SeedTokenAsync(Target, "tok");

        var result = await Writer().UpdateUserRoleAsync(AdminContext(), Admin, "a@e.st", Target, "teacher", Ip);

        Assert.Equal(RoleUpdateStatus.NoChange, result.Status);
        Assert.Empty(await ReadAuditRowsAsync());
        Assert.False(await IsRevokedAsync("tok"));
    }

    [Fact]
    public async Task Same_role_comparison_ignores_catalogue_casing()
    {
        await ExecuteAdminAsync("""UPDATE "roles" SET "name" = 'Teacher' WHERE "id" = 'role-teacher'""");
        await SeedUserAsync(Admin, School, FormMapsRoles.SchoolAdmin);
        await SeedUserAsync(Target, School, "teacher");

        var result = await Writer().UpdateUserRoleAsync(AdminContext(), Admin, "a@e.st", Target, "teacher", Ip);

        Assert.Equal(RoleUpdateStatus.NoChange, result.Status);
    }

    // =====================================================================================================
    // wiring
    // =====================================================================================================

    private NpgsqlFormMapsDatabaseSessionFactory SessionFactory() =>
        new(_appDataSource, new RlsSessionContextApplier());

    private SchoolUsersWriter Writer()
    {
        var factory = SessionFactory();
        return new SchoolUsersWriter(factory, new AuthRepository(factory));
    }

    private static RequestContext AdminContext() => RequestContext.Authenticated(
        new RequestActor(Admin, FormMapsRoles.SchoolAdmin, "admin@example.test", "Admin"),
        School, [FormMapsPermissions.SchoolUsers], TokenSource.AuthorizationBearer, isDevelopmentOverride: false);

    private static RequestContext SuperAdminContext() => RequestContext.Authenticated(
        new RequestActor(Admin, FormMapsRoles.SuperAdmin, "admin@example.test", "Admin"),
        School, [FormMapsPermissions.SchoolUsers], TokenSource.AuthorizationBearer, isDevelopmentOverride: false);

    // ---- seeding + assertions, all as the SUPERUSER so RLS never hides state from the test itself ----

    private async Task SeedRolesAsync()
    {
        foreach (var name in UserRoleValidation.AllowedRoles)
        {
            await ExecuteAdminAsync(
                """INSERT INTO "roles" ("id","name") VALUES (@id, @name)""",
                ("id", $"role-{name}"), ("name", name));
        }
    }

    private Task SeedUserAsync(string id, string? schoolId, string roleName) =>
        ExecuteAdminAsync(
            """
            INSERT INTO "users" ("id","name","email","roleId","roleName","schoolId")
            VALUES (@id, @id, @id || '@example.test', 'seed-role-id', @roleName, @schoolId)
            """,
            ("id", id), ("roleName", roleName), ("schoolId", (object?)schoolId ?? DBNull.Value));

    private Task SeedTokenAsync(string userId, string token, bool isRevoked = false) =>
        ExecuteAdminAsync(
            """
            INSERT INTO "refresh_tokens" ("id","userId","token","expiresAt","isRevoked","updatedAt")
            VALUES (@id, @userId, @token, now() + interval '7 days', @isRevoked, now())
            """,
            ("id", Guid.NewGuid().ToString()), ("userId", userId), ("token", token), ("isRevoked", isRevoked));

    private Task SetUserUpdatedAtAsync(string id, DateTime value) =>
        ExecuteAdminAsync("""UPDATE "users" SET "updatedAt" = @value WHERE "id" = @id""", ("id", id), ("value", value));

    private async Task<(string RoleId, string RoleName)> ReadUserRoleAsync(string id)
    {
        await using var connection = await OpenAdminAsync();
        await using var command = new NpgsqlCommand("""SELECT "roleId","roleName" FROM "users" WHERE "id" = @id""", connection);
        command.Parameters.AddWithValue("id", id);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync(), $"user {id} not found");
        return (reader.GetString(0), reader.GetString(1));
    }

    private async Task<DateTime> ReadUserUpdatedAtAsync(string id) =>
        (DateTime)(await ScalarObjectAdminAsync("""SELECT "updatedAt" FROM "users" WHERE "id" = @id""", ("id", id)))!;

    private async Task<bool> IsRevokedAsync(string token) =>
        (bool)(await ScalarObjectAdminAsync("""SELECT "isRevoked" FROM "refresh_tokens" WHERE "token" = @t""", ("t", token)))!;

    private async Task<string?> ReadRevokedByIpAsync(string token) =>
        await ScalarObjectAdminAsync("""SELECT "revokedByIp" FROM "refresh_tokens" WHERE "token" = @t""", ("t", token)) as string;

    private async Task<DateTime?> ReadRevokedAtAsync(string token) =>
        await ScalarObjectAdminAsync("""SELECT "revokedAt" FROM "refresh_tokens" WHERE "token" = @t""", ("t", token)) as DateTime?;

    private sealed record AuditRow(
        string ActorId, string ActorEmail, string Action, string ResourceType, string? ResourceId,
        string? Details, string? IpAddress);

    private async Task<IReadOnlyList<AuditRow>> ReadAuditRowsAsync()
    {
        await using var connection = await OpenAdminAsync();
        await using var command = new NpgsqlCommand("""
            SELECT "actorId","actorEmail","action","resourceType","resourceId","details"::text,"ipAddress"
            FROM "audit_logs" ORDER BY "createdDate"
            """, connection);
        await using var reader = await command.ExecuteReaderAsync();
        var rows = new List<AuditRow>();
        while (await reader.ReadAsync())
        {
            rows.Add(new AuditRow(
                reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
                reader.IsDBNull(4) ? null : reader.GetString(4),
                reader.IsDBNull(5) ? null : reader.GetString(5),
                reader.IsDBNull(6) ? null : reader.GetString(6)));
        }

        return rows;
    }

    private async Task<NpgsqlConnection> OpenAdminAsync()
    {
        var connection = new NpgsqlConnection(_harness.AdminConnectionString);
        await connection.OpenAsync();
        return connection;
    }

    private async Task ExecuteAdminAsync(string sql, params (string Name, object Value)[] parameters)
    {
        await using var connection = await OpenAdminAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value);
        }

        await command.ExecuteNonQueryAsync();
    }

    private async Task<int> ScalarAdminAsync(string sql, params (string Name, object Value)[] parameters) =>
        Convert.ToInt32(await ScalarObjectAdminAsync(sql, parameters));

    private async Task<object?> ScalarObjectAdminAsync(string sql, params (string Name, object Value)[] parameters)
    {
        await using var connection = await OpenAdminAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value);
        }

        var result = await command.ExecuteScalarAsync();
        return result is DBNull ? null : result;
    }
}
