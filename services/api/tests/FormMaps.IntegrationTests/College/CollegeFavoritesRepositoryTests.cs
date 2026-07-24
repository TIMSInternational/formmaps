using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.College;
using FormMaps.Infrastructure.College;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.College;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="CollegeFavoritesRepository"/> (FM-DOTNET-082). Pins: search filters
/// (isActive, name ILIKE, state, acceptanceRate range) + Decimal→number + tuition jsonb + name ASC; favorites list
/// join + active/user scope + createdDate DESC; add-to-list create / reactivate (fit preserved when absent) / 409
/// already-active; FindActiveFavoriteOwner; fit update; soft-delete.
/// </summary>
public sealed class CollegeFavoritesRepositoryTests
    : IClassFixture<CollegeFavoritesDatabaseFixture>, IAsyncLifetime
{
    private readonly CollegeFavoritesDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CollegeFavoritesRepositoryTests(CollegeFavoritesDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "universities", "university_favorites" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Search_filters_active_name_state_rate_and_maps_types()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Univ(conn, "a", "Alpha University", state: "CA", rate: 0.10m, tuition: """{"inState":1000}""");
        await Univ(conn, "b", "Beta College", state: "NY", rate: 0.50m);
        await Univ(conn, "g", "Gamma Institute", state: "CA", rate: 0.90m);
        await Univ(conn, "d", "Delta School", state: "CA", rate: 0.20m, isActive: false);

        var all = await Repo().SearchAsync(Ctx(), new UniversitySearchFilter(null, null, null, null));
        Assert.Equal(["Alpha University", "Beta College", "Gamma Institute"], all.Select(r => r.Name)); // name ASC, Delta excluded
        Assert.Equal(0.10, all[0].AcceptanceRate); // Decimal → number
        Assert.Equal(1000, all[0].Tuition.GetProperty("inState").GetInt32()); // jsonb passthrough

        var byName = await Repo().SearchAsync(Ctx(), new UniversitySearchFilter("alpha", null, null, null));
        Assert.Equal(["Alpha University"], byName.Select(r => r.Name)); // ILIKE %alpha%

        var byState = await Repo().SearchAsync(Ctx(), new UniversitySearchFilter(null, "CA", null, null));
        Assert.Equal(["Alpha University", "Gamma Institute"], byState.Select(r => r.Name));

        var byRate = await Repo().SearchAsync(Ctx(), new UniversitySearchFilter(null, null, 0.4, 0.6));
        Assert.Equal(["Beta College"], byRate.Select(r => r.Name)); // 0.4 <= rate <= 0.6
    }

    [Fact]
    public async Task ListFavorites_joins_university_scopes_active_user_desc()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Univ(conn, "uni-x", "Xavier", state: "MA", rate: 0.3m);
        await Univ(conn, "uni-x2", "Yale-ish", state: "CT", rate: 0.2m);
        await Univ(conn, "uni-x3", "Zeta", state: "RI", rate: 0.4m);
        await Fav(conn, "f-old", "u1", "uni-x", created: new DateTime(2026, 7, 1));
        await Fav(conn, "f-new", "u1", "uni-x2", created: new DateTime(2026, 7, 10));
        await Fav(conn, "f-inactive", "u1", "uni-x3", isActive: false); // distinct uni (unique userId,universityId)
        await Fav(conn, "f-other", "u2", "uni-x");

        var rows = await Repo().ListFavoritesAsync(Ctx(), "u1");
        Assert.Equal(["f-new", "f-old"], rows.Select(r => r.Favorite.Id)); // active + u1, createdDate DESC
        Assert.Equal("Xavier", rows[1].University.Name);                    // joined university
        Assert.Equal(0.3, rows[1].University.AcceptanceRate);
    }

    [Fact]
    public async Task AddToList_create_reactivate_and_409()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Univ(conn, "uni-a", "A", state: "CA", rate: 0.5m);

        // Create (no fit → NULL).
        var created = await Repo().AddToListAsync(Ctx(), "u1", "uni-a", fitValid: true, hasFit: false, fitIsNull: false, fit: null, "u1");
        Assert.Equal(AddToListOutcome.Ok, created.Outcome);
        Assert.True(created.Row!.IsActive);
        Assert.Null(created.Row.FitClassification);

        // Duplicate active → 409.
        var dup = await Repo().AddToListAsync(Ctx(), "u1", "uni-a", fitValid: true, hasFit: true, fitIsNull: false, fit: "reach", "u1");
        Assert.Equal(AddToListOutcome.AlreadyInList, dup.Outcome);

        // Soft-delete, then re-add WITHOUT fit → reactivated, fit preserved from... (create set NULL) still NULL.
        await Repo().SoftDeleteFavoriteAsync(Ctx(), created.Row.Id, "u1");
        var react = await Repo().AddToListAsync(Ctx(), "u1", "uni-a", fitValid: true, hasFit: false, fitIsNull: false, fit: null, "u1");
        Assert.Equal(AddToListOutcome.Ok, react.Outcome);
        Assert.True(react.Row!.IsActive);
        Assert.Equal(created.Row.Id, react.Row.Id); // same row reactivated (not a new insert)
    }

    [Fact]
    public async Task AddToList_reactivate_preserves_existing_fit_when_absent()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Univ(conn, "uni-b", "B", state: "NY", rate: 0.4m);
        var created = await Repo().AddToListAsync(Ctx(), "u1", "uni-b", fitValid: true, hasFit: true, fitIsNull: false, fit: "safety", "u1");
        await Repo().SoftDeleteFavoriteAsync(Ctx(), created.Row!.Id, "u1");

        var react = await Repo().AddToListAsync(Ctx(), "u1", "uni-b", fitValid: true, hasFit: false, fitIsNull: false, fit: null, "u1");
        Assert.Equal("safety", react.Row!.FitClassification); // absent fit on reactivate → unchanged (Prisma undefined)
    }

    [Fact]
    public async Task FindOwner_UpdateFit_and_SoftDelete()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Univ(conn, "uni-c", "C", state: "TX", rate: 0.6m);
        await Fav(conn, "f1", "owner-1", "uni-c", fit: "match");
        await Fav(conn, "f-inactive", "owner-1", "uni-c2", isActive: false);

        Assert.Equal("owner-1", await Repo().FindActiveFavoriteOwnerAsync(Ctx(), "f1"));
        Assert.Null(await Repo().FindActiveFavoriteOwnerAsync(Ctx(), "f-inactive"));
        Assert.Null(await Repo().FindActiveFavoriteOwnerAsync(Ctx(), "missing"));

        var updated = await Repo().UpdateFitAsync(Ctx(), "f1", hasFit: true, fitIsNull: false, fit: "reach", "editor-1");
        Assert.Equal("reach", updated.FitClassification);
        Assert.Equal("editor-1", updated.UpdatedBy);

        await Repo().SoftDeleteFavoriteAsync(Ctx(), "f1", "editor-1");
        Assert.Null(await Repo().FindActiveFavoriteOwnerAsync(Ctx(), "f1")); // now inactive
    }

    // ---- helpers ----

    private CollegeFavoritesRepository Repo() =>
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

    private static async Task Univ(
        NpgsqlConnection conn, string id, string name, string? state, decimal? rate,
        bool isActive = true, string tuition = "{}")
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "universities"("id","name","city","state","acceptanceRate","tuition","type","website","isActive")
            VALUES(@id,@n,'City',@st,@r,@t::jsonb,'private','https://x.edu',@act)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("n", name);
        cmd.Parameters.AddWithValue("st", (object?)state ?? DBNull.Value);
        cmd.Parameters.AddWithValue("r", (object?)rate ?? DBNull.Value);
        cmd.Parameters.AddWithValue("t", tuition);
        cmd.Parameters.AddWithValue("act", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Fav(
        NpgsqlConnection conn, string id, string userId, string universityId, bool isActive = true,
        string? fit = null, DateTime? created = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "university_favorites"("id","userId","universityId","fitClassification","isActive","favoritedAt","createdDate","updatedAt")
            VALUES(@id,@u,@uni,@fit,@act,@cd,@cd,@cd)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("u", userId);
        cmd.Parameters.AddWithValue("uni", universityId);
        cmd.Parameters.AddWithValue("fit", (object?)fit ?? DBNull.Value);
        cmd.Parameters.AddWithValue("act", isActive);
        cmd.Parameters.AddWithValue("cd", DateTime.SpecifyKind(created ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }
}
