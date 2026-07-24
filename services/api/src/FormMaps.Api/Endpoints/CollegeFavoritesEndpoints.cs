using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using FormMaps.Application.Auth;
using FormMaps.Application.College;
using Microsoft.Extensions.Primitives;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// College search + favorites (FM-DOTNET-082 — routes/college.ts Feature 2, mounted /api/v1/college). One dark flag
/// <c>FORMMAPS_ROUTE_COLLEGE_FAVORITES_TO_DOTNET</c> co-flips three paths (path-not-method): GET /search (no access —
/// any authenticated caller), GET+POST /students/{studentId}/list, PUT+DELETE /list/{id}. Favorites are cross-user
/// scoped via <see cref="ICollegeAccessResolver"/> (any failure → uniform 404 "Not found"). POST upserts on the unique
/// (userId,universityId): existing+active → 409 "Already in list" (BEFORE the fit type-check); else reactivate/create.
/// PUT/DELETE do findUnique {id,isActive:true} → 404 "Not found" then the access check. A non-string fitClassification
/// on a write path → 500 (deferred). Body: empty→{}, malformed/primitive→500 (after RequireIdentity — auth-first).
/// </summary>
public static partial class CollegeFavoritesEndpoints
{
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    public static IEndpointRouteBuilder MapCollegeFavoritesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/college").WithTags("CollegeFavorites");
        group.MapGet("/search", SearchAsync);
        group.MapGet("/students/{studentId}/list", ListAsync);
        group.MapPost("/students/{studentId}/list", AddAsync);
        group.MapPut("/list/{id}", UpdateAsync);
        group.MapDelete("/list/{id}", DeleteAsync);
        return app;
    }

    private static async Task<IResult> SearchAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICollegeFavoritesRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;

        var query = http.Request.Query;
        var q = NonEmpty(query["q"]);            // if(q) → contains; "" falsy → no filter
        var state = NonEmpty(query["state"]);    // if(state) → exact
        var min = NonEmpty(query["minAdmRate"]); // present-truthy → parseFloat (may be NaN)
        var max = NonEmpty(query["maxAdmRate"]);

        var filter = new UniversitySearchFilter(
            q, state,
            min is null ? null : JsParseFloat(min),
            max is null ? null : JsParseFloat(max));

        var rows = await repository.SearchAsync(context, filter, cancellationToken);
        return Results.Ok(new { success = true, data = rows.Select(SearchRowJson) });
    }

    private static async Task<IResult> ListAsync(
        string studentId, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICollegeAccessResolver access, ICollegeFavoritesRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;
        if (!await access.CanAccessAsync(context, studentId, cancellationToken)) return NotFound();

        var rows = await repository.ListFavoritesAsync(context, studentId, cancellationToken);
        return Results.Ok(new { success = true, data = rows.Select(FavoriteWithUniversityJson) });
    }

    private static async Task<IResult> AddAsync(
        string studentId, HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICollegeAccessResolver access, ICollegeFavoritesRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        if (!await access.CanAccessAsync(context, studentId, cancellationToken)) return NotFound();

        var b = body.Value;
        var hasUid = TryGet(b, "universityId", out var uidEl);
        if (!JsTruthy(hasUid, uidEl)) return BadRequest("universityId required"); // !universityId → 400 (AFTER access)
        if (uidEl.ValueKind != JsonValueKind.String) return InternalError();      // truthy non-string → Prisma 500 at findUnique
        var universityId = uidEl.GetString()!;

        var (hasFit, fitIsNull, fit, fitValid) = ResolveFit(b);

        var result = await repository.AddToListAsync(
            context, studentId, universityId, fitValid, hasFit, fitIsNull, fit, context.Actor!.UserId, cancellationToken);
        return result.Outcome switch
        {
            AddToListOutcome.AlreadyInList => Results.Json(
                new { success = false, message = "Already in list" }, statusCode: StatusCodes.Status409Conflict),
            AddToListOutcome.InvalidBody => InternalError(),
            _ => Results.Json(new { success = true, data = FavoriteJson(result.Row!) }, statusCode: StatusCodes.Status201Created),
        };
    }

    private static async Task<IResult> UpdateAsync(
        string id, HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICollegeAccessResolver access, ICollegeFavoritesRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        var owner = await repository.FindActiveFavoriteOwnerAsync(context, id, cancellationToken);
        if (owner is null) return NotFound();
        if (!await access.CanAccessAsync(context, owner, cancellationToken)) return NotFound();

        var (hasFit, fitIsNull, fit, fitValid) = ResolveFit(body.Value);
        if (!fitValid) return InternalError(); // non-string fitClassification → Prisma 500 (deferred past the 404 gates)

        var row = await repository.UpdateFitAsync(context, id, hasFit, fitIsNull, fit, context.Actor!.UserId, cancellationToken);
        return Results.Ok(new { success = true, data = FavoriteJson(row) });
    }

    private static async Task<IResult> DeleteAsync(
        string id, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICollegeAccessResolver access, ICollegeFavoritesRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null) return error;

        var owner = await repository.FindActiveFavoriteOwnerAsync(context, id, cancellationToken);
        if (owner is null) return NotFound();
        if (!await access.CanAccessAsync(context, owner, cancellationToken)) return NotFound();

        await repository.SoftDeleteFavoriteAsync(context, id, context.Actor!.UserId, cancellationToken);
        return Results.Ok(new { success = true });
    }

    // A String? column raw assignment: absent → not written; null → NULL; string(incl "") → value; other → 500.
    private static (bool Has, bool IsNull, string? Value, bool Valid) ResolveFit(JsonElement body)
    {
        if (!TryGet(body, "fitClassification", out var el)) return (false, false, null, true);
        return el.ValueKind switch
        {
            JsonValueKind.Null => (true, true, null, true),
            JsonValueKind.String => (true, false, el.GetString(), true),
            _ => (true, false, null, false),
        };
    }

    // ECMAScript parseFloat: skip leading whitespace, parse the longest valid numeric prefix; no prefix → NaN.
    private static double JsParseFloat(string s)
    {
        var match = ParseFloatPrefix().Match(s);
        if (!match.Success) return double.NaN;
        var token = match.Groups[1].Value;
        if (token.EndsWith("Infinity", StringComparison.Ordinal))
        {
            return token.StartsWith('-') ? double.NegativeInfinity : double.PositiveInfinity;
        }

        return double.Parse(token, NumberStyles.Float, CultureInfo.InvariantCulture);
    }

    [GeneratedRegex(@"^[\s﻿ ]*([+-]?(?:Infinity|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?))")]
    private static partial Regex ParseFloatPrefix();

    private static string? NonEmpty(StringValues values)
    {
        var v = values.Count > 0 ? values[0] : null;
        return string.IsNullOrEmpty(v) ? null : v;
    }

    private static object SearchRowJson(UniversitySearchRow r) => new
    {
        id = r.Id,
        name = r.Name,
        city = r.City,
        state = r.State,
        acceptanceRate = r.AcceptanceRate,
        satAverage = r.SatAverage,
        satReading25 = r.SatReading25,
        satReading75 = r.SatReading75,
        satMath25 = r.SatMath25,
        satMath75 = r.SatMath75,
        actCumulative25 = r.ActCumulative25,
        actCumulative75 = r.ActCumulative75,
        actCumulativeMid = r.ActCumulativeMid,
        tuition = r.Tuition,
        studentCount = r.StudentCount,
        type = r.Type,
        website = r.Website,
    };

    private static object FavoriteJson(FavoriteRow r) => new
    {
        id = r.Id,
        userId = r.UserId,
        universityId = r.UniversityId,
        favoritedAt = r.FavoritedAt,
        notes = r.Notes,
        fitClassification = r.FitClassification,
        isActive = r.IsActive,
        createdBy = r.CreatedBy,
        createdDate = r.CreatedDate,
        updatedBy = r.UpdatedBy,
        updatedAt = r.UpdatedAt,
    };

    private static object FavoriteWithUniversityJson(FavoriteWithUniversity r) => new
    {
        id = r.Favorite.Id,
        userId = r.Favorite.UserId,
        universityId = r.Favorite.UniversityId,
        favoritedAt = r.Favorite.FavoritedAt,
        notes = r.Favorite.Notes,
        fitClassification = r.Favorite.FitClassification,
        isActive = r.Favorite.IsActive,
        createdBy = r.Favorite.CreatedBy,
        createdDate = r.Favorite.CreatedDate,
        updatedBy = r.Favorite.UpdatedBy,
        updatedAt = r.Favorite.UpdatedAt,
        university = new
        {
            id = r.University.Id,
            name = r.University.Name,
            city = r.University.City,
            state = r.University.State,
            acceptanceRate = r.University.AcceptanceRate,
            satAverage = r.University.SatAverage,
            actCumulativeMid = r.University.ActCumulativeMid,
            tuition = r.University.Tuition,
            type = r.University.Type,
            website = r.University.Website,
        },
    };

    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        using var streamReader = new StreamReader(http.Request.Body);
        var raw = await streamReader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(raw)) return EmptyObject;

        try
        {
            using var document = JsonDocument.Parse(raw);
            return document.RootElement.ValueKind is JsonValueKind.Object or JsonValueKind.Array
                ? document.RootElement.Clone()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static bool TryGet(JsonElement body, string name, out JsonElement el)
    {
        if (body.ValueKind == JsonValueKind.Object && body.TryGetProperty(name, out el)) return true;
        el = default;
        return false;
    }

    private static bool JsTruthy(bool has, JsonElement el)
    {
        if (!has) return false;
        return el.ValueKind switch
        {
            JsonValueKind.Null => false,
            JsonValueKind.False => false,
            JsonValueKind.True => true,
            JsonValueKind.String => !string.IsNullOrEmpty(el.GetString()),
            JsonValueKind.Number => !(el.TryGetDouble(out var n) && n == 0),
            _ => true,
        };
    }

    private static (RequestContext Context, IResult? Error) RequireIdentity(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return (context, Results.Json(
                new { success = false, code = decision.Code, message = decision.Message },
                statusCode: decision.StatusCode));
        }

        return (context, null);
    }

    private static IResult NotFound() =>
        Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);

    private static IResult BadRequest(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult InternalError() =>
        Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
}
