using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolStudents;

/// <summary>
/// Testcontainers Postgres harness for the school:manage roster surfaces (FM-DOTNET-062/063/064/065/066), running the
/// REAL production RLS policies against a NON-SUPERUSER NOBYPASSRLS login (formmaps#125). Applies
/// school-students-schema.sql and pins a NON-UTC server timezone (America/New_York) — the readers emit ISO-Z
/// timestamps and must not depend on the container's local tz.
///
/// <para>ONE of this fixture's fifteen tables is deliberately NOT named below because production policies nothing
/// on it, and naming one fails the fixture:</para>
/// <list type="bullet">
/// <item><c>schools</c> — the tenant root itself; there is no schoolId column to scope it by.</item>
/// </list>
///
/// <para><c>school_courses</c> and <c>student_course_plans</c> used to sit in that list too, on the claim that
/// pilot.sql was a scratch file. It is not: it is applied to production, and formmaps#135 vendored it, so both
/// tables are now policied here as well. One consequence is worth keeping in front of anyone editing the writer
/// tests, because vendoring did NOT change it: <c>SchoolStudentsCoursePlanWriter.DeleteCoursePlanCourseAsync</c>'s
/// <c>"studentId" = @sid</c> predicate is still the only defence between a caller authorised for student A and
/// student B's plan row when both students share a school — pilot's policy is keyed on <c>schoolId</c>, so it
/// does not separate two students of the SAME school. That test is load-bearing app-layer coverage, not an
/// RLS assertion.</para>
/// </summary>
public sealed class SchoolStudentsDatabaseFixture : RlsEnabledDatabaseFixture
{
    protected override string SchemaResourceFileName => "school-students-schema.sql";

    /// <summary>
    /// The fourteen tables production policies. <c>users</c>/<c>student_alerts</c> come from 005-sensitive.sql,
    /// <c>pca_evaluations</c> from 007-self-scoped.sql, <c>pca_exam_sessions</c>/<c>evaluation_groups</c>/
    /// <c>student_parent_links</c> from 003-fk-users.sql (+ the parent-own-links pair in 009),
    /// <c>school_courses</c>/<c>student_course_plans</c> from pilot.sql (formmaps#135), and the rest are
    /// direct-schoolId tables from 002.
    /// </summary>
    protected override IReadOnlyCollection<string> PoliciedTables =>
    [
        "users",
        "student_grades",
        "academic_years",
        "graduation_rule_sets",
        "pca_evaluations",
        "pca_exam_sessions",
        "evaluation_groups",
        "student_alerts",
        "community_service_entries",
        "student_parent_links",
        "course_change_requests",
        "school_assessment_settings",
        "school_courses",
        "student_course_plans",
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
