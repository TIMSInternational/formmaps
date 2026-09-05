using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Gradebook;
using FormMaps.Application.Transcript;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Gradebook;

namespace FormMaps.Infrastructure.Transcript;

/// <summary>
/// Reads for routes/transcript.ts (issue #55). getTranscriptData / resolveGpaConfig are NOT reimplemented here —
/// they are <see cref="TranscriptDataQuery"/>, shared with the already-shipped GradebookReader.
/// Every session is opened from the passed <see cref="RequestContext"/>; the endpoint decides whether that is
/// the caller or <c>RequestContext.System()</c> (parent role only, mirroring legacy <c>readFor</c>).
/// </summary>
public sealed class TranscriptReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ITranscriptReader
{
    public async Task<string?> GetUserSchoolIdAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        return await ReadUserSchoolIdAsync(session, userId, cancellationToken);
    }

    public async Task<StudentTranscript> GetTranscriptDataAsync(
        RequestContext context, string studentId, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        var grades = await TranscriptDataQuery.LoadGradesAsync(session, studentId, schoolId, cancellationToken);
        var (unweighted, bonuses) = await TranscriptDataQuery.ResolveGpaConfigAsync(session, schoolId, cancellationToken);
        return TranscriptDataQuery.BuildTranscript(grades, unweighted, bonuses);
    }

    public async Task<StudentGpaRow?> GetStudentGpaAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = TranscriptDataQuery.Command(session, StudentGpaSelect + """ WHERE "userId" = @uid""");
        TranscriptDataQuery.AddParameter(command, "uid", userId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadStudentGpa(reader) : null;
    }

    // counselorCanAccessStudent (transcriptService.ts:87-94): BOTH users rows must be readable and carry a
    // non-null schoolId, and the two must be equal. A row the caller's RLS hides reads as "no schoolId" -> false,
    // which is legacy's behaviour too (Prisma runs under the same policy).
    public async Task<bool> CounselorCanAccessStudentAsync(
        RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        var counselorSchool = await ReadUserSchoolIdAsync(session, counselorId, cancellationToken);
        var studentSchool = await ReadUserSchoolIdAsync(session, studentId, cancellationToken);

        return counselorSchool is not null
            && studentSchool is not null
            && string.Equals(counselorSchool, studentSchool, StringComparison.Ordinal);
    }

    // parentCanAccessStudent (transcriptService.ts:103-108). formmaps#121: matched on parentUserId — the column
    // 009-parent-links.sql's policy names — NOT on parentEmail, and isAccepted is explicit.
    public async Task<bool> ParentCanAccessStudentAsync(
        RequestContext context, string parentId, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = TranscriptDataQuery.Command(session, """
            SELECT 1 FROM "student_parent_links"
            WHERE "studentId" = @sid AND "parentUserId" = @pid AND "isActive" = true AND "isAccepted" = true
            LIMIT 1
            """);
        TranscriptDataQuery.AddParameter(command, "sid", studentId);
        TranscriptDataQuery.AddParameter(command, "pid", parentId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken);
    }

    public async Task<GpaConfigurationRow?> GetGpaConfigAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = TranscriptDataQuery.Command(session, GpaConfigSelect + """ WHERE "schoolId" = @school""");
        TranscriptDataQuery.AddParameter(command, "school", schoolId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadGpaConfig(reader) : null;
    }

    // getClassRankings (transcriptService.ts:299-332): school_users(role=student, isActive) -> student_gpas
    // (isActive, ORDER BY classRank ASC -> Postgres default NULLS LAST, which is what Prisma emits) -> users for
    // the display name/grade. Empty student list short-circuits to [] BEFORE the gpa query, exactly as legacy does.
    public async Task<IReadOnlyList<ClassRankingRow>> GetClassRankingsAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var studentIds = await ReadActiveStudentIdsAsync(session, schoolId, cancellationToken);
        if (studentIds.Count == 0)
        {
            return [];
        }

        var rows = new List<ClassRankingRow>();
        var ids = studentIds.ToArray();

        await using (var command = TranscriptDataQuery.Command(session, """
            SELECT g."userId",
                   g."classRank",
                   g."gpaUnweighted"::double precision,
                   g."gpaWeighted"::double precision,
                   g."totalCredits"::double precision,
                   g."classSize",
                   g."rankPercentile"::double precision,
                   g."computedAt",
                   u."id",
                   u."name",
                   u."gradeLevel"
            FROM "student_gpas" g
            LEFT JOIN "users" u ON u."id" = g."userId"
            WHERE g."userId" = ANY(@ids) AND g."isActive" = true
            ORDER BY g."classRank" ASC
            """))
        {
            TranscriptDataQuery.AddParameter(command, "ids", ids);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var userFound = !reader.IsDBNull(8);
                var name = userFound && !reader.IsDBNull(9) ? reader.GetString(9) : null;

                rows.Add(new ClassRankingRow(
                    StudentId: reader.GetString(0),
                    // user?.name || "—": an absent user row AND an empty/null name both fall back to the em dash.
                    StudentName: string.IsNullOrEmpty(name) ? "—" : name,
                    UserFound: userFound,
                    GradeLevel: userFound && !reader.IsDBNull(10) ? reader.GetInt32(10) : null,
                    Rank: reader.IsDBNull(1) ? null : reader.GetInt32(1),
                    // Number(x) || 0 — null and NaN both collapse to 0 (legacy quirk: a genuine 0.0 GPA is
                    // indistinguishable from "never computed" on this route).
                    Gpa: NumberOrZero(reader, 2),
                    WeightedGpa: NumberOrZero(reader, 3),
                    TotalCredits: NumberOrZero(reader, 4),
                    ClassSize: reader.IsDBNull(5) ? null : reader.GetInt32(5),
                    // Math.round(Number(rankPercentile || 0) * 100) — JS Math.round is half-UP (toward +Infinity),
                    // NOT away-from-zero; percentile is non-negative here so the two agree.
                    Percentile: (int)Math.Floor((reader.IsDBNull(6) ? 0d : reader.GetDouble(6)) * 100d + 0.5d),
                    ComputedAt: TranscriptDataQuery.IsoZ(reader.GetDateTime(7))));
            }
        }

        return rows;
    }

    // ---------------------------------------------------------------- shared row readers

    internal const string StudentGpaSelect = """
        SELECT "id", "userId",
               "gpaUnweighted"::double precision, "gpaWeighted"::double precision,
               "totalCredits"::double precision, "classRank", "classSize",
               "rankPercentile"::double precision, "yearlyBreakdown"::text,
               "computedAt", "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
        FROM "student_gpas"
        """;

    internal static StudentGpaRow ReadStudentGpa(DbDataReader reader) => new(
        Id: reader.GetString(0),
        UserId: reader.GetString(1),
        GpaUnweighted: reader.IsDBNull(2) ? null : reader.GetDouble(2),
        GpaWeighted: reader.IsDBNull(3) ? null : reader.GetDouble(3),
        // serializeStudentGpa: totalCredits == null ? 0 — the column is NOT NULL, so this is belt-and-braces.
        TotalCredits: reader.IsDBNull(4) ? 0d : reader.GetDouble(4),
        ClassRank: reader.IsDBNull(5) ? null : reader.GetInt32(5),
        ClassSize: reader.IsDBNull(6) ? null : reader.GetInt32(6),
        RankPercentile: reader.IsDBNull(7) ? null : reader.GetDouble(7),
        YearlyBreakdown: ParseJson(reader.IsDBNull(8) ? null : reader.GetString(8)),
        ComputedAt: TranscriptDataQuery.IsoZ(reader.GetDateTime(9)),
        IsActive: reader.GetBoolean(10),
        CreatedBy: reader.IsDBNull(11) ? null : reader.GetString(11),
        CreatedDate: TranscriptDataQuery.IsoZ(reader.GetDateTime(12)),
        UpdatedBy: reader.IsDBNull(13) ? null : reader.GetString(13),
        UpdatedAt: TranscriptDataQuery.IsoZ(reader.GetDateTime(14)));

    internal const string GpaConfigSelect = """
        SELECT "id", "schoolId", "scale"::text, "unweightedMap"::text, "weightBonuses"::text,
               "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
        FROM "gpa_configurations"
        """;

    internal static GpaConfigurationRow ReadGpaConfig(DbDataReader reader) => new(
        Id: reader.GetString(0),
        SchoolId: reader.GetString(1),
        Scale: NormalizeDecimalString(reader.GetString(2)),
        UnweightedMap: ParseJson(reader.IsDBNull(3) ? null : reader.GetString(3)),
        WeightBonuses: ParseJson(reader.IsDBNull(4) ? null : reader.GetString(4)),
        IsActive: reader.GetBoolean(5),
        CreatedBy: reader.IsDBNull(6) ? null : reader.GetString(6),
        CreatedDate: TranscriptDataQuery.IsoZ(reader.GetDateTime(7)),
        UpdatedBy: reader.IsDBNull(8) ? null : reader.GetString(8),
        UpdatedAt: TranscriptDataQuery.IsoZ(reader.GetDateTime(9)));

    // ---------------------------------------------------------------- helpers

    internal static async Task<string?> ReadUserSchoolIdAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = TranscriptDataQuery.Command(session, """SELECT "schoolId" FROM "users" WHERE "id" = @uid""");
        TranscriptDataQuery.AddParameter(command, "uid", userId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return reader.IsDBNull(0) ? null : reader.GetString(0);
    }

    // prisma.schoolUser.findMany({ where:{ schoolId, role:"student", isActive:true }, select:{ userId } }).
    // NO ORDER BY, deliberately: legacy has none either, and computeClassRanks assigns ranks in exactly this
    // order, so imposing one here would invent a tie-break legacy does not have.
    internal static async Task<List<string>> ReadActiveStudentIdsAsync(
        FormMapsDatabaseSession session, string schoolId, CancellationToken cancellationToken)
    {
        var ids = new List<string>();
        await using var command = TranscriptDataQuery.Command(session, """
            SELECT "userId" FROM "school_users"
            WHERE "schoolId" = @school AND "role" = 'student' AND "isActive" = true
            """);
        TranscriptDataQuery.AddParameter(command, "school", schoolId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            ids.Add(reader.GetString(0));
        }

        return ids;
    }

    private static double NumberOrZero(DbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? 0d : reader.GetDouble(ordinal);

    private static readonly JsonElement JsonNull = JsonDocument.Parse("null").RootElement.Clone();

    internal static JsonElement ParseJson(string? json)
    {
        if (string.IsNullOrEmpty(json))
        {
            return JsonNull;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return JsonNull;
        }
    }

    /// <summary>
    /// The uncoerced-Decimal wire form for <c>gpa_configurations.scale</c>. Shared with the graduation rule-set
    /// tree, which has four more of them — see <see cref="PrismaDecimalText"/> for the full rationale.
    /// </summary>
    internal static string NormalizeDecimalString(string raw) => PrismaDecimalText.Normalize(raw);
}
