using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Real-DB tests for <see cref="AllResultsReader"/>'s tenant scoping.
///
/// <para>The query had no tenant predicate at all: it selected every completed pca_exam_session on
/// the platform. The endpoint's admin gate admits <c>school_admin</c>, so "admin only" was never the
/// same statement as "their own school", and the only thing between a school admin and every other
/// school's students' cognitive results was RLS.</para>
///
/// <para>RLS is not an independent control here. The policies are parameterised by
/// <c>app.current_school_id</c>, set from the same claim the request arrived with — the same check,
/// counted twice. These tests run against a schema with NO RLS policies at all, which is the point:
/// they prove the QUERY scopes, rather than proving the database rescued a query that did not.</para>
/// </summary>
public sealed class AllResultsReaderTests : IClassFixture<PcaExamWriteDatabaseFixture>, IAsyncLifetime
{
    private readonly PcaExamWriteDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public AllResultsReaderTests(PcaExamWriteDatabaseFixture fixture) => _fixture = fixture;

    public Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    private AllResultsReader MakeReader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx(string role, string? schoolId) =>
        RequestContext.Authenticated(
            new RequestActor("admin-" + Guid.NewGuid().ToString("N")[..8], role, "a@e.st", "An Admin"),
            schoolId: schoolId,
            permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader,
            isDevelopmentOverride: true);

    /// <summary>One completed session for a user in `schoolId`. Returns the session id.</summary>
    private async Task<string> SeedCompletedSessionAsync(string schoolId)
    {
        var suffix = Guid.NewGuid().ToString("N")[..12];
        var userId = $"u-{suffix}";
        var sessionId = $"s-{suffix}";
        var examId = $"e-{suffix}";

        await using var conn = await _dataSource.OpenConnectionAsync();

        await using (var cmd = new NpgsqlCommand(
            """INSERT INTO "users" ("id","schoolId") VALUES (@id, @school)""", conn))
        {
            cmd.Parameters.AddWithValue("id", userId);
            cmd.Parameters.AddWithValue("school", schoolId);
            await cmd.ExecuteNonQueryAsync();
        }

        await using (var cmd = new NpgsqlCommand(
            """
            INSERT INTO "pca_exams" ("id","name","type","timeLimitMinutes","updatedAt")
            VALUES (@id, 'Pattern', 'PatternRecognition'::"ExamType", 5, now())
            """, conn))
        {
            cmd.Parameters.AddWithValue("id", examId);
            await cmd.ExecuteNonQueryAsync();
        }

        await using (var cmd = new NpgsqlCommand(
            """
            INSERT INTO "pca_exam_sessions"
              ("id","examId","userId","examName","examType","startTime","isCompleted","isActive","status","updatedAt")
            VALUES (@id, @exam, @user, 'Pattern', 'PatternRecognition'::"ExamType", now(), true, true,
                    'Completed'::"ExamStatus", now())
            """, conn))
        {
            cmd.Parameters.AddWithValue("id", sessionId);
            cmd.Parameters.AddWithValue("exam", examId);
            cmd.Parameters.AddWithValue("user", userId);
            await cmd.ExecuteNonQueryAsync();
        }

        return sessionId;
    }

    [Fact]
    public async Task A_school_admin_sees_only_their_own_school()
    {
        var mine = await SeedCompletedSessionAsync("school-A");
        var theirs = await SeedCompletedSessionAsync("school-B");

        var page = await MakeReader().ReadAsync(Ctx(FormMapsRoles.SchoolAdmin, "school-A"), skip: 0, limit: 100);
        var ids = page.Rows.Select(r => r.Id).ToHashSet();

        Assert.Contains(mine, ids);
        Assert.DoesNotContain(theirs, ids);
    }

    [Fact]
    public async Task The_total_is_scoped_too_so_pagination_does_not_leak_the_count()
    {
        await SeedCompletedSessionAsync("school-C");
        await SeedCompletedSessionAsync("school-D");
        await SeedCompletedSessionAsync("school-D");

        var page = await MakeReader().ReadAsync(Ctx(FormMapsRoles.SchoolAdmin, "school-C"), skip: 0, limit: 100);

        // Exactly the one row seeded for school-C. A count taken from the unscoped query would
        // report every completed session on the platform even while the rows were filtered.
        Assert.Equal(page.Rows.Count, page.Total);
        Assert.Equal(1, page.Total);
    }

    [Fact]
    public async Task A_super_admin_is_still_platform_wide()
    {
        var a = await SeedCompletedSessionAsync("school-E");
        var b = await SeedCompletedSessionAsync("school-F");

        var page = await MakeReader().ReadAsync(Ctx(FormMapsRoles.SuperAdmin, schoolId: null), skip: 0, limit: 500);
        var ids = page.Rows.Select(r => r.Id).ToHashSet();

        Assert.Contains(a, ids);
        Assert.Contains(b, ids);
    }

    [Fact]
    public async Task A_school_less_non_super_admin_sees_nothing_rather_than_everything()
    {
        await SeedCompletedSessionAsync("school-G");

        var page = await MakeReader().ReadAsync(Ctx(FormMapsRoles.SchoolAdmin, schoolId: null), skip: 0, limit: 100);

        // Fail closed. A null schoolId binds as NULL and matches no row; the dangerous reading of
        // "no school" is "no filter".
        Assert.Empty(page.Rows);
        Assert.Equal(0, page.Total);
    }
}
