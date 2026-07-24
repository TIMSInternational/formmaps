using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.IsamsWrites;
using FormMaps.Application.Security;

namespace FormMaps.Infrastructure.IsamsWrites;

/// <summary>
/// iSAMS configure write (FM-DOTNET-087 — schoolService.configureIsams). A faithful port of the Prisma
/// <c>isamsConfig.upsert({ where:{schoolId}, create, update })</c> plus the AES-256-GCM credential encryption,
/// on a writable Identity-RLS session + commit. The create and update payloads DIFFER (create:
/// authType||"api_key" + createdBy + creds-if-present; update: raw authType + updatedBy + conditional creds), so
/// the upsert is modeled as SELECT-then-branch rather than one ON CONFLICT statement — that is what makes e.g.
/// <c>authType:0</c> succeed on create (→ "api_key") but 500 on update (Prisma rejects a Number for a String col).
///
/// <para>Parity rules preserved: <c>endpoint = body.endpoint || body.apiUrl</c> (JS-|| on both paths);
/// <c>credentialsEncrypted = apiKey ? encrypt(apiKey) : undefined</c> — a truthy NON-string apiKey makes Node's
/// encryptField throw → 500 with no write (checked before the session opens); Prisma "undefined ⇒ omit" (create:
/// column defaults to NULL; update: column unchanged) vs "null ⇒ SET NULL"; a truthy non-string endpoint/authType
/// ⇒ 500. updatedBy + updatedAt are ALWAYS written on update (the Prisma update literal sets updatedBy
/// unconditionally and @updatedAt bumps), so even an empty-body update touches the row.</para>
/// </summary>
public sealed class IsamsConfigWriter(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    IFieldCipher fieldCipher,
    TimeProvider timeProvider) : IIsamsConfigWriter
{
    public async Task<ConfigureIsamsResult> ConfigureAsync(
        RequestContext context, string schoolId, JsonElement body, CancellationToken cancellationToken = default)
    {
        // encryptedCreds is computed FIRST (schoolService.ts:381), before the upsert. A truthy non-string apiKey →
        // encryptField throws → 500 (no DB touched). Falsy apiKey → no creds. Truthy string → the ciphertext.
        if (!TryResolveCredentials(body, out var credentialsEncrypted))
        {
            return InvalidBody;
        }

        // endpoint = body.endpoint || body.apiUrl — same coalescing on both paths; a truthy non-string → 500.
        var endpoint = ResolveEndpoint(body);
        if (endpoint.Kind == WriteKind.TypeError)
        {
            return InvalidBody;
        }

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var existingId = await FindConfigIdAsync(session, schoolId, cancellationToken);
        return existingId is null
            ? await InsertAsync(session, schoolId, endpoint, body, credentialsEncrypted, context, cancellationToken)
            : await UpdateAsync(session, existingId, endpoint, body, credentialsEncrypted, context, cancellationToken);
    }

    // ---------------------------------------------------------------- upsert branches

    private async Task<ConfigureIsamsResult> InsertAsync(
        FormMapsDatabaseSession session, string schoolId, WriteValue endpoint, JsonElement body,
        string? credentialsEncrypted, RequestContext context, CancellationToken cancellationToken)
    {
        // create authType = body.authType || "api_key" — always a value (never NULL/skip) unless truthy-non-string.
        var authType = ResolveAuthTypeCreate(body);
        if (authType.Kind == WriteKind.TypeError)
        {
            return InvalidBody;
        }

        var columns = new List<string> { "\"schoolId\"", "\"authType\"", "\"createdBy\"", "\"createdDate\"", "\"updatedAt\"" };
        var values = new List<string> { "@school", "@authType", "@createdBy", "@now", "@now" };

        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        AddParameter(command, "school", schoolId);
        AddParameter(command, "authType", authType.Value); // create authType is always a Value.
        AddParameter(command, "createdBy", context.Actor!.UserId);
        AddTimestamp(command, "now", Now());

        AddOptionalColumn(command, columns, values, "endpoint", endpoint);
        if (credentialsEncrypted is not null)
        {
            columns.Add("\"credentialsEncrypted\"");
            values.Add("@creds");
            AddParameter(command, "creds", credentialsEncrypted);
        }

        command.CommandText = $"""
            INSERT INTO "isams_configs" ({string.Join(", ", new[] { "\"id\"" }.Concat(columns))})
            VALUES ({string.Join(", ", new[] { "gen_random_uuid()::text" }.Concat(values))})
            RETURNING "id", "endpoint"
            """;

        return await ExecuteReturningAsync(command, session, cancellationToken);
    }

    private async Task<ConfigureIsamsResult> UpdateAsync(
        FormMapsDatabaseSession session, string id, WriteValue endpoint, JsonElement body,
        string? credentialsEncrypted, RequestContext context, CancellationToken cancellationToken)
    {
        // update authType = body.authType (RAW — no ||): absent→skip, null→NULL, string→value, other→500.
        var authType = ResolveAuthTypeUpdate(body);
        if (authType.Kind == WriteKind.TypeError)
        {
            return InvalidBody;
        }

        // updatedBy + updatedAt are set unconditionally (the Prisma update literal + @updatedAt).
        var sets = new List<string> { "\"updatedBy\" = @updatedBy", "\"updatedAt\" = @now" };

        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        AddParameter(command, "id", id);
        AddParameter(command, "updatedBy", context.Actor!.UserId);
        AddTimestamp(command, "now", Now());

        AddOptionalSet(command, sets, "endpoint", endpoint);
        AddOptionalSet(command, sets, "authType", authType);
        if (credentialsEncrypted is not null)
        {
            sets.Add("\"credentialsEncrypted\" = @creds");
            AddParameter(command, "creds", credentialsEncrypted);
        }

        command.CommandText = $"""
            UPDATE "isams_configs" SET {string.Join(", ", sets)} WHERE "id" = @id
            RETURNING "id", "endpoint"
            """;

        return await ExecuteReturningAsync(command, session, cancellationToken);
    }

    private static async Task<string?> FindConfigIdAsync(
        FormMapsDatabaseSession session, string schoolId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "id" FROM "isams_configs" WHERE "schoolId" = @school""");
        AddParameter(command, "school", schoolId);
        return await command.ExecuteScalarAsync(cancellationToken) as string;
    }

    private static async Task<ConfigureIsamsResult> ExecuteReturningAsync(
        DbCommand command, FormMapsDatabaseSession session, CancellationToken cancellationToken)
    {
        string id;
        string? endpoint;
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            await reader.ReadAsync(cancellationToken); // RETURNING yields exactly one row.
            id = reader.GetString(0);
            endpoint = reader.IsDBNull(1) ? null : reader.GetString(1);
        }

        await session.CommitAsync(cancellationToken);
        return new ConfigureIsamsResult(ConfigureIsamsStatus.Ok, id, endpoint);
    }

    // ---------------------------------------------------------------- JS-value resolution

    // credentialsEncrypted = body.apiKey ? encryptField(body.apiKey) : undefined. Returns false ONLY for a truthy
    // non-string apiKey (encryptField would throw → 500). Falsy/absent → true + null (no creds field).
    private bool TryResolveCredentials(JsonElement body, out string? ciphertext)
    {
        ciphertext = null;
        if (!TryGetProp(body, "apiKey", out var apiKey) || !IsTruthy(apiKey))
        {
            return true;
        }

        if (apiKey.ValueKind != JsonValueKind.String)
        {
            return false; // truthy non-string → Node's cipher.update throws → 500.
        }

        ciphertext = fieldCipher.Encrypt(apiKey.GetString()!); // truthy string ⇒ non-empty ("" is falsy).
        return true;
    }

    // endpoint = body.endpoint || body.apiUrl: endpoint if truthy, else apiUrl (present-or-undefined, any value).
    private static WriteValue ResolveEndpoint(JsonElement body)
    {
        if (TryGetProp(body, "endpoint", out var endpoint) && IsTruthy(endpoint))
        {
            return ClassifyString(present: true, endpoint);
        }

        var hasApiUrl = TryGetProp(body, "apiUrl", out var apiUrl);
        return ClassifyString(hasApiUrl, apiUrl);
    }

    // create authType = body.authType || "api_key": truthy string → value; truthy non-string → 500; falsy → "api_key".
    private static WriteValue ResolveAuthTypeCreate(JsonElement body)
    {
        if (TryGetProp(body, "authType", out var authType) && IsTruthy(authType))
        {
            return authType.ValueKind == JsonValueKind.String
                ? new WriteValue(WriteKind.Value, authType.GetString())
                : new WriteValue(WriteKind.TypeError, null);
        }

        return new WriteValue(WriteKind.Value, "api_key");
    }

    // update authType = body.authType (raw Prisma String? assignment).
    private static WriteValue ResolveAuthTypeUpdate(JsonElement body)
    {
        var present = TryGetProp(body, "authType", out var authType);
        return ClassifyString(present, authType);
    }

    // Prisma String? assignment of a JS value: undefined→Skip (omit); null→SET NULL; string→value; else→TypeError(500).
    private static WriteValue ClassifyString(bool present, JsonElement element)
    {
        if (!present)
        {
            return new WriteValue(WriteKind.Skip, null);
        }

        return element.ValueKind switch
        {
            JsonValueKind.Null => new WriteValue(WriteKind.Null, null),
            JsonValueKind.String => new WriteValue(WriteKind.Value, element.GetString()),
            _ => new WriteValue(WriteKind.TypeError, null),
        };
    }

    private static bool TryGetProp(JsonElement body, string name, out JsonElement value)
    {
        value = default;
        return body.ValueKind == JsonValueKind.Object && body.TryGetProperty(name, out value);
    }

    // JS truthiness: null/false/0/"" falsy; objects/arrays/non-empty strings/non-zero numbers truthy.
    private static bool IsTruthy(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Null or JsonValueKind.Undefined or JsonValueKind.False => false,
        JsonValueKind.Number => value.GetDouble() != 0,
        JsonValueKind.String => value.GetString()?.Length > 0,
        _ => true,
    };

    // ---------------------------------------------------------------- SQL helpers

    private static void AddOptionalColumn(
        DbCommand command, List<string> columns, List<string> values, string name, WriteValue value)
    {
        if (value.Kind == WriteKind.Skip)
        {
            return; // omit → the column takes its DB default (NULL for these nullable columns on INSERT).
        }

        columns.Add($"\"{name}\"");
        values.Add($"@{name}");
        AddParameter(command, name, value.Kind == WriteKind.Null ? null : value.Value);
    }

    private static void AddOptionalSet(DbCommand command, List<string> sets, string name, WriteValue value)
    {
        if (value.Kind == WriteKind.Skip)
        {
            return; // omit from SET → column unchanged.
        }

        sets.Add($"\"{name}\" = @{name}");
        AddParameter(command, name, value.Kind == WriteKind.Null ? null : value.Value);
    }

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, object? value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value ?? DBNull.Value;
        command.Parameters.Add(parameter);
    }

    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    // Kind=Unspecified + millisecond-truncated (the timestamp(no-tz) write rule — avoids the timestamptz GUC cast).
    private DateTime Now() =>
        new(
            timeProvider.GetUtcNow().UtcDateTime.Ticks / TimeSpan.TicksPerMillisecond * TimeSpan.TicksPerMillisecond,
            DateTimeKind.Unspecified);

    private static ConfigureIsamsResult InvalidBody => new(ConfigureIsamsStatus.InvalidBody);

    private enum WriteKind
    {
        Skip,
        Null,
        Value,
        TypeError,
    }

    private readonly record struct WriteValue(WriteKind Kind, string? Value);
}
