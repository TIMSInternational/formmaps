using System.Reflection;

namespace FormMaps.IntegrationTests.TestSupport.Rls;

/// <summary>
/// Guards the guard (formmaps#125). <see cref="ProductionRlsPolicies"/> is now the only thing standing
/// between "the fixtures enforce production RLS" and "the fixtures silently enforce nothing", so its own
/// failure modes need pinning. No container here — these are pure and fast.
/// </summary>
public sealed class ProductionRlsPoliciesTests
{
    [Fact]
    public void Every_vendored_file_is_an_embedded_resource()
    {
        // The .csproj globs TestSupport\Rls\*.sql. A file dropped into that directory but never applied —
        // because it was left out of VendoredFileNames — is a policy that production has and the tests do
        // not, which is the whole formmaps#125 failure in miniature. Both directions are checked.
        var embedded = Assembly.GetExecutingAssembly().GetManifestResourceNames()
            .Where(n => n.Contains(".Rls.", StringComparison.Ordinal) && n.EndsWith(".sql", StringComparison.Ordinal))
            .Select(n => n[(n.LastIndexOf(".Rls.", StringComparison.Ordinal) + ".Rls.".Length)..])
            .OrderBy(n => n, StringComparer.Ordinal)
            .ToList();

        Assert.Equal<string>(ProductionRlsPolicies.VendoredFileNames.OrderBy(n => n, StringComparer.Ordinal), embedded);
    }

    [Fact]
    public void Every_vendored_file_parses_into_recognised_statements()
    {
        foreach (var fileName in ProductionRlsPolicies.VendoredFileNames)
        {
            var statements = ProductionRlsPolicies.SplitStatements(ProductionRlsPolicies.ReadVendoredFile(fileName)).ToList();
            Assert.NotEmpty(statements);

            foreach (var statement in statements)
            {
                Assert.True(
                    statement.StartsWith("ALTER TABLE", StringComparison.OrdinalIgnoreCase)
                    || statement.StartsWith("DROP POLICY", StringComparison.OrdinalIgnoreCase)
                    || statement.StartsWith("CREATE POLICY", StringComparison.OrdinalIgnoreCase),
                    $"{fileName}: unrecognised statement start — {statement[..Math.Min(120, statement.Length)]}");
            }
        }
    }

    [Fact]
    public void Splitter_ignores_semicolons_inside_comments()
    {
        // Not hypothetical: 007-self-scoped.sql alone carries 17 semicolons inside `--` comments. A splitter
        // that naively cut on every `;` would tear a CREATE POLICY in half and apply the fragment, and the
        // half that survived would be a policy nobody wrote.
        const string Sql = """
            -- a comment; with a semicolon; and another
            ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
            /* block; comment */
            DROP POLICY IF EXISTS tenant_isolation ON "users";
            """;

        Assert.Equal<string>(
            ["ALTER TABLE \"users\" ENABLE ROW LEVEL SECURITY", "DROP POLICY IF EXISTS tenant_isolation ON \"users\""],
            ProductionRlsPolicies.SplitStatements(Sql).Select(s => s.Trim()));
    }

    [Fact]
    public void Splitter_ignores_semicolons_inside_string_literals()
    {
        const string Sql = """
            CREATE POLICY p ON "t" USING (current_setting('a;b', true) = 'on');
            ALTER TABLE "t" ENABLE ROW LEVEL SECURITY;
            """;

        Assert.Equal(2, ProductionRlsPolicies.SplitStatements(Sql).Count());
    }

    [Fact]
    public void The_parent_facing_tables_really_are_policied_in_the_vendored_copies()
    {
        // A cheap, container-free tripwire for a stale vendored copy: if a refresh ever drops the policy on
        // one of these, the fixtures would apply nothing for it and every isolation assertion about it would
        // go vacuously green. This fails first, and names the table.
        foreach (var table in new[] { "users", "student_parent_links", "notifications", "evaluation_groups", "student_test_scores" })
        {
            var found = ProductionRlsPolicies.VendoredFileNames
                .SelectMany(f => ProductionRlsPolicies.SplitStatements(ProductionRlsPolicies.ReadVendoredFile(f)))
                .Any(s => s.StartsWith($"CREATE POLICY", StringComparison.OrdinalIgnoreCase)
                          && s.Contains($"ON \"{table}\"", StringComparison.Ordinal));

            Assert.True(found, $"no CREATE POLICY on \"{table}\" in the vendored production files");
        }
    }
}
