using FormMaps.Application.Auth;
using FormMaps.Application.SchoolStudents;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolStudents;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolStudents;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC container tz) tests for <see cref="SchoolStudentsParentsReader"/>. Pins:
/// IsStudentInCallerSchool (exists+same-school → true; other-school/missing/null → false); listParentsForStudent
/// (status accepted/expired/pending via a FIXED TimeProvider, createdDate DESC, isActive filter, ISO-Z fields);
/// listParents (JOIN school-scope, group by lower(parentEmail) keep-first, students appended, total = LINK count so
/// data.Count &lt; total, search over name/email but stats search-independent, school-wide stats totalParents-distinct
/// / linkedStudents / pendingInvites).
/// </summary>
public sealed class SchoolStudentsParentsReaderTests : IClassFixture<SchoolStudentsDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";
    private static readonly DateTime Now = new(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc);

    private readonly SchoolStudentsDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public SchoolStudentsParentsReaderTests(SchoolStudentsDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "users","student_parent_links" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- IsStudentInCallerSchool ----

    [Fact]
    public async Task IsStudentInCallerSchool_true_only_for_same_school_existing_student()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School);
        await SeedUser(conn, "sx", OtherSchool);
        await SeedUser(conn, "sn", null);

        Assert.True(await Reader().IsStudentInCallerSchoolAsync(Ctx(), School, "s1"));
        Assert.False(await Reader().IsStudentInCallerSchoolAsync(Ctx(), School, "sx"));   // other school
        Assert.False(await Reader().IsStudentInCallerSchoolAsync(Ctx(), School, "sn"));   // null schoolId
        Assert.False(await Reader().IsStudentInCallerSchoolAsync(Ctx(), School, "nope")); // missing
    }

    // ---- listParentsForStudent ----

    [Fact]
    public async Task ListParentsForStudent_derives_status_and_orders_desc()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School);
        // accepted (regardless of token); expired (token in the past, not accepted); pending (token future);
        // pending (no token). Ordered createdDate DESC.
        await SeedLink(conn, "l-acc", "s1", "acc@e.st", isAccepted: true, tokenExpiresAt: Now.AddDays(-1), acceptedAt: Now.AddDays(-2), createdDate: Now.AddDays(-1));
        await SeedLink(conn, "l-exp", "s1", "exp@e.st", isAccepted: false, tokenExpiresAt: Now.AddHours(-1), createdDate: Now.AddDays(-2));
        await SeedLink(conn, "l-fut", "s1", "fut@e.st", isAccepted: false, tokenExpiresAt: Now.AddHours(1), createdDate: Now.AddDays(-3));
        await SeedLink(conn, "l-non", "s1", "non@e.st", isAccepted: false, tokenExpiresAt: null, createdDate: Now.AddDays(-4));
        await SeedLink(conn, "l-inact", "s1", "x@e.st", isAccepted: false, tokenExpiresAt: null, isActive: false); // excluded

        var links = await Reader().ListParentsForStudentAsync(Ctx(), "s1");

        Assert.Equal(new[] { "l-acc", "l-exp", "l-fut", "l-non" }, links.Select(l => l.Id).ToArray()); // createdDate DESC
        Assert.Equal("accepted", links.Single(l => l.Id == "l-acc").Status);
        Assert.Equal("expired", links.Single(l => l.Id == "l-exp").Status);
        Assert.Equal("pending", links.Single(l => l.Id == "l-fut").Status);
        Assert.Equal("pending", links.Single(l => l.Id == "l-non").Status);
        var acc = links.Single(l => l.Id == "l-acc");
        Assert.Equal("acc@e.st", acc.Email);
        Assert.NotNull(acc.AcceptedAt);
        Assert.Null(links.Single(l => l.Id == "l-exp").AcceptedAt);
    }

    // ---- listParents ----

    [Fact]
    public async Task ListParents_groups_by_lower_email_keep_first_and_counts_links()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, name: "Ada", gradeLevel: 11);
        await SeedUser(conn, "s2", School, name: "Bo", gradeLevel: 12);
        await SeedUser(conn, "sx", OtherSchool);
        // Pat is linked to s1 and s2 with the SAME email in different case → ONE group, TWO students, TWO links.
        await SeedLink(conn, "l1", "s1", "Pat@e.st", parentName: "Pat First", parentUserId: "u9", createdDate: Now.AddDays(-1));
        await SeedLink(conn, "l2", "s2", "pat@e.st", parentName: "Pat Second", createdDate: Now.AddDays(-2));
        // A different parent + an other-school link (excluded).
        await SeedLink(conn, "l3", "s1", "mom@e.st", createdDate: Now.AddDays(-3));
        await SeedLink(conn, "lx", "sx", "ext@e.st");

        var page = await Reader().ListParentsAsync(Ctx(), School, Query(limit: 20));

        Assert.Equal(3, page.Total);                 // THREE in-school links (l1,l2,l3)
        Assert.Equal(2, page.Data.Count);            // grouped to TWO parents
        var pat = page.Data[0];                        // l1 first (createdDate DESC)
        Assert.Equal("l1", pat.Id);
        Assert.Equal("Pat First", pat.ParentName);   // keep-FIRST link's fields
        Assert.Equal("u9", pat.ParentUserId);
        Assert.Equal(new[] { "s1", "s2" }, pat.Students.Select(s => s.Id).ToArray()); // both students appended
        Assert.Equal(11, pat.Students[0].GradeLevel);
        // ASYMMETRY (faithful): the DISPLAY grouping (data) is case-INSENSITIVE (parentEmail.toLowerCase) → 2 parents,
        // but stats.totalParents mirrors Prisma groupBy on the RAW parentEmail (case-SENSITIVE) → "Pat@e.st" and
        // "pat@e.st" count as DISTINCT → 3. linkedStudents/pendingInvites are raw link counts (3 each).
        Assert.Equal(3, page.Stats.TotalParents);
        Assert.Equal(3, page.Stats.LinkedStudents);
        Assert.Equal(3, page.Stats.PendingInvites);
    }

    [Fact]
    public async Task ListParents_search_filters_data_but_not_stats()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School);
        await SeedLink(conn, "l1", "s1", "pat@e.st", parentName: "Pat", isAccepted: true, createdDate: Now.AddDays(-1));
        await SeedLink(conn, "l2", "s1", "mom@e.st", parentName: "Mom", createdDate: Now.AddDays(-2));

        var page = await Reader().ListParentsAsync(Ctx(), School, Query(search: "pat"));

        Assert.Single(page.Data);                    // only pat matches the search
        Assert.Equal("l1", page.Data[0].Id);
        Assert.Equal(1, page.Total);                 // link count under the search filter
        // stats ignore the search filter → school-wide.
        Assert.Equal(2, page.Stats.TotalParents);
        Assert.Equal(2, page.Stats.LinkedStudents);
        Assert.Equal(1, page.Stats.PendingInvites);  // l2 only (l1 accepted)
    }

    [Fact]
    public async Task ListParents_empty_school_returns_zero_stats()
    {
        var page = await Reader().ListParentsAsync(Ctx(), School, Query());
        Assert.Empty(page.Data);
        Assert.Equal(0, page.Total);
        Assert.Equal(0, page.Stats.TotalParents);
    }

    // ---- helpers ----

    private SchoolStudentsParentsReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), new FixedTimeProvider(Now));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school-admin", "admin@e.st", "Admin"),
            schoolId: School, permissions: new[] { "school:manage" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static ParentsListQuery Query(int page = 1, int limit = 20, string? search = null) =>
        new(page, limit, (long)(page - 1) * limit, search);

    private static DateTime Unspec(DateTime utc) => DateTime.SpecifyKind(utc, DateTimeKind.Unspecified);

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
    }

    private static async Task SeedUser(
        NpgsqlConnection conn, string id, string? schoolId, string? name = null, int? gradeLevel = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "users" ("id","name","email","roleName","schoolId","gradeLevel","isActive")
            VALUES (@id,@n,@e,'Student',@s,@g,true)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("n", name ?? $"Name {id}");
        cmd.Parameters.AddWithValue("e", $"{id}@e.st");
        cmd.Parameters.AddWithValue("s", (object?)schoolId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("g", (object?)gradeLevel ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedLink(
        NpgsqlConnection conn, string id, string studentId, string parentEmail,
        string parentName = "Parent", string? parentUserId = null, string relation = "parent",
        bool isAccepted = false, DateTime? tokenExpiresAt = null, DateTime? acceptedAt = null,
        bool isActive = true, DateTime? createdDate = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_parent_links"
                ("id","studentId","parentEmail","parentName","parentUserId","relation","isAccepted",
                 "tokenExpiresAt","acceptedAt","isActive","createdDate","updatedAt")
            VALUES (@id,@st,@pe,@pn,@pu,@rel,@acc,@tok,@accAt,@a,@cd,@cd)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("st", studentId);
        cmd.Parameters.AddWithValue("pe", parentEmail);
        cmd.Parameters.AddWithValue("pn", parentName);
        cmd.Parameters.AddWithValue("pu", (object?)parentUserId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("rel", relation);
        cmd.Parameters.AddWithValue("acc", isAccepted);
        cmd.Parameters.AddWithValue("tok", (object?)(tokenExpiresAt is null ? null : Unspec(tokenExpiresAt.Value)) ?? DBNull.Value);
        cmd.Parameters.AddWithValue("accAt", (object?)(acceptedAt is null ? null : Unspec(acceptedAt.Value)) ?? DBNull.Value);
        cmd.Parameters.AddWithValue("a", isActive);
        cmd.Parameters.AddWithValue("cd", Unspec(createdDate ?? DateTime.UtcNow));
        await cmd.ExecuteNonQueryAsync();
    }
}
