using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolStudents;

/// <summary>
/// Testcontainers Postgres harness for the school:manage roster surfaces (FM-DOTNET-062/063/064/065/066), running the
/// REAL production RLS policies against a NON-SUPERUSER NOBYPASSRLS login (formmaps#125). Applies
/// school-students-schema.sql and pins a NON-UTC server timezone (America/New_York) — the readers emit ISO-Z
/// timestamps and must not depend on the container's local tz.
///
/// <para>THREE of this fixture's fifteen tables are deliberately NOT named below because production policies nothing
/// on them, and naming one fails the fixture:</para>
/// <list type="bullet">
/// <item><c>schools</c> — the tenant root itself; there is no schoolId column to scope it by.</item>
/// <item><c>school_courses</c> — appears in none of prisma/rls/*.sql despite carrying a non-null schoolId. Every
/// read of it in this domain is explicitly <c>"schoolId" = @school</c>-filtered in SQL, so the app layer is the only
/// gate. Recorded here rather than assumed.</item>
/// <item><c>student_course_plans</c> — the production gap already recorded in <c>ParentChildReaderTests.Fixture</c>.
/// It is load-bearing HERE in a way it is not there: <c>SchoolStudentsCoursePlanWriter.DeleteCoursePlanCourseAsync</c>
/// has no RLS backstop whatsoever, so its <c>"studentId" = @sid</c> predicate is the ONLY thing standing between a
/// caller authorised for student A and student B's plan row.</item>
/// </list>
/// </summary>
public sealed class SchoolStudentsDatabaseFixture : RlsEnabledDatabaseFixture
{
    protected override string SchemaResourceFileName => "school-students-schema.sql";

    /// <summary>
    /// The twelve tables production policies. <c>users</c>/<c>student_alerts</c> come from 005-sensitive.sql,
    /// <c>pca_evaluations</c> from 007-self-scoped.sql, <c>pca_exam_sessions</c>/<c>evaluation_groups</c>/
    /// <c>student_parent_links</c> from 003-fk-users.sql (+ the parent-own-links pair in 009), and the rest are
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
