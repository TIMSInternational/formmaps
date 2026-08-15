using FormMaps.IntegrationTests.TestSupport.Rls;

namespace FormMaps.IntegrationTests.Counselor;

/// <summary>
/// Testcontainers Postgres harness for the enriched caseload reader (FM-DOTNET-068).
///
/// <para>formmaps#125: derives from <see cref="RlsEnabledDatabaseFixture"/>, so the PRODUCTION policies are live and
/// the reader under test runs as a NOSUPERUSER NOBYPASSRLS login. This fixture is the one the conversion guide calls
/// out as mattering most — every read here is a member of school staff reading OTHER people's rows, and the school
/// branch of the policies (<c>owner.schoolId = app.current_school_id</c>) admits every one of them. RLS therefore
/// cannot do the caseload gate's job: only <c>CounselorCaseloadReader</c>'s <c>a."counselorId" = @cid</c> keeps an
/// unassigned same-school counselor out. See
/// <c>CounselorCaseloadReaderTests.Caseload_gate_denies_an_unassigned_same_school_counselor</c>.</para>
///
/// <para>TWO OF THE TWELVE TABLES ARE ABSENT from <see cref="PoliciedTables"/>. The previous version of this
/// comment said both were unpolicied in production; BOTH halves of that were wrong (formmaps#135), and the two
/// are wrong for different reasons — do not re-merge them into one claim:</para>
/// <list type="bullet">
///   <item><description><c>school_courses</c> — the per-school course catalogue, with a non-null direct
///   <c>schoolId</c>, i.e. exactly the shape 002-direct-schoolid.sql exists for. It IS policied in production —
///   by prisma/rls/pilot.sql, which this harness does not yet vendor. So it is unpolicied HERE only, and the
///   reader's own <c>"schoolId" = @school</c> is all these tests exercise. The old reasoning ("not on
///   005-sensitive.sql's INTENTIONALLY UNPOLICIED list") pointed at the right anomaly and drew the wrong
///   conclusion: the absence meant the policy lived in a file nobody had vendored, not that none existed.</description></item>
///   <item><description><c>personality_assessment_sessions</c> — FK-to-user (<c>user_id</c>), the shape
///   003-fk-users.sql exists for. Genuinely policied by NO file, pilot.sql included — but it is NOT undocumented,
///   as this comment used to claim. api/scripts/check-rls-coverage.mjs carries it in PENDING with the reason
///   "#77 — assessment session data; personality is LIVE in .NET, so needs a read-path audit on both backends".
///   PENDING is acknowledged debt that reports loudly without failing CI, which is a different thing from an
///   exemption and a different thing again from school_courses above.</description></item>
/// </list>
/// <para>Both are asserted absent by the harness-proof test so a future policy refresh that adds them turns this
/// into a failing test rather than a quietly stale comment.</para>
/// </summary>
public sealed class CounselorCaseloadDatabaseFixture : RlsEnabledDatabaseFixture
{
    protected override string SchemaResourceFileName => "counselor-caseload-schema.sql";

    /// <summary>
    /// The ten tables in this fixture production policies. Order is irrelevant (the applier sorts what it applied);
    /// completeness is not — a policied table left off this list is a table left unprotected in the fixture, and the
    /// isolation assertions below it would pass for the wrong reason.
    /// </summary>
    protected override IReadOnlyCollection<string> PoliciedTables =>
    [
        "users",                            // 005-sensitive.sql   (self OR same school)
        "student_alerts",                   // 005-sensitive.sql   (student OR student's school)
        "counselor_student_assignments",    // 003-fk-users.sql    (keyed on studentId, NOT counselorId)
        "student_grades",                   // 002-direct-schoolid.sql
        "academic_years",                   // 002-direct-schoolid.sql
        "graduation_rule_sets",             // 002-direct-schoolid.sql
        "pca_exam_sessions",                // 003-fk-users.sql
        "evaluation_groups",                // 003-fk-users.sql
        "user_career_profiles",             // 003-fk-users.sql
        "pca_evaluations",                  // 007-self-scoped.sql
    ];
}
