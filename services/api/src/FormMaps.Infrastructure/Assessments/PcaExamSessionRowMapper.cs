using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Single source for the full pca_exam_sessions row projection shared by the history and all-results
/// readers (keeps the SELECT column list + <see cref="PcaHistorySession"/> mapping from drifting
/// between them). Timestamps are emitted as JS-toISOString Z-strings (NOT DateTimeOffset, which STJ
/// would render as +00:00). Three columns are @map'd in Prisma (violation_count / flag_for_review),
/// so they are explicitly aliased.
/// </summary>
internal static class PcaExamSessionRowMapper
{
    /// <summary>The SELECT column list (no FROM/WHERE) producing the <see cref="PcaHistorySession"/> shape.</summary>
    public const string Columns = """
        "id", "examId", "userId", "examName", "examType"::text AS "examType",
        "startTime", "endTime", "totalTimeSpent", "totalQuestions", "questionsAnswered",
        "correctAnswers", "incorrectAnswers", "unansweredQuestions", "scorePercentage",
        "accuracyPercentage", "isTimeExpired", "isCompleted", "status"::text AS "status",
        "violations"::text AS "violations", "violation_count" AS "violationCount",
        "flag_for_review" AS "flagForReview", "isActive", "createdBy", "createdDate",
        "updatedBy", "updatedAt"
        """;

    public static PcaHistorySession Map(DbDataReader r) => new(
        Id: r.GetString(r.GetOrdinal("id")),
        ExamId: r.GetString(r.GetOrdinal("examId")),
        UserId: r.GetString(r.GetOrdinal("userId")),
        ExamName: r.GetString(r.GetOrdinal("examName")),
        ExamType: r.GetString(r.GetOrdinal("examType")),
        StartTime: IsoZ(r, "startTime")!,
        EndTime: IsoZ(r, "endTime"),
        TotalTimeSpent: ReadNullableInt(r, "totalTimeSpent"),
        TotalQuestions: r.GetInt32(r.GetOrdinal("totalQuestions")),
        QuestionsAnswered: r.GetInt32(r.GetOrdinal("questionsAnswered")),
        CorrectAnswers: r.GetInt32(r.GetOrdinal("correctAnswers")),
        IncorrectAnswers: r.GetInt32(r.GetOrdinal("incorrectAnswers")),
        UnansweredQuestions: r.GetInt32(r.GetOrdinal("unansweredQuestions")),
        ScorePercentage: r.GetDouble(r.GetOrdinal("scorePercentage")),
        AccuracyPercentage: r.GetDouble(r.GetOrdinal("accuracyPercentage")),
        IsTimeExpired: r.GetBoolean(r.GetOrdinal("isTimeExpired")),
        IsCompleted: r.GetBoolean(r.GetOrdinal("isCompleted")),
        Status: r.GetString(r.GetOrdinal("status")),
        Violations: ReadJson(r, "violations"),
        ViolationCount: r.GetInt32(r.GetOrdinal("violationCount")),
        FlagForReview: r.GetBoolean(r.GetOrdinal("flagForReview")),
        IsActive: r.GetBoolean(r.GetOrdinal("isActive")),
        CreatedBy: ReadNullableString(r, "createdBy"),
        CreatedDate: IsoZ(r, "createdDate")!,
        UpdatedBy: ReadNullableString(r, "updatedBy"),
        UpdatedAt: IsoZ(r, "updatedAt")!);

    // timestamp -> JS-toISOString Z-string (3 ms digits + Z), UTC. null column -> null.
    public static string? IsoZ(DbDataReader r, string name)
    {
        var o = r.GetOrdinal(name);
        if (r.IsDBNull(o))
        {
            return null;
        }

        var utc = DateTime.SpecifyKind(r.GetDateTime(o), DateTimeKind.Utc);
        return utc.ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
    }

    public static JsonElement ReadJson(DbDataReader r, string name)
    {
        var o = r.GetOrdinal(name);
        var raw = r.IsDBNull(o) ? "null" : r.GetString(o);
        using var doc = JsonDocument.Parse(raw);
        return doc.RootElement.Clone();
    }

    public static string? ReadNullableString(DbDataReader r, string name)
    {
        var o = r.GetOrdinal(name);
        return r.IsDBNull(o) ? null : r.GetString(o);
    }

    public static int? ReadNullableInt(DbDataReader r, string name)
    {
        var o = r.GetOrdinal(name);
        return r.IsDBNull(o) ? null : r.GetInt32(o);
    }
}
