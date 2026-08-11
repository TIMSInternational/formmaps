using System.Collections.Immutable;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using Npgsql;

namespace FormMaps.IntegrationTests.TestSupport.Rls;

/// <summary>
/// Applies the REAL production row-level-security policies to a Testcontainers fixture database
/// (formmaps#125).
///
/// <para>WHY THIS EXISTS. Before this, exactly one fixture in ~54 turned RLS on at all, and even that
/// one is inert by design (<c>MessagesAdversarialAccessTests</c> runs as the container superuser and
/// asserts so). Every other fixture builds a hand-written schema with no policies and connects as
/// testcontainers' default <c>postgres</c> login, which is a SUPERUSER — and a superuser bypasses RLS
/// outright, FORCE or not. So a repository that reads on the caller's Identity session and one that
/// reads on a System session produce identical results, and the entire tenant-isolation bug class is
/// invisible. That is not a hypothetical: three of the four .NET parent surfaces shipped to production
/// with exactly that bug (formmaps#121) with a green suite.</para>
///
/// <para>THE POLICIES ARE COPIES, NOT TRANSCRIPTIONS. See TestSupport/Rls/README.md. The vendored .sql
/// files are byte-identical to <c>formmaps-platform/api/prisma/rls/*.sql</c>, so what a test asserts
/// against is what Aurora enforces, and a refresh is a <c>cp</c> plus a <c>git diff</c>.</para>
///
/// <para>APPLICATION IS FILTERED, NOT WHOLESALE. A fixture models a handful of tables; the policy files
/// name ~130. <see cref="ApplyAsync"/> reads the tables that actually exist in the fixture database out
/// of <c>pg_class</c> and applies only the statements targeting those. The filter is therefore
/// data-driven: adding a table to a fixture's DDL automatically pulls in that table's production policy,
/// with no second list to keep in sync.</para>
/// </summary>
public static class ProductionRlsPolicies
{
    /// <summary>
    /// The applied set, in order. <c>pilot.sql</c> is excluded deliberately — it is a scratch file in the
    /// source directory and is not part of what production runs.
    /// </summary>
    public static readonly ImmutableArray<string> VendoredFileNames =
    [
        "002-direct-schoolid.sql",
        "003-fk-users.sql",
        "004-fk-parent.sql",
        "005-sensitive.sql",
        "006-graduation-plans.sql",
        "007-self-scoped.sql",
        "008-form-drafts.sql",
        "009-parent-links.sql",
    ];

    /// <summary>
    /// The only tables the policy BODIES sub-select from. A fixture whose DDL omits one of these while
    /// policying a table that depends on it gets a named failure rather than a silently absent policy.
    /// Derived from the vendored files (<c>grep -ohE "FROM [a-z_]+ [a-z]+"</c>) and re-derived at runtime
    /// by <see cref="ApplyAsync"/> — this constant is only used to produce a better message.
    /// </summary>
    private static readonly Regex BodyTableReference =
        new(@"\bFROM\s+(?<table>[a-z_]+)\s", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    // The vendored files contain exactly three top-level statement shapes (verified: no DO blocks, no
    // $$ bodies, no functions). Each names its TARGET table first, which matters — a CREATE POLICY body
    // may mention other tables in a sub-SELECT and those must not be mistaken for the target.
    private static readonly Regex AlterTable =
        new(@"^ALTER\s+TABLE\s+(?:public\.)?""?(?<table>\w+)""?", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex DropPolicy =
        new(@"^DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?\w+\s+ON\s+(?:public\.)?""?(?<table>\w+)""?",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex CreatePolicy =
        new(@"^CREATE\s+POLICY\s+\w+\s+ON\s+(?:public\.)?""?(?<table>\w+)""?",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

    /// <summary>
    /// Turns on the production policies for every table that both exists in <paramref name="connection"/>'s
    /// database and is policied in production.
    /// </summary>
    /// <param name="connection">An OPEN connection as the container superuser (policies are DDL).</param>
    /// <param name="expectedPoliciedTables">
    /// Tables the caller believes production policies. Every one of them must exist in the database AND
    /// pick up at least one policy, or this throws. This is the anti-vacuity guard: without it a renamed
    /// table or a typo in a fixture's DDL yields a fixture with no RLS and a suite that passes for the
    /// wrong reason — the exact failure formmaps#125 is about.
    /// </param>
    /// <returns>The tables that were policied, sorted.</returns>
    public static async Task<IReadOnlyList<string>> ApplyAsync(
        NpgsqlConnection connection,
        IReadOnlyCollection<string> expectedPoliciedTables,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(connection);
        ArgumentNullException.ThrowIfNull(expectedPoliciedTables);

        var existingTables = await ReadPublicTablesAsync(connection, cancellationToken);

        var missingFromFixture = expectedPoliciedTables.Where(t => !existingTables.Contains(t)).OrderBy(t => t).ToList();
        if (missingFromFixture.Count > 0)
        {
            throw new ArgumentException(
                $"These tables were named as policied but do not exist in the fixture database: " +
                $"{string.Join(", ", missingFromFixture)}. Add them to the fixture DDL, or stop naming them.",
                nameof(expectedPoliciedTables));
        }

        var applied = new HashSet<string>(StringComparer.Ordinal);

        foreach (var fileName in VendoredFileNames)
        {
            foreach (var statement in SplitStatements(ReadVendoredFile(fileName)))
            {
                var target = TargetTable(statement);
                if (target is null)
                {
                    throw new InvalidOperationException(
                        $"{fileName}: could not determine the target table of statement: {Truncate(statement)}. " +
                        "The splitter recognises only ALTER TABLE / DROP POLICY / CREATE POLICY; if the production " +
                        "files grew a new statement shape, teach ProductionRlsPolicies about it rather than skipping it.");
                }

                if (!existingTables.Contains(target))
                {
                    continue;
                }

                EnsureBodyDependenciesExist(fileName, statement, target, existingTables);

                try
                {
                    await using var command = new NpgsqlCommand(statement, connection);
                    await command.ExecuteNonQueryAsync(cancellationToken);
                }
                catch (PostgresException exception)
                {
                    // Overwhelmingly this is 42703 undefined_column: the fixture's hand-written DDL models only
                    // the columns its queries touch, and a policy predicate names one it left out (schoolId on
                    // the direct-tenant tables is the usual culprit). Add the column — production has it, which
                    // is why the policy can reference it. Do NOT drop the policy to make this go away: the whole
                    // point of formmaps#125 is that an absent policy is an assertion that proves nothing.
                    throw new InvalidOperationException(
                        $"{fileName}: applying the production policy for \"{target}\" failed ({exception.SqlState}: " +
                        $"{exception.MessageText}). The fixture's DDL for \"{target}\" is missing something the real " +
                        $"policy needs.\nStatement: {Truncate(statement)}",
                        exception);
                }

                applied.Add(target);
            }
        }

        var silentlyUnpolicied = expectedPoliciedTables.Where(t => !applied.Contains(t)).OrderBy(t => t).ToList();
        if (silentlyUnpolicied.Count > 0)
        {
            throw new ArgumentException(
                $"These tables exist in the fixture but production policies NOTHING on them: " +
                $"{string.Join(", ", silentlyUnpolicied)}. Either they are genuinely unpolicied in production " +
                "(005-sensitive.sql keeps such a list) and must not be named here, or the vendored copies are stale.",
                nameof(expectedPoliciedTables));
        }

        return applied.OrderBy(t => t, StringComparer.Ordinal).ToList();
    }

    /// <summary>
    /// The whole point of the harness: a login that is NOT a superuser, NOT BYPASSRLS, and NOT the owner of
    /// the tables — because all three of those bypass or defeat the policies. Same shape as
    /// <c>SchoolUsers/SchoolUserRoleRlsHarness.cs</c>.
    /// </summary>
    public static async Task CreateRestrictedLoginAsync(
        NpgsqlConnection connection,
        string roleName,
        string password,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(connection);

        // roleName/password are compile-time constants in the fixtures; identifiers cannot be parameterised
        // in DDL anyway. Guard rather than trust, so a future caller cannot smuggle SQL through here.
        if (!Regex.IsMatch(roleName, "^[a-z_][a-z0-9_]*$"))
        {
            throw new ArgumentException($"Role name must be a bare lowercase identifier, got '{roleName}'.", nameof(roleName));
        }

        if (!Regex.IsMatch(password, "^[A-Za-z0-9]+$"))
        {
            throw new ArgumentException("Test password must be alphanumeric.", nameof(password));
        }

        await using var command = new NpgsqlCommand(
            $"""
             CREATE ROLE {roleName} LOGIN PASSWORD '{password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
             GRANT USAGE ON SCHEMA public TO {roleName};
             GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {roleName};
             GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {roleName};
             """,
            connection);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    /// <summary>
    /// Asserts the login really is restricted. Called by every converted fixture's harness-proof test:
    /// if this ever comes back true the fixture has silently gone back to bypassing RLS and every
    /// isolation assertion in that file is vacuous.
    /// </summary>
    public static async Task<bool> BypassesRlsAsync(NpgsqlConnection connection, CancellationToken cancellationToken = default)
    {
        await using var command = new NpgsqlCommand(
            "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user", connection);
        return (bool)(await command.ExecuteScalarAsync(cancellationToken))!;
    }

    private static void EnsureBodyDependenciesExist(
        string fileName, string statement, string target, ISet<string> existingTables)
    {
        foreach (Match match in BodyTableReference.Matches(statement))
        {
            var referenced = match.Groups["table"].Value;
            if (referenced.Equals(target, StringComparison.Ordinal) || existingTables.Contains(referenced))
            {
                continue;
            }

            throw new InvalidOperationException(
                $"{fileName}: the production policy on \"{target}\" sub-selects \"{referenced}\", which this " +
                $"fixture does not create. Add \"{referenced}\" to the fixture DDL — dropping the policy instead " +
                "would leave the table unprotected and the isolation assertions vacuous.");
        }
    }

    private static async Task<HashSet<string>> ReadPublicTablesAsync(
        NpgsqlConnection connection, CancellationToken cancellationToken)
    {
        var tables = new HashSet<string>(StringComparer.Ordinal);
        await using var command = new NpgsqlCommand(
            """
            SELECT c.relname FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r'
            """, connection);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            tables.Add(reader.GetString(0));
        }

        return tables;
    }

    private static string? TargetTable(string statement)
    {
        foreach (var pattern in new[] { AlterTable, DropPolicy, CreatePolicy })
        {
            var match = pattern.Match(statement);
            if (match.Success)
            {
                return match.Groups["table"].Value;
            }
        }

        return null;
    }

    /// <summary>
    /// Splits on top-level semicolons. The vendored files carry semicolons inside <c>--</c> comments
    /// (17 of them in 007-self-scoped.sql alone), so comments have to be stripped first or the splitter
    /// tears statements in half. Verified against the vendored set: no dollar-quoting, no semicolons
    /// inside string literals — both are still handled so a future policy file cannot break this quietly.
    /// </summary>
    internal static IEnumerable<string> SplitStatements(string sql)
    {
        var current = new StringBuilder();
        var i = 0;

        while (i < sql.Length)
        {
            var c = sql[i];

            if (c == '-' && i + 1 < sql.Length && sql[i + 1] == '-')
            {
                while (i < sql.Length && sql[i] != '\n')
                {
                    i++;
                }

                current.Append('\n');
                continue;
            }

            if (c == '/' && i + 1 < sql.Length && sql[i + 1] == '*')
            {
                i += 2;
                while (i + 1 < sql.Length && !(sql[i] == '*' && sql[i + 1] == '/'))
                {
                    i++;
                }

                i = Math.Min(i + 2, sql.Length);
                current.Append(' ');
                continue;
            }

            if (c is '\'' or '"')
            {
                var quote = c;
                current.Append(c);
                i++;
                while (i < sql.Length)
                {
                    current.Append(sql[i]);
                    if (sql[i] == quote)
                    {
                        // doubled quote is an escaped quote, not the end of the literal
                        if (i + 1 < sql.Length && sql[i + 1] == quote)
                        {
                            current.Append(sql[i + 1]);
                            i += 2;
                            continue;
                        }

                        i++;
                        break;
                    }

                    i++;
                }

                continue;
            }

            if (c == ';')
            {
                var statement = current.ToString().Trim();
                if (statement.Length > 0)
                {
                    yield return statement;
                }

                current.Clear();
                i++;
                continue;
            }

            current.Append(c);
            i++;
        }

        var tail = current.ToString().Trim();
        if (tail.Length > 0)
        {
            yield return tail;
        }
    }

    internal static string ReadVendoredFile(string fileName)
    {
        var assembly = Assembly.GetExecutingAssembly();
        var resource = assembly.GetManifestResourceNames()
            .SingleOrDefault(n => n.EndsWith($".Rls.{fileName}", StringComparison.Ordinal))
            ?? throw new InvalidOperationException(
                $"Vendored RLS file '{fileName}' is not an EmbeddedResource. Add it to " +
                "FormMaps.IntegrationTests.csproj — an unregistered file is silently no RLS at all.");

        using var stream = assembly.GetManifestResourceStream(resource)!;
        using var streamReader = new StreamReader(stream);
        return streamReader.ReadToEnd();
    }

    private static string Truncate(string value) =>
        value.Length <= 160 ? value : value[..160] + "…";
}
