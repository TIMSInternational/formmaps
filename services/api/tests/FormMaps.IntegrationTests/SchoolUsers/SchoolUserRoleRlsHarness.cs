using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.SchoolUsers;

/// <summary>
/// Testcontainers Postgres harness for the role-change slice (formmaps#114 / #120). Unlike the other schema-only
/// harnesses in this project this one turns RLS ON and hands the code under test a NON-SUPERUSER, NON-BYPASSRLS
/// login, because the whole point of #120 is a bug that only exists once the policies are live:
///
/// <para>On 2026-08-09 prisma/rls/007-self-scoped.sql policied <c>refresh_tokens</c> owner-only, and legacy's
/// role-change revocation silently stopped working — it touches the TARGET's rows while the request runs under the
/// CALLER's GUCs, so the policy matched nothing, <c>updateMany</c> returned <c>{count:0}</c>, and NOTHING THREW.
/// A harness that runs as the container superuser cannot see that class of bug at all: a superuser bypasses RLS
/// even with FORCE set, so every policy failure looks like a success (formmaps#119, the same trap that made an
/// earlier RLS verification through the RDS master role look like total policy failure). Assertions therefore run
/// over <see cref="AdminConnectionString"/> (superuser, so the test can always see the true row state) while the
/// code under test runs over <see cref="AppConnectionString"/>.</para>
///
/// <para>The DDL is inline rather than an embedded .sql resource on purpose: an embedded resource needs a rebuild
/// to take effect, which has silently served a stale schema here before.</para>
///
/// <para>Policied tables mirror production exactly, INCLUDING what is deliberately left unpolicied:
/// <c>users</c> (005-sensitive.sql: self OR same-school) and <c>refresh_tokens</c> (007-self-scoped.sql:
/// owner-only) carry ENABLE + FORCE + <c>tenant_isolation</c>; <c>roles</c> and <c>audit_logs</c> carry none
/// (005-sensitive.sql's "global catalog" / "INTENTIONALLY UNPOLICIED" list, and #77 group 2 is still an open
/// owner decision). If audit_logs ever gets a policy, the audit assertions here are the tripwire.</para>
/// </summary>
public sealed class SchoolUserRoleRlsHarness : IAsyncLifetime
{
    public const string AppRole = "formmaps_app_test";
    private const string AppPassword = "integrationtestpasswordonly";

    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    /// <summary>Container superuser — setup and assertions ONLY. Never hand this to the code under test.</summary>
    public string AdminConnectionString => _container.GetConnectionString();

    /// <summary>The least-privilege login the code under test runs as: no SUPERUSER, no BYPASSRLS, not the table owner.</summary>
    public string AppConnectionString
    {
        get
        {
            var builder = new NpgsqlConnectionStringBuilder(AdminConnectionString)
            {
                Username = AppRole,
                Password = AppPassword,
            };
            return builder.ConnectionString;
        }
    }

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        await using var connection = new NpgsqlConnection(AdminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(Ddl, connection);
        await command.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _container.DisposeAsync();

    /// <summary>Truncate between tests, as the superuser (RLS would otherwise scope the DELETE).</summary>
    public async Task ResetAsync()
    {
        await using var connection = new NpgsqlConnection(AdminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            """TRUNCATE "audit_logs","refresh_tokens","users","roles" """, connection);
        await command.ExecuteNonQueryAsync();
    }

    private static readonly string Ddl = $"""
        -- ---- tables (hand-authored from api/prisma/schema.prisma; only the columns this slice touches) ----

        CREATE TABLE "roles" (
            "id"          text PRIMARY KEY,
            "name"        text NOT NULL UNIQUE,
            "description" text NOT NULL DEFAULT '',
            "isActive"    boolean NOT NULL DEFAULT true,
            "createdDate" timestamp NOT NULL DEFAULT now(),
            "updatedAt"   timestamp NOT NULL DEFAULT now()
        );

        CREATE TABLE "users" (
            "id"          text PRIMARY KEY,
            "name"        text NOT NULL,
            "email"       text NOT NULL,
            "roleId"      text NOT NULL,
            "roleName"    text NOT NULL,
            "schoolId"    text,
            "gradeLevel"  integer,
            "isActive"    boolean NOT NULL DEFAULT true,
            "createdDate" timestamp NOT NULL DEFAULT now(),
            "updatedAt"   timestamp NOT NULL DEFAULT now()
        );

        -- "updatedAt" NOT NULL with NO database default on both tables below: Prisma's @updatedAt is
        -- application-managed (auth-schema.sql's convention), so a writer that forgets to bind it fails loudly
        -- here instead of quietly persisting a stale timestamp in production.
        CREATE TABLE "refresh_tokens" (
            "id"          text PRIMARY KEY,
            "userId"      text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
            "token"       text NOT NULL UNIQUE,
            "expiresAt"   timestamp NOT NULL,
            "isRevoked"   boolean NOT NULL DEFAULT false,
            "revokedAt"   timestamp,
            "revokedBy"   text,
            "createdByIp" text,
            "revokedByIp" text,
            "isActive"    boolean NOT NULL DEFAULT true,
            "createdDate" timestamp NOT NULL DEFAULT now(),
            "updatedAt"   timestamp NOT NULL
        );

        CREATE TABLE "audit_logs" (
            "id"           text PRIMARY KEY,
            "actorId"      text NOT NULL,
            "actorEmail"   text NOT NULL,
            "action"       text NOT NULL,
            "resourceType" text NOT NULL,
            "resourceId"   text,
            "details"      jsonb,
            "ipAddress"    text,
            "isActive"     boolean NOT NULL DEFAULT true,
            "createdDate"  timestamp NOT NULL DEFAULT now(),
            "updatedAt"    timestamp NOT NULL
        );

        -- ---- RLS, verbatim from the production policy files ----

        -- users: self OR same-school (prisma/rls/005-sensitive.sql).
        ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
        ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
        CREATE POLICY tenant_isolation ON "users"
          USING (
            current_setting('app.bypass_rls', true) = 'on'
            OR ("id" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
            OR ("schoolId" = current_setting('app.current_school_id', true) AND current_setting('app.current_school_id', true) <> '')
          )
          WITH CHECK (
            current_setting('app.bypass_rls', true) = 'on'
            OR ("id" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
            OR ("schoolId" = current_setting('app.current_school_id', true) AND current_setting('app.current_school_id', true) <> '')
          );

        -- refresh_tokens: OWNER-ONLY (prisma/rls/007-self-scoped.sql). This is the policy that made the legacy
        -- revocation a silent no-op; every cross-user path must reach it through bypass.
        ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY;
        ALTER TABLE "refresh_tokens" FORCE ROW LEVEL SECURITY;
        CREATE POLICY tenant_isolation ON "refresh_tokens"
          USING (
            current_setting('app.bypass_rls', true) = 'on'
            OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
          )
          WITH CHECK (
            current_setting('app.bypass_rls', true) = 'on'
            OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
          );

        -- "roles" and "audit_logs": NO policies, matching production.

        -- ---- the least-privilege login ----

        CREATE ROLE {AppRole} LOGIN PASSWORD '{AppPassword}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
        GRANT USAGE ON SCHEMA public TO {AppRole};
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {AppRole};
        """;
}
