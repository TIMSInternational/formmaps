using FormMaps.Application.Auth;
using FormMaps.Application.College;
using FormMaps.Infrastructure.College;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.College;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="CollegeEssaysRepository"/> (FM-DOTNET-083). Pins: essays list +
/// UNFILTERED comment count (Prisma _count, no isActive) + active/student scope + createdDate DESC; create (defaults +
/// stored wordCount) + owner lookup; update (title/content/status enum cast/wordCount override) preserving unset fields;
/// soft-delete; comment insert (authorId=caller) + list join to author {id,name,roleName} + active/asc scope.
/// </summary>
public sealed class CollegeEssaysRepositoryTests
    : IClassFixture<CollegeEssaysDatabaseFixture>, IAsyncLifetime
{
    private readonly CollegeEssaysDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CollegeEssaysRepositoryTests(CollegeEssaysDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "college_essays", "essay_comments", "users" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task ListEssays_scopes_active_student_desc_with_unfiltered_comment_count()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Essay(conn, "e-old", "stu-1", "Old", created: new DateTime(2026, 7, 1));
        await Essay(conn, "e-new", "stu-1", "New", created: new DateTime(2026, 7, 10));
        await Essay(conn, "e-inactive", "stu-1", "Gone", isActive: false);
        await Essay(conn, "e-other", "stu-2", "Other");
        await Comment(conn, "c1", "e-new", "a1", isActive: true);
        await Comment(conn, "c2", "e-new", "a1", isActive: false); // inactive comment STILL counts (Prisma _count unfiltered)

        var rows = await Repo().ListEssaysAsync(Ctx(), "stu-1");
        Assert.Equal(["e-new", "e-old"], rows.Select(r => r.Essay.Id)); // active + stu-1, createdDate DESC
        Assert.Equal(2, rows[0].CommentCount);                          // both comments counted
        Assert.Equal(0, rows[1].CommentCount);
    }

    [Fact]
    public async Task Create_stores_defaults_and_wordCount()
    {
        var input = new EssayCreateInput("stu-1", "My Essay", "The prompt", "hello world essay", "personal", null, 3);
        var created = await Repo().CreateEssayAsync(Ctx(), "caller-1", input);

        Assert.Equal("draft", created.Status);      // DB default
        Assert.True(created.IsActive);              // DB default
        Assert.Equal(3, created.WordCount);
        Assert.Equal("The prompt", created.Prompt);
        Assert.Equal("caller-1", created.CreatedBy);
        Assert.Equal("stu-1", await Repo().FindActiveEssayOwnerAsync(Ctx(), created.Id));
    }

    [Fact]
    public async Task FindOwner_ignores_inactive_and_missing()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Essay(conn, "e1", "owner-1", "T");
        await Essay(conn, "e-dead", "owner-1", "T", isActive: false);

        Assert.Equal("owner-1", await Repo().FindActiveEssayOwnerAsync(Ctx(), "e1"));
        Assert.Null(await Repo().FindActiveEssayOwnerAsync(Ctx(), "e-dead"));
        Assert.Null(await Repo().FindActiveEssayOwnerAsync(Ctx(), "missing"));
    }

    [Fact]
    public async Task Update_sets_present_fields_and_preserves_unset()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Essay(conn, "e1", "stu-1", "Original", prompt: "keep-me", content: "old", status: "draft", wordCount: 1);

        // Update title + status + content (derives wordCount 2); prompt untouched.
        var fields = new EssayUpdateFields(
            HasTitle: true, Title: "Updated",
            HasContent: true, ContentIsNull: false, Content: "brand new",
            HasStatus: true, Status: "in_review",
            HasWordCount: true, WordCount: 2);
        var updated = await Repo().ApplyEssayUpdateAsync(Ctx(), "editor-1", "e1", fields);

        Assert.Equal("Updated", updated.Title);
        Assert.Equal("in_review", updated.Status); // enum cast
        Assert.Equal("brand new", updated.Content);
        Assert.Equal(2, updated.WordCount);
        Assert.Equal("keep-me", updated.Prompt);   // unset → preserved
        Assert.Equal("editor-1", updated.UpdatedBy);
    }

    [Fact]
    public async Task Update_content_null_clears_it()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Essay(conn, "e1", "stu-1", "T", content: "had text", wordCount: 2);

        var fields = new EssayUpdateFields(
            HasTitle: false, Title: null,
            HasContent: true, ContentIsNull: true, Content: null,
            HasStatus: false, Status: null,
            HasWordCount: true, WordCount: 0);
        var updated = await Repo().ApplyEssayUpdateAsync(Ctx(), "editor-1", "e1", fields);

        Assert.Null(updated.Content);
        Assert.Equal(0, updated.WordCount);
    }

    [Fact]
    public async Task SoftDelete_deactivates()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Essay(conn, "e1", "stu-1", "T");

        await Repo().SoftDeleteEssayAsync(Ctx(), "editor-1", "e1");
        Assert.Null(await Repo().FindActiveEssayOwnerAsync(Ctx(), "e1")); // now inactive
    }

    [Fact]
    public async Task AddComment_stores_author_and_content()
    {
        var comment = await Repo().AddCommentAsync(Ctx(), "e1", "author-9", "nice work");
        Assert.Equal("e1", comment.EssayId);
        Assert.Equal("author-9", comment.AuthorId);
        Assert.Equal("nice work", comment.Content);
        Assert.True(comment.IsActive);
    }

    [Fact]
    public async Task ListComments_joins_author_scopes_active_asc()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "u1", "Alice Advisor", "counselor");
        await User(conn, "u2", "Bob Admin", "school_admin");
        await Comment(conn, "c-2nd", "e1", "u2", created: new DateTime(2026, 7, 10));
        await Comment(conn, "c-1st", "e1", "u1", created: new DateTime(2026, 7, 1));
        await Comment(conn, "c-inactive", "e1", "u1", isActive: false);
        await Comment(conn, "c-other", "e2", "u1");

        var rows = await Repo().ListCommentsAsync(Ctx(), "e1");
        Assert.Equal(["c-1st", "c-2nd"], rows.Select(r => r.Comment.Id)); // active + e1, createdDate ASC
        Assert.Equal("Alice Advisor", rows[0].Author.Name);
        Assert.Equal("counselor", rows[0].Author.RoleName);
        Assert.Equal("u1", rows[0].Author.Id);
    }

    // ---- helpers ----

    private CollegeEssaysRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            new FixedTimeProvider(new DateTime(2026, 7, 24, 12, 0, 0, DateTimeKind.Utc)));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("caller", "student", "c@e.st", "Student"),
            schoolId: "school-1", permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
    }

    private static async Task Essay(
        NpgsqlConnection conn, string id, string studentId, string title, bool isActive = true,
        string? prompt = null, string? content = null, string status = "draft", int wordCount = 0,
        DateTime? created = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "college_essays"
                ("id","studentId","title","prompt","content","status","wordCount","isActive","createdDate","updatedAt")
            VALUES(@id,@sid,@t,@p,@c,@st::"EssayStatus",@wc,@act,@cd,@cd)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("sid", studentId);
        cmd.Parameters.AddWithValue("t", title);
        cmd.Parameters.AddWithValue("p", (object?)prompt ?? DBNull.Value);
        cmd.Parameters.AddWithValue("c", (object?)content ?? DBNull.Value);
        cmd.Parameters.AddWithValue("st", status);
        cmd.Parameters.AddWithValue("wc", wordCount);
        cmd.Parameters.AddWithValue("act", isActive);
        cmd.Parameters.AddWithValue("cd", DateTime.SpecifyKind(created ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Comment(
        NpgsqlConnection conn, string id, string essayId, string authorId, bool isActive = true, DateTime? created = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "essay_comments"("id","essayId","authorId","content","isActive","createdDate","updatedAt")
            VALUES(@id,@eid,@a,'text',@act,@cd,@cd)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("eid", essayId);
        cmd.Parameters.AddWithValue("a", authorId);
        cmd.Parameters.AddWithValue("act", isActive);
        cmd.Parameters.AddWithValue("cd", DateTime.SpecifyKind(created ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task User(NpgsqlConnection conn, string id, string name, string roleName)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users"("id","name","roleName") VALUES(@id,@n,@r)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("n", name);
        cmd.Parameters.AddWithValue("r", roleName);
        await cmd.ExecuteNonQueryAsync();
    }
}
