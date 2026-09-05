using System.Reflection;
using FormMaps.IntegrationTests.TestSupport.Rls;

namespace FormMaps.IntegrationTests.CareerFit;

/// <summary>
/// Testcontainers Postgres harness for the CareerFit persistence slice (FM-CF-002): the two .NET-owned tables in
/// <c>infra/aws/sql/careerfit-schema.sql</c>, applied VERBATIM from that file, under the platform's production
/// policies, read and written as a NOSUPERUSER NOBYPASSRLS login.
/// </summary>
/// <remarks>
/// <para>
/// TWO SOURCES OF DDL, ON PURPOSE. <see cref="RlsEnabledDatabaseFixture"/> validates <see cref="PoliciedTables"/>
/// against the vendored production policy files (<c>TestSupport/Rls/*.sql</c>, byte-for-byte copies of
/// <c>formmaps-platform/api/prisma/rls/</c>) and would correctly reject <c>careerfit_runs</c> — those files are
/// legacy Node's and the CareerFit tables are .NET-owned, so their policy ships in <c>infra/aws/sql/</c>, the
/// place <c>audit_events</c>' does. The harness's rule for that case is the Audit fixture's: embed the REAL
/// production file by reference and apply it, never a transcription (formmaps#125). So:
/// </para>
/// <list type="bullet">
/// <item><see cref="SchemaResourceFileName"/> creates only the PLATFORM tables the CareerFit DDL and its policies
/// depend on (users, schools, counselor_student_assignments, student_parent_links);</item>
/// <item><see cref="AdditionalDdl"/> is the text of <c>infra/aws/sql/careerfit-schema.sql</c>, which creates the
/// two CareerFit tables, their indexes, and their RLS — exactly what <c>formmaps-sql-apply.yml</c> will run;</item>
/// <item><see cref="PoliciedTables"/> names the platform tables the VENDORED files policy, and the base applies
/// those. The CareerFit tables' policies are asserted separately by the harness-proof test, from
/// <c>pg_policies</c>, because the base's <c>AppliedPolicyTables</c> can only ever report what the vendored files
/// applied.</item>
/// </list>
/// <para>
/// The base runs <see cref="AdditionalDdl"/> after the schema and BEFORE the vendored policies, which is the order
/// that matters here: the CareerFit DDL's foreign keys need users/schools to exist, and the users policy that the
/// base applies afterwards does not touch the CareerFit predicates (they scope on the row's own columns, not on a
/// users sub-select — see the file's RLS comment).
/// </para>
/// <para>
/// The restricted login is <see cref="RlsEnabledDatabaseFixture.AppRole"/> with SELECT/INSERT/UPDATE/DELETE on
/// every table — wider than production's <c>formmaps_dotnet_svc</c> (SELECT + INSERT only, section 4.7 of
/// dotnet-service-role.sql). That is deliberate and not a gap: this fixture proves the POLICIES, and
/// <c>DbRoleGrantsTests</c> proves the GRANTs; a login that could not write would make the WITH CHECK half of
/// the policy untestable here.
/// </para>
/// </remarks>
public sealed class CareerFitDatabaseFixture : RlsEnabledDatabaseFixture
{
    /// <summary>Basename of the production file; the embedded resource is linked under CareerFit\Data\.</summary>
    public const string ProductionDdlFileName = "careerfit-schema.sql";

    /// <summary>
    /// FM-CF-013's shadow table, in its own production file for the reason its header gives (it is
    /// MEASUREMENT, retired at cutover, so it is dropped as one file's worth of objects). Applied here
    /// AFTER the run schema and in that order, because its "runId" foreign key references careerfit_runs
    /// -- the same apply-order dependency docs/migration/sql-apply-runbook.md records for production.
    /// </summary>
    public const string ShadowDdlFileName = "careerfit-shadow-tables.sql";

    protected override string SchemaResourceFileName => "careerfit-fixture-schema.sql";

    /// <summary>
    /// The platform tables in this fixture that the VENDORED production files policy. <c>schools</c> is present
    /// and deliberately absent from this list: production leaves it unpolicied (007-self-scoped.sql's header,
    /// "still needs an owner decision"), and naming it would make the base throw. The two CareerFit tables are
    /// absent for the opposite reason — they are policied, but by <see cref="AdditionalDdl"/>, not by the base.
    /// The two assessment SESSION tables (FM-CF-010's source rows) appear in no vendored file and so stay
    /// unpolicied here, as the vendored set leaves them; <c>pca_results</c> does appear (007) and is named.
    /// FM-CF-007 adds the 360 chassis, and the two halves of it differ: <c>evaluation_groups</c> IS policied
    /// (003-fk-users.sql — self OR the evaluated user's school) and so is named here, while
    /// <c>vocational_responses</c> appears in no vendored file. That asymmetry is safe in this direction and
    /// only in this direction: every response row is reachable only through the loader's join to its group,
    /// so the policied parent gates the unpolicied child for the read CareerFit performs. A future query
    /// that reached vocational_responses WITHOUT that join would not be gated, which is why the loader is
    /// the single read path (see VocationalResponseLoader's header).
    /// </summary>
    protected override IReadOnlyCollection<string> PoliciedTables =>
    [
        "users",                            // 005-sensitive.sql   (self OR same school)
        "counselor_student_assignments",    // 003-fk-users.sql    (keyed on studentId, NOT counselorId)
        "student_parent_links",             // 003-fk-users.sql + 009-parent-links.sql
        "pca_results",                      // 007-self-scoped.sql (self OR owner's school via users) — FM-CF-010 source row
        "evaluation_groups",                // 003-fk-users.sql    (self OR the evaluated user's school) — FM-CF-007 source row
        "user_career_profiles",             // 003-fk-users.sql    (self OR the owner's school via users) — FM-CF-013 legacy cache
    ];

    /// <summary>The real <c>infra/aws/sql/careerfit-schema.sql</c>, applied as-is. See the class remarks.</summary>
    protected override string? AdditionalDdl =>
        LoadProductionDdl() + "\n" + LoadShadowDdl();

    /// <summary>
    /// The production DDL text. Public because the idempotency test re-applies it on a database where every object
    /// already exists — the file's "safe to run multiple times" header claim is only observable on a SECOND apply.
    /// </summary>
    public static string LoadProductionDdl() => LoadEmbedded(ProductionDdlFileName);

    /// <summary>The real <c>infra/aws/sql/careerfit-shadow-tables.sql</c>. Public for the same idempotency reason.</summary>
    public static string LoadShadowDdl() => LoadEmbedded(ShadowDdlFileName);

    private static string LoadEmbedded(string fileName)
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames()
            .Single(n => n.EndsWith($".CareerFit.Data.{fileName}", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
