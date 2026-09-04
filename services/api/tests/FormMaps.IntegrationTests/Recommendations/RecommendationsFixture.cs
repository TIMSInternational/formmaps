using FormMaps.IntegrationTests.TestSupport.Rls;

namespace FormMaps.IntegrationTests.Recommendations;

/// <summary>
/// formmaps#125-style fixture for the letters-of-recommendation port (formmaps#59): the REAL production RLS
/// policies applied over the harness schema, and a NOSUPERUSER / NOBYPASSRLS login for the code under test.
///
/// <para>The five policied tables are the ones this fixture creates that production policies:
/// <c>users</c> (005-sensitive.sql), <c>recommendation_requests</c>, <c>student_applications</c> and
/// <c>counselor_student_assignments</c> (003-fk-users.sql), and <c>recommendation_application_links</c>
/// (004-fk-parent.sql). <c>coaches</c> and <c>bookings</c> are created but appear in no policy file, so they are
/// deliberately NOT named — naming an unpolicied table fails the fixture, and production leaves those two
/// unpolicied too, so the fixture is not understating anything here.</para>
///
/// <para>Why the policy matters for this suite specifically: <c>recommendation_requests</c>'s policy has a SCHOOL
/// branch (any caller sharing the student's schoolId is admitted), so a same-school classmate is the useful
/// adversary — the row IS visible to their session and only the application-layer gate denies it. That is the
/// case the letter-download tests are built around.</para>
/// </summary>
public sealed class RecommendationsFixture : RlsEnabledDatabaseFixture
{
    protected override string SchemaResourceFileName => "recommendations-schema.sql";

    protected override IReadOnlyCollection<string> PoliciedTables =>
    [
        "users",
        "recommendation_requests",
        "recommendation_application_links",
        "student_applications",
        "counselor_student_assignments",
    ];
}
