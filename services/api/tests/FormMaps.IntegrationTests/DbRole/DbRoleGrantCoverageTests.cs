using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text.RegularExpressions;

namespace FormMaps.IntegrationTests.DbRole;

/// <summary>
/// THE DRIFT GUARD THAT DERIVES FROM SOURCE, closing the hole that let formmaps#62's
/// <c>teacher_invites</c> gap reach a merge with a fully green suite.
///
/// <para>WHY THE EXISTING GUARD COULD NOT CATCH IT.
/// <c>DbRoleGrantsTests.Every_table_in_the_schema_is_granted_at_least_select</c> enumerates
/// <c>pg_class</c> in the harness's STUB schema and asserts every table there has a GRANT. That compares two
/// HAND-MAINTAINED lists — <c>DbRole/Data/dotnet-service-role-stub-schema.sql</c> and the GRANT lists in
/// <c>infra/aws/sql/dotnet-service-role.sql</c> — and it is vacuous for any table missing from BOTH. When #62
/// landed, <c>teacher_invites</c> was in neither: the stub-vs-grants reconciliation was byte-for-byte clean in
/// both directions while the table the code SELECTs and UPDATEs had no grant at all. Adding the table to the
/// stub schema fixes that one instance; it does not fix the class, because the next lane's author has to
/// remember to edit the same two hand-maintained files.</para>
///
/// <para>WHAT THIS TEST DOES INSTEAD. It re-derives the table scope from the .NET SOURCE — the third,
/// non-hand-maintained input, and the only one that cannot forget — using the recipe the role script's own
/// maintenance note already documents, then asserts every table the code references carries a GRANT. A lane
/// that starts touching a new table now fails here without anyone having thought to update a list.</para>
///
/// <para>NO DATABASE. This is deliberately a pure file-analysis test with no <see cref="DbRoleDatabaseFixture"/>
/// and no container: the question "does the code touch a table the script never grants?" is answerable from the
/// two files, and keeping it container-free means it still runs (and still fails) in an environment where Docker
/// is unavailable — which is precisely when a grant regression would otherwise sail through.</para>
/// </summary>
public sealed class DbRoleGrantCoverageTests
{
    /// <summary>
    /// The role script's documented recipe, transcribed:
    /// <c>grep -rhoE '\b(FROM|JOIN|INTO|UPDATE)\s+\\?"[a-zA-Z_0-9]+\\?"'</c>. The optional backslash matches
    /// both raw string literals (<c>FROM "users"</c>) and escaped ones (<c>FROM \"users\"</c>), which the
    /// codebase uses in roughly equal measure.
    ///
    /// <para>CASE-SENSITIVE ON PURPOSE, exactly as the documented recipe is. Adding <c>IgnoreCase</c> looks
    /// like harmless robustness and is not: it starts matching ENGLISH PROSE in comments, where "from" and
    /// "into" precede a quoted word. Measured, not hypothetical -- it picked up <c>"id"</c> from
    /// BillingShadowRepository.cs:125 ("the real guarantee comes from \"id\" being...") and
    /// <c>"not_ready"</c> from LegacyApiInsightsTrigger.cs:126, neither of which is a table. SQL keywords in
    /// this codebase's queries are uppercase without exception, so the case rule costs nothing and is what
    /// keeps the derived set clean enough to assert on.</para>
    /// </summary>
    private static readonly Regex TableReference = new(
        """\b(?:FROM|JOIN|INTO|UPDATE)\s+\\?"([a-zA-Z_0-9]+)\\?["]""",
        RegexOptions.Compiled);

    private static readonly Regex GrantedTable = new(
        """public\."([a-zA-Z_0-9]+)["]""",
        RegexOptions.Compiled);

    /// <summary>
    /// Names the regex above matches that are NOT tables the role needs a grant on. EMPTY TODAY, and kept as an
    /// explicit, empty, NAMED list rather than being absent: when a future CTE or subquery alias trips this test,
    /// the fix is to add it here with a reason, which leaves a record — not to loosen the regex, which would
    /// silently re-open the hole this test exists to close.
    /// </summary>
    private static readonly string[] NotRealTables = [];

    [Fact]
    public void Every_table_the_dotnet_source_touches_is_granted_in_the_role_script()
    {
        var referenced = TablesReferencedBySource();
        var granted = TablesGrantedByRoleScript();

        // Sanity floor: if the source walk silently found nothing (wrong path, moved tree), the assertion below
        // would pass vacuously -- which is the exact failure mode this whole test exists to eliminate.
        Assert.True(
            referenced.Count > 50,
            $"derivation found only {referenced.Count} table references in services/api/src -- the source walk is broken, not the grants");

        var ungranted = referenced.Except(granted).Except(NotRealTables).Order().ToArray();

        Assert.True(
            ungranted.Length == 0,
            "tables referenced by .NET SQL in services/api/src with NO GRANT in infra/aws/sql/dotnet-service-role.sql: "
            + $"{string.Join(", ", ungranted)}. Every one of these 42501s the moment DATABASE_URL is repointed at "
            + "formmaps_dotnet_svc. Add an explicit GRANT in the appropriate section of the role script (and a stub "
            + "row + a verify-grants.sql row), or add the name to NotRealTables if it is a CTE rather than a table.");
    }

    /// <summary>
    /// The reverse direction, as a REPORT rather than a failure. A grant with no call site is not automatically
    /// wrong -- <c>shadow_payments</c> is granted deliberately ahead of its port, and the script's maintenance
    /// note says so -- but an unexplained one is worth seeing, so this pins the known set instead of asserting
    /// emptiness. A new name appearing here means someone widened the role beyond what the code does.
    /// </summary>
    [Fact]
    public void The_only_granted_table_with_no_call_site_is_the_one_the_script_documents()
    {
        var referenced = TablesReferencedBySource();
        var granted = TablesGrantedByRoleScript();

        var withoutCallSite = granted.Except(referenced).Order().ToArray();

        Assert.Equal(["shadow_payments"], withoutCallSite);
    }

    // ---- derivation ----

    private static HashSet<string> TablesReferencedBySource()
    {
        var source = SourceDirectory();

        var tables = new HashSet<string>(StringComparer.Ordinal);
        foreach (var file in Directory.EnumerateFiles(source, "*.cs", SearchOption.AllDirectories))
        {
            foreach (Match match in TableReference.Matches(File.ReadAllText(file)))
            {
                tables.Add(match.Groups[1].Value);
            }
        }

        return tables;
    }

    private static HashSet<string> TablesGrantedByRoleScript()
    {
        // The REAL production script, via the same embedded-by-reference resource DbRoleDatabaseFixture applies,
        // so this reads the file ops actually run rather than a copy of it.
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames()
            .Single(n => n.EndsWith("dotnet-service-role.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        var script = reader.ReadToEnd();

        return GrantedTable.Matches(script).Select(m => m.Groups[1].Value).ToHashSet(StringComparer.Ordinal);
    }

    /// <summary>
    /// Anchors on this test file's own compile-time path rather than <c>AppContext.BaseDirectory</c>: the output
    /// directory is nested an unpredictable number of levels below the project depending on TFM/configuration,
    /// while this file's location relative to <c>services/api/src</c> is fixed by the repo layout.
    /// </summary>
    private static string SourceDirectory([CallerFilePath] string thisFile = "")
    {
        // <repo>/services/api/tests/FormMaps.IntegrationTests/DbRole/<this file>
        var source = Path.GetFullPath(Path.Combine(
            Path.GetDirectoryName(thisFile)!, "..", "..", "..", "src"));

        Assert.True(Directory.Exists(source), $"expected the .NET source tree at {source}");
        return source;
    }
}
