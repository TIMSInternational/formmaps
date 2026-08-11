using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Testcontainers Postgres harness for the test-scores read/write slice (FM-DOTNET-037). Applies
/// testscores-schema.sql (users + student_test_scores + universities + counselor_student_assignments +
/// student_parent_links) and pins a NON-UTC server timezone so the ISO-Z timestamp emission is caught.
///
/// <para>formmaps#125: now derives from <see cref="RlsEnabledDatabaseFixture"/>, so the PRODUCTION policies are
/// live and the code under test runs as a NOSUPERUSER NOBYPASSRLS login. This is one of the two fixtures where
/// formmaps#121 actually escaped — <c>HasActiveParentLinkAsync</c> matched a parentEmail on the caller's own
/// session, which a school-less parent can never see, and the old superuser fixture could not tell that apart
/// from a working gate. <c>universities</c> is intentionally absent from <see cref="PoliciedTables"/>: it is a
/// global catalog and production policies nothing on it.</para>
/// </summary>
public sealed class TestScoreDatabaseFixture : RlsEnabledDatabaseFixture
{
    protected override string SchemaResourceFileName => "testscores-schema.sql";

    protected override IReadOnlyCollection<string> PoliciedTables =>
        ["users", "student_test_scores", "counselor_student_assignments", "student_parent_links"];

    /// <summary>
    /// A non-UTC server timezone, set on the DATABASE so it applies to every later connection — including the
    /// restricted app login, which is the one the timestamp assertions actually go through.
    /// </summary>
    protected override async Task OnSeededAsync(NpgsqlConnection adminConnection)
    {
        var database = (string)(await new NpgsqlCommand("SELECT current_database()", adminConnection).ExecuteScalarAsync())!;
        await using var tz = new NpgsqlCommand(
            $"ALTER DATABASE \"{database}\" SET timezone TO 'America/New_York'", adminConnection);
        await tz.ExecuteNonQueryAsync();
    }
}
