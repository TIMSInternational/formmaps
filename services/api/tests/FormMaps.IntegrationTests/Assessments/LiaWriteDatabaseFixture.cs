using System.Reflection;
using FormMaps.Application.Assessments;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Schema-only Testcontainers Postgres harness for the LIA session write lifecycle (FM-DOTNET-029) —
/// the first real-DB test fixture in the .NET suite. Boots postgres:16-alpine, applies the LIA DDL
/// (lia-schema.sql, verbatim from the prod migration; users stubbed; no RLS policies), seeds the static
/// <c>lia_questions</c> catalog, and exposes the connection string. RLS-e2e stays deferred (policy DDL is
/// not in the repo).
///
/// The <c>lia_questions</c> seed is what makes the harness able to catch FK-shaped bugs at all: prod has
/// <c>lia_responses_question_id_fkey REFERENCES lia_questions(id)</c>, so any question_id this backend
/// writes must already exist there. Rows are generated FROM
/// <see cref="LiaAnswerScoring.BuildQuestionBank"/> — the same embedded static bank production code
/// serves content from — with a FRESH uuid per row, never a hard-coded id list. That mirrors prod, where
/// <c>lia_questions.id</c> is <c>@default(uuid())</c> and its values are therefore non-deterministic per
/// seed run; a test that hard-coded ids would be testing a guarantee production does not offer.
/// </summary>
public sealed class LiaWriteDatabaseFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    private readonly Dictionary<LiaQuestionKey, string> _questionIds = [];

    public string ConnectionString => _container.GetConnectionString();

    /// <summary>
    /// The real seeded <c>lia_questions.id</c> for a natural key. Tests use this instead of inventing
    /// question_id strings: an invented one now violates the FK, exactly as it would in production.
    /// </summary>
    public string QuestionId(string subtest, int itemNumber, bool isPractice) =>
        _questionIds.TryGetValue(new LiaQuestionKey(subtest, itemNumber, isPractice), out var id)
            ? id
            : throw new InvalidOperationException(
                $"No seeded lia_questions row for ({subtest}, item {itemNumber}, isPractice={isPractice}).");

    /// <summary>Count of seeded catalog rows — pinned by the harness-proof test.</summary>
    public int SeededQuestionCount => _questionIds.Count;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using (var command = new NpgsqlCommand(LoadSchemaDdl(), connection))
        {
            await command.ExecuteNonQueryAsync();
        }

        await SeedQuestionCatalogAsync(connection);

        // Pin every subsequent session to a NON-UTC server timezone. The write columns are
        // `timestamp` (without tz); a correct writer binds tz-independently so stored == returned under
        // any server tz. If a regression bound completed_at as `timestamptz` (Kind=Utc), Postgres would
        // apply a TimeZone cast here and the store-vs-return assertions would go red — this is the
        // regression pin for the completed_at tz footgun.
        var database = (string)(await new NpgsqlCommand("SELECT current_database()", connection).ExecuteScalarAsync())!;
        await using var tz = new NpgsqlCommand($"ALTER DATABASE \"{database}\" SET timezone TO 'America/New_York'", connection);
        await tz.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _container.DisposeAsync();

    /// <summary>
    /// One <c>lia_questions</c> row per embedded-bank entry, inserted in a single round-trip via unnest.
    /// The generated ids are recorded in <see cref="_questionIds"/> so tests can resolve them without a
    /// query. Never truncated: this is static catalog content, and the in-process resolver cache under
    /// test assumes the catalog does not change mid-run (as it does not in production).
    /// </summary>
    private async Task SeedQuestionCatalogAsync(NpgsqlConnection connection)
    {
        var bank = LiaAnswerScoring.BuildQuestionBank();
        var ids = new string[bank.Count];
        var subtests = new string[bank.Count];
        var itemNumbers = new int[bank.Count];
        var questionData = new string[bank.Count];
        var correctAnswers = new string[bank.Count];
        var isPractice = new bool[bank.Count];

        for (var i = 0; i < bank.Count; i++)
        {
            var q = bank[i];
            ids[i] = Guid.NewGuid().ToString();
            subtests[i] = q.Subtest;
            itemNumbers[i] = q.ItemNumber;
            questionData[i] = q.QuestionData.GetRawText();
            correctAnswers[i] = q.CorrectAnswer;
            isPractice[i] = q.IsPractice;
            _questionIds[new LiaQuestionKey(q.Subtest, q.ItemNumber, q.IsPractice)] = ids[i];
        }

        await using var command = new NpgsqlCommand(
            """
            INSERT INTO "lia_questions"
                ("id", "subtest", "item_number", "question_data", "correct_answer", "is_practice", "updated_at")
            SELECT u."id", u."subtest"::"LiaSubtest", u."itemNumber", u."questionData"::jsonb,
                   u."correctAnswer", u."isPractice", now()
            FROM unnest(@ids, @subtests, @itemNumbers, @questionData, @correctAnswers, @isPractice)
                 AS u("id", "subtest", "itemNumber", "questionData", "correctAnswer", "isPractice")
            """,
            connection);
        command.Parameters.AddWithValue("ids", ids);
        command.Parameters.AddWithValue("subtests", subtests);
        command.Parameters.AddWithValue("itemNumbers", itemNumbers);
        command.Parameters.AddWithValue("questionData", questionData);
        command.Parameters.AddWithValue("correctAnswers", correctAnswers);
        command.Parameters.AddWithValue("isPractice", isPractice);
        await command.ExecuteNonQueryAsync();
    }

    private static string LoadSchemaDdl()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("lia-schema.sql", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
