using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.IsamsWrites;
using FormMaps.Application.Security;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.IsamsWrites;
using FormMaps.Infrastructure.Security;
using FormMaps.IntegrationTests.IsamsReads;
using Npgsql;

namespace FormMaps.IntegrationTests.IsamsWrites;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="IsamsConfigWriter"/> — the iSAMS configure upsert
/// (FM-DOTNET-087). Reuses the FM-053 schema harness (isams_configs). Pins the create-vs-update asymmetry
/// (authType:0 → "api_key" on create, but 500 on update), the endpoint = body.endpoint || body.apiUrl coalescing,
/// Prisma "undefined ⇒ omit" vs "null ⇒ NULL", the AES-256-GCM credential round-trip (a written credential
/// decrypts back to the apiKey and satisfies isEncrypted), unconditional updatedBy/updatedAt on update, and the
/// type-500s (non-string endpoint/authType/apiKey, truthy-non-string apiKey) that leave the row untouched.
/// </summary>
public sealed class IsamsConfigWriterTests : IClassFixture<IsamsReadsDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string KeyHex = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

    private readonly IsamsReadsDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public IsamsConfigWriterTests(IsamsReadsDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "isams_configs" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- create ----

    [Fact]
    public async Task Create_inserts_row_and_returns_id_and_endpoint()
    {
        var result = await Writer().ConfigureAsync(Ctx(), School, Body("""{"endpoint":"https://x","authType":"basic","apiKey":"sk-1"}"""));

        Assert.Equal(ConfigureIsamsStatus.Ok, result.Status);
        Assert.False(string.IsNullOrEmpty(result.Id));
        Assert.Equal("https://x", result.Endpoint);

        var row = await ReadConfig();
        Assert.Equal("https://x", row.Endpoint);
        Assert.Equal("basic", row.AuthType);
        Assert.Equal("admin-1", row.CreatedBy);
        Assert.Null(row.UpdatedBy);          // create leaves updatedBy NULL
        Assert.True(row.IsActive);           // isActive DB default
    }

    [Fact]
    public async Task Create_endpoint_falls_back_to_apiUrl_when_endpoint_absent()
    {
        await Writer().ConfigureAsync(Ctx(), School, Body("""{"apiUrl":"https://from-apiurl"}"""));
        Assert.Equal("https://from-apiurl", (await ReadConfig()).Endpoint);
    }

    [Fact]
    public async Task Create_endpoint_wins_over_apiUrl_when_both_present()
    {
        await Writer().ConfigureAsync(Ctx(), School, Body("""{"endpoint":"https://primary","apiUrl":"https://fallback"}"""));
        Assert.Equal("https://primary", (await ReadConfig()).Endpoint);
    }

    [Fact]
    public async Task Create_empty_string_endpoint_is_falsy_and_falls_to_apiUrl()
    {
        await Writer().ConfigureAsync(Ctx(), School, Body("""{"endpoint":"","apiUrl":"https://fallback"}"""));
        Assert.Equal("https://fallback", (await ReadConfig()).Endpoint);
    }

    [Fact]
    public async Task Create_empty_body_yields_null_endpoint_and_default_authType()
    {
        var result = await Writer().ConfigureAsync(Ctx(), School, Body("{}"));

        Assert.Equal(ConfigureIsamsStatus.Ok, result.Status);
        Assert.Null(result.Endpoint);
        var row = await ReadConfig();
        Assert.Null(row.Endpoint);           // undefined ⇒ omit ⇒ NULL default
        Assert.Equal("api_key", row.AuthType); // authType || "api_key"
        Assert.Null(row.CredentialsEncrypted);
    }

    [Fact]
    public async Task Create_explicit_null_endpoint_stores_null()
    {
        await Writer().ConfigureAsync(Ctx(), School, Body("""{"endpoint":null}"""));
        Assert.Null((await ReadConfig()).Endpoint);
    }

    [Fact]
    public async Task Create_authType_zero_defaults_to_api_key()
    {
        // authType:0 is JS-falsy → `0 || "api_key"` = "api_key". The CREATE side of the asymmetry (contrast update).
        var result = await Writer().ConfigureAsync(Ctx(), School, Body("""{"endpoint":"https://x","authType":0}"""));

        Assert.Equal(ConfigureIsamsStatus.Ok, result.Status);
        Assert.Equal("api_key", (await ReadConfig()).AuthType);
    }

    [Fact]
    public async Task Create_apiKey_is_encrypted_and_round_trips()
    {
        await Writer().ConfigureAsync(Ctx(), School, Body("""{"endpoint":"https://x","apiKey":"super-secret-token"}"""));

        var stored = (await ReadConfig()).CredentialsEncrypted;
        Assert.NotNull(stored);
        var cipher = new AesGcmFieldCipher(new FieldEncryptionOptions(KeyHex));
        Assert.True(cipher.IsEncrypted(stored!));                 // 16-byte IV → Node isEncrypted recognises it
        Assert.Equal("super-secret-token", cipher.Decrypt(stored!)); // decrypts back to the apiKey
    }

    [Fact]
    public async Task Create_without_apiKey_leaves_credentials_null()
    {
        await Writer().ConfigureAsync(Ctx(), School, Body("""{"endpoint":"https://x"}"""));
        Assert.Null((await ReadConfig()).CredentialsEncrypted);
    }

    // ---- update ----

    [Fact]
    public async Task Update_changes_fields_and_sets_updatedBy_leaving_createdBy()
    {
        await Writer().ConfigureAsync(Ctx(), School, Body("""{"endpoint":"https://old","authType":"api_key","apiKey":"k1"}"""));
        var before = await ReadConfig();

        var result = await Writer().ConfigureAsync(Ctx("admin-2"), School, Body("""{"endpoint":"https://new","authType":"basic"}"""));

        Assert.Equal(ConfigureIsamsStatus.Ok, result.Status);
        var after = await ReadConfig();
        Assert.Equal(before.Id, after.Id);                       // same row (upsert on schoolId)
        Assert.Equal("https://new", after.Endpoint);
        Assert.Equal("basic", after.AuthType);
        Assert.Equal("admin-1", after.CreatedBy);                // createdBy untouched
        Assert.Equal("admin-2", after.UpdatedBy);                // updatedBy set to the second caller
        Assert.Equal(before.CredentialsEncrypted, after.CredentialsEncrypted); // no apiKey ⇒ creds unchanged
    }

    [Fact]
    public async Task Update_authType_zero_is_500_and_leaves_row_unchanged()
    {
        // The UPDATE side of the asymmetry: raw authType:0 is a Number for a String column → Prisma reject → 500.
        await Writer().ConfigureAsync(Ctx(), School, Body("""{"endpoint":"https://x","authType":"basic"}"""));

        var result = await Writer().ConfigureAsync(Ctx(), School, Body("""{"authType":0}"""));

        Assert.Equal(ConfigureIsamsStatus.InvalidBody, result.Status);
        Assert.Equal("basic", (await ReadConfig()).AuthType); // unchanged — no write on a type error
    }

    [Fact]
    public async Task Update_raw_null_authType_sets_null()
    {
        await Writer().ConfigureAsync(Ctx(), School, Body("""{"endpoint":"https://x","authType":"basic"}"""));

        await Writer().ConfigureAsync(Ctx(), School, Body("""{"authType":null}"""));

        Assert.Null((await ReadConfig()).AuthType); // explicit null ⇒ SET NULL
    }

    [Fact]
    public async Task Update_absent_endpoint_leaves_it_unchanged()
    {
        await Writer().ConfigureAsync(Ctx(), School, Body("""{"endpoint":"https://keep"}"""));

        await Writer().ConfigureAsync(Ctx(), School, Body("""{"authType":"basic"}"""));

        Assert.Equal("https://keep", (await ReadConfig()).Endpoint); // undefined ⇒ omit from SET ⇒ unchanged
    }

    [Fact]
    public async Task Update_apiKey_replaces_credentials()
    {
        await Writer().ConfigureAsync(Ctx(), School, Body("""{"apiKey":"first"}"""));
        var first = (await ReadConfig()).CredentialsEncrypted;

        await Writer().ConfigureAsync(Ctx(), School, Body("""{"apiKey":"second"}"""));
        var second = (await ReadConfig()).CredentialsEncrypted;

        Assert.NotEqual(first, second);
        Assert.Equal("second", new AesGcmFieldCipher(new FieldEncryptionOptions(KeyHex)).Decrypt(second!));
    }

    [Fact]
    public async Task Update_empty_body_still_bumps_updatedBy()
    {
        await Writer().ConfigureAsync(Ctx("creator"), School, Body("""{"endpoint":"https://x"}"""));

        var result = await Writer().ConfigureAsync(Ctx("editor"), School, Body("{}"));

        Assert.Equal(ConfigureIsamsStatus.Ok, result.Status);
        var row = await ReadConfig();
        Assert.Equal("editor", row.UpdatedBy);            // updatedBy always written on update
        Assert.Equal("https://x", row.Endpoint);          // untouched
    }

    // ---- type-500s (no write) ----

    [Theory]
    [InlineData("""{"endpoint":123}""")]                 // non-string endpoint
    [InlineData("""{"apiUrl":123}""")]                   // endpoint absent → apiUrl selected → non-string
    [InlineData("""{"apiKey":123}""")]                   // truthy non-string apiKey → encryptField throws
    [InlineData("""{"apiKey":true}""")]                  // truthy non-string apiKey
    [InlineData("""{"authType":123}""")]                 // create authType truthy non-string
    public async Task Invalid_types_return_500_and_write_nothing(string json)
    {
        var result = await Writer().ConfigureAsync(Ctx(), School, Body(json));

        Assert.Equal(ConfigureIsamsStatus.InvalidBody, result.Status);
        Assert.Null(await ReadConfigOrNull()); // no row created
    }

    [Fact]
    public async Task Zero_apiKey_is_falsy_and_writes_no_credentials()
    {
        var result = await Writer().ConfigureAsync(Ctx(), School, Body("""{"endpoint":"https://x","apiKey":0}"""));

        Assert.Equal(ConfigureIsamsStatus.Ok, result.Status);
        Assert.Null((await ReadConfig()).CredentialsEncrypted);
    }

    // ---- helpers ----

    private IsamsConfigWriter Writer() =>
        new(
            new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            new AesGcmFieldCipher(new FieldEncryptionOptions(KeyHex)),
            new FixedTimeProvider(new DateTime(2026, 7, 24, 12, 0, 0, DateTimeKind.Utc)));

    private static JsonElement Body(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private static RequestContext Ctx(string userId = "admin-1") =>
        RequestContext.Authenticated(
            new RequestActor(userId, "school-admin", "admin@e.st", "Admin"),
            schoolId: School, permissions: new[] { "school:manage" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private async Task<ConfigRow> ReadConfig() => (await ReadConfigOrNull())!;

    private async Task<ConfigRow?> ReadConfigOrNull()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT "id","endpoint","authType","credentialsEncrypted","createdBy","updatedBy","isActive"
            FROM "isams_configs" WHERE "schoolId" = @s
            """, conn);
        cmd.Parameters.AddWithValue("s", School);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return null;
        }

        return new ConfigRow(
            reader.GetString(0),
            reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            reader.IsDBNull(4) ? null : reader.GetString(4),
            reader.IsDBNull(5) ? null : reader.GetString(5),
            reader.GetBoolean(6));
    }

    private sealed record ConfigRow(
        string Id, string? Endpoint, string? AuthType, string? CredentialsEncrypted,
        string? CreatedBy, string? UpdatedBy, bool IsActive);

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
    }
}
