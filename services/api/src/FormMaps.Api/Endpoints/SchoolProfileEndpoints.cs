using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolProfile;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// school:manage profile + settings surface (FM-DOTNET-051 — routes/school.ts, mounted under /api/v1/school-admin):
/// GET+PUT /school/profile and GET+PUT /settings. Both paths carry a read (GET) AND a write (PUT), so they cut over
/// together (Next rewrites match by PATH not method) under ONE flag; this slice is the .NET write-owner for the
/// schools table's profile/settings columns.
///
/// <para>Auth chain per endpoint: RequireIdentity (401) → permission <c>school:manage</c> (403) → resolve the
/// caller's own schoolId (getSchoolId). Unlike the FM-050 reads, NO-SCHOOL IS A 404 here — and the message DIFFERS
/// per path: /school/profile → "No school linked"; /settings → "Not found". (Neither is the 400 "No school" the
/// assessment router uses.) getSettings returning null (school row missing) is also 404 "Not found". PUT bodies are
/// read with the shared empty-vs-malformed reader (empty → {} no-op; malformed → 400 "Invalid request body").</para>
/// </summary>
public static class SchoolProfileEndpoints
{
    public static IEndpointRouteBuilder MapSchoolProfileEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin").WithTags("SchoolProfile");

        group.MapGet("/school/profile", GetSchoolProfileAsync);
        group.MapPut("/school/profile", PutSchoolProfileAsync);
        group.MapGet("/settings", GetSettingsAsync);
        group.MapPut("/settings", PutSettingsAsync);

        return app;
    }

    // ---------------------------------------------------------------- /school/profile

    private static async Task<IResult> GetSchoolProfileAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolProfileReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return NoSchoolLinked();
        }

        var profile = await reader.GetSchoolProfileAsync(context, schoolId, cancellationToken);
        // Legacy getSchoolProfile returns null when the row is missing → { success:true, data:null }.
        return profile is null
            ? Results.Ok(new { success = true, data = (object?)null })
            : Results.Ok(new { success = true, data = ProfileJson(profile) });
    }

    private static async Task<IResult> PutSchoolProfileAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolProfileWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return NoSchoolLinked();
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InvalidBody();
        }

        // The allow-list builder IS the mass-assignment guard: unknown keys (adminEmail, maxStudents, plan, id, …)
        // are never mapped to a column. An empty patch is a no-op that still bumps updatedAt + returns the row.
        var columns = SchoolProfileUpdateBuilder.Build(body.Value);
        var profile = await writer.UpdateSchoolProfileAsync(context, schoolId, columns, cancellationToken);
        return Results.Ok(new { success = true, data = ProfileJson(profile) });
    }

    // ---------------------------------------------------------------- /settings

    private static async Task<IResult> GetSettingsAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolProfileReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return SettingsNotFound();
        }

        var userId = context.Actor!.UserId;
        var settings = await reader.GetSettingsAsync(context, userId, schoolId, cancellationToken);
        if (settings is null)
        {
            return SettingsNotFound();
        }

        return Results.Ok(new { success = true, data = SettingsJson(settings) });
    }

    private static async Task<IResult> PutSettingsAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolProfileWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return SettingsNotFound();
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InvalidBody();
        }

        if (!TryParseSettingsPatch(body.Value, out var patch, out var parseError))
        {
            // Architecturally-correct divergence (FM-044/048 house rule): legacy casts the wrong-typed value and
            // lets Prisma 500 at the DB; we reject the malformed field up front with a 400.
            return Results.Json(new { success = false, message = parseError }, statusCode: StatusCodes.Status400BadRequest);
        }

        var result = await writer.UpdateSettingsAsync(context, schoolId, patch, cancellationToken);
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                notifyOnStudentSignup = result.NotifyOnStudentSignup,
                notifyOnAssessmentComplete = result.NotifyOnAssessmentComplete,
                allowStudentSelfRegistration = result.AllowStudentSelfRegistration,
                timezone = result.Timezone,
                maxStudents = result.MaxStudents
            }
        });
    }

    // ---------------------------------------------------------------- JSON shapes

    // The full schools row (schema order) + the `email` alias — a verbatim passthrough of the Prisma model.
    private static object ProfileJson(SchoolProfileDto p) => new
    {
        id = p.Id,
        name = p.Name,
        adminEmail = p.AdminEmail,
        contactEmail = p.ContactEmail,
        maxStudents = p.MaxStudents,
        serviceHoursRequired = p.ServiceHoursRequired,
        details = p.Details,
        contractStartDate = p.ContractStartDate,
        contractEndDate = p.ContractEndDate,
        status = p.Status,
        invitedAt = p.InvitedAt,
        invitationToken = p.InvitationToken,
        invitationTokenExpiresAt = p.InvitationTokenExpiresAt,
        notifyOnStudentSignup = p.NotifyOnStudentSignup,
        notifyOnAssessmentComplete = p.NotifyOnAssessmentComplete,
        allowStudentSelfRegistration = p.AllowStudentSelfRegistration,
        logoUrl = p.LogoUrl,
        address = p.Address,
        phone = p.Phone,
        website = p.Website,
        timezone = p.Timezone,
        isActive = p.IsActive,
        createdBy = p.CreatedBy,
        createdDate = p.CreatedDate,
        updatedBy = p.UpdatedBy,
        updatedAt = p.UpdatedAt,
        videoCallsEnabled = p.VideoCallsEnabled,
        email = p.Email
    };

    private static object SettingsJson(SchoolSettings s) => new
    {
        school = new
        {
            name = s.Name,
            currentStudents = s.CurrentStudents,
            maxStudents = s.MaxStudents,
            plan = s.Plan
        },
        admin = new
        {
            id = s.AdminId,
            name = s.AdminName,
            email = s.AdminEmail
        },
        notifyOnStudentSignup = s.NotifyOnStudentSignup,
        notifyOnAssessmentComplete = s.NotifyOnAssessmentComplete,
        allowStudentSelfRegistration = s.AllowStudentSelfRegistration,
        timezone = s.Timezone,
        maxStudents = s.MaxStudents
    };

    // ---------------------------------------------------------------- settings patch parse (allow-list)

    // updateSettings body is untyped. Notify/self-registration flags map to nullable Boolean? columns and are
    // written when present as an actual JSON boolean OR JSON null — legacy `if (body.x !== undefined) data.x = body.x`
    // treats JSON null as PRESENT and writes it as NULL (200, field null). A present-but-non-boolean-non-null value
    // (string/number/object/array) → 400 (the sanctioned house rule; legacy 500s at the DB). timezone: `if
    // (body.timezone)` truthiness — written only when a truthy (non-empty) JSON string; falsy present values
    // (null/""/false/0) are skipped; a truthy NON-string (number≠0 / true / object / array) → 400.
    private static bool TryParseSettingsPatch(JsonElement body, out SchoolSettingsPatch patch, out string error)
    {
        patch = default!;
        error = string.Empty;
        bool hasNss = false, hasNac = false, hasAsr = false, hasTz = false;
        bool? nss = null, nac = null, asr = null;
        string? tz = null;

        if (body.ValueKind == JsonValueKind.Object)
        {
            if (!TryReadBool(body, "notifyOnStudentSignup", ref hasNss, ref nss, out error)) { return false; }
            if (!TryReadBool(body, "notifyOnAssessmentComplete", ref hasNac, ref nac, out error)) { return false; }
            if (!TryReadBool(body, "allowStudentSelfRegistration", ref hasAsr, ref asr, out error)) { return false; }

            if (body.TryGetProperty("timezone", out var tzEl))
            {
                switch (tzEl.ValueKind)
                {
                    case JsonValueKind.String:
                        var s = tzEl.GetString()!;
                        if (s.Length > 0) { hasTz = true; tz = s; } // truthy string → write; "" falsy → skip
                        break;
                    case JsonValueKind.Null:
                    case JsonValueKind.False:
                        break; // falsy → skip
                    case JsonValueKind.Number:
                        if (tzEl.TryGetDouble(out var d) && d == 0) { break; } // 0 falsy → skip
                        error = "timezone must be a string"; return false;      // truthy number
                    default: // True / Object / Array — truthy non-string
                        error = "timezone must be a string"; return false;
                }
            }
        }

        patch = new SchoolSettingsPatch(hasNss, nss, hasNac, nac, hasAsr, asr, hasTz, tz);
        return true;
    }

    private static bool TryReadBool(JsonElement body, string name, ref bool has, ref bool? value, out string error)
    {
        error = string.Empty;
        if (!body.TryGetProperty(name, out var el))
        {
            return true; // absent → not written
        }

        switch (el.ValueKind)
        {
            case JsonValueKind.True:
            case JsonValueKind.False:
                has = true;
                value = el.GetBoolean();
                return true;
            case JsonValueKind.Null:
                has = true;
                value = null; // present JSON null → write NULL (legacy `data.x = null`)
                return true;
            default: // String / Number / Object / Array → 400 (house rule; legacy 500s at the DB)
                error = $"{name} must be a boolean";
                return false;
        }
    }

    // ---------------------------------------------------------------- body reader + guard

    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    // EmptyObject for an empty/whitespace body (express.json() yields {} → the update becomes a no-op that still
    // returns the row); null when the body is present-but-malformed JSON (→ 400, no write). Mirrors
    // SchoolAdminEndpoints.ReadBodyAsync.
    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        using var streamReader = new StreamReader(http.Request.Body);
        var raw = await streamReader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return EmptyObject;
        }

        try
        {
            using var document = JsonDocument.Parse(raw);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// Shared guard chain: RequireIdentity (401) → permission school:manage (403) → resolve the caller's own
    /// schoolId. The resolved schoolId MAY be null/empty — each handler renders its OWN 404 (the message differs
    /// per path). Error is non-null ONLY for 401/403.
    /// </summary>
    private static async Task<(RequestContext Context, string? SchoolId, IResult? Error)> AuthorizeAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        CancellationToken cancellationToken)
    {
        var context = accessor.Current;

        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return (context, null, Results.Json(
                new { success = false, code = decision.Code, message = decision.Message },
                statusCode: decision.StatusCode));
        }

        if (!context.Permissions.Contains(FormMapsPermissions.SchoolManage))
        {
            return (context, null, Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        var schoolId = await scope.ResolveSchoolIdAsync(context, cancellationToken);
        return (context, schoolId, null);
    }

    private static IResult NoSchoolLinked() =>
        Results.Json(new { success = false, message = "No school linked" }, statusCode: StatusCodes.Status404NotFound);

    private static IResult SettingsNotFound() =>
        Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);

    private static IResult InvalidBody() =>
        Results.Json(new { success = false, message = "Invalid request body" }, statusCode: StatusCodes.Status400BadRequest);
}
