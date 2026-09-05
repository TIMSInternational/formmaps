using FormMaps.Application.Auth;
using FormMaps.Application.Email;
using FormMaps.Application.Recommendations;
using FormMaps.Application.Storage;
using FormMaps.Infrastructure.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Recommendations;
using Npgsql;

namespace FormMaps.IntegrationTests.Recommendations;

/// <summary>
/// Shared wiring for the formmaps#59 real-DB suites: seed helpers on the ADMIN connection, request contexts, and a
/// <see cref="RecommendationsService"/> built from the REAL repository and the REAL
/// <see cref="UserAccessGuard"/> (the canAccessUser port) over the restricted login. Only S3 and the mailer are
/// doubled — the authorization path under test is production code end to end.
/// </summary>
internal static class RecommendationTestWorld
{
    public const string School = "school-1";
    public const string OtherSchool = "school-2";

    public static RecommendationsRepository Repository(NpgsqlDataSource appDataSource, DateTime now) =>
        new(Factory(appDataSource), new FixedTimeProvider(now));

    public static RecommendationsService Service(
        NpgsqlDataSource appDataSource, DateTime now, FakeObjectStorage storage, FakeEmailSender mailer)
    {
        var factory = Factory(appDataSource);
        var options = new EmailOptions(
            "noreply@formmaps.com", "https://app.formmaps.com", "https://app.formmaps.ai",
            "https://logo", "postal", "us-east-1");
        return new RecommendationsService(
            new RecommendationsRepository(factory, new FixedTimeProvider(now)),
            new UserAccessGuard(factory),
            storage,
            mailer,
            new RecommendationEmails(new EmailTemplates(options), options),
            new FixedTimeProvider(now));
    }

    private static NpgsqlFormMapsDatabaseSessionFactory Factory(NpgsqlDataSource dataSource) =>
        new(dataSource, new RlsSessionContextApplier());

    public static RequestContext Ctx(string userId, string role, string? schoolId, params string[] permissions) =>
        RequestContext.Authenticated(
            new RequestActor(userId, role, $"{userId}@e.st", userId),
            schoolId,
            permissions,
            TokenSource.DevelopmentHeader,
            isDevelopmentOverride: true);

    // ---- seeds (ADMIN connection only — a policy-filtered seed would silently write nothing) ----

    public static async Task UserAsync(
        NpgsqlConnection conn, string id, string role, string? schoolId, bool isActive = true, string? name = null)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users"("id","name","email","roleName","schoolId","isActive") VALUES(@id,@n,@e,@r,@s,@a)""",
            conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("n", (object?)(name ?? id) ?? DBNull.Value);
        cmd.Parameters.AddWithValue("e", $"{id}@e.st");
        cmd.Parameters.AddWithValue("r", role);
        cmd.Parameters.AddWithValue("s", (object?)schoolId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    public static async Task RequestAsync(
        NpgsqlConnection conn, string id, string studentId, string recommenderId, string status = "requested",
        bool isActive = true, string? letterFileKey = null, string? letterFileName = null, DateTime? created = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "recommendation_requests"
                ("id","studentId","recommenderId","status","relationship","requestMessage","isActive",
                 "letterFileKey","letterFileName","createdDate","updatedAt")
            VALUES(@id,@s,@r,@st,'Teacher','Please',@a,@k,@f,@c,@c)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("r", recommenderId);
        cmd.Parameters.AddWithValue("st", status);
        cmd.Parameters.AddWithValue("a", isActive);
        cmd.Parameters.AddWithValue("k", (object?)letterFileKey ?? DBNull.Value);
        cmd.Parameters.AddWithValue("f", (object?)letterFileName ?? DBNull.Value);
        cmd.Parameters.AddWithValue(
            "c", DateTime.SpecifyKind(created ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }

    public static async Task AssignmentAsync(
        NpgsqlConnection conn, string id, string counselorId, string studentId, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "counselor_student_assignments"("id","counselorId","studentId","isActive") VALUES(@i,@c,@s,@a)""",
            conn);
        cmd.Parameters.AddWithValue("i", id);
        cmd.Parameters.AddWithValue("c", counselorId);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    public static async Task ApplicationAsync(
        NpgsqlConnection conn, string id, string studentId, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "student_applications"("id","studentId","isActive") VALUES(@i,@s,@a)""", conn);
        cmd.Parameters.AddWithValue("i", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    public static async Task CoachAsync(NpgsqlConnection conn, string id, string userId, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "coaches"("id","userId","isActive") VALUES(@i,@u,@a)""", conn);
        cmd.Parameters.AddWithValue("i", id);
        cmd.Parameters.AddWithValue("u", userId);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    public static async Task BookingAsync(
        NpgsqlConnection conn, string id, string coachId, string studentId, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "bookings"("id","coachId","studentId","isActive") VALUES(@i,@c,@s,@a)""", conn);
        cmd.Parameters.AddWithValue("i", id);
        cmd.Parameters.AddWithValue("c", coachId);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    public static readonly string[] AllTables =
    [
        "users", "coaches", "bookings", "counselor_student_assignments", "student_applications",
        "recommendation_requests", "recommendation_application_links",
    ];
}

internal sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
}

/// <summary>S3 double: records the keys written/read/deleted and hands back a stable presigned URL.</summary>
internal sealed class FakeObjectStorage : IObjectStorage
{
    public List<string> Uploaded { get; } = [];

    public List<(string Key, int Ttl, bool Inline, string ContentType)> Reads { get; } = [];

    public List<string> Deleted { get; } = [];

    public Task<StoredObject> UploadAndGetUrlAsync(
        string folder, string filename, byte[] body, string contentType, CancellationToken cancellationToken = default)
    {
        var ext = filename.Contains('.') ? filename[filename.LastIndexOf('.')..] : "";
        var key = $"{folder}/{Uploaded.Count + 1}-abcdef{ext}";
        Uploaded.Add(key);
        return Task.FromResult(new StoredObject(key, $"https://signed/{key}"));
    }

    public Task<string> GetPresignedReadUrlAsync(
        string key, int ttlSeconds, bool inline, string contentType, CancellationToken cancellationToken = default)
    {
        Reads.Add((key, ttlSeconds, inline, contentType));
        return Task.FromResult($"https://signed/read/{key}");
    }

    public Task DeleteAsync(string key, CancellationToken cancellationToken = default)
    {
        Deleted.Add(key);
        return Task.CompletedTask;
    }
}

/// <summary>Mailer double — records every send. Never throws (matches the IEmailSender contract).</summary>
internal sealed class FakeEmailSender : IEmailSender
{
    public List<(string To, string Subject, string Html)> Sent { get; } = [];

    public Task<bool> SendAsync(string to, string subject, string html, CancellationToken cancellationToken = default)
    {
        Sent.Add((to, subject, html));
        return Task.FromResult(true);
    }
}
