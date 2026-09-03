using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolAdmin;

/// <summary>
/// Testcontainers Postgres harness for the school-admin slice (FM-DOTNET sub-slice 1 reads + 044/045 writes),
/// running the REAL production RLS policies against a NON-SUPERUSER NOBYPASSRLS login (formmaps#125, converted
/// under Wave 3 #139). Applies schooladmin-schema.sql (users + evaluation_groups + pca_evaluations +
/// pca_exam_sessions + school_assessment_settings + assessment_schedules + the setup-360 tables) and pins a NON-UTC
/// server timezone so the ISO-Z timestamp emission on schedule rows is caught if it were tz-dependent.
///
/// <para>THREE of this fixture's eleven tables are deliberately NOT named below because production policies nothing
/// on them, and naming one fails the fixture:</para>
/// <list type="bullet">
/// <item><c>schools</c> — the tenant root itself; there is no schoolId column to scope it by.</item>
/// <item><c>lia_assessment_sessions</c> / <c>personality_assessment_sessions</c> — genuinely unpolicied in production
/// (recorded as PENDING "#77 — needs a read-path audit on both backends" in api/scripts/check-rls-coverage.mjs;
/// neither table is named in api/prisma/rls/pilot.sql either — re-verify with one grep over that directory in
/// formmaps-platform). The reads over them here are keyed on an already school-scoped student id list.</item>
/// </list>
/// </summary>
public sealed class SchoolAdminDatabaseFixture : RlsEnabledDatabaseFixture
{
    protected override string SchemaResourceFileName => "schooladmin-schema.sql";

    /// <summary>
    /// The eight tables production policies. <c>users</c> comes from 005-sensitive.sql, <c>pca_evaluations</c> from
    /// 007-self-scoped.sql, <c>counselor_student_assignments</c>/<c>evaluation_groups</c>/<c>pca_exam_sessions</c>/
    /// <c>student_parent_links</c> from 003-fk-users.sql (+ the parent-own-links pair in 009), and the two
    /// direct-schoolId tables from 002.
    /// </summary>
    protected override IReadOnlyCollection<string> PoliciedTables =>
    [
        "users",
        "assessment_schedules",
        "school_assessment_settings",
        "pca_evaluations",
        "pca_exam_sessions",
        "counselor_student_assignments",
        "evaluation_groups",
        "student_parent_links",
    ];

    /// <summary>
    /// The NON-UTC timezone pin. Database-scoped rather than session-scoped so it also applies to the restricted
    /// login's connections, which are opened later out of a data source this fixture never sees.
    /// </summary>
    protected override async Task OnSeededAsync(NpgsqlConnection adminConnection)
    {
        var database = (string)(await new NpgsqlCommand("SELECT current_database()", adminConnection).ExecuteScalarAsync())!;
        await using var tz = new NpgsqlCommand(
            $"ALTER DATABASE \"{database}\" SET timezone TO 'America/New_York'", adminConnection);
        await tz.ExecuteNonQueryAsync();
    }
}
