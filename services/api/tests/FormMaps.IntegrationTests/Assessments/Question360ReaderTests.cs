using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="Question360Reader"/>. Pins the isActive filter, the
/// relationType / category / parent filters, orderBy questionNumber ASC (with the deterministic id tie-break),
/// the full-row shape (camelCase-serializable record + ISO-Z timestamps + null parentQuestionId), and the
/// findUnique-by-id contract (NO isActive filter → an inactive row is still returned; missing → null).
/// </summary>
public sealed class Question360ReaderTests : IClassFixture<Question360DatabaseFixture>, IAsyncLifetime
{
    private readonly Question360DatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public Question360ReaderTests(Question360DatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "questions_360" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task List_returns_only_active_ordered_by_questionNumber()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedAsync(conn, number: 3, relationType: "peer", category: "collaboration");
        await SeedAsync(conn, number: 1, relationType: "peer", category: "collaboration");
        await SeedAsync(conn, number: 2, relationType: "self", category: "leadership", isActive: false); // excluded

        var rows = await Reader().ListAsync(Ctx(), relationType: null);

        Assert.Equal(new[] { 1, 3 }, rows.Select(r => r.QuestionNumber).ToArray()); // asc, inactive excluded
    }

    [Fact]
    public async Task List_filters_by_relationType()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedAsync(conn, number: 1, relationType: "peer", category: "c");
        await SeedAsync(conn, number: 2, relationType: "manager", category: "c");

        var rows = await Reader().ListAsync(Ctx(), relationType: "manager");

        Assert.Single(rows);
        Assert.Equal("manager", rows[0].RelationType);
    }

    [Fact]
    public async Task List_orders_ties_by_id_for_determinism()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedAsync(conn, id: "id-b", number: 5, relationType: "peer", category: "c");
        await SeedAsync(conn, id: "id-a", number: 5, relationType: "peer", category: "c");

        var rows = await Reader().ListAsync(Ctx(), relationType: null);

        Assert.Equal(new[] { "id-a", "id-b" }, rows.Select(r => r.Id).ToArray()); // questionNumber tie -> id ASC
    }

    [Fact]
    public async Task ListByCategory_filters_active_in_category()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedAsync(conn, number: 1, relationType: "peer", category: "leadership");
        await SeedAsync(conn, number: 2, relationType: "peer", category: "collaboration");
        await SeedAsync(conn, number: 3, relationType: "peer", category: "leadership", isActive: false);

        var rows = await Reader().ListByCategoryAsync(Ctx(), "leadership");

        Assert.Single(rows);
        Assert.Equal(1, rows[0].QuestionNumber);
    }

    [Fact]
    public async Task ListByParent_returns_active_sub_questions()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedAsync(conn, id: "parent-1", number: 1, relationType: "peer", category: "c");
        await SeedAsync(conn, number: 2, relationType: "peer", category: "c", parentQuestionId: "parent-1", isSubQuestion: true);
        await SeedAsync(conn, number: 3, relationType: "peer", category: "c", parentQuestionId: "parent-1", isSubQuestion: true, isActive: false);
        await SeedAsync(conn, number: 4, relationType: "peer", category: "c", parentQuestionId: "other");

        var rows = await Reader().ListByParentAsync(Ctx(), "parent-1");

        Assert.Single(rows);
        Assert.Equal(2, rows[0].QuestionNumber);
        Assert.True(rows[0].IsSubQuestion);
        Assert.Equal("parent-1", rows[0].ParentQuestionId);
    }

    [Fact]
    public async Task GetById_returns_full_row_including_inactive_with_isoZ_and_null_parent()
    {
        var when = new DateTime(2025, 3, 1, 12, 0, 0);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedAsync(conn, id: "q-1", number: 7, relationType: "peer", category: "collaboration",
            isActive: false, createdDate: when, updatedDate: when); // inactive is still returned by id

        var row = await Reader().GetByIdAsync(Ctx(), "q-1");

        Assert.NotNull(row);
        Assert.Equal("q-1", row!.Id);
        Assert.False(row.IsActive);
        Assert.Null(row.ParentQuestionId);
        Assert.Equal("2025-03-01T12:00:00.000Z", row.CreatedDate);
        Assert.Equal("2025-03-01T12:00:00.000Z", row.UpdatedAt);
    }

    [Fact]
    public async Task GetById_returns_null_when_absent()
    {
        var row = await Reader().GetByIdAsync(Ctx(), "does-not-exist");
        Assert.Null(row);
    }

    // ---------------------------------------------------------------- helpers

    private Question360Reader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("u-" + Guid.NewGuid().ToString("N"), "school_admin", "a@e.st", "Test User"),
            schoolId: null, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task SeedAsync(
        NpgsqlConnection conn,
        int number,
        string relationType,
        string category,
        string? id = null,
        bool isActive = true,
        bool isSubQuestion = false,
        string? parentQuestionId = null,
        DateTime? createdDate = null,
        DateTime? updatedDate = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "questions_360"
              ("id","questionEnglishText","questionSpanishText","category","relationType","questionNumber",
               "isSubQuestion","parentQuestionId","isActive","createdDate","updatedAt")
            VALUES (@id,@en,@es,@cat,@rel,@num,@sub,@parent,@active,
                    COALESCE(@created, CURRENT_TIMESTAMP), COALESCE(@updated, CURRENT_TIMESTAMP))
            """, conn);
        cmd.Parameters.AddWithValue("id", id ?? Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("en", $"EN {number}");
        cmd.Parameters.AddWithValue("es", $"ES {number}");
        cmd.Parameters.AddWithValue("cat", category);
        cmd.Parameters.AddWithValue("rel", relationType);
        cmd.Parameters.AddWithValue("num", number);
        cmd.Parameters.AddWithValue("sub", isSubQuestion);
        cmd.Parameters.AddWithValue("parent", (object?)parentQuestionId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("active", isActive);
        cmd.Parameters.AddWithValue("created",
            createdDate is { } c ? DateTime.SpecifyKind(c, DateTimeKind.Unspecified) : (object)DBNull.Value);
        cmd.Parameters.AddWithValue("updated",
            updatedDate is { } u ? DateTime.SpecifyKind(u, DateTimeKind.Unspecified) : (object)DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }
}
